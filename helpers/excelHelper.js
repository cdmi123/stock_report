const xlsx = require('xlsx');

/**
 * Helper to find a value in cleanRow based on possible key matches.
 * Performs direct matching first, then falls back to normalized alphanumeric matching.
 * @param {Object} cleanRow - Lowercased, trimmed row object
 * @param {Array<string>} possibleKeys - Possible key names to match
 * @returns {any} Matching value or empty string
 */
const findValue = (cleanRow, possibleKeys) => {
  for (const k of possibleKeys) {
    const cleanK = k.trim().toLowerCase();
    if (cleanRow[cleanK] !== undefined && cleanRow[cleanK] !== null) {
      return cleanRow[cleanK];
    }
  }
  const normalizedPossibles = possibleKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const key of Object.keys(cleanRow)) {
    const normalizedKey = key.replace(/[^a-z0-9]/g, '');
    const matchIdx = normalizedPossibles.indexOf(normalizedKey);
    if (matchIdx !== -1) {
      return cleanRow[key];
    }
  }
  return '';
};

/**
 * Parses an Excel file from a buffer or file path and returns standardized JSON array.
 * @param {Buffer|string} fileSource - File buffer or file path
 * @param {string} fileType - 'STOCK' or 'SALE'
 * @returns {Array<Object>} Array of records
 */
const parseExcel = (fileSource, fileType) => {
  try {
    let workbook;
    if (Buffer.isBuffer(fileSource)) {
      workbook = xlsx.read(fileSource, { type: 'buffer' });
    } else {
      workbook = xlsx.readFile(fileSource);
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Read the first 15 rows as raw arrays to locate the header row (skipping metadata/title rows)
    const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const rowCells = rawRows[i].map(cell => cell.toString().trim().toLowerCase());
      
      // Look for a row containing typical headers
      const hasItem = rowCells.some(c => c.includes('item') || c.includes('product') || c === 'name');
      const hasDesign = rowCells.some(c => c.includes('design') || c.includes('style') || c === 'designno');
      const hasSize = rowCells.some(c => c === 'size');

      if (hasItem && (hasDesign || hasSize)) {
        headerRowIndex = i;
        break;
      }
    }

    console.log(`Detected header row at index: ${headerRowIndex} (1-indexed row: ${headerRowIndex + 1})`);

    // Parse the worksheet starting from the detected header row range
    const rawData = xlsx.utils.sheet_to_json(worksheet, { 
      range: headerRowIndex, 
      defval: '' 
    });

    // Get original headers from first row if available
    const originalHeaders = rawData.length > 0 ? Object.keys(rawData[0]).map(k => k.trim()) : [];

    // Standardize column mappings
    const rows = rawData.map(row => {
      const standardized = {};
      
      // Clean keys by removing leading/trailing spaces and converting to lowercase
      const cleanRow = {};
      Object.keys(row).forEach(key => {
        cleanRow[key.toString().trim().toLowerCase()] = row[key];
      });

      // Map fields based on matching rules
      standardized.barcode = findValue(cleanRow, ['barcode', 'sku', 'code']).toString().trim();
      
      standardized.item_name = findValue(cleanRow, ['item name', 'itemname', 'product', 'name', 'item']).toString().trim();

      standardized.design_no = findValue(cleanRow, ['design no', 'design no.', 'design number', 'designnumber', 'designno', 'design', 'style']).toString().trim();

      standardized.size = findValue(cleanRow, ['size']).toString().trim();

      standardized.colour = findValue(cleanRow, ['colour', 'color']).toString().trim();

      standardized.box_no = findValue(cleanRow, ['box no', 'box no.', 'box number', 'boxno', 'box']).toString().trim();

      if (fileType === 'STOCK') {
        // Prioritized Quantity mapping supporting branch specific header (e.g. Qty - ATLANTIC ARTHUR-RAJKOT)
        const qtyKey = Object.keys(cleanRow).find(k => k.startsWith('qty -')) ||
                       Object.keys(cleanRow).find(k => k === 'available quantity' || k === 'available qty' || k === 'quantity' || k === 'qty' || k === 'net qty') ||
                       Object.keys(cleanRow).find(k => k.includes('qty') || k.includes('quantity'));
        
        const qtyVal = qtyKey ? cleanRow[qtyKey] : 0;
        standardized.quantity = parseInt(qtyVal, 10) || 0;

        const rateVal = findValue(cleanRow, ['rate', 'pur price', 'base pur price', 'base', 'purprice']);
        standardized.rate = parseFloat(rateVal) || 0;

        const mrpVal = findValue(cleanRow, ['mrp']);
        standardized.mrp = parseFloat(mrpVal) || 0;
      }

      return standardized;
    });

    // Attach headers list to the array for diagnostic logging on zero-rows parsed
    rows.headers = originalHeaders;
    return rows;
  } catch (error) {
    console.error('Error parsing excel:', error);
    throw new Error('Failed to parse Excel file: ' + error.message);
  }
};

module.exports = {
  parseExcel
};
