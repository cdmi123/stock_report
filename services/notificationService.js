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

const buildProductLabel = (transfer) => {
  const itemName = transfer.product_id.item_name || 'Product';
  const designNo = transfer.product_id.design_no ? ` ${transfer.product_id.design_no}` : '';
  const size = transfer.product_id.size ? ` Size ${transfer.product_id.size}` : '';
  return `${itemName}${designNo}${size}`.trim();
};

const buildTransferRequestMessage = (transfer) => {
  const requester = transfer.to_branch.branch_name;
  return `${requester} requested ${buildProductLabel(transfer)} Qty ${transfer.quantity}`.trim();
};

const buildTransferStatusMessage = (transfer, status) => {
  const sourceName = transfer.from_branch.branch_name;
  const destinationName = transfer.to_branch.branch_name;
  const productLabel = buildProductLabel(transfer);

  if (status === 'Approved') {
    return `${sourceName} approved ${productLabel} Qty ${transfer.quantity} for ${destinationName}`;
  }
  if (status === 'Picked') {
    return `${sourceName} picked ${productLabel} Qty ${transfer.quantity} for ${destinationName}`;
  }
  if (status === 'In Transit') {
    return `${sourceName} shipped ${productLabel} Qty ${transfer.quantity} to ${destinationName}`;
  }
  if (status === 'Delivered') {
    return `${destinationName} received ${productLabel} Qty ${transfer.quantity}`;
  }
  if (status === 'Rejected') {
    return `${sourceName} rejected ${productLabel} Qty ${transfer.quantity} for ${destinationName}`;
  }
  return `Transfer updated to ${status} for ${productLabel} Qty ${transfer.quantity}`;
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

const dispatchTransferNotifications = async ({ transfer, io, title, message, branchIds }) => {
  const normalizedBranchIds = [...new Set((branchIds || []).filter(Boolean).map((id) => id.toString()))];
  if (normalizedBranchIds.length === 0) {
    return [];
  }

  const recipients = await User.find({ branch_id: { $in: normalizedBranchIds } }).select('_id branch_id');
  if (recipients.length === 0) {
    return [];
  }

  const insertedNotifications = await Notification.insertMany(
    recipients.map((recipient) => ({
      user_id: recipient._id,
      branch_id: recipient.branch_id,
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
      branchId: normalizedBranchIds[0],
      transferId: transfer._id.toString(),
      createdAt: insertedNotifications[0].createdAt,
      isRead: false,
      url: '/transfer-requests'
    };
    await sendPushNotifications(subscriptions, pushPayload);
  }

  return insertedNotifications;
};

const loadTransferWithRelations = async (transferId) => {
  return Transfer.findById(transferId)
    .populate('from_branch')
    .populate('to_branch')
    .populate('product_id');
};

const notifyTransferRequestCreated = async ({ transferId, io }) => {
  const transfer = await loadTransferWithRelations(transferId);

  if (!transfer || !transfer.from_branch || !transfer.to_branch || !transfer.product_id) {
    return [];
  }

  return dispatchTransferNotifications({
    transfer,
    io,
    title: 'New Product Request',
    message: buildTransferRequestMessage(transfer),
    branchIds: [transfer.from_branch._id]
  });
};

const notifyTransferStatusChanged = async ({ transferId, status, io }) => {
  const transfer = await loadTransferWithRelations(transferId);

  if (!transfer || !transfer.from_branch || !transfer.to_branch || !transfer.product_id) {
    return [];
  }

  let branchIds = [];
  if (['Approved', 'Picked', 'In Transit', 'Rejected'].includes(status)) {
    branchIds = [transfer.to_branch._id];
  } else if (status === 'Delivered') {
    branchIds = [transfer.from_branch._id];
  }

  return dispatchTransferNotifications({
    transfer,
    io,
    title: `Transfer ${status}`,
    message: buildTransferStatusMessage(transfer, status),
    branchIds
  });
};

module.exports = {
  notifyTransferRequestCreated,
  notifyTransferStatusChanged,
  serializeNotification
};
