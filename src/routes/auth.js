const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuthenticated } = require('../middleware/auth');

// Brute-Force-Schutz für den Passwort-Login: max. 10 fehlgeschlagene Versuche
// pro IP in 15 Minuten. Erfolgreiche Logins zählen nicht mit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  // Ein fehlgeschlagener Login antwortet mit 302 → /login; nur ein 302 → /dashboard
  // ist ein echter Erfolg. Ohne diese Unterscheidung würde jeder Fehlversuch als
  // "erfolgreich" (Status < 400) gewertet und das Limit nie greifen.
  requestWasSuccessful: (req, res) => {
    const loc = res.getHeader('Location') || res.getHeader('location');
    return res.statusCode === 302 && loc === '/dashboard';
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Zu viele Anmeldeversuche. Bitte versuchen Sie es in einigen Minuten erneut.');
    res.redirect('/login');
  },
});

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post('/login', loginLimiter, redirectIfAuthenticated, authController.processLogin);
router.get('/logout', authController.logout);

// M365 / Microsoft Entra ID Login
router.get('/auth/microsoft', redirectIfAuthenticated, authController.startMicrosoftLogin);
router.get('/auth/microsoft/callback', redirectIfAuthenticated, authController.microsoftCallback);

module.exports = router;