const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Branch = require('../models/Branch');

/**
 * Matches a product in the database using the priority rules:
 * 1. Barcode
 * 2. Design Number + Size
 * 3. Item Name + Size
 * 
 * @param {Object} criteria - Product search criteria
 * @param {string} [criteria.barcode] - Barcode
 * @param {string} [criteria.design_no] - Design Number
 * @param {string} [criteria.size] - Size
 * @param {string} [criteria.item_name] - Item Name
 * @returns {Promise<Product|null>} Matched Product document or null
 */
const matchProduct = async (criteria) => {
  const { barcode, design_no, size, item_name } = criteria;

  // 1. Match by Barcode
  if (barcode && barcode.trim() !== '') {
    const product = await Product.findOne({ barcode: barcode.trim() });
    if (product) {
      // If design_no is also provided, ensure it matches
      if (!design_no || design_no.trim() === '' || product.design_no === design_no.trim()) {
        return product;
      }
    }
  }

  // 2. Match by Design Number + Size
  if (design_no && size && design_no.trim() !== '' && size.trim() !== '') {
    const product = await Product.findOne({
      design_no: design_no.trim(),
      size: size.trim()
    });
    if (product) return product;
  }

  // 3. Match by Item Name + Size
  if (item_name && size && item_name.trim() !== '' && size.trim() !== '') {
    const query = {
      item_name: { $regex: new RegExp('^' + escapeRegex(item_name.trim()) + '$', 'i') },
      size: size.trim()
    };
    // If design_no is provided, restrict the match to have the same design_no
    if (design_no && design_no.trim() !== '') {
      query.design_no = design_no.trim();
    }
    const product = await Product.findOne(query);
    if (product) return product;
  }

  return null;
};

/**
 * Searches positive stock in other branches using the requested network match order:
 * 1. Barcode
 * 2. SKU (mapped into barcode by the Excel parser)
 * 3. Design Number + Size
 *
 * @param {Object} criteria
 * @param {string} [criteria.barcode]
 * @param {string} [criteria.design_no]
 * @param {string} [criteria.size]
 * @param {string} excludeBranchId
 * @returns {Promise<{product: Product|null, availableBranches: Array}>}
 */
const findProductInNetworkStock = async (criteria, excludeBranchId) => {
  const { barcode, design_no, size } = criteria;
  let product = null;

  if (barcode && barcode.trim() !== '') {
    product = await Product.findOne({ barcode: barcode.trim() });
  }

  if (!product && design_no && size && design_no.trim() !== '' && size.trim() !== '') {
    product = await Product.findOne({
      design_no: design_no.trim(),
      size: size.trim()
    });
  }

  if (!product) {
    return { product: null, availableBranches: [] };
  }

  const stockRecords = await Stock.find({
    product_id: product._id,
    branch_id: { $ne: excludeBranchId },
    quantity: { $gt: 0 }
  }).populate('branch_id');

  if (stockRecords.length === 0) {
    return { product, availableBranches: [] };
  }

  const branchDetails = await Branch.find({
    _id: { $in: stockRecords.map(record => record.branch_id?._id || record.branch_id).filter(Boolean) }
  }).select('branch_name branch_type priority');
  const branchById = new Map(branchDetails.map(branch => [branch._id.toString(), branch]));

  const availableBranches = stockRecords
    .map(record => {
      const branchId = record.branch_id ? record.branch_id._id.toString() : '';
      const branch = branchById.get(branchId) || record.branch_id;
      if (!branch) return null;

      return {
        branch_id: branch._id,
        branch_name: branch.branch_name,
        branch_type: branch.branch_type,
        quantity: Math.max(0, record.quantity - (record.reserved_quantity || 0)),
        priority: branch.priority || 99
      };
    })
    .filter(branch => branch && branch.quantity > 0)
    .sort((a, b) => {
      const aIsHO = a.branch_type === 'H/O' ? 0 : 1;
      const bIsHO = b.branch_type === 'H/O' ? 0 : 1;
      if (aIsHO !== bIsHO) return aIsHO - bIsHO;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.branch_name.localeCompare(b.branch_name);
    })
    .map(({ branch_type, ...branch }) => branch);

  return { product, availableBranches };
};

// Utility to escape regex characters
function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

module.exports = {
  matchProduct,
  findProductInNetworkStock
};
