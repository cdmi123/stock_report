const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Sale = require('../models/Sale');
const Transfer = require('../models/Transfer');
const Branch = require('../models/Branch');
const ActivityLog = require('../models/ActivityLog');
const mongoose = require('mongoose');

const getDashboard = async (req, res) => {
  const user = req.user;

  try {
    if (user.role === 'Super Admin') {
      // 1. Super Admin Dashboard Metrics
      const totalProducts = await Product.countDocuments();
      
      const stockAggregate = await Stock.aggregate([
        { $group: { _id: null, totalStock: { $sum: "$quantity" } } }
      ]);
      const totalStock = stockAggregate[0] ? stockAggregate[0].totalStock : 0;

      const salesAggregate = await Sale.aggregate([
        { $group: { _id: null, totalSales: { $sum: "$quantity" } } }
      ]);
      const totalSales = salesAggregate[0] ? salesAggregate[0].totalSales : 0;

      const pendingTransfers = await Transfer.countDocuments({ status: 'Pending' });
      const lowStockProducts = await Stock.countDocuments({ quantity: { $lt: 5 } });

      // Branch Performance
      const branchPerformance = await Sale.aggregate([
        {
          $group: {
            _id: "$branch_id",
            totalSold: { $sum: "$quantity" },
            revenue: { $sum: { $multiply: ["$quantity", "$rate"] } }
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
      ]);

      // Monthly sales chart data (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      const chartDataAggregate = await Sale.aggregate([
        { $match: { sale_date: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$sale_date" },
              month: { $month: "$sale_date" }
            },
            revenue: { $sum: { $multiply: ["$quantity", "$rate"] } }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]);

      // Format chart data
      const monthsName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const chartLabels = [];
      const chartRevenue = [];

      for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - 5 + i);
        const year = d.getFullYear();
        const monthNum = d.getMonth() + 1; // 1-indexed for comparison
        chartLabels.push(`${monthsName[d.getMonth()]} ${year}`);

        const match = chartDataAggregate.find(item => item._id.year === year && item._id.month === monthNum);
        chartRevenue.push(match ? match.revenue : 0);
      }

      // Recent Transfers
      const recentTransfers = await Transfer.find()
        .populate('from_branch')
        .populate('to_branch')
        .populate('product_id')
        .sort({ createdAt: -1 })
        .limit(10);

      res.render('dashboard/index', {
        role: user.role,
        totalProducts,
        totalStock,
        totalSales,
        pendingTransfers,
        lowStockProducts,
        branchPerformance,
        chartLabels,
        chartRevenue,
        recentTransfers
      });

    } else {
      // 2. Branch Dashboard Metrics
      const branchId = user.branch_id._id;

      const branchStockAgg = await Stock.aggregate([
        { $match: { branch_id: new mongoose.Types.ObjectId(branchId) } },
        { $group: { _id: null, totalStock: { $sum: "$quantity" } } }
      ]);
      const branchStock = branchStockAgg[0] ? branchStockAgg[0].totalStock : 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const branchSalesAgg = await Sale.aggregate([
        { 
          $match: { 
            branch_id: new mongoose.Types.ObjectId(branchId),
            sale_date: { $gte: today }
          } 
        },
        { $group: { _id: null, totalSales: { $sum: "$quantity" } } }
      ]);
      const todaySales = branchSalesAgg[0] ? branchSalesAgg[0].totalSales : 0;

      // Transfer Requests count (inbound + outbound pending)
      const transferRequests = await Transfer.countDocuments({
        $or: [
          { from_branch: branchId },
          { to_branch: branchId }
        ],
        status: 'Pending'
      });

      const lowStockProducts = await Stock.countDocuments({
        branch_id: branchId,
        quantity: { $lt: 5 }
      });

      // Recent activity for this branch
      const recentActivities = await ActivityLog.find()
        .populate('user_id')
        .sort({ createdAt: -1 })
        .limit(5);

      // Branch-wise stock report (include products with no stock record for branch)
      const branchStockReport = await Product.aggregate([
        {
          $lookup: {
            from: 'stocks',
            let: { productId: '$_id' },
            pipeline: [
              { $match: { $expr: { $and: [ { $eq: ['$product_id', '$$productId'] }, { $eq: ['$branch_id', new mongoose.Types.ObjectId(branchId)] } ] } } },
              { $project: { quantity: 1, reserved_quantity: 1 } }
            ],
            as: 'stock'
          }
        },
        { $unwind: { path: '$stock', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            product_id: '$_id',
            item_name: '$item_name',
            design_no: '$design_no',
            size: '$size',
            mrp: '$mrp',
            rate: '$rate',
            quantity: { $ifNull: ['$stock.quantity', 0] },
            reserved_quantity: { $ifNull: ['$stock.reserved_quantity', 0] },
            value: { $multiply: [ { $ifNull: ['$stock.quantity', 0] }, '$mrp' ] }
          }
        },
        { $sort: { quantity: -1, item_name: 1 } },
        { $limit: 100 }
      ]);

      res.render('dashboard/index', {
        role: user.role,
        branchName: user.branch_id.branch_name,
        branchStock,
        todaySales,
        transferRequests,
        lowStockProducts,
        recentActivities,
        branchStockReport
      });
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', {
      title: 'Dashboard Error',
      message: 'Failed to load dashboard data.'
    });
  }
};

module.exports = {
  getDashboard
};
