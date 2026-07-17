const Transfer = require('../models/Transfer');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');
const Branch = require('../models/Branch');

/**
 * Automatically calculates and creates a transfer recommendation for a product shortage.
 * @param {Object} params
 * @param {string} params.toBranchId - Branch experiencing the shortage
 * @param {string} params.productId - Product with the shortage
 * @param {number} params.shortageQty - Quantity needed
 */
const createTransferRecommendation = async ({ toBranchId, productId, shortageQty }) => {
  try {
    // 1. Search all other branches for stock of this product
    const otherStocks = await Stock.find({
      branch_id: { $ne: toBranchId },
      product_id: productId,
      quantity: { $gt: 0 }
    }).sort({ quantity: -1 }); // Sort by quantity descending

    if (otherStocks.length === 0) {
      // No stock available anywhere else. This will show up in the Purchase Requirement / Shortage reports.
      return null;
    }

    // 2. Select the branch with the highest available quantity
    const sourceStock = otherStocks[0];
    const sourceBranchId = sourceStock.branch_id;
    const availableQty = sourceStock.quantity;

    // Recommend transfer of the smaller of availableQty or shortageQty
    const transferQty = Math.min(availableQty, shortageQty);

    if (transferQty <= 0) return null;

    // 3. Create the Transfer order in "Pending" status
    const transfer = new Transfer({
      from_branch: sourceBranchId,
      to_branch: toBranchId,
      product_id: productId,
      quantity: transferQty,
      status: 'Pending'
    });
    await transfer.save();

    return transfer;
  } catch (error) {
    console.error('Error creating transfer recommendation:', error);
    throw error;
  }
};

/**
 * Updates a transfer request status and manages inventory movements on delivery.
 * @param {string} transferId - ID of the transfer
 * @param {string} newStatus - New status ('Approved', 'Picked', 'In Transit', 'Delivered', 'Rejected')
 * @param {string} userId - ID of the user performing action
 */
const updateTransferStatus = async (transferId, newStatus, userId) => {
  try {
    const transfer = await Transfer.findById(transferId);
    if (!transfer) {
      throw new Error('Transfer request not found.');
    }

    const oldStatus = transfer.status;
    if (oldStatus === 'Delivered' || oldStatus === 'Rejected') {
      throw new Error(`Cannot modify a transfer that is already ${oldStatus}.`);
    }

    // Update status
    transfer.status = newStatus;
    await transfer.save();

    // If new status is Delivered, execute stock movements
    if (newStatus === 'Delivered') {
      // 1. Deduct from source branch stock
      let sourceStock = await Stock.findOne({
        branch_id: transfer.from_branch,
        product_id: transfer.product_id
      });

      if (!sourceStock) {
        // Fallback: create record with negative stock or 0, though stock should exist
        sourceStock = new Stock({
          branch_id: transfer.from_branch,
          product_id: transfer.product_id,
          quantity: 0
        });
      }

      sourceStock.quantity -= transfer.quantity;
      await sourceStock.save();

      // 2. Add to destination branch stock
      let destStock = await Stock.findOne({
        branch_id: transfer.to_branch,
        product_id: transfer.product_id
      });

      if (!destStock) {
        destStock = new Stock({
          branch_id: transfer.to_branch,
          product_id: transfer.product_id,
          quantity: 0
        });
      }

      destStock.quantity += transfer.quantity;
      await destStock.save();

      // 3. Log stock transactions
      const txOut = new StockTransaction({
        branch_id: transfer.from_branch,
        product_id: transfer.product_id,
        transaction_type: 'TRANSFER_OUT',
        quantity: transfer.quantity,
        reference_id: transfer._id
      });
      await txOut.save();

      const txIn = new StockTransaction({
        branch_id: transfer.to_branch,
        product_id: transfer.product_id,
        transaction_type: 'TRANSFER_IN',
        quantity: transfer.quantity,
        reference_id: transfer._id
      });
      await txIn.save();
    }

    return transfer;
  } catch (error) {
    console.error('Error updating transfer status:', error);
    throw error;
  }
};

module.exports = {
  createTransferRecommendation,
  updateTransferStatus
};
