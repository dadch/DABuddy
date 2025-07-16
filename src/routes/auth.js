const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuthenticated } = require('../middleware/auth');

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post('/login', redirectIfAuthenticated, authController.processLogin);
router.get('/logout', authController.logout);

module.exports = router;