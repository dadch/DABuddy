const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  } else {
    req.flash('error', 'Please log in to access this page.');
    return res.redirect('/login');
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (req.session && req.session.userId && req.session.userRole) {
      if (roles.includes(req.session.userRole)) {
        return next();
      } else {
        req.flash('error', 'Access denied. Insufficient permissions.');
        return res.redirect('/dashboard');
      }
    } else {
      req.flash('error', 'Please log in to access this page.');
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