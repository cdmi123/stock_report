const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true
    },
    auth: {
      type: String,
      required: true
    }
  },
  userAgent: {
    type: String,
    default: ''
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

pushSubscriptionSchema.index({ user_id: 1, branch_id: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
