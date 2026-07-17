const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const { serializeNotification } = require('../services/notificationService');

const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const notifications = await Notification.find({ user_id: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await Notification.countDocuments({
      user_id: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      notifications: notifications.map(serializeNotification),
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to load notifications.' });
  }
};

const subscribePush = async (req, res) => {
  try {
    if (!req.user.branch_id) {
      return res.status(400).json({ success: false, message: 'Push notifications are only available for branch users.' });
    }

    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ success: false, message: 'Invalid push subscription payload.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user_id: req.user._id,
        branch_id: req.user.branch_id._id,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        userAgent: req.headers['user-agent'] || '',
        lastSeenAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ success: false, message: 'Failed to save push subscription.' });
  }
};

const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user_id: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
};

module.exports = {
  getNotifications,
  subscribePush,
  markAllRead
};
