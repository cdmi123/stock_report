const express = require('express');
const router = express.Router();
const multer = require('multer');
const saleController = require('../controllers/saleController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

// Set up Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx or .xls) are allowed.'), false);
    }
  }
});

router.use(protect);

router.get('/', saleController.getSales);

// Restrict uploads and preview actions to Super Admin and Branch Manager
router.get('/upload', restrictTo('Super Admin', 'Branch Manager'), saleController.getUploadSale);
router.post('/upload', restrictTo('Super Admin', 'Branch Manager'), upload.single('sale_file'), saleController.postUploadSale);
router.get('/import/preview/:sessionId', restrictTo('Super Admin', 'Branch Manager'), saleController.getImportPreview);
router.post('/import/action', restrictTo('Super Admin', 'Branch Manager'), saleController.postImportAction);
router.get('/:saleId/availability', restrictTo('Super Admin', 'Branch Manager'), saleController.getSaleAvailability);

module.exports = router;
