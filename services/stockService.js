const Product = require('../models/Product');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const UploadLog = require('../models/UploadLog');
const { parseExcel } = require('../helpers/excelHelper');
const { matchProduct } = require('../helpers/productMatcher');

/**
 * Processes an uploaded stock Excel file for a specific branch.
 * @param {Object} params
 * @param {string} params.branchId - ID of the branch uploading stock
 * @param {string} params.userId - ID of the user uploading stock
 * @param {Buffer} params.fileBuffer - Excel file buffer
 * @param {string} params.filename - Name of the uploaded file
 */
const uploadStockFile = async ({ branchId, userId, fileBuffer, filename }) => {
  // Prevent duplicate uploads by checking if this filename has been successfully uploaded for this branch
  const duplicate = await UploadLog.findOne({
    branch_id: branchId,
    filename: filename,
    file_type: 'STOCK',
    status: 'SUCCESS'
  });

  if (duplicate) {
    throw new Error(`File "${filename}" has already been uploaded successfully for this branch.`);
  }

  // Set up temporary log
  const log = new UploadLog({
    file_type: 'STOCK',
    branch_id: branchId,
    uploaded_by: userId,
    filename: filename,
    status: 'FAILED', // Default until successful
    records_processed: 0
  });

  try {
    const rows = parseExcel(fileBuffer, 'STOCK');
    let processedCount = 0;

    // Clear existing stocks and stock upload transactions for this branch
    await Stock.deleteMany({ branch_id: branchId });
    await StockTransaction.deleteMany({ branch_id: branchId, transaction_type: 'STOCK_UPLOAD' });

    for (const row of rows) {
      // Basic validation: design_no, item_name, and size are required
      if (!row.design_no || !row.item_name || !row.size) {
        continue; // skip invalid rows
      }

      // 1. Try to match the product
      let product = await matchProduct({
        barcode: row.barcode,
        design_no: row.design_no,
        size: row.size,
        item_name: row.item_name
      });

      // 2. If product doesn't exist, create it
      if (!product) {
        product = new Product({
          barcode: row.barcode,
          item_name: row.item_name,
          design_no: row.design_no,
          size: row.size,
          colour: row.colour,
          box_no: row.box_no,
          rate: row.rate,
          mrp: row.mrp
        });
        await product.save();
      } else {
        // Update product details if they are provided/changed
        let updated = false;
        if (row.barcode && product.barcode !== row.barcode) { product.barcode = row.barcode; updated = true; }
        if (row.colour && product.colour !== row.colour) { product.colour = row.colour; updated = true; }
        if (row.box_no && product.box_no !== row.box_no) { product.box_no = row.box_no; updated = true; }
        if (row.rate && product.rate !== row.rate) { product.rate = row.rate; updated = true; }
        if (row.mrp && product.mrp !== row.mrp) { product.mrp = row.mrp; updated = true; }
        if (updated) {
          await product.save();
        }
      }

      // 3. Update stock record
      let stock = await Stock.findOne({ branch_id: branchId, product_id: product._id });
      const oldQty = stock ? stock.quantity : 0;
      const newQty = row.quantity;

      if (!stock) {
        stock = new Stock({
          branch_id: branchId,
          product_id: product._id,
          quantity: newQty
        });
      } else {
        stock.quantity = newQty;
      }
      await stock.save();

      // 4. Record transaction (STOCK_UPLOAD)
      // Transaction logs the delta or the absolute setting? We log the absolute uploaded quantity
      const transaction = new StockTransaction({
        branch_id: branchId,
        product_id: product._id,
        transaction_type: 'STOCK_UPLOAD',
        quantity: newQty,
        reference_id: log._id
      });
      await transaction.save();

      processedCount++;
    }

    if (processedCount === 0) {
      const headerList = (rows && rows.headers) ? rows.headers.join(', ') : 'unknown';
      throw new Error(`Failed to import stock: 0 records were processed. Please check your Excel headers. Detected columns: [${headerList}]. Required columns: Item Name, Design Number, Size, Available Quantity, Rate, MRP.`);
    }

    // Mark upload log as successful
    log.status = 'SUCCESS';
    log.records_processed = processedCount;
    await log.save();

    return { success: true, recordsProcessed: processedCount };
  } catch (error) {
    log.status = 'FAILED';
    log.error_message = error.message;
    await log.save();
    throw error;
  }
};

module.exports = {
  uploadStockFile
};
