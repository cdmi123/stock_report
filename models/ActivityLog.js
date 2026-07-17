const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // Null if action by unauthenticated guest (e.g. login failure)
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: String,
    required: true
  },
  ip_address: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
