const Branch = require('../models/Branch');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

const getBranches = async (req, res) => {
  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('branches/index', { branches, error: null, success: null });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).render('error', { title: 'Branch Error', message: 'Failed to load branches.' });
  }
};

const postCreateBranch = async (req, res) => {
  const { branch_name, city, address, branch_type } = req.body;
  try {
    const branches = await Branch.find().sort({ branch_name: 1 });
    if (!branch_name || !city || !address || !branch_type) {
      return res.render('branches/index', { branches, error: 'All fields are required.', success: null });
    }

    const exists = await Branch.findOne({ branch_name: branch_name.trim() });
    if (exists) {
      return res.render('branches/index', { branches, error: 'Branch name already exists.', success: null });
    }

    const newBranch = new Branch({
      branch_name: branch_name.trim(),
      city: city.trim(),
      address: address.trim(),
      branch_type: branch_type
    });
    await newBranch.save();

    // Log Activity
    await new ActivityLog({
      user_id: req.user._id,
      action: 'CREATE_BRANCH',
      details: `Created new branch: ${newBranch.branch_name}`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    const updatedBranches = await Branch.find().sort({ branch_name: 1 });
    res.render('branches/index', { branches: updatedBranches, error: null, success: 'Branch created successfully!' });
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).render('error', { title: 'Branch Error', message: 'Failed to create branch.' });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find().populate('branch_id').sort({ name: 1 });
    const branches = await Branch.find().sort({ branch_name: 1 });
    res.render('branches/users', { users, branches, error: null, success: null });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).render('error', { title: 'User Error', message: 'Failed to load users.' });
  }
};

const postCreateUser = async (req, res) => {
  const { name, email, password, role, branch_id } = req.body;
  try {
    const users = await User.find().populate('branch_id').sort({ name: 1 });
    const branches = await Branch.find().sort({ branch_name: 1 });

    if (!name || !email || !password || !role) {
      return res.render('branches/users', { users, branches, error: 'Please fill in all required fields.', success: null });
    }

    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    if (exists) {
      return res.render('branches/users', { users, branches, error: 'Email already registered.', success: null });
    }

    const newUser = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      role: role,
      branch_id: role === 'Super Admin' ? null : branch_id
    });
    await newUser.save();

    // Log Activity
    await new ActivityLog({
      user_id: req.user._id,
      action: 'CREATE_USER',
      details: `Created user ${newUser.email} with role ${newUser.role}`,
      ip_address: req.ip || req.connection.remoteAddress
    }).save();

    const updatedUsers = await User.find().populate('branch_id').sort({ name: 1 });
    res.render('branches/users', { users: updatedUsers, branches, error: null, success: 'User created successfully!' });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).render('error', { title: 'User Error', message: 'Failed to create user.' });
  }
};

module.exports = {
  getBranches,
  postCreateBranch,
  getUsers,
  postCreateUser
};
