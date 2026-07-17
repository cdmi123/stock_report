const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  barcode: {
    type: String,
    trim: true,
    index: true
  },
  item_name: {
    type: String,
    required: true,
    trim: true
  },
  design_no: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: String,
    required: true,
    trim: true
  },
  colour: {
    type: String,
    trim: true,
    default: ''
  },
  box_no: {
    type: String,
    trim: true,
    default: ''
  },
  rate: {
    type: Number,
    default: 0
  },
  mrp: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for fast lookup priority
productSchema.index({ design_no: 1, size: 1 });
productSchema.index({ item_name: 1, size: 1 });

module.exports = mongoose.model('Product', productSchema);
