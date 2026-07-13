const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const path = require('path');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

require('dotenv').config();

const { sequelize } = require('./src/models');
const { i18next, middleware: i18nMiddleware, SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE } = require('./src/config/i18n');
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionStore = new SequelizeStore({
  db: sequelize,
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(flash());

// i18next-Middleware setzt req.t/req.i18n; danach unsere eigene Middleware
// erzwingt die in req.session.language hinterlegte Profil-Sprache (sonst
// fällt der Detector auf den Accept-Language-Header zurück).
app.use(i18nMiddleware.handle(i18next));
app.use((req, res, next) => {
  const lng = (req.session && req.session.language && SUPPORTED_LANGUAGES.includes(req.session.language))
    ? req.session.language
    : (req.i18n && SUPPORTED_LANGUAGES.includes(req.i18n.language) ? req.i18n.language : FALLBACK_LANGUAGE);
  if (req.i18n && req.i18n.language !== lng) req.i18n.changeLanguage(lng);
  // Für EJS-Templates verfügbar machen.
  res.locals.t = (key, opts) => req.t(key, opts);
  res.locals.lang = lng;
  res.locals.supportedLanguages = SUPPORTED_LANGUAGES;
  // Helper: lokalisierter Meilenstein-Titel. Erwartet ein Objekt mit
  // `label` (DE) und optional `label_fr`. Fällt auf DE zurück, wenn das
  // FR-Feld fehlt/leer ist. Funktioniert für sowohl Vorlagen (Milestone)
  // als auch Snapshots (ThesisMilestone).
  res.locals.milestoneLabel = (m) => {
    if (!m) return '';
    const fr = m.label_fr;
    if (lng === 'fr' && fr && String(fr).trim()) return fr;
    return m.label || '';
  };
  // Helper: lokalisierte Bezeichnung eines Diplomjahres. Bevorzugt das in der
  // Benutzersprache hinterlegte Freitext-Label; sonst Fallback auf das andere
  // Sprach-Label und zuletzt auf die reine Jahreszahl.
  res.locals.yearLabel = (y) => {
    if (!y) return '';
    const fr = y.label_fr && String(y.label_fr).trim();
    const de = y.label_de && String(y.label_de).trim();
    if (lng === 'fr' && fr) return fr;
    if (lng === 'de' && de) return de;
    return fr || de || (y.year != null ? String(y.year) : '');
  };
  // Helper: lokalisierte Bezeichnung einer Upload-Kategorie. Bevorzugt
  // label_fr für FR-User; sonst Fallback auf label (DE).
  res.locals.categoryLabel = (c) => {
    if (!c) return '';
    const fr = c.label_fr && String(c.label_fr).trim();
    if (lng === 'fr' && fr) return fr;
    return c.label || '';
  };
  next();
});

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Seite nicht gefunden',
    messages: req.flash()
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', {
    title: 'Serverfehler',
    messages: req.flash()
  });
});

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    sessionStore.sync();
    
    await sequelize.sync({ force: false });
    console.log('Database synchronized successfully.');
    
    app.listen(PORT, () => {
      console.log(`ThesisBuddy server running on http://localhost:${PORT}`);
    });

    // Reminder-Scheduler starten (Cron, standardmässig täglich 07:00).
    try {
      require('./src/jobs/reminderJob').start();
    } catch (e) {
      console.warn('[reminderJob] konnte nicht gestartet werden:', e.message);
    }
  } catch (error) {
    console.error('Unable to start server:', error);
    process.exit(1);
  }
}

startServer();