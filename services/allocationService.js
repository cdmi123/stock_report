const Stock = require('../models/Stock');
const Branch = require('../models/Branch');

/**
 * Calculates stock recommendations and auto-allocations across branches.
 * @param {string} productId - Product ID to check
 * @param {string} currentBranchId - ID of the branch to exclude
 * @param {number} requiredQty - Shortage quantity needed
 * @returns {Promise<Object>} Recommendation details
 */
const getBranchStockRecommendations = async (productId, currentBranchId, requiredQty) => {
  // 1. Fetch all stock records for this product across all branches except the current one
  const stockRecords = await Stock.find({
    product_id: productId,
    branch_id: { $ne: currentBranchId }
  }).populate('branch_id');

  // 2. Map and filter records that have net available stock > 0
  const availableBranches = stockRecords
    .map(s => {
      const branch = s.branch_id;
      const netAvailable = Math.max(0, s.quantity - s.reserved_quantity);
      return {
        branch_id: branch._id,
        branch_name: branch.branch_name,
        quantity: netAvailable,
        priority: branch.priority || 99
      };
    })
    .filter(b => b.quantity > 0)
    // 3. Sort by priority order (ascending: 1, 2, 3...)
    .sort((a, b) => a.priority - b.priority);

  // Recommended single branch (first priority branch with any stock)
  const recommendedBranch = availableBranches.length > 0 ? {
    branch_id: availableBranches[0].branch_id,
    branch_name: availableBranches[0].branch_name,
    quantity: availableBranches[0].quantity
  } : null;

  // 4. Calculate Auto-Allocation (Cascade)
  let remainingNeeded = requiredQty;
  const autoAllocation = [];

  for (const b of availableBranches) {
    if (remainingNeeded <= 0) break;

    const allocatedAmount = Math.min(b.quantity, remainingNeeded);
    autoAllocation.push({
      branch_id: b.branch_id,
      branch_name: b.branch_name,
      quantity: allocatedAmount
    });

    remainingNeeded -= allocatedAmount;
  }

  return {
    availableBranches,
    recommendedBranch,
    autoAllocation
  };
};

module.exports = {
  getBranchStockRecommendations
};
