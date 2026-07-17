const reportService = require('../services/reportService');
const Branch = require('../models/Branch');

// Helper to determine branch ID filter based on user role and query param
const getTargetBranchId = (req) => {
  const user = req.user;
  if (user.role === 'Super Admin') {
    return req.query.branchId || null;
  }
  return user.branch_id._id.toString();
};

const getReportsIndex = async (req, res) => {
  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('reports/index', {
      branches,
      role: req.user.role,
      userBranchId: req.user.branch_id ? req.user.branch_id._id.toString() : null
    });
  } catch (error) {
    console.error('Error rendering reports list:', error);
    res.status(500).render('error', { title: 'Reports Error', message: 'Failed to load reports page.' });
  }
};

const getBranchStock = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getBranchWiseStock(targetBranchId);
    
    res.render('reports/branch_stock', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getConsolidatedStock = async (req, res) => {
  try {
    // Restrict Consolidated Stock to Super Admin
    if (req.user.role !== 'Super Admin') {
      return res.status(403).render('error', { title: 'Access Denied', message: 'Only Super Admins can view consolidated stock.' });
    }
    const data = await reportService.getConsolidatedStock();
    res.render('reports/consolidated_stock', { data });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getDailySales = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getDailySalesReport(targetBranchId);

    res.render('reports/daily_sales', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getMonthlySales = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getMonthlySalesReport(targetBranchId);

    res.render('reports/monthly_sales', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getTransfers = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getTransferReport(targetBranchId, false);

    res.render('reports/transfers', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getPendingTransfers = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getTransferReport(targetBranchId, true);

    res.render('reports/pending_transfers', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getPurchaseRequirement = async (req, res) => {
  try {
    const data = await reportService.getPurchaseRequirementReport();
    res.render('reports/purchase_requirement', { data });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getLowStock = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getLowStockReport(targetBranchId);

    res.render('reports/low_stock', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getDeadStock = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getDeadStockReport(targetBranchId);

    res.render('reports/dead_stock', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getFastMoving = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getFastMovingProducts(targetBranchId);

    res.render('reports/fast_moving', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getSlowMoving = async (req, res) => {
  try {
    const targetBranchId = getTargetBranchId(req);
    const branches = await Branch.find().sort({ branch_name: 1 });
    const data = await reportService.getSlowMovingProducts(targetBranchId);

    res.render('reports/slow_moving', {
      data,
      branches,
      selectedBranch: req.user.role === 'Super Admin' ? req.query.branchId : req.user.branch_id._id.toString(),
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

const getBranchPerformance = async (req, res) => {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).render('error', { title: 'Access Denied', message: 'Only Super Admins can view branch performance.' });
    }
    const data = await reportService.getBranchPerformance();
    res.render('reports/branch_performance', { data });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { title: 'Report Error', message: 'Failed to generate report.' });
  }
};

module.exports = {
  getReportsIndex,
  getBranchStock,
  getConsolidatedStock,
  getDailySales,
  getMonthlySales,
  getTransfers,
  getPendingTransfers,
  getPurchaseRequirement,
  getLowStock,
  getDeadStock,
  getFastMoving,
  getSlowMoving,
  getBranchPerformance
};
