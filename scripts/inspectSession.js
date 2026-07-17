require('dotenv').config();
const mongoose = require('mongoose');

// Connect to DB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clothing_erp';

const inspectSession = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the SalesImportSession model
    const SalesImportSession = mongoose.model('SalesImportSession', new mongoose.Schema({}, { strict: false }));
    const session = await SalesImportSession.findOne().sort({ createdAt: -1 });

    if (!session) {
      console.log('No session found');
    } else {
      console.log('Latest Session details:');
      console.log('ID:', session._id);
      console.log('Filename:', session.get('filename'));
      console.log('Is Committed:', session.get('is_committed'));
      console.log('Rows count:', session.get('rows') ? session.get('rows').length : 0);
      console.log('Rows:', JSON.stringify(session.get('rows'), null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
};

inspectSession();
