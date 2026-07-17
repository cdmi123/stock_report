const mongoose = require('mongoose');

const salesImportSessionSchema = new mongoose.Schema({
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
  filename: {
    type: String,
    required: true
  },
  is_committed: {
    type: Boolean,
    default: false,
    required: true
  },
  rows: [{
    excel_row_number: {
      type: Number,
      required: true
    },
    barcode: {
      type: String,
      default: ''
    },
    item_name: {
      type: String,
      default: ''
    },
    design_no: {
      type: String,
      default: ''
    },
    size: {
      type: String,
      default: ''
    },
    colour: {
      type: String,
      default: ''
    },
    sold_quantity: {
      type: Number,
      required: true,
      default: 1
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    status: {
      type: String,
      enum: ['READY', 'SHORTAGE', 'UNMATCHED', 'COMMITTED', 'HOLD'],
      default: 'READY',
      required: true
    },
    current_branch_qty: {
      type: Number,
      default: 0
    },
    additional_qty_required: {
      type: Number,
      default: 0
    },
    available_branches: [{
      branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
      branch_name: String,
      quantity: Number,
      priority: Number
    }],
    recommended_branch: {
      branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
      branch_name: { type: String, default: '' },
      quantity: { type: Number, default: 0 }
    },
    auto_allocation: [{
      branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
      branch_name: String,
      quantity: Number
    }]
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('SalesImportSession', salesImportSessionSchema);
