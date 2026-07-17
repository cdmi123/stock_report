require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const Stock = require('../models/Stock');
const Sale = require('../models/Sale');
const StockTransaction = require('../models/StockTransaction');
const Transfer = require('../models/Transfer');
const SalesImportSession = require('../models/SalesImportSession');
const UploadLog = require('../models/UploadLog');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

const clearStockAndSaleData = async () => {
  console.log('--- Starting Stock and Sale Data Cleanup ---');
  await connectDB();

  try {
    // 1. Find a Super Admin to attribute the log, if exists
    const superAdmin = await User.findOne({ role: 'Super Admin' });
    const adminId = superAdmin ? superAdmin._id : null;

    console.log('Executing deletions across stock and sales collections...');

    // Perform deletions
    const [
      stockResult,
      saleResult,
      transactionResult,
      transferResult,
      sessionResult,
      uploadLogResult
    ] = await Promise.all([
      Stock.deleteMany({}),
      Sale.deleteMany({}),
      StockTransaction.deleteMany({}),
      Transfer.deleteMany({}),
      SalesImportSession.deleteMany({}),
      UploadLog.deleteMany({})
    ]);

    console.log(`- Stocks deleted: ${stockResult.deletedCount}`);
    console.log(`- Sales deleted: ${saleResult.deletedCount}`);
    console.log(`- Stock Transactions deleted: ${transactionResult.deletedCount}`);
    console.log(`- Transfers deleted: ${transferResult.deletedCount}`);
    console.log(`- Sales Import Sessions deleted: ${sessionResult.deletedCount}`);
    console.log(`- Upload Logs deleted: ${uploadLogResult.deletedCount}`);

    // Log this action to ActivityLog
    const cleanupLog = new ActivityLog({
      user_id: adminId,
      action: 'DATABASE_CLEANUP',
      details: 'Wiped all stock, sale, stock transaction, transfer, sales import session, and upload log data across all branches.',
      ip_address: 'localhost'
    });
    await cleanupLog.save();
    console.log('Cleanup event recorded in ActivityLog.');

    console.log('--- Cleanup Completed Successfully ---');
  } catch (error) {
    console.error('Error executing cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

clearStockAndSaleData();
