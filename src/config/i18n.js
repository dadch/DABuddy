// i18n-Initialisierung (i18next + fs-backend + Express-Middleware).
// Übersetzungen liegen in locales/<lang>/translation.json. Neue Sprachen
// können einfach durch Anlegen weiterer Unterverzeichnisse ergänzt werden;
// ggf. zusätzlich in SUPPORTED_LANGUAGES eintragen.
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path = require('path');

const SUPPORTED_LANGUAGES = ['de', 'fr'];
const FALLBACK_LANGUAGE = 'de';

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    backend: {
      loadPath: path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json'),
    },
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    preload: SUPPORTED_LANGUAGES,
    ns: ['translation'],
    defaultNS: 'translation',
    detection: {
      // Sprache wird vor allem aus req.session.language gesetzt (siehe
      // resolveLanguageMiddleware). Diese Reihenfolge ist nur Fallback.
      order: ['querystring', 'header'],
      lookupQuerystring: 'lng',
      caches: false,
    },
    interpolation: { escapeValue: false }, // EJS escaped selber
  });

module.exports = {
  i18next,
  middleware,
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
};
