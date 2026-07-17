const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // Retrieve token from cookie
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    if (req.accepts('html', 'json') === 'json' || req.path.startsWith('/api')) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in.' });
    }
    return res.redirect('/auth/login');
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clothing_erp_jwt_secret_key_12345_67890');

    // Get user from database
    const user = await User.findById(decoded.id).populate('branch_id');
    if (!user) {
      res.clearCookie('token');
      if (req.accepts('html', 'json') === 'json' || req.path.startsWith('/api')) {
        return res.status(401).json({ success: false, message: 'User not found.' });
      }
      return res.redirect('/auth/login');
    }

    req.user = user;
    // Share user data with EJS templates
    res.locals.currentUser = user;
    next();
  } catch (error) {
    console.error('JWT verification error:', error);
    res.clearCookie('token');
    if (req.accepts('html', 'json') === 'json' || req.path.startsWith('/api')) {
      return res.status(401).json({ success: false, message: 'Session expired, please log in again.' });
    }
    return res.redirect('/auth/login');
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      if (req.accepts('html', 'json') === 'json' || req.path.startsWith('/api')) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission.' });
      }
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to view this page.'
      });
    }
    next();
  };
};

module.exports = {
  protect,
  restrictTo
};
