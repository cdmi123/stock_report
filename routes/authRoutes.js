const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/logout', protect, authController.getLogout);

module.exports = router;
