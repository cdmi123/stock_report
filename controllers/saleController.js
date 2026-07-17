const Sale = require('../models/Sale');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const ActivityLog = require('../models/ActivityLog');
const { uploadSaleFile } = require('../services/saleService');
const { parseExcel } = require('../helpers/excelHelper');
const { matchProduct, findProductInNetworkStock } = require('../helpers/productMatcher');

const getSales = async (req, res) => {
  const user = req.user;
  const { branchId } = req.query;

  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    
    // Construct Query
    const filter = {};
    if (user.role === 'Super Admin') {
      if (branchId) {
        filter.branch_id = branchId;
      }
    } else {
      filter.branch_id = user.branch_id._id;
    }

    const sales = await Sale.find(filter)
      .populate('branch_id')
      .populate('product_id')
      .sort({ sale_date: -1 })
      .then(list => list.filter(item => item.product_id !== null)); // filter orphans

    res.render('sales/index', {
      sales,
      branches,
      selectedBranch: user.role === 'Super Admin' ? branchId : user.branch_id._id.toString(),
      role: user.role
    });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).render('error', { title: 'Sales Error', message: 'Failed to load sales records.' });
  }
};

const getUploadSale = async (req, res) => {
  const user = req.user;
  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('sales/upload', {
      branches,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: null,
      success: null,
      shortagesCount: 0,
      unmatchedCount: 0,
      unmatched: []
    });
  } catch (error) {
    console.error('Error rendering sales upload:', error);
    res.status(500).render('error', { title: 'Sales Error', message: 'Failed to load upload form.' });
  }
};

const SalesImportSession = require('../models/SalesImportSession');
const Transfer = require('../models/Transfer');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const { getBranchStockRecommendations } = require('../services/allocationService');

