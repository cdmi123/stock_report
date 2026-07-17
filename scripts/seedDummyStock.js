require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const StockTransaction = require('../models/StockTransaction');

const seedDummyStock = async () => {
  console.log('--- Seeding Dummy Stock Data ---');
  await connectDB();

  try {
    const branches = await Branch.find();
    const products = await Product.find();

    if (branches.length === 0 || products.length === 0) {
      console.log('Error: Please seed branches and products first by starting the server or running the integration tests.');
      await mongoose.connection.close();
      return;
    }

    console.log(`Found ${branches.length} branches and ${products.length} products. Populating matrix...`);

    let recordsCount = 0;

    for (const branch of branches) {
      for (const product of products) {
        // Generate random quantity between 5 and 25
        const randomQty = Math.floor(Math.random() * (25 - 5 + 1)) + 5;

        // Find or create Stock
        let stock = await Stock.findOne({ branch_id: branch._id, product_id: product._id });
        if (!stock) {
          stock = new Stock({
            branch_id: branch._id,
            product_id: product._id,
            quantity: randomQty
          });
        } else {
          stock.quantity = randomQty;
        }
        await stock.save();

        // Write a stock adjustment transaction log
        await new StockTransaction({
          branch_id: branch._id,
          product_id: product._id,
          transaction_type: 'ADJUSTMENT',
          quantity: randomQty
        }).save();

        recordsCount++;
      }
    }

    console.log(`Successfully seeded/updated ${recordsCount} stock records across branches.`);
  } catch (error) {
    console.error('Error seeding dummy stock:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

seedDummyStock();
