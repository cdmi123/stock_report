const xlsx = require('xlsx');

// Let's build a workbook like the user's Excel
const headers = [
  'SNo.', 'Barcode', 'Item Name', 'Bran', 'Size', 'Colour', 'Style', 'Design No.', 'Box No.', 'GST', 'Qty - ATLANTIC ARTHUR-RAJKOT', 'Net Qty', 'Base', 'Pur Price', 'Stock Avg Pur Price', 'Stock Tot Pur Price', 'MAP', 'Total MAP', 'Rate'
];

const row1 = ['Operator : ATLANTIC ARTHUR, Export Time : 11-07-2026 10:31 AM'];
const row2 = headers;
const row3 = ['1', 'DA65', 'BAGI', '0', '36', 'BLACK', '', '1529', '', '', '1', '1', '1499', '1499', '', '1499', '1499', '1499', '1499'];

const data = [row1, row2, row3];

const wb = xlsx.utils.book_new();
const ws = xlsx.utils.aoa_to_sheet(data);
xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');

const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

// Now let's run the header detection logic
const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
console.log('rawRows length:', rawRows.length);

let headerRowIndex = 0;
for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
  const rowCells = rawRows[i].map(cell => cell.toString().trim().toLowerCase());
  console.log(`Row ${i}:`, rowCells.slice(0, 10));

  const hasItem = rowCells.some(c => c.includes('item') || c.includes('product') || c === 'name');
  const hasDesign = rowCells.some(c => c.includes('design') || c.includes('style') || c === 'designno');
  const hasSize = rowCells.some(c => c === 'size');

  console.log(`- hasItem: ${hasItem}, hasDesign: ${hasDesign}, hasSize: ${hasSize}`);

  if (hasItem && (hasDesign || hasSize)) {
    headerRowIndex = i;
    console.log(`Matched header row at index: ${i}`);
    break;
  }
}

console.log('Resulting headerRowIndex:', headerRowIndex);