const postUploadSale = async (req, res) => {
  const user = req.user;
  const { branch_id } = req.body;
  const file = req.file;

  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    const targetBranchId = user.role === 'Super Admin' ? branch_id : user.branch_id._id.toString();

    if (!targetBranchId) {
      return res.render('sales/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Please select a branch.',
        success: null,
        shortagesCount: 0,
        unmatchedCount: 0,
        unmatched: []
      });
    }

    if (!file) {
      return res.render('sales/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Please upload an Excel file.',
        success: null,
        shortagesCount: 0,
        unmatchedCount: 0,
        unmatched: []
      });
    }

    const branch = await Branch.findById(targetBranchId);
    if (!branch) {
      return res.render('sales/upload', {
        branches,
        role: user.role,
        userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Branch not found.',
        success: null,
        shortagesCount: 0,
        unmatchedCount: 0,
        unmatched: []
      });
    }

    // 1. Parse Excel Rows
    const excelRows = parseExcel(file.buffer, 'SALE');
    if (excelRows.length === 0) {
      const headerList = excelRows.headers ? excelRows.headers.join(', ') : 'unknown';
      throw new Error(`Failed to import sales: 0 records were processed. Detected columns: [${headerList}]. Required columns: Item Name, Design Number, Size.`);
    }

    // 2. Aggregate Excel Rows (Group identical items and sum sold quantities)
    const aggregated = {};
    excelRows.forEach(row => {
      if (!row.design_no && !row.item_name) return;
      const key = `${row.design_no || ''}::${row.size || ''}::${row.item_name || ''}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          design_no: row.design_no,
          size: row.size,
          item_name: row.item_name,
          box_no: row.box_no,
          sold_quantity: 0,
          barcode: row.barcode
        };
      }
      aggregated[key].sold_quantity += 1;
    });

    // 3. Process each row for stock analysis and allocation recommendations
    const sessionRows = [];
    let excelRowNumber = 1;

    for (const key of Object.keys(aggregated)) {
      const item = aggregated[key];
      excelRowNumber++;

      let product = await matchProduct({
        barcode: item.barcode,
        design_no: item.design_no,
        size: item.size,
        item_name: item.item_name
      });

      let status = 'UNMATCHED';
      let currentBranchQty = 0;
      let additionalQtyRequired = 0;
      let availableBranches = [];
      let recommendedBranch = null;
      let autoAllocation = [];

      if (product) {
        const stock = await Stock.findOne({ branch_id: targetBranchId, product_id: product._id });
        currentBranchQty = stock ? stock.quantity : 0;

        if (currentBranchQty >= item.sold_quantity) {
          status = 'READY';
          additionalQtyRequired = 0;
        } else {
          status = 'SHORTAGE';
          additionalQtyRequired = item.sold_quantity - currentBranchQty;

          // Query stock routing recommendations from other branches
          const rec = await getBranchStockRecommendations(product._id, targetBranchId, additionalQtyRequired);
          availableBranches = rec.availableBranches;
          recommendedBranch = rec.recommendedBranch;
          autoAllocation = rec.autoAllocation;
        }
      } else {
        additionalQtyRequired = item.sold_quantity;

        const networkMatch = await findProductInNetworkStock({
          barcode: item.barcode,
          design_no: item.design_no,
          size: item.size
        }, targetBranchId);

        if (networkMatch.product && networkMatch.availableBranches.length > 0) {
          product = networkMatch.product;
          availableBranches = networkMatch.availableBranches;
          recommendedBranch = availableBranches[0] || null;

          let remainingNeeded = additionalQtyRequired;
          autoAllocation = [];
          for (const branchOption of availableBranches) {
            if (remainingNeeded <= 0) break;
            const allocatedQuantity = Math.min(branchOption.quantity, remainingNeeded);
            autoAllocation.push({
              branch_id: branchOption.branch_id,
              branch_name: branchOption.branch_name,
              quantity: allocatedQuantity
            });
            remainingNeeded -= allocatedQuantity;
          }
        }
      }

      sessionRows.push({
        excel_row_number: excelRowNumber,
        barcode: item.barcode || '',
        item_name: item.item_name || '',
        design_no: item.design_no || '',
        size: item.size || '',
        colour: item.colour || '',
        sold_quantity: item.sold_quantity,
        product_id: product ? product._id : null,
        status,
        current_branch_qty: currentBranchQty,
        additional_qty_required: additionalQtyRequired,
        available_branches: availableBranches,
        recommended_branch: recommendedBranch,
        auto_allocation: autoAllocation
      });
    }

    // 4. Create and Save Import Session
    const session = new SalesImportSession({
      branch_id: targetBranchId,
      uploaded_by: user._id,
      filename: file.originalname,
      rows: sessionRows
    });
    await session.save();

    // Log Activity
    await new ActivityLog({
      user_id: user._id,
      action: 'SALE_UPLOAD',
      details: `Uploaded sales file "${file.originalname}" for branch: ${branch.branch_name}. Created import preview session.`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    // Redirect to Interactive Import Staging Preview
    res.redirect(`/sales/import/preview/${session._id}`);

  } catch (error) {
    console.error('Error uploading sales file:', error);

    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('sales/upload', {
      branches,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: error.message,
      success: null,
      shortagesCount: 0,
      unmatchedCount: 0,
      unmatched: []
    });
  }
};

const getImportPreview = async (req, res) => {
  const { sessionId } = req.params;
  const user = req.user;

  try {
    const session = await SalesImportSession.findById(sessionId)
      .populate('branch_id')
      .populate('rows.product_id');

    if (!session) {
      return res.status(404).render('error', { title: 'Import Error', message: 'Import session not found.' });
    }

    if (session.is_committed) {
      return res.status(400).render('error', { title: 'Import Error', message: 'This sales session has already been finalized.' });
    }

    res.render('sales/preview', {
      session,
      role: user.role
    });
  } catch (error) {
    console.error('Error loading import preview:', error);
    res.status(500).render('error', { title: 'Import Error', message: 'Failed to load import preview.' });
  }
};

const postImportAction = async (req, res) => {
  const { sessionId, rowId, actionType, sourceBranchId } = req.body;
  const user = req.user;

  try {
    const session = await SalesImportSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    // Handle Confirm Import Action (Commiting the whole session)
    if (actionType === 'CONFIRM_IMPORT') {
      let committedCount = 0;

      // Clear existing sales and sale upload transactions for this branch
      await Sale.deleteMany({ branch_id: session.branch_id });
      await StockTransaction.deleteMany({ branch_id: session.branch_id, transaction_type: 'SALE_UPLOAD' });

      // Group rows by product_id to merge quantities for the same product
      const productSalesMap = {};
      for (const row of session.rows) {
        if (row.status === 'HOLD' || row.status === 'UNMATCHED') continue;
        if (!row.product_id) continue;

        const prodIdStr = row.product_id.toString();
        if (!productSalesMap[prodIdStr]) {
          productSalesMap[prodIdStr] = {
            product_id: row.product_id,
            sold_quantity: 0,
            current_branch_qty: row.current_branch_qty
          };
        }
        productSalesMap[prodIdStr].sold_quantity += row.sold_quantity;
        row.status = 'COMMITTED';
      }

      for (const prodIdStr of Object.keys(productSalesMap)) {
        const item = productSalesMap[prodIdStr];
        const product = await Product.findById(item.product_id);
        if (!product) continue;

        // Determine how many items we process locally vs request
        const localAvailable = Math.max(0, item.current_branch_qty);
        const toDeduct = Math.min(item.sold_quantity, localAvailable);

        if (toDeduct > 0) {
          // Deduct from local stock
          let stock = await Stock.findOne({ branch_id: session.branch_id, product_id: product._id });
          if (stock) {
            stock.quantity -= toDeduct;
            await stock.save();
          }

          // Record Sale
          const sale = new Sale({
            branch_id: session.branch_id,
            product_id: product._id,
            sale_date: new Date(),
            quantity: toDeduct,
            rate: product.rate,
            mrp: product.mrp
          });
          await sale.save();

          // Record Transaction log
          const transaction = new StockTransaction({
            branch_id: session.branch_id,
            product_id: product._id,
            transaction_type: 'SALE_UPLOAD',
            quantity: toDeduct,
            reference_id: sale._id
          });
          await transaction.save();
        }

        committedCount += item.sold_quantity;
      }

      session.is_committed = true;
      await session.save();

      // Trigger socket dashboard update
      const branch = await Branch.findById(session.branch_id);
      const io = req.app.get('io');
      if (io && branch) {
        io.emit('dashboardUpdate', {
          type: 'SALE_UPLOAD',
          message: `Sales import finalized for ${branch.branch_name}. Processed ${committedCount} items.`,
          branchId: session.branch_id
        });
      }

      return res.json({ success: true, message: `Successfully committed ${committedCount} sales to inventory.` });
    }

    // Handle individual row actions (Create Transfer, Auto Allocate, Reserve, Hold)
    const row = session.rows.id(rowId);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Row not found.' });
    }

    if (actionType === 'CREATE_TRANSFER') {
      const srcBranchId = sourceBranchId || (row.recommended_branch ? row.recommended_branch.branch_id : null);
      if (!srcBranchId) {
        return res.status(400).json({ success: false, message: 'No supplying branch selected.' });
      }

      // Create Stock Transfer Request
      const transfer = new Transfer({
        product_id: row.product_id,
        from_branch: srcBranchId,
        to_branch: session.branch_id,
        quantity: row.additional_qty_required,
        status: 'Pending'
      });
      await transfer.save();

      // Update row status
      row.status = 'READY'; // Marked as ready to import since transfer is logged
      await session.save();

      return res.json({ success: true, message: `Transfer request created for ${row.additional_qty_required} units.` });
    }

    if (actionType === 'AUTO_ALLOCATE') {
      if (row.auto_allocation.length === 0) {
        return res.status(400).json({ success: false, message: 'No allocation distribution available.' });
      }

      // Create transfers across multiple branches
      for (const alloc of row.auto_allocation) {
        const transfer = new Transfer({
          product_id: row.product_id,
          from_branch: alloc.branch_id,
          to_branch: session.branch_id,
          quantity: alloc.quantity,
          status: 'Pending'
        });
        await transfer.save();
      }

      row.status = 'READY';
      await session.save();

      return res.json({ success: true, message: `Split transfer requests generated successfully.` });
    }

    if (actionType === 'RESERVE_STOCK') {
      const srcBranchId = sourceBranchId || (row.recommended_branch ? row.recommended_branch.branch_id : null);
      if (!srcBranchId) {
        return res.status(400).json({ success: false, message: 'No source branch available to reserve.' });
      }

      // Reserve stock in source branch Stock record
      const stock = await Stock.findOne({ branch_id: srcBranchId, product_id: row.product_id });
      if (!stock || (stock.quantity - stock.reserved_quantity) < row.additional_qty_required) {
        return res.status(400).json({ success: false, message: 'Insufficient stock available to reserve in source branch.' });
      }

      stock.reserved_quantity += row.additional_qty_required;
      await stock.save();

      // Log a temporary transfer request with state "Approved" so it's already staged for logistics dispatch
      const transfer = new Transfer({
        product_id: row.product_id,
        from_branch: srcBranchId,
        to_branch: session.branch_id,
        quantity: row.additional_qty_required,
        status: 'Approved' // Pre-approved because stock is reserved
      });
      await transfer.save();

      row.status = 'READY';
      await session.save();

      return res.json({ success: true, message: `Successfully reserved ${row.additional_qty_required} pieces.` });
    }

    if (actionType === 'HOLD_SALE') {
      row.status = 'HOLD';
      await session.save();
      return res.json({ success: true, message: 'Sale item status changed to HOLD.' });
    }

    return res.status(400).json({ success: false, message: 'Invalid action type.' });

  } catch (error) {
    console.error('Error processing import action:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSaleAvailability = async (req, res) => {
  const { saleId } = req.params;
  try {
    const sale = await Sale.findById(saleId).populate('product_id').populate('branch_id');
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale record not found.' });
    }

    const currentStock = await Stock.findOne({ branch_id: sale.branch_id._id, product_id: sale.product_id._id });
    const currentQty = currentStock ? currentStock.quantity : 0;

    const rec = await getBranchStockRecommendations(sale.product_id._id, sale.branch_id._id, sale.quantity);

    return res.json({
      success: true,
      product: {
        _id: sale.product_id._id,
        item_name: sale.product_id.item_name,
        design_no: sale.product_id.design_no,
        size: sale.product_id.size,
        colour: sale.product_id.colour || 'N/A',
        sold_quantity: sale.quantity
      },
      currentBranch: {
        branch_name: sale.branch_id.branch_name,
        quantity: currentQty
      },
      availableBranches: rec.availableBranches,
      recommendedBranch: rec.recommendedBranch
    });
  } catch (error) {
    console.error('Error fetching sale availability:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSales,
  getUploadSale,
  postUploadSale,
  getImportPreview,
  postImportAction,
  getSaleAvailability
};

