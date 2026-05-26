const { User, Year } = require('../models');
const { Op, fn, col, where } = require('sequelize');

const showLogin = async (req, res) => {
  try {
    const years = await Year.findAll({ order: [['year', 'DESC']] });
    res.render('login', { years, messages: req.flash() });
  } catch (error) {
    console.error('Error loading login page:', error);
    res.render('login', { years: [], messages: { error: ['Diplomjahre konnten nicht geladen werden'] } });
  }
};

const processLogin = async (req, res) => {
  const { username, password, year } = req.body;

  try {
    if (!username || !password || !year) {
      req.flash('error', 'Bitte füllen Sie alle Felder aus');
      return res.redirect('/login');
    }

    // Anmeldung mit Benutzername ODER E-Mail-Adresse (E-Mail case-insensitiv).
    const ident = String(username).trim();
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username: ident },
          where(fn('lower', col('email')), ident.toLowerCase()),
        ]
      }
    });

    if (!user) {
      req.flash('error', 'Benutzername oder Passwort ungültig');
      return res.redirect('/login');
    }

    const isValidPassword = await user.validatePassword(password);

    if (!isValidPassword) {
      req.flash('error', 'Benutzername oder Passwort ungültig');
      return res.redirect('/login');
    }

    const selectedYear = await Year.findByPk(year);
    if (!selectedYear) {
      req.flash('error', 'Ungültiges Diplomjahr ausgewählt');
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

    req.flash('success', `Willkommen zurück, ${user.firstname}!`);
    res.redirect('/dashboard');

  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Bei der Anmeldung ist ein Fehler aufgetreten');
    res.redirect('/login');
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      req.flash('error', 'Abmeldung nicht möglich');
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