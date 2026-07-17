const express = require('express');
const router = express.Router();
const multer = require('multer');
const stockController = require('../controllers/stockController');
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

router.get('/', stockController.getStocks);

// Only Super Admin and Branch Manager can view or post uploads
router.get('/upload', restrictTo('Super Admin', 'Branch Manager'), stockController.getUploadStock);
router.post('/upload', restrictTo('Super Admin', 'Branch Manager'), upload.single('stock_file'), stockController.postUploadStock);

module.exports = router;
