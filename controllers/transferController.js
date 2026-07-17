const Transfer = require('../models/Transfer');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const ActivityLog = require('../models/ActivityLog');
const { updateTransferStatus } = require('../services/transferService');
const { notifyTransferRequestCreated, notifyTransferStatusChanged } = require('../services/notificationService');

const serializeTransferForRealtime = (transfer) => ({
  transferId: transfer._id.toString(),
  status: transfer.status,
  fromBranchId: transfer.from_branch && transfer.from_branch._id ? transfer.from_branch._id.toString() : transfer.from_branch.toString(),
  toBranchId: transfer.to_branch && transfer.to_branch._id ? transfer.to_branch._id.toString() : transfer.to_branch.toString()
});

const getTransfers = async (req, res) => {
  const user = req.user;
  try {
    const query = {};
    if (user.role !== 'Super Admin') {
      query.$or = [
        { from_branch: user.branch_id._id },
        { to_branch: user.branch_id._id }
      ];
    }

    const transfers = await Transfer.find(query)
      .populate('from_branch')
      .populate('to_branch')
      .populate('product_id')
      .sort({ createdAt: -1 })
      .then(list => list.filter(item => item.product_id !== null));

    const branches = await Branch.find().sort({ branch_name: 1 });
    const products = await Product.find().sort({ item_name: 1 });

    res.render('transfers/index', {
      transfers,
      branches,
      products,
      role: user.role,
      userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).render('error', { title: 'Transfer Error', message: 'Failed to load transfers.' });
  }
};

const postCreateTransfer = async (req, res) => {
  const user = req.user;
  const { product_id, from_branch, to_branch, quantity } = req.body;

  try {
    const qty = parseInt(quantity, 10);
    const destinationBranchId = user.role === 'Super Admin' ? to_branch : user.branch_id._id.toString();

    const transfersQuery = {};
    if (user.role !== 'Super Admin') {
      transfersQuery.$or = [
        { from_branch: user.branch_id._id },
        { to_branch: user.branch_id._id }
      ];
    }
    const transfers = await Transfer.find(transfersQuery).populate('from_branch').populate('to_branch').populate('product_id').sort({ createdAt: -1 });
    const branches = await Branch.find().sort({ branch_name: 1 });
    const products = await Product.find().sort({ item_name: 1 });

    if (!product_id || !from_branch || !destinationBranchId || !qty || qty <= 0) {
      return res.render('transfers/index', {
        transfers, branches, products, role: user.role, userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Please fill out all fields correctly.', success: null
      });
    }

    if (from_branch === destinationBranchId) {
      return res.render('transfers/index', {
        transfers, branches, products, role: user.role, userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Source and destination branches cannot be the same.', success: null
      });
    }

    const sourceStock = await Stock.findOne({ branch_id: from_branch, product_id });
    const available = sourceStock ? sourceStock.quantity : 0;
    if (available <= 0) {
      return res.render('transfers/index', {
        transfers, branches, products, role: user.role, userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
        error: 'Selected source branch has no stock of this product.', success: null
      });
    }

    const finalQty = Math.min(qty, available);

    const newTransfer = new Transfer({
      from_branch,
      to_branch: destinationBranchId,
      product_id,
      quantity: finalQty,
      status: 'Pending'
    });
    await newTransfer.save();

    await new ActivityLog({
      user_id: user._id,
      action: 'CREATE_TRANSFER',
      details: `Created transfer request for product ID ${product_id} (${finalQty} pcs) from branch ID ${from_branch} to branch ID ${destinationBranchId}`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    const io = req.app.get('io');
    try {
      await notifyTransferRequestCreated({ transferId: newTransfer._id, io });
    } catch (notificationError) {
      console.error('Transfer notification dispatch failed:', notificationError);
    }

    if (io) {
      io.emit('dashboardUpdate', {
        type: 'TRANSFER_CREATE',
        message: 'New stock transfer request pending.',
        transfer: serializeTransferForRealtime(newTransfer)
      });
    }

    const updatedTransfers = await Transfer.find(transfersQuery).populate('from_branch').populate('to_branch').populate('product_id').sort({ createdAt: -1 });
    res.render('transfers/index', {
      transfers: updatedTransfers, branches, products, role: user.role, userBranchId: user.branch_id ? user.branch_id._id.toString() : null,
      error: null, success: 'Transfer request created successfully!'
    });
  } catch (error) {
    console.error('Error creating manual transfer:', error);
    res.status(500).render('error', { title: 'Transfer Error', message: 'Failed to request stock.' });
  }
};

const postUpdateStatus = async (req, res) => {
  const user = req.user;
  const { id } = req.params;
  const { status } = req.body;

  try {
    const transfer = await Transfer.findById(id).populate('from_branch').populate('to_branch').populate('product_id');
    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Transfer request not found.' });
    }

    if (user.role !== 'Super Admin') {
      const isFromBranch = user.branch_id && user.branch_id._id.toString() === transfer.from_branch._id.toString();
      const isToBranch = user.branch_id && user.branch_id._id.toString() === transfer.to_branch._id.toString();

      if (['Approved', 'Picked', 'In Transit', 'Rejected'].includes(status)) {
        if (!isFromBranch) {
          return res.status(403).json({ success: false, message: 'Only the supplying branch manager can approve/reject/ship this request.' });
        }
      } else if (status === 'Delivered') {
        if (!isToBranch) {
          return res.status(403).json({ success: false, message: 'Only the receiving branch manager can mark this request as delivered.' });
        }
      } else {
        return res.status(400).json({ success: false, message: 'Invalid status transition requested.' });
      }
    }

    await updateTransferStatus(id, status, user._id);

    await new ActivityLog({
      user_id: user._id,
      action: 'UPDATE_TRANSFER',
      details: `Updated transfer ${id} status to ${status} for product ${transfer.product_id.item_name}`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    const updatedTransfer = await Transfer.findById(id).populate('from_branch').populate('to_branch').populate('product_id');

    const io = req.app.get('io');
    try {
      await notifyTransferStatusChanged({ transferId: updatedTransfer._id, status, io });
    } catch (notificationError) {
      console.error('Transfer status notification dispatch failed:', notificationError);
    }

    if (io) {
      io.emit('dashboardUpdate', {
        type: 'TRANSFER_UPDATE',
        message: `Transfer status updated to ${status}`,
        transfer: serializeTransferForRealtime(updatedTransfer)
      });
    }

    res.json({
      success: true,
      message: `Transfer status successfully updated to ${status}.`,
      transfer: serializeTransferForRealtime(updatedTransfer)
    });
  } catch (error) {
    console.error('Error updating transfer status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTransfers,
  postCreateTransfer,
  postUpdateStatus
};

