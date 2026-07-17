const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Sale = require('../models/Sale');
const StockTransaction = require('../models/StockTransaction');
const UploadLog = require('../models/UploadLog');
const { parseExcel } = require('../helpers/excelHelper');
const { matchProduct } = require('../helpers/productMatcher');
const { createTransferRecommendation } = require('./transferService');

/**
 * Processes an uploaded sales Excel file for a specific branch.
 * @param {Object} params
 * @param {string} params.branchId - ID of the branch uploading sales
 * @param {string} params.userId - ID of the user uploading sales
 * @param {Buffer} params.fileBuffer - Excel file buffer
 * @param {string} params.filename - Name of the uploaded file
 */
const uploadSaleFile = async ({ branchId, userId, fileBuffer, filename }) => {
  // Prevent duplicate uploads
  const duplicate = await UploadLog.findOne({
    branch_id: branchId,
    filename: filename,
    file_type: 'SALE',
    status: 'SUCCESS'
  });

  if (duplicate) {
    throw new Error(`File "${filename}" has already been uploaded successfully for this branch.`);
  }

  // Set up temporary log
  const log = new UploadLog({
    file_type: 'SALE',
    branch_id: branchId,
    uploaded_by: userId,
    filename: filename,
    status: 'FAILED',
    records_processed: 0
  });

  try {
    const rows = parseExcel(fileBuffer, 'SALE');
    
    // Clear existing sales and sale upload transactions for this branch
    await Sale.deleteMany({ branch_id: branchId });
    await StockTransaction.deleteMany({ branch_id: branchId, transaction_type: 'SALE_UPLOAD' });

    // Aggregate sold items: count identical rows
    // Key format: design_no | size | item_name
    const aggregated = {};
    rows.forEach(row => {
      // Basic validation
      if (!row.design_no && !row.item_name) return;

      const key = `${row.design_no || ''}::${row.size || ''}::${row.item_name || ''}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          design_no: row.design_no,
          size: row.size,
          item_name: row.item_name,
          box_no: row.box_no,
          sold_quantity: 0
        };
      }
      aggregated[key].sold_quantity += 1;
    });

    let processedCount = 0;
    const shortages = [];
    const unmatched = [];

    for (const key of Object.keys(aggregated)) {
      const item = aggregated[key];

      // Match product
      const product = await matchProduct({
        design_no: item.design_no,
        size: item.size,
        item_name: item.item_name
      });

      if (!product) {
        unmatched.push(`${item.item_name} (Design: ${item.design_no}, Size: ${item.size})`);
        continue;
      }

      const soldQty = item.sold_quantity;

      // Get current stock
      let stock = await Stock.findOne({ branch_id: branchId, product_id: product._id });
      const availableQty = stock ? stock.quantity : 0;

      // Deduct stock (allow negative stock to represent net position and backorder)
      if (!stock) {
        stock = new Stock({
          branch_id: branchId,
          product_id: product._id,
          quantity: -soldQty
        });
      } else {
        stock.quantity -= soldQty;
      }
      await stock.save();

      // Record Sale entry
      const sale = new Sale({
        branch_id: branchId,
        product_id: product._id,
        sale_date: new Date(),
        quantity: soldQty,
        rate: product.rate,
        mrp: product.mrp
      });
      await sale.save();

      // Record Transaction
      const transaction = new StockTransaction({
        branch_id: branchId,
        product_id: product._id,
        transaction_type: 'SALE_UPLOAD',
        quantity: soldQty,
        reference_id: sale._id
      });
      await transaction.save();

      // Check if shortage exists
      if (availableQty < soldQty) {
        const shortageQty = soldQty - availableQty;
        shortages.push({
          product,
          shortageQty,
          availableQty
        });

        // Trigger automatic transfer recommendation logic
        await createTransferRecommendation({
          toBranchId: branchId,
          productId: product._id,
          shortageQty
        });
      }

      processedCount += soldQty;
    }

    if (processedCount === 0) {
      const headerList = (rows && rows.headers) ? rows.headers.join(', ') : 'unknown';
      throw new Error(`Failed to import sales: 0 records were processed. Please check your Excel headers. Detected columns: [${headerList}]. Required columns: Item Name, Design Number, Size.`);
    }

    log.status = 'SUCCESS';
    log.records_processed = processedCount;
    if (unmatched.length > 0) {
      log.error_message = `Warning: Unmatched products: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ` and ${unmatched.length - 5} more` : ''}`;
    }
    await log.save();

    return {
      success: true,
      recordsProcessed: processedCount,
      shortagesCount: shortages.length,
      unmatchedCount: unmatched.length,
      unmatched
    };
  } catch (error) {
    log.status = 'FAILED';
    log.error_message = error.message;
    await log.save();
    throw error;
  }
};

module.exports = {
  uploadSaleFile
};
