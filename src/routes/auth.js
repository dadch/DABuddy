const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuthenticated } = require('../middleware/auth');

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post('/login', redirectIfAuthenticated, authController.processLogin);
router.get('/logout', authController.logout);

// M365 / Microsoft Entra ID Login
router.get('/auth/microsoft', redirectIfAuthenticated, authController.startMicrosoftLogin);
router.get('/auth/microsoft/callback', redirectIfAuthenticated, authController.microsoftCallback);

module.exports = router;