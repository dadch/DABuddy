// SMTP-Konfiguration und Versand-Helper.
//
// Erforderliche .env-Variablen (alle STRINGS):
//   MAIL_HOST         SMTP-Server-Hostname (z. B. smtp.office365.com)
//   MAIL_PORT         Port (587 = STARTTLS, 465 = SSL, 25 = plain)
//   MAIL_SECURE       'true' bei SSL/465, sonst 'false'
//   MAIL_USER         SMTP-Benutzer   (leer = Versand ohne Authentifizierung,
//   MAIL_PASS         SMTP-Passwort    z. B. internes Relay auf Port 25)
//   MAIL_FROM         Absender im Format 'ThesisBuddy <no-reply@…>'
//
// Optional für interne Relays mit Self-Signed-Zertifikat:
//   MAIL_TLS_REJECT_UNAUTHORIZED  'false' = Zertifikat nicht prüfen (Default: true)
//
// Prod-Override (optional): wenn gesetzt, gehen ALLE Mails an diese Adresse
// und der eigentliche Empfänger steht im Betreff ("→ user@…").
//   MAIL_OVERRIDE_TO  z. B. debug@…  (leer/nicht gesetzt = keine Umleitung)
//
// Rate-Limit-Schutz: nodemailer legt intern nur eine Verbindung an.

const nodemailer = require('nodemailer');

let _transporter = null;

function getConfig() {
  return {
    host: process.env.MAIL_HOST || '',
    port: parseInt(process.env.MAIL_PORT || '587', 10),
    secure: String(process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || 'ThesisBuddy <no-reply@example.local>',
    override: (process.env.MAIL_OVERRIDE_TO || '').trim() || null,
    rejectUnauthorized: String(process.env.MAIL_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
  };
}

// Host + Port genügen — Benutzer/Passwort sind optional (internes Relay ohne Auth).
function isConfigured() {
  const c = getConfig();
  return !!(c.host && c.port);
}

function getTransporter() {
  if (_transporter) return _transporter;
  if (!isConfigured()) return null;
  const c = getConfig();
  _transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    // auth nur mitgeben, wenn Credentials gesetzt sind — sonst versucht
    // nodemailer keine SMTP-Authentifizierung (anonymes Relay).
    ...(c.user || c.pass ? { auth: { user: c.user, pass: c.pass } } : {}),
    tls: { rejectUnauthorized: c.rejectUnauthorized },
  });
  return _transporter;
}

// Setzt den Transporter zurück (z. B. wenn .env geändert wurde, nur Dev).
function resetTransporter() { _transporter = null; }

// Verbindung zum SMTP-Server testen (verify).
async function verifyConnection() {
  const t = getTransporter();
  if (!t) throw new Error('SMTP-Konfiguration unvollständig (.env prüfen).');
  await t.verify();
  return true;
}

// Sendet eine Mail. `to` ist der EIGENTLICHE Empfänger. Wenn MAIL_OVERRIDE_TO
// gesetzt ist, wird die Mail dorthin umgeleitet und der Original-Empfänger
// erscheint als "→ <email>" im Betreff.
async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP-Konfiguration unvollständig (.env prüfen).');
  const c = getConfig();
  const actualTo = c.override || to;
  const finalSubject = c.override ? `[→ ${to}] ${subject}` : subject;
  return t.sendMail({
    from: c.from,
    to: actualTo,
    subject: finalSubject,
    text,
    html,
    attachments,   // optional: [{ filename, content, contentType }]
  });
}

module.exports = {
  getConfig,
  isConfigured,
  getTransporter,
  resetTransporter,
  verifyConnection,
  sendMail,
};
