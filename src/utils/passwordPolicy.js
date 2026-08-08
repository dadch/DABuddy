const crypto = require('crypto');

// Die Plattform wird normalerweise über M365-Login genutzt; ein lokaler
// Passwort-Login ist nur für Administratoren vorgesehen. Alle anderen Konten
// erhalten ein zufälliges, nicht verwendbares Passwort. Admin-Passwörter
// müssen eine Mindestlänge erfüllen.
const MIN_ADMIN_PASSWORD_LEN = 12;

// Kryptografisch zufälliges Passwort (~24 Zeichen, url-safe).
function randomPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

// Liefert eine Fehlermeldung, wenn für ein Admin-Konto ein zu kurzes Passwort
// gesetzt werden soll; sonst null. Für Nicht-Admin-Rollen immer null (deren
// Passwort ist für den Login irrelevant).
function adminPasswordError(role, password) {
  if (role !== 'admin') return null;
  if (!password || String(password).length < MIN_ADMIN_PASSWORD_LEN) {
    return `Admin-Passwörter müssen mindestens ${MIN_ADMIN_PASSWORD_LEN} Zeichen lang sein.`;
  }
  return null;
}

module.exports = { MIN_ADMIN_PASSWORD_LEN, randomPassword, adminPasswordError };
