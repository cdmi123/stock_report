const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Sale = require('../models/Sale');
const Transfer = require('../models/Transfer');
const Branch = require('../models/Branch');

/**
 * Gets stock report for a specific branch, or all branches if branchId is null.
 */
const getBranchWiseStock = async (branchId = null) => {
  const query = {};
  if (branchId) {
    query.branch_id = branchId;
  }

  return Stock.find(query)
    .populate('branch_id')
    .populate('product_id')
    .then(stocks => stocks.filter(s => s.product_id !== null)); // filter out orphaned stock
};

/**
 * Generates a pivot table showing product stocks across all branches.
 */
const getConsolidatedStock = async () => {
  const branches = await Branch.find().sort({ branch_name: 1 });
  const stocks = await Stock.find().populate('product_id').populate('branch_id');

  // Pivot by Product ID
  const pivot = {};

  stocks.forEach(s => {
    if (!s.product_id) return;
    const prodId = s.product_id._id.toString();

    if (!pivot[prodId]) {
      pivot[prodId] = {
        product: s.product_id,
        branchQuantities: {},
        totalQuantity: 0
      };
      // Initialize all branches with 0
      branches.forEach(b => {
        pivot[prodId].branchQuantities[b._id.toString()] = 0;
      });
    }

    const branchIdStr = s.branch_id ? s.branch_id._id.toString() : '';
    if (branchIdStr) {
      pivot[prodId].branchQuantities[branchIdStr] = s.quantity;
      pivot[prodId].totalQuantity += s.quantity;
    }
  });

  return {
    branches,
    rows: Object.values(pivot)
  };
};

/**
 * Gets daily sales report, optionally filtered by branch.
 */
const getDailySalesReport = async (branchId = null) => {
  const match = {};
  if (branchId) {
    match.branch_id = new mongoose.Types.ObjectId(branchId);
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$sale_date" },
          month: { $month: "$sale_date" },
          day: { $dayOfMonth: "$sale_date" }
        },
        totalSalesQty: { $sum: "$quantity" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$rate"] } },
        totalMrpRevenue: { $sum: { $multiply: ["$quantity", "$mrp"] } },
        transactionsCount: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } }
  ];

  return Sale.aggregate(pipeline);
};

/**
 * Gets monthly sales report, optionally filtered by branch.
 */
const getMonthlySalesReport = async (branchId = null) => {
  const match = {};
  if (branchId) {
    match.branch_id = new mongoose.Types.ObjectId(branchId);
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$sale_date" },
          month: { $month: "$sale_date" }
        },
        totalSalesQty: { $sum: "$quantity" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$rate"] } },
        totalMrpRevenue: { $sum: { $multiply: ["$quantity", "$mrp"] } },
        transactionsCount: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ];

  return Sale.aggregate(pipeline);
};

/**
 * Gets transfer history, optionally filtered by branch (either from or to).
 */
const getTransferReport = async (branchId = null, pendingOnly = false) => {
  const query = {};
  if (branchId) {
    query.$or = [{ from_branch: branchId }, { to_branch: branchId }];
  }
  if (pendingOnly) {
    query.status = 'Pending';
  }

  return Transfer.find(query)
    .populate('from_branch')
    .populate('to_branch')
    .populate('product_id')
    .sort({ createdAt: -1 });
};

/**
 * Identifies items that have negative stock (unfulfilled sales)
 * or total consolidated stock <= 2, indicating purchase need.
 */
const getPurchaseRequirementReport = async () => {
  const consolidated = await getConsolidatedStock();
  const requirements = [];

  consolidated.rows.forEach(row => {
    // If consolidated stock is low (e.g. <= 2) or there is negative stock in any branch
    const hasNegativeStock = Object.values(row.branchQuantities).some(qty => qty < 0);
    if (row.totalQuantity <= 2 || hasNegativeStock) {
      requirements.push({
        product: row.product,
        totalQuantity: row.totalQuantity,
        branchQuantities: row.branchQuantities,
        branches: consolidated.branches,
        suggestedPurchaseQty: row.totalQuantity < 0 ? Math.abs(row.totalQuantity) + 10 : 10
      });
    }
  });

  return requirements;
};

