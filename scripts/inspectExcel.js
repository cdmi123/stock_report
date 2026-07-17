const xlsx = require('xlsx');

const inspectExcel = () => {
  const filePath = 'D:\\Ravi Sir\\Node js\\Node js Project List\\11. ERP System\\RAJKOT SALES.xlsx';
  try {
    const workbook = xlsx.readFile(filePath);
    console.log('SheetNames:', workbook.SheetNames);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    console.log('Total raw rows:', rawRows.length);
    console.log('First 15 raw rows:');
    rawRows.slice(0, 15).forEach((row, i) => {
      console.log(`Row ${i + 1}:`, row);
    });
  } catch (error) {
    console.error('Error reading Excel:', error);
  }
};

inspectExcel();
