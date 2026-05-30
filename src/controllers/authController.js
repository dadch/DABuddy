const { User, UserRole, Year } = require('../models');
const { Op, fn, col, where } = require('sequelize');

// Liefert alle Rollen eines Users (Primär + Zusatzrollen, dedupliziert).
async function getUserRoles(userId) {
  const rows = await UserRole.findAll({ where: { user_id: userId }, attributes: ['role'] });
  return Array.from(new Set(rows.map(r => r.role)));
}

// Wählt die beim Login aktive Rolle: bevorzugt last_active_role (falls noch zugewiesen),
// sonst die Primärrolle aus users.role.
async function pickRoleForUser(user) {
  const roles = await getUserRoles(user.id);
  if (user.last_active_role && roles.includes(user.last_active_role)) return user.last_active_role;
  if (roles.includes(user.role)) return user.role;
  return roles[0] || user.role;
}

const showLogin = async (req, res) => {
  // Das Diplomjahr wird beim Login nicht mehr gewählt; es ist die globale
  // Admin-Einstellung bzw. die letzte Auswahl von Admin/FachbereichsleiterIn.
  res.render('login', { messages: req.flash() });
};

// Wählt für einen User das Diplomjahr beim Login:
//   - Admin / FachbereichsleiterIn: zuletzt gewählt (wenn noch vorhanden), sonst aktuell
//   - alle anderen Rollen: immer das aktuelle Jahr
// Fallback: jüngstes vorhandenes Jahr.
async function pickYearForUser(user) {
  const switchableRoles = ['admin', 'department_lead'];
  if (switchableRoles.includes(user.role) && user.last_selected_year_id) {
    const remembered = await Year.findByPk(user.last_selected_year_id);
    if (remembered) return remembered;
  }
  const current = await Year.findOne({ where: { is_current: true } });
  if (current) return current;
  return Year.findOne({ order: [['year', 'DESC']] });
}

const processLogin = async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
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

    const selectedYear = await pickYearForUser(user);
    if (!selectedYear) {
      req.flash('error', 'Es ist kein Diplomjahr verfügbar. Bitte kontaktieren Sie den Administrator.');
      return res.redirect('/login');
    }

    const activeRole = await pickRoleForUser(user);

    req.session.userId = user.id;
    req.session.userRole = activeRole;
    req.session.selectedYear = selectedYear.id;
    req.session.username = user.username;
    req.session.fullName = `${user.name}, ${user.firstname}`;

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
  getUserRoles,
};
