const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', transferController.getTransfers);

// Restrict creation and status editing to Super Admin and Branch Manager
router.post('/create', restrictTo('Super Admin', 'Branch Manager'), transferController.postCreateTransfer);
router.post('/:id/status', restrictTo('Super Admin', 'Branch Manager'), transferController.postUpdateStatus);

module.exports = router;
