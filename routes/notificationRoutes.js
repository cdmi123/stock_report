const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);
router.get('/', notificationController.getNotifications);
router.post('/subscribe', notificationController.subscribePush);
router.post('/read-all', notificationController.markAllRead);

module.exports = router;
