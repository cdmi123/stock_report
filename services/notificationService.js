const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const Transfer = require('../models/Transfer');
const User = require('../models/User');

let webPush = null;
try {
  webPush = require('web-push');
} catch (error) {
  console.warn('web-push is not installed. Native push notifications are disabled until dependencies are installed.');
}

let vapidConfigured = false;

const configureWebPush = () => {
  if (!webPush || vapidConfigured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@clothing-erp.local';

  if (!publicKey || !privateKey) {
    return;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
};

const serializeNotification = (notification) => ({
  id: notification._id ? notification._id.toString() : '',
  title: notification.title,
  message: notification.message,
  branchId: notification.branch_id ? notification.branch_id.toString() : '',
  transferId: notification.transfer_id ? notification.transfer_id.toString() : '',
  createdAt: notification.createdAt,
  isRead: notification.isRead,
  url: '/transfer-requests'
});

const buildTransferMessage = (transfer) => {
  const requester = transfer.from_branch.city || transfer.from_branch.branch_name;
  const itemName = transfer.product_id.item_name || 'Product';
  const designNo = transfer.product_id.design_no ? ` ${transfer.product_id.design_no}` : '';
  const size = transfer.product_id.size ? ` Size ${transfer.product_id.size}` : '';
  return `${requester} requested ${itemName}${designNo}${size} Qty ${transfer.quantity}`.trim();
};

const sendPushNotifications = async (subscriptions, payload) => {
  configureWebPush();
  if (!webPush || !vapidConfigured || subscriptions.length === 0) {
    return;
  }

  for (const subscription of subscriptions) {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys
      }, JSON.stringify(payload));
    } catch (error) {
      const statusCode = error.statusCode || error.status_code;
      if (statusCode === 404 || statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      } else {
        console.error('Push notification send failed:', error.message || error);
      }
    }
  }
};

const notifyTransferRequestCreated = async ({ transferId, io }) => {
  const transfer = await Transfer.findById(transferId)
    .populate('from_branch')
    .populate('to_branch')
    .populate('product_id');

  if (!transfer || !transfer.to_branch || !transfer.product_id) {
    return [];
  }

  const recipients = await User.find({ branch_id: transfer.to_branch._id }).select('_id branch_id');
  if (recipients.length === 0) {
    return [];
  }

  const title = 'New Product Request';
  const message = buildTransferMessage(transfer);

  const insertedNotifications = await Notification.insertMany(
    recipients.map((recipient) => ({
      user_id: recipient._id,
      branch_id: transfer.to_branch._id,
      transfer_id: transfer._id,
      title,
      message,
      isRead: false
    }))
  );

  if (io) {
    insertedNotifications.forEach((notification) => {
      io.to(`user:${notification.user_id.toString()}`).emit('transferNotification', serializeNotification(notification));
    });
  }

  const subscriptions = await PushSubscription.find({
    user_id: { $in: recipients.map((recipient) => recipient._id) }
  });

  if (subscriptions.length > 0) {
    const pushPayload = {
      title,
      message,
      branchId: transfer.to_branch._id,
      transferId: transfer._id,
      createdAt: insertedNotifications[0].createdAt,
      isRead: false,
      url: '/transfer-requests'
    };
    await sendPushNotifications(subscriptions, pushPayload);
  }

  return insertedNotifications;
};

module.exports = {
  notifyTransferRequestCreated,
  serializeNotification
};

