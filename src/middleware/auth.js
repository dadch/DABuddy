const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    req.flash('error', 'Bitte melden Sie sich an, um auf diese Seite zuzugreifen.');
    return res.redirect('/login');
  }
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