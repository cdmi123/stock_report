const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', reportController.getReportsIndex);
router.get('/branch-stock', reportController.getBranchStock);
router.get('/consolidated-stock', reportController.getConsolidatedStock);
router.get('/daily-sales', reportController.getDailySales);
router.get('/monthly-sales', reportController.getMonthlySales);
router.get('/transfers', reportController.getTransfers);
router.get('/pending-transfers', reportController.getPendingTransfers);
router.get('/purchase-requirement', reportController.getPurchaseRequirement);
router.get('/low-stock', reportController.getLowStock);
router.get('/dead-stock', reportController.getDeadStock);
router.get('/fast-moving', reportController.getFastMoving);
router.get('/slow-moving', reportController.getSlowMoving);
router.get('/branch-performance', reportController.getBranchPerformance);

module.exports = router;
