// Öffentliche Basis-URL der Anwendung (für Links in E-Mails).
//
// Quelle ist ausschliesslich die Umgebungsvariable APP_URL, z. B.
//   APP_URL=https://thesisbuddy.hftm.ch
//
// Fehlt sie, wird auf http://localhost:<PORT> zurückgefallen. Das ist für die
// lokale Entwicklung richtig, in der Produktion aber ein Konfigurationsfehler:
// Erinnerungs- und Chat-Mails enthielten dann Links auf localhost. Deshalb
// meldet `warnIfUnconfigured()` beim Serverstart eine deutliche Warnung, und
// die Mail-Einstellungsseite zeigt den Zustand an.

function fallbackUrl() {
  return `http://localhost:${process.env.PORT || 3000}`;
}

// true, wenn APP_URL gesetzt ist (nicht leer).
function isConfigured() {
  return !!(process.env.APP_URL || '').trim();
}

// Basis-URL ohne abschliessenden Schrägstrich.
function getAppUrl() {
  const raw = (process.env.APP_URL || '').trim();
  return (raw || fallbackUrl()).replace(/\/+$/, '');
}

// Beim Serverstart aufrufen. Gibt true zurück, wenn gewarnt wurde.
function warnIfUnconfigured() {
  if (isConfigured()) return false;
  const prod = process.env.NODE_ENV === 'production';
  const msg = `[appUrl] APP_URL ist nicht gesetzt — Links in E-Mails zeigen auf ${fallbackUrl()}.`
    + (prod ? ' In der Produktion muss APP_URL in .env gesetzt werden (z. B. https://thesisbuddy.hftm.ch).' : '');
  if (prod) console.error(msg); else console.warn(msg);
  return true;
}

module.exports = { getAppUrl, isConfigured, warnIfUnconfigured };
