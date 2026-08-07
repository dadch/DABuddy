const requireAuth = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    // Ziel-URL merken (nur interne GET-Ziele), damit z.B. Mail-Links nach dem
    // Login direkt zur gewünschten Seite führen statt aufs Dashboard.
    if (req.session && req.method === 'GET' && typeof req.originalUrl === 'string'
        && req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//')) {
      req.session.returnTo = req.originalUrl;
    }
    req.flash('error', 'Bitte melden Sie sich an, um auf diese Seite zuzugreifen.');
    return res.redirect('/login');
  }

  // Wenn der eingeloggte User aktuell als Studierende/r unterwegs ist und seine
  // Diplomarbeit zwischenzeitlich gesperrt wurde, Session sofort verwerfen.
  if (req.session.userRole === 'student') {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(req.session.userId);
      if (user) {
        const locked = await user.getStudentTheses({ where: { is_locked: true }, limit: 1 });
        if (locked && locked.length > 0) {
          return req.session.destroy(() => {
            return res.redirect('/login?locked=1');
          });
        }
      }
    } catch (e) {
      console.error('Lock-Check fehlgeschlagen:', e);
    }
  }

  return next();
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (req.session && req.session.userId && req.session.userRole) {
      if (roles.includes(req.session.userRole)) {
        return next();
      } else {
        req.flash('error', 'Zugriff verweigert. Unzureichende Berechtigungen.');
        return res.redirect('/dashboard');
      }
    } else {
      req.flash('error', 'Bitte melden Sie sich an, um auf diese Seite zuzugreifen.');
      return res.redirect('/login');
    }
  };
};

const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  return next();
};

module.exports = {
  requireAuth,
  requireRole,
  redirectIfAuthenticated,
};