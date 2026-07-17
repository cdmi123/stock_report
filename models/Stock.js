const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 0
  },
  reserved_quantity: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
});

// Composite unique index
stockSchema.index({ branch_id: 1, product_id: 1 }, { unique: true });

module.exports = mongoose.model('Stock', stockSchema);
