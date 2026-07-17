const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

router.use(protect);
router.use(restrictTo('Super Admin'));

router.get('/', branchController.getBranches);
router.post('/', branchController.postCreateBranch);

router.get('/users', branchController.getUsers);
router.post('/users', branchController.postCreateUser);

module.exports = router;
