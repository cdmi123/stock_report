const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../test_data');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// 1. Generate Surat Stock
const suratStockData = [
  {
    'Barcode': '8901234567891',
    'Item Name': 'BAGI',
    'Design Number': '1529',
    'Size': '40',
    'Colour': 'Blue',
    'Box Number': 'Box-01',
    'Available Quantity': 10,
    'Rate': 500,
    'MRP': 999
  },
  {
    'Barcode': '8901234567892',
    'Item Name': 'SHIRT',
    'Design Number': '9041',
    'Size': 'XL',
    'Colour': 'White',
    'Box Number': 'Box-02',
    'Available Quantity': 15,
    'Rate': 800,
    'MRP': 1599
  },
  {
    'Barcode': '8901234567893',
    'Item Name': 'JEANS',
    'Design Number': '4567',
    'Size': '32',
    'Colour': 'Black',
    'Box Number': 'Box-03',
    'Available Quantity': 8,
    'Rate': 1200,
    'MRP': 2499
  }
];

const wbSurat = xlsx.utils.book_new();
const wsSurat = xlsx.utils.json_to_sheet(suratStockData);
xlsx.utils.book_append_sheet(wbSurat, wsSurat, 'Stock Take');
xlsx.writeFile(wbSurat, path.join(outputDir, 'Surat_Stock.xlsx'));
console.log('Created test_data/Surat_Stock.xlsx');

// 2. Generate Rajkot Stock
const rajkotStockData = [
  {
    'Barcode': '8901234567891',
    'Item Name': 'BAGI',
    'Design Number': '1529',
    'Size': '40',
    'Colour': 'Blue',
    'Box Number': 'Box-01',
    'Available Quantity': 2,
    'Rate': 500,
    'MRP': 999
  },
  {
    'Barcode': '8901234567892',
    'Item Name': 'SHIRT',
    'Design Number': '9041',
    'Size': 'XL',
    'Colour': 'White',
    'Box Number': 'Box-02',
    'Available Quantity': 1,
    'Rate': 800,
    'MRP': 1599
  }
];

const wbRajkotStock = xlsx.utils.book_new();
const wsRajkotStock = xlsx.utils.json_to_sheet(rajkotStockData);
xlsx.utils.book_append_sheet(wbRajkotStock, wsRajkotStock, 'Stock Take');
xlsx.writeFile(wbRajkotStock, path.join(outputDir, 'Rajkot_Stock.xlsx'));
console.log('Created test_data/Rajkot_Stock.xlsx');

// 3. Generate Rajkot Sales (5 BAGI, 2 SHIRT)
const rajkotSalesData = [
  { 'Item Name': 'BAGI', 'Design Number': '1529', 'Size': '40', 'Box Number': 'Box-01' },
  { 'Item Name': 'BAGI', 'Design Number': '1529', 'Size': '40', 'Box Number': 'Box-01' },
  { 'Item Name': 'BAGI', 'Design Number': '1529', 'Size': '40', 'Box Number': 'Box-01' },
  { 'Item Name': 'BAGI', 'Design Number': '1529', 'Size': '40', 'Box Number': 'Box-01' },
  { 'Item Name': 'BAGI', 'Design Number': '1529', 'Size': '40', 'Box Number': 'Box-01' },
  { 'Item Name': 'SHIRT', 'Design Number': '9041', 'Size': 'XL', 'Box Number': 'Box-02' },
  { 'Item Name': 'SHIRT', 'Design Number': '9041', 'Size': 'XL', 'Box Number': 'Box-02' }
];

const wbRajkotSales = xlsx.utils.book_new();
const wsRajkotSales = xlsx.utils.json_to_sheet(rajkotSalesData);
xlsx.utils.book_append_sheet(wbRajkotSales, wsRajkotSales, 'Sales Log');
xlsx.writeFile(wbRajkotSales, path.join(outputDir, 'Rajkot_Sale.xlsx'));
console.log('Created test_data/Rajkot_Sale.xlsx');

console.log('Mock test files generation complete.');
