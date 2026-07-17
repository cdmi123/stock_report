const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
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
  transaction_type: {
    type: String,
    required: true,
    enum: ['STOCK_UPLOAD', 'SALE_UPLOAD', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT']
  },
  quantity: {
    type: Number,
    required: true
  },
  reference_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
