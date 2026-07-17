const mongoose = require('mongoose');

const uploadLogSchema = new mongoose.Schema({
  file_type: {
    type: String,
    required: true,
    enum: ['STOCK', 'SALE']
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploaded_at: {
    type: Date,
    default: Date.now
  },
  filename: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    required: true
  },
  error_message: {
    type: String,
    default: null
  },
  records_processed: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('UploadLog', uploadLogSchema);
