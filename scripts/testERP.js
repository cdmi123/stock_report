require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const Branch = require('../models/Branch');
const User = require('../models/User');
const Product = require('../models/Product');
const Stock = require('../models/Stock');
const Sale = require('../models/Sale');
const Transfer = require('../models/Transfer');
const StockTransaction = require('../models/StockTransaction');
const UploadLog = require('../models/UploadLog');

// Services
const { uploadStockFile } = require('../services/stockService');
const { uploadSaleFile } = require('../services/saleService');
const { updateTransferStatus } = require('../services/transferService');

const fs = require('fs');
const path = require('path');

const runTest = async () => {
  console.log('--- Starting ERP Integration Test ---');
  
  // Connect to DB
  await connectDB();
  
  // Clear collections for clean test run
  console.log('Clearing database collections for test run...');
  await Promise.all([
    Branch.deleteMany({}),
    User.deleteMany({}),
    Product.deleteMany({}),
    Stock.deleteMany({}),
    Sale.deleteMany({}),
    Transfer.deleteMany({}),
    StockTransaction.deleteMany({}),
    UploadLog.deleteMany({})
  ]);
  console.log('Database cleared.');

  // 1. Seed branches
  console.log('\nStep 1: Seeding branches and users...');
  const rajkot = await new Branch({ branch_name: 'Rajkot Branch', city: 'Rajkot', address: 'Crystal Mall, Rajkot', branch_type: 'Retail', priority: 3 }).save();
  const surat = await new Branch({ branch_name: 'H/O Surat', city: 'Surat', address: 'Ring Road, Surat', branch_type: 'H/O', priority: 1 }).save();
  const ahmedabad = await new Branch({ branch_name: 'Ahmedabad Branch', city: 'Ahmedabad', address: 'CG Road, Ahmedabad', branch_type: 'Retail', priority: 2 }).save();
  
  const admin = await new User({
    name: 'Super Admin',
    email: 'superadmin@erp.com',
    password: 'admin123',
    role: 'Super Admin'
  }).save();
  console.log(`Seeded branches and admin user: ${admin.email}`);

  // Load Excel file buffers
  const suratStockBuf = fs.readFileSync(path.join(__dirname, '../test_data/Surat_Stock.xlsx'));
  const rajkotStockBuf = fs.readFileSync(path.join(__dirname, '../test_data/Rajkot_Stock.xlsx'));
  const rajkotSaleBuf = fs.readFileSync(path.join(__dirname, '../test_data/Rajkot_Sale.xlsx'));

  // 2. Upload stock files
  console.log('\nStep 2: Uploading stock take spreadsheets...');
  const suratStockResult = await uploadStockFile({
    branchId: surat._id,
    userId: admin._id,
    fileBuffer: suratStockBuf,
    filename: 'Surat_Stock.xlsx'
  });
  console.log(`Surat Stock Upload: Processed ${suratStockResult.recordsProcessed} records.`);

  const rajkotStockResult = await uploadStockFile({
    branchId: rajkot._id,
    userId: admin._id,
    fileBuffer: rajkotStockBuf,
    filename: 'Rajkot_Stock.xlsx'
  });
  console.log(`Rajkot Stock Upload: Processed ${rajkotStockResult.recordsProcessed} records.`);

  // Verify stock levels before sales
  const initialRajkotStock = await Stock.find({ branch_id: rajkot._id }).populate('product_id');
  console.log('\nInitial Rajkot stock quantities:');
  initialRajkotStock.forEach(s => {
    console.log(`- ${s.product_id.item_name} (Design: ${s.product_id.design_no}): ${s.quantity} pcs`);
  });

  const initialSuratStock = await Stock.find({ branch_id: surat._id }).populate('product_id');
  console.log('Initial Surat stock quantities:');
  initialSuratStock.forEach(s => {
    console.log(`- ${s.product_id.item_name} (Design: ${s.product_id.design_no}): ${s.quantity} pcs`);
  });

  // Try duplicate upload
  console.log('\nVerifying duplicate upload prevention...');
  try {
    await uploadStockFile({
      branchId: rajkot._id,
      userId: admin._id,
      fileBuffer: rajkotStockBuf,
      filename: 'Rajkot_Stock.xlsx'
    });
    console.error('FAIL: Duplicate upload was not prevented!');
  } catch (err) {
    console.log(`PASS: Duplicate upload correctly blocked with message: "${err.message}"`);
  }

  // 3. Process Sales
  console.log('\nStep 3: Uploading Rajkot sales sheet (5 BAGI, 2 SHIRT)...');
  const rajkotSalesResult = await uploadSaleFile({
    branchId: rajkot._id,
    userId: admin._id,
    fileBuffer: rajkotSaleBuf,
    filename: 'Rajkot_Sale.xlsx'
  });
  console.log(`Rajkot Sales Upload: Processed ${rajkotSalesResult.recordsProcessed} sold items.`);
  console.log(`Shortages triggered: ${rajkotSalesResult.shortagesCount}`);

  // Verify Rajkot stocks are negative (representing shortage/backorder)
  const afterSalesRajkotStock = await Stock.find({ branch_id: rajkot._id }).populate('product_id');
  console.log('\nRajkot stock quantities after sales deduction:');
  let bagiShortagePassed = false;
  let shirtShortagePassed = false;
  
  afterSalesRajkotStock.forEach(s => {
    console.log(`- ${s.product_id.item_name} (Design: ${s.product_id.design_no}): ${s.quantity} pcs`);
    if (s.product_id.item_name === 'BAGI' && s.quantity === -3) bagiShortagePassed = true;
    if (s.product_id.item_name === 'SHIRT' && s.quantity === -1) shirtShortagePassed = true;
  });

  if (bagiShortagePassed && shirtShortagePassed) {
    console.log('PASS: Stocks correctly adjusted into negative values for shortage tracking.');
  } else {
    console.error('FAIL: Stock values do not match expected shortages.');
  }

  // 4. Verify Transfer Recommendations
  console.log('\nStep 4: Verifying auto-recommended transfer requests...');
  const pendingTransfers = await Transfer.find({ status: 'Pending' })
    .populate('from_branch')
    .populate('to_branch')
    .populate('product_id');

  console.log(`Found ${pendingTransfers.length} pending transfer recommendations:`);
  let bagiTransferId = null;
  
  pendingTransfers.forEach(t => {
    console.log(`- Recommendation: Transfer ${t.quantity} pcs of ${t.product_id.item_name} from ${t.from_branch.branch_name} to ${t.to_branch.branch_name}`);
    if (t.product_id.item_name === 'BAGI') {
      bagiTransferId = t._id;
    }
  });

  if (pendingTransfers.length === 2) {
    console.log('PASS: 2 transfer requests correctly generated.');
  } else {
    console.error('FAIL: Expected 2 transfers, found ' + pendingTransfers.length);
  }

  // 5. Execute Transfer Flow
  console.log(`\nStep 5: Simulating logistics flow for BAGI transfer (ID: ${bagiTransferId})...`);
  
  console.log('Approving transfer...');
  await updateTransferStatus(bagiTransferId, 'Approved', admin._id);
  
  console.log('Picking transfer...');
  await updateTransferStatus(bagiTransferId, 'Picked', admin._id);

  console.log('Shipping transfer (In Transit)...');
  await updateTransferStatus(bagiTransferId, 'In Transit', admin._id);

  console.log('Delivering transfer...');
  await updateTransferStatus(bagiTransferId, 'Delivered', admin._id);
  console.log('Transfer delivered successfully.');

  // 6. Verify stocks after delivery
  console.log('\nStep 6: Verifying final stock quantities after transfer delivery...');
  
  const finalRajkotBAGI = await Stock.findOne({ branch_id: rajkot._id })
    .populate({ path: 'product_id', match: { item_name: 'BAGI' } })
    .then(s => s ? s.quantity : null);

  const finalSuratBAGI = await Stock.findOne({ branch_id: surat._id })
    .populate({ path: 'product_id', match: { item_name: 'BAGI' } })
    .then(s => s ? s.quantity : null);

  console.log(`- Final Rajkot BAGI stock (Expected: 0): ${finalRajkotBAGI}`);
  console.log(`- Final Surat BAGI stock (Expected: 7): ${finalSuratBAGI}`);

  if (finalRajkotBAGI === 0 && finalSuratBAGI === 7) {
    console.log('PASS: Stocks successfully balanced out. Source decremented, destination incremented.');
  } else {
    console.error('FAIL: Final stocks did not balance correctly.');
  }

  // Close DB connection
  await mongoose.connection.close();
  console.log('\n--- ERP Integration Test Completed Successfully ---');
};

runTest().catch(async (err) => {
  console.error('\nFAIL: Test encountered an error:', err);
  await mongoose.connection.close();
});
