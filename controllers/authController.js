const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const jwt = require('jsonwebtoken');

const getLogin = (req, res) => {
  if (req.cookies && req.cookies.token) {
    return res.redirect('/');
  }
  res.render('auth/login', { error: null });
};

const postLogin = async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  try {
    if (!email || !password) {
      return res.render('auth/login', { error: 'Please enter both email and password.' });
    }

    const user = await User.findOne({ email }).populate('branch_id');
    if (!user) {
      await new ActivityLog({
        user_id: null,
        action: 'LOGIN_FAILED',
        details: `Failed login attempt for email: ${email}`,
        ip_address: ip
      }).save();
      return res.render('auth/login', { error: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await new ActivityLog({
        user_id: null,
        action: 'LOGIN_FAILED',
        details: `Incorrect password for user: ${email}`,
        ip_address: ip
      }).save();
      return res.render('auth/login', { error: 'Invalid email or password.' });
    }

    // Sign JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'clothing_erp_jwt_secret_key_12345_67890',
      { expiresIn: '1d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // Log Activity
    await new ActivityLog({
      user_id: user._id,
      action: 'LOGIN_SUCCESS',
      details: `${user.name} logged in successfully (${user.role}).`,
      ip_address: ip
    }).save();

    res.redirect('/');
  } catch (error) {
    console.error('Login error:', error);
    res.render('auth/login', { error: 'An unexpected error occurred. Please try again.' });
  }
};

const getLogout = async (req, res) => {
  try {
    if (req.user) {
      await new ActivityLog({
        user_id: req.user._id,
        action: 'LOGOUT',
        details: `${req.user.name} logged out.`,
        ip_address: req.ip || req.connection.remoteAddress
      }).save();
    }
  } catch (err) {
    console.error('Error logging logout:', err);
  }

  res.clearCookie('token');
  res.redirect('/auth/login');
};

module.exports = {
  getLogin,
  postLogin,
  getLogout
};
