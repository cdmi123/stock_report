require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');

// Models (for seeding / socket auth)
const User = require('./models/User');
const Branch = require('./models/Branch');

// Routes
const authRoutes = require('./routes/authRoutes');
const branchRoutes = require('./routes/branchRoutes');
const stockRoutes = require('./routes/stockRoutes');
const saleRoutes = require('./routes/saleRoutes');
const transferRoutes = require('./routes/transferRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Share socket.io instance with express app/controllers
app.set('io', io);

// Connect to Database
connectDB();

// Express Configuration Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Set up Views and Static folders
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Mount Routing Tree
app.use('/auth', authRoutes);
app.use('/branches', branchRoutes);
app.use('/stocks', stockRoutes);
app.use('/sales', saleRoutes);
app.use('/transfers', transferRoutes);
app.use('/reports', reportRoutes);
app.use('/notifications', notificationRoutes);
app.get('/transfer-requests', (req, res) => res.redirect('/transfers'));
app.use('/', dashboardRoutes); // Dashboard mounts at root

// Global 404 Route
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 - Page Not Found',
    message: 'The page you are looking for does not exist or has been moved.'
  });
});

// Seeding Function
const seedDatabase = async () => {
  try {
    // 1. Seed Branches
    let branches = await Branch.find();
    if (branches.length === 0) {
      console.log('Seeding default branches...');
      const rajkot = await new Branch({ branch_name: 'Rajkot Branch', city: 'Rajkot', address: '101, Crystal Mall, Rajkot, Gujarat', branch_type: 'Retail', priority: 3 }).save();
      const surat = await new Branch({ branch_name: 'H/O Surat', city: 'Surat', address: '502, Ring Road Textile Hub, Surat, Gujarat', branch_type: 'H/O', priority: 1 }).save();
      const ahmedabad = await new Branch({ branch_name: 'Ahmedabad Branch', city: 'Ahmedabad', address: '703, CG Road Business Center, Ahmedabad, Gujarat', branch_type: 'Retail', priority: 2 }).save();
      branches = [rajkot, surat, ahmedabad];
      console.log('Branches seeded successfully.');
    }

    // 2. Seed Super Admin
    const adminCount = await User.countDocuments({ role: 'Super Admin' });
    if (adminCount === 0) {
      console.log('Seeding default Super Admin...');
      await new User({
        name: 'Super Admin',
        email: 'superadmin@erp.com',
        password: 'admin123',
        role: 'Super Admin',
        branch_id: null
      }).save();
      console.log('Super Admin user created (superadmin@erp.com / admin123).');
    }

    // 3. Seed Branch Managers (if user list has only admin)
    const totalUsers = await User.countDocuments();
    if (totalUsers <= 1) {
      console.log('Seeding branch managers...');
      const rajkotBranch = branches.find(b => b.branch_name === 'Rajkot Branch');
      const suratBranch = branches.find(b => b.branch_name === 'H/O Surat');
      const ahmedabadBranch = branches.find(b => b.branch_name === 'Ahmedabad Branch');

      if (rajkotBranch) {
        await new User({ name: 'Rajkot Manager', email: 'rajkot@erp.com', password: 'rajkot123', role: 'Branch Manager', branch_id: rajkotBranch._id }).save();
      }
      if (suratBranch) {
        await new User({ name: 'Surat Manager', email: 'surat@erp.com', password: 'surat123', role: 'Branch Manager', branch_id: suratBranch._id }).save();
      }
      if (ahmedabadBranch) {
        await new User({ name: 'Ahmedabad Manager', email: 'ahmedabad@erp.com', password: 'ahmedabad123', role: 'Branch Manager', branch_id: ahmedabadBranch._id }).save();
      }
      console.log('Branch managers seeded.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

const parseCookies = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
};

const attachSocketRooms = async (socket) => {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    const token = cookies.token;
    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clothing_erp_jwt_secret_key_12345_67890');
    const user = await User.findById(decoded.id).populate('branch_id');
    if (!user) {
      return null;
    }

    socket.data.userId = user._id.toString();
    socket.join(`user:${socket.data.userId}`);

    if (user.branch_id && user.branch_id._id) {
      socket.data.branchId = user.branch_id._id.toString();
      socket.join(`branch:${socket.data.branchId}`);
    }

    return user;
  } catch (error) {
    console.warn('Socket authentication skipped:', error.message);
    return null;
  }
};

// Execute seed before starting server listener
seedDatabase();

// Socket.io Connection Logic
io.on('connection', async (socket) => {
  const user = await attachSocketRooms(socket);
  console.log(`Socket client connected: ${socket.id}${user ? ` (user: ${user.email})` : ''}`);
  
  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Run server listener
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ERP System Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  console.log(`Access login page at http://localhost:${PORT}/auth/login`);
});


