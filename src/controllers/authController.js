const { User, Year } = require('../models');

const showLogin = async (req, res) => {
  try {
    const years = await Year.findAll({ order: [['year', 'DESC']] });
    res.render('login', { years, messages: req.flash() });
  } catch (error) {
    console.error('Error loading login page:', error);
    res.render('login', { years: [], messages: { error: ['Unable to load years'] } });
  }
};

const processLogin = async (req, res) => {
  const { username, password, year } = req.body;

  try {
    if (!username || !password || !year) {
      req.flash('error', 'Please fill in all fields');
      return res.redirect('/login');
    }

    const user = await User.findOne({ where: { username } });
    
    if (!user) {
      req.flash('error', 'Invalid username or password');
      return res.redirect('/login');
    }

    const isValidPassword = await user.validatePassword(password);
    
    if (!isValidPassword) {
      req.flash('error', 'Invalid username or password');
      return res.redirect('/login');
    }

    const selectedYear = await Year.findByPk(year);
    if (!selectedYear) {
      req.flash('error', 'Invalid year selected');
      return res.redirect('/login');
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.selectedYear = selectedYear.id;
    req.session.username = user.username;
    req.session.fullName = `${user.firstname} ${user.name}`;

    console.log('Login successful - Session set:', {
      userId: req.session.userId,
      userRole: req.session.userRole,
      selectedYear: req.session.selectedYear,
      fullName: req.session.fullName
    });

    req.flash('success', `Welcome back, ${user.firstname}!`);
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'An error occurred during login');
    res.redirect('/login');
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      req.flash('error', 'Could not log out');
      return res.redirect('/dashboard');
    }
    res.redirect('/login');
  });
};

module.exports = {
  showLogin,
  processLogin,
  logout,
};