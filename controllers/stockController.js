const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Branch = require('../models/Branch');
const ActivityLog = require('../models/ActivityLog');
const Sale = require('../models/Sale');
const { uploadStockFile } = require('../services/stockService');

const getStocks = async (req, res) => {
  const user = req.user;
  const { q } = req.query;

  try {
    // Get branches based on role restrictions
    let branchesQuery = {};
    if (user.role !== 'Super Admin') {
      branchesQuery = {
        $or: [
          { _id: user.branch_id ? user.branch_id._id : null },
          { branch_type: 'H/O' }
        ]
      };
    }
    const branches = await Branch.find(branchesQuery).sort({ branch_name: 1 });
    const branchIds = branches.map(b => b._id);
    
    // Construct Product Query
    const productFilter = {};
    if (q && q.trim() !== '') {
      const escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      productFilter.$or = [
        { barcode: q.trim() },
        { design_no: q.trim() },
        { item_name: { $regex: escapedQ, $options: 'i' } }
      ];
    }

    const products = await Product.find(productFilter).sort({ item_name: 1 });
    const productIds = products.map(p => p._id);

    // Fetch Stock records for matched products (all branches to check backup stocks)
    const stocks = await Stock.find({ product_id: { $in: productIds } })
      .populate('branch_id')
      .populate('product_id');

    // Build Pivot Matrix
    const pivot = {};
    products.forEach(p => {
      pivot[p._id.toString()] = {
        product: p,
        branchQuantities: {},
        totalQuantity: 0,
        otherBranchStock: []
      };
      // Initialize branch quantities to 0
      branches.forEach(b => {
        pivot[p._id.toString()].branchQuantities[b._id.toString()] = 0;
      });
    });

    stocks.forEach(s => {
      if (!s.product_id) return;
      const prodId = s.product_id._id.toString();
      const branchIdStr = s.branch_id ? s.branch_id._id.toString() : '';
      if (pivot[prodId] && branchIdStr) {
        if (pivot[prodId].branchQuantities[branchIdStr] !== undefined) {
          pivot[prodId].branchQuantities[branchIdStr] = s.quantity;
          pivot[prodId].totalQuantity += s.quantity;
        } else {
          // If it is not a visible branch but has stock > 0, store it as backup source
          if (s.quantity > 0 && s.branch_id) {
            pivot[prodId].otherBranchStock.push({
              branch_id: branchIdStr,
              branch_name: s.branch_id.branch_name,
              quantity: s.quantity
            });
          }
        }
      }
    });

    const matrixRows = Object.values(pivot);

    // Calculate Top Summary Metrics (scoped to visible/allowed branches)
    const allowedBranchIdStrs = branchIds.map(id => id.toString());
    const allowedStocks = stocks.filter(s => s.branch_id && allowedBranchIdStrs.includes(s.branch_id._id.toString()));
    const consolidatedSKUs = products.length;
    const globalOnHand = allowedStocks.reduce((sum, s) => sum + s.quantity, 0);
    const depletedLocations = allowedStocks.filter(s => s.quantity < 5).length;
    
    const salesFilter = user.role === 'Super Admin' ? {} : { branch_id: user.branch_id._id };
    const sessionOperations = await Sale.countDocuments(salesFilter);

    res.render('stocks/index', {
      matrixRows,
      branches,
      searchQuery: q || '',
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      consolidatedSKUs,
      globalOnHand,
      depletedLocations,
      sessionOperations
    });
  } catch (error) {
    console.error('Error fetching stocks matrix:', error);
    res.status(500).render('error', { title: 'Stock Error', message: 'Failed to load stock matrix records.' });
  }
};

const getUploadStock = async (req, res) => {
  const user = req.user;
  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('stocks/upload', {
      branches,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error rendering upload page:', error);
    res.status(500).render('error', { title: 'Stock Error', message: 'Failed to load upload form.' });
  }
};

const postUploadStock = async (req, res) => {
  const user = req.user;
  const { branch_id } = req.body;
  const file = req.file;

  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    const targetBranchId = user.role === 'Super Admin' ? branch_id : user.branch_id._id.toString();

    if (!targetBranchId) {
      return res.render('stocks/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Please select a branch.',
        success: null
      });
    }

    if (!file) {
      return res.render('stocks/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Please upload an Excel file.',
        success: null
      });
    }

    const branch = await Branch.findById(targetBranchId);
    if (!branch) {
      return res.render('stocks/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Branch not found.',
        success: null
      });
    }

    // Call service to process upload
    const result = await uploadStockFile({
      branchId: targetBranchId,
      userId: user._id,
      fileBuffer: file.buffer,
      filename: file.originalname
    });

    // Log Activity
    await new ActivityLog({
      user_id: user._id,
      action: 'STOCK_UPLOAD',
      details: `Uploaded stock file "${file.originalname}" for branch: ${branch.branch_name}. Processed ${result.recordsProcessed} items.`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    // Trigger Real-time updates via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('dashboardUpdate', {
        type: 'STOCK_UPLOAD',
        message: `New stock upload for ${branch.branch_name}`,
        branchId: targetBranchId
      });
    }

    res.render('stocks/upload', {
      branches,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: null,
      success: `Stock file uploaded successfully! Processed ${result.recordsProcessed} records.`
    });
  } catch (error) {
    console.error('Error uploading stock file:', error);
    
    // Render upload page with error
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('stocks/upload', {
      branches,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: error.message,
      success: null
    });
  }
};

module.exports = {
  getStocks,
  getUploadStock,
  postUploadStock
};
