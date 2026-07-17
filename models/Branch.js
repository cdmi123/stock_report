const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  branch_name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  branch_type: {
    type: String,
    enum: ['H/O', 'Retail'],
    default: 'Retail',
    required: true
  },
  priority: {
    type: Number,
    default: 99,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Branch', branchSchema);
