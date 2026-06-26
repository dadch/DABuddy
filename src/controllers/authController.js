const { User, UserRole, Year, Thesis } = require('../models');
const { Op, fn, col, where } = require('sequelize');
const crypto = require('crypto');

// ---------- M365 / Microsoft Entra ID Login (Single-Tenant @hftm.ch) ----------

let _msalClient = null;
// Lazy-Init: erst beim ersten Login-Versuch initialisieren, damit der Server
// auch dann startet, wenn die M365-Konfiguration (noch) fehlt.
function getMsalClient() {
  if (_msalClient) return _msalClient;
  const clientId = process.env.MS_CLIENT_ID;
  const tenantId = process.env.MS_TENANT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !tenantId || !clientSecret) return null;
  const { ConfidentialClientApplication } = require('@azure/msal-node');
  _msalClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  });
  return _msalClient;
}

const MS_REDIRECT_URI = () => process.env.MS_REDIRECT_URI || 'http://localhost:3000/auth/microsoft/callback';
const MS_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

// Startet den M365-Login-Flow: PKCE + State werden in der Session abgelegt,
// dann Redirect zu Microsoft.
const startMicrosoftLogin = async (req, res) => {
  try {
    const msal = getMsalClient();
    if (!msal) {
      req.flash('error', 'M365-Login ist nicht konfiguriert. Bitte Administrator informieren.');
      return res.redirect('/login');
    }
    const state = crypto.randomBytes(16).toString('hex');
    req.session.msAuthState = state;
    const url = await msal.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI(),
      state,
      prompt: 'select_account',
    });
    return res.redirect(url);
  } catch (e) {
    console.error('startMicrosoftLogin error:', e);
    req.flash('error', 'M365-Login konnte nicht gestartet werden.');
    return res.redirect('/login');
  }
};

// Callback nach Authentifizierung bei Microsoft: Code gegen Token tauschen,
// User per E-Mail (case-insensitive) im DABuddy-User-Bestand suchen, Session
// wie beim normalen Passwort-Login aufbauen.
const microsoftCallback = async (req, res) => {
  try {
    const msal = getMsalClient();
    if (!msal) {
      req.flash('error', 'M365-Login ist nicht konfiguriert.');
      return res.redirect('/login');
    }

    // State-Check gegen CSRF.
    if (!req.query.state || req.query.state !== req.session.msAuthState) {
      req.flash('error', 'Ungültiger M365-Login-Status. Bitte erneut versuchen.');
      return res.redirect('/login');
    }
    delete req.session.msAuthState;

    if (req.query.error) {
      console.warn('M365 auth error:', req.query.error, req.query.error_description);
      req.flash('error', 'M365-Login abgebrochen oder verweigert.');
      return res.redirect('/login');
    }
    if (!req.query.code) {
      req.flash('error', 'Kein Authorization-Code von Microsoft erhalten.');
      return res.redirect('/login');
    }

    const tokenResponse = await msal.acquireTokenByCode({
      code: req.query.code,
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI(),
    });

    const claims = tokenResponse.idTokenClaims || {};
    // E-Mail aus den Standardansprüchen ableiten. Bei Schul-Tenant ist
    // `preferred_username` üblicherweise die UPN/Mail-Adresse.
    const email = (claims.email || claims.preferred_username || claims.upn || '').toString().trim().toLowerCase();
    if (!email) {
      req.flash('error', 'M365-Login lieferte keine E-Mail-Adresse.');
      return res.redirect('/login');
    }

    // User per Mail (case-insensitive) suchen.
    const user = await User.findOne({
      where: where(fn('lower', col('email')), email),
    });
    if (!user) {
      req.flash('error', 'Diese E-Mail-Adresse ist nicht im System registriert. Bitte wende dich an die Fachbereichsleitung.');
      return res.redirect('/login');
    }

    // Locked-Thesis-Check (wie beim Passwort-Login).
    const roles = await getUserRoles(user.id);
    if (roles.includes('student')) {
      const lockedThesis = await user.getStudentTheses({ where: { is_locked: true }, limit: 1 });
      if (lockedThesis && lockedThesis.length > 0) {
        req.flash('error', 'Diese Diplomarbeit wurde gesperrt. Bitte kontaktieren Sie die Fachbereichsleitung.');
        return res.redirect('/login');
      }
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
    req.session.language = user.language || 'de';

    req.flash('success', `Willkommen zurück, ${user.firstname}!`);
    return res.redirect('/dashboard');
  } catch (e) {
    console.error('microsoftCallback error:', e);
    req.flash('error', 'M365-Login fehlgeschlagen.');
    return res.redirect('/login');
  }
};

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
  if (req.query.locked === '1') {
    req.flash('error', 'Diese Diplomarbeit wurde gesperrt. Bitte kontaktieren Sie die Fachbereichsleitung.');
  }
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

    // Gesperrte Arbeit: Studierende, deren Diplomarbeit gesperrt wurde
    // (z.B. wegen Abbruch), dürfen sich nicht mehr einloggen.
    const roles = await getUserRoles(user.id);
    if (roles.includes('student')) {
      const lockedThesis = await user.getStudentTheses({
        where: { is_locked: true },
        limit: 1,
      });
      if (lockedThesis && lockedThesis.length > 0) {
        req.flash('error', 'Diese Diplomarbeit wurde gesperrt. Bitte kontaktieren Sie die Fachbereichsleitung.');
        return res.redirect('/login');
      }
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
    req.session.language = user.language || 'de';

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
  startMicrosoftLogin,
  microsoftCallback,
};
