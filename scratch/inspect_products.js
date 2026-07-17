require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const run = async () => {
  await connectDB();
  const products = await Product.find({});
  console.log('--- Products ---');
  products.forEach(p => {
    console.log(`ID: ${p._id} | Name: ${p.item_name} | Design: ${p.design_no} | Size: ${p.size} | Rate: ${p.rate} | MRP: ${p.mrp}`);
  });
  await mongoose.connection.close();
};

run().catch(console.error);
