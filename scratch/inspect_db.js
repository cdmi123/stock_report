require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const User = require('../models/User');

const run = async () => {
  await connectDB();
  console.log('Connected to DB');

  const branches = await Branch.find();
  console.log('\n--- Branches ---');
  branches.forEach(b => console.log(`${b._id} | ${b.branch_name} | ${b.city} | ${b.branch_type}`));

  const users = await User.find().populate('branch_id');
  console.log('\n--- Users ---');
  users.forEach(u => console.log(`${u._id} | ${u.name} | ${u.email} | ${u.role} | Branch: ${u.branch_id ? u.branch_id.branch_name : 'null'}`));

  const stocksCount = await Stock.countDocuments();
  console.log(`\nTotal stocks in DB: ${stocksCount}`);

  const stockRecords = await Stock.find().populate('branch_id').populate('product_id');
  console.log('\n--- Stock Records (First 20) ---');
  stockRecords.slice(0, 20).forEach((s, idx) => {
    console.log(`${idx + 1}. Branch: ${s.branch_id ? s.branch_id.branch_name : 'NULL'} | Product: ${s.product_id ? s.product_id.item_name : 'NULL'} (Qty: ${s.quantity})`);
  });

  // Check for issues:
  const orphanedProduct = stockRecords.filter(s => !s.product_id);
  const orphanedBranch = stockRecords.filter(s => !s.branch_id);
  console.log(`\nStock records with null product: ${orphanedProduct.length}`);
  console.log(`Stock records with null branch: ${orphanedBranch.length}`);

  await mongoose.connection.close();
};

run().catch(console.error);
