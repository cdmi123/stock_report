require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const Stock = require('../models/Stock');

// Services
const { getBranchStockRecommendations } = require('../services/allocationService');

const runTest = async () => {
  console.log('--- Starting Stock Allocation Engine Verification ---');
  await connectDB();

  try {
    // 1. Clear database collections for clean test
    console.log('Clearing sandbox collections...');
    await Promise.all([
      Branch.deleteMany({}),
      Product.deleteMany({}),
      Stock.deleteMany({})
    ]);

    // 2. Seed branches with strict priority order
    console.log('Seeding branches with priority weights...');
    const surat = await new Branch({ branch_name: 'Surat H/O', city: 'Surat', address: 'Ring Road, Surat', branch_type: 'H/O', priority: 1 }).save();
    const ahmedabad = await new Branch({ branch_name: 'Ahmedabad Branch', city: 'Ahmedabad', address: 'CG Road, Ahmedabad', branch_type: 'Retail', priority: 2 }).save();
    const rajkot = await new Branch({ branch_name: 'Rajkot Branch', city: 'Rajkot', address: 'Crystal Mall, Rajkot', branch_type: 'Retail', priority: 3 }).save();
    const mumbai = await new Branch({ branch_name: 'Mumbai Branch', city: 'Mumbai', address: 'Bandra, Mumbai', branch_type: 'Retail', priority: 5 }).save();

    // 3. Create a test product
    console.log('Seeding sample Product...');
    const product = await new Product({
      barcode: '8901234567890',
      item_name: 'Premium Cotton Shirt',
      design_no: 'SHIRT-001',
      size: 'XL',
      colour: 'Black',
      rate: 1000,
      mrp: 1200
    }).save();

    // 4. Seed stock distributions mimicking the user requirement example:
    // Required additional quantity = 80
    // Surat H/O stock = 40
    // Ahmedabad stock = 30
    // Mumbai stock = 50
    // Rajkot stock (current branch) = 20
    console.log('Seeding stock quantities (mocking allocation scenario)...');
    await new Stock({ branch_id: rajkot._id, product_id: product._id, quantity: 20 }).save();
    await new Stock({ branch_id: surat._id, product_id: product._id, quantity: 40 }).save();
    await new Stock({ branch_id: ahmedabad._id, product_id: product._id, quantity: 30 }).save();
    await new Stock({ branch_id: mumbai._id, product_id: product._id, quantity: 50 }).save();

    // 5. Run recommendation check:
    // Rajkot manager wants to allocate 80 additional units
    console.log('\nRunning allocation lookup for 80 units...');
    const rec = await getBranchStockRecommendations(product._id, rajkot._id, 80);

    console.log('1. Available Branches (Sorted by priority):');
    rec.availableBranches.forEach(b => {
      console.log(`  - ${b.branch_name} (Priority ${b.priority}): ${b.quantity} available`);
    });

    console.log(`2. Recommended Branch: ${rec.recommendedBranch.branch_name}`);

    console.log('3. Auto-Allocation breakdown:');
    rec.autoAllocation.forEach(alloc => {
      console.log(`  - Take ${alloc.quantity} from ${alloc.branch_name}`);
    });

    // Verification asserts
    // Available branches priority check
    if (rec.availableBranches[0].branch_name !== 'Surat H/O' || rec.availableBranches[1].branch_name !== 'Ahmedabad Branch') {
      throw new Error('FAIL: Available branches are not sorted by priority order!');
    }
    console.log('PASS: Priority sorting works.');

    // Recommended branch assertion
    if (rec.recommendedBranch.branch_name !== 'Surat H/O') {
      throw new Error('FAIL: Recommended branch is not Surat H/O!');
    }
    console.log('PASS: Surat H/O recommended as first priority.');

    // Auto-allocation cascade verification:
    // Required 80 -> Surat H/O gives 40 -> Ahmedabad gives 30 -> Mumbai gives 10.
    const suratAlloc = rec.autoAllocation.find(a => a.branch_name === 'Surat H/O');
    const ahmedabadAlloc = rec.autoAllocation.find(a => a.branch_name === 'Ahmedabad Branch');
    const mumbaiAlloc = rec.autoAllocation.find(a => a.branch_name === 'Mumbai Branch');

    if (!suratAlloc || suratAlloc.quantity !== 40) throw new Error('FAIL: Surat allocation should be 40.');
    if (!ahmedabadAlloc || ahmedabadAlloc.quantity !== 30) throw new Error('FAIL: Ahmedabad allocation should be 30.');
    if (!mumbaiAlloc || mumbaiAlloc.quantity !== 10) throw new Error('FAIL: Mumbai allocation should be 10.');

    console.log('PASS: Auto-allocation cascade counts are mathematically correct.');

    console.log('\n--- Stock Allocation Engine Verification Passed Successfully ---');

  } catch (error) {
    console.error('\nFAIL: Verification failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
};

runTest();