/**
 * Gets products where stock is below a safety limit (e.g. < 5).
 */
const getLowStockReport = async (branchId = null, threshold = 5) => {
  const query = { quantity: { $lt: threshold } };
  if (branchId) {
    query.branch_id = branchId;
  }

  return Stock.find(query)
    .populate('branch_id')
    .populate('product_id')
    .sort({ quantity: 1 })
    .then(stocks => stocks.filter(s => s.product_id !== null));
};

/**
 * Dead stock report: positive stock but 0 sales in the last 30 days.
 */
const getDeadStockReport = async (branchId = null, daysLimit = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

  // 1. Get products sold in the last 30 days
  const saleQuery = { sale_date: { $gte: cutoffDate } };
  if (branchId) {
    saleQuery.branch_id = branchId;
  }
  const recentlySoldProductIds = await Sale.distinct('product_id', saleQuery);

  // 2. Find stock documents with quantity > 0 where product is NOT in recently sold list
  const stockQuery = {
    quantity: { $gt: 0 },
    product_id: { $nin: recentlySoldProductIds }
  };
  if (branchId) {
    stockQuery.branch_id = branchId;
  }

  return Stock.find(stockQuery)
    .populate('branch_id')
    .populate('product_id')
    .sort({ quantity: -1 })
    .then(stocks => stocks.filter(s => s.product_id !== null));
};

/**
 * Fast moving products: high sales counts in the last 30 days.
 */
const getFastMovingProducts = async (branchId = null, limit = 10) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  const match = { sale_date: { $gte: cutoffDate } };
  if (branchId) {
    match.branch_id = new mongoose.Types.ObjectId(branchId);
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: "$product_id",
        totalSold: { $sum: "$quantity" }
      }
    },
    { $sort: { totalSold: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product"
      }
    },
    { $unwind: "$product" }
  ];

  return Sale.aggregate(pipeline);
};

/**
 * Slow moving products: positive stock but very low sales in the last 30 days.
 */
const getSlowMovingProducts = async (branchId = null, limit = 10) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  // 1. Get sales count in the last 30 days for each product
  const match = { sale_date: { $gte: cutoffDate } };
  if (branchId) {
    match.branch_id = new mongoose.Types.ObjectId(branchId);
  }

  const salesAggregate = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$product_id",
        totalSold: { $sum: "$quantity" }
      }
    }
  ]);

  const salesMap = {};
  salesAggregate.forEach(s => {
    salesMap[s._id.toString()] = s.totalSold;
  });

  // 2. Fetch all products with stock > 0
  const stockQuery = { quantity: { $gt: 0 } };
  if (branchId) {
    stockQuery.branch_id = branchId;
  }
  const stocks = await Stock.find(stockQuery).populate('product_id').populate('branch_id');

  // 3. Map stocks and merge with sales numbers
  const list = stocks
    .filter(s => s.product_id !== null)
    .map(s => {
      const sold = salesMap[s.product_id._id.toString()] || 0;
      return {
        stock: s,
        totalSold: sold
      };
    });

  // Sort by sales ascending (slowest first)
  list.sort((a, b) => a.totalSold - b.totalSold);

  return list.slice(0, limit);
};

/**
 * Branch performance report: compares branches on total sold qty and revenue.
 */
const getBranchPerformance = async () => {
  const pipeline = [
    {
      $group: {
        _id: "$branch_id",
        totalSold: { $sum: "$quantity" },
        revenue: { $sum: { $multiply: ["$quantity", "$rate"] } },
        mrpRevenue: { $sum: { $multiply: ["$quantity", "$mrp"] } }
      }
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id",
        foreignField: "_id",
        as: "branch"
      }
    },
    { $unwind: "$branch" },
    { $sort: { revenue: -1 } }
  ];

  return Sale.aggregate(pipeline);
};

module.exports = {
  getBranchWiseStock,
  getConsolidatedStock,
  getDailySalesReport,
  getMonthlySalesReport,
  getTransferReport,
  getPurchaseRequirementReport,
  getLowStockReport,
  getDeadStockReport,
  getFastMovingProducts,
  getSlowMovingProducts,
  getBranchPerformance
};
const mongoose = require('mongoose'); // Ensure mongoose is available for Type OIDs
