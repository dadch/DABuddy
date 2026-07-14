// Sekretariats-Änderungsbenachrichtigung.
//
// Wenn für eine Diplomarbeit die initiale Sekretariats-Mail (Marker im
// appSettings-Store) bereits versendet wurde, informiert dieser Notifier das
// Sekretariat bei relevanten Änderungen an dieser DA (Titel, Bewerterteam,
// Auftraggeber) sowie beim Upload einer Geheimhaltungsvereinbarung.
//
// Ist die initiale Mail noch nicht gegangen, macht diese Funktion nichts —
// die Änderungsmeldung ist nur ab dem Moment relevant, wo das Sekretariat
// den ersten Zustand kennt.

const fs = require('fs');
const path = require('path');
const { Thesis, User, Department, Year } = require('../models');
const appSettings = require('../config/appSettings');
const mailer = require('../config/mailer');

function _sanitize(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120) || 'unbenannt';
}

// Sendet die Änderungsmail (Fire-and-Forget). Return { sent, reason }.
async function notifyChange(thesisId, opts = {}) {
  try {
    const secretariatEmail = appSettings.get('secretariat_email');
    if (!secretariatEmail) return { sent: false, reason: 'no_secretariat_email' };
    if (!mailer.isConfigured()) return { sent: false, reason: 'smtp_not_configured' };

    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name'] },
        { model: Year, as: 'year', attributes: ['id', 'year'] },
        { model: User, as: 'students', attributes: ['id', 'firstname', 'name'] },
        { model: User, as: 'coaches',  attributes: ['id', 'firstname', 'name'] },
        { model: User, as: 'experts',  attributes: ['id', 'firstname', 'name'] },
      ],
    });
    if (!thesis) return { sent: false, reason: 'thesis_not_found' };
    if (thesis.is_locked) return { sent: false, reason: 'thesis_locked' };
    if (!thesis.year || !thesis.department) return { sent: false, reason: 'missing_year_or_dept' };

    const markerKey = `secretariat_notified_transfer:${thesis.year.id}:${thesis.department.id}`;
    if (!appSettings.get(markerKey)) return { sent: false, reason: 'not_yet_initially_notified' };

    const students = thesis.students || [];
    const studentName = students.length
      ? students.map(s => `${s.firstname} ${s.name}`).join(' und ')
      : `Diplomarbeit ${thesis.id}`;
    const firstStudentFirst = students[0] ? students[0].firstname : '';
    const firstStudentLast  = students[0] ? students[0].name : '';
    const coachName  = (thesis.coaches  || []).map(c => `${c.firstname} ${c.name}`).join(', ') || '—';
    const expertName = (thesis.experts  || []).map(e => `${e.firstname} ${e.name}`).join(', ') || '—';

    const subject = `ThesisBuddy — Änderung Diplomarbeit: ${firstStudentFirst} ${firstStudentLast}`.trim();
    const text =
`Liebes Sekretariat

Der Diplomarbeitstitel oder das Bewerterteam für die Diplomarbeit von ${studentName} wurde geändert: Hier die aktuellen Daten:
Titel: ${thesis.title || '—'}
Dozent: ${coachName}
Experte: ${expertName}
Auftraggeber: ${thesis.sponsor || '—'}
Geheimhaltung: ${thesis.is_confidential ? 'Ja' : 'Nein'}

Freundliche Grüsse
ThesisBuddy`;

    const attachments = [];
    if (thesis.is_confidential
        && thesis.confidentiality_document_path
        && fs.existsSync(thesis.confidentiality_document_path)) {
      const namePart = students.length
        ? students.map(s => `${s.firstname}_${s.name}`).join('_')
        : `DA_${thesis.id}`;
      const ext = path.extname(thesis.confidentiality_document_filename || thesis.confidentiality_document_path) || '.pdf';
      attachments.push({
        filename: `GH_${_sanitize(thesis.department.name)}_${_sanitize(namePart)}${ext}`,
        path: thesis.confidentiality_document_path,
      });
    }

    await mailer.sendMail({ to: secretariatEmail, subject, text, attachments });
    console.log(`[secretariatChange] Änderungs-Mail an ${secretariatEmail} für DA ${thesisId}${opts.reason ? ' (' + opts.reason + ')' : ''}`);
    return { sent: true };
  } catch (e) {
    console.error('[secretariatChange] Fehler:', e && e.message);
    return { sent: false, reason: 'exception', error: e && e.message };
  }
}

// Fire-and-forget-Wrapper — der Aufrufer soll nicht blockieren, nur triggern.
function notifyChangeAsync(thesisId, opts) {
  Promise.resolve()
    .then(() => notifyChange(thesisId, opts))
    .catch(e => console.error('[secretariatChange] async error:', e && e.message));
}

// Sperrungs-Benachrichtigung. Sendet UNABHÄNGIG von der initialen
// Vollständigkeits-Mail — die Sperrung ist immer eine relevante Information
// für das Sekretariat.
async function notifyLocked(thesisId) {
  try {
    const secretariatEmail = appSettings.get('secretariat_email');
    if (!secretariatEmail) return { sent: false, reason: 'no_secretariat_email' };
    if (!mailer.isConfigured()) return { sent: false, reason: 'smtp_not_configured' };

    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name'] },
        { model: User, as: 'students', attributes: ['id', 'firstname', 'name'] },
      ],
    });
    if (!thesis) return { sent: false, reason: 'thesis_not_found' };

    const students = thesis.students || [];
    const studentName = students.length
      ? students.map(s => `${s.firstname} ${s.name}`).join(' und ')
      : `Diplomarbeit ${thesis.id}`;
    const firstStudentFirst = students[0] ? students[0].firstname : '';
    const firstStudentLast  = students[0] ? students[0].name : '';
    const subject = `ThesisBuddy — Diplomarbeit gesperrt: ${firstStudentFirst} ${firstStudentLast}`.trim();
    const text =
`Liebes Sekretariat

Die Diplomarbeit von ${studentName} mit dem Titel ${thesis.title || '—'} ist durch den Fachbereichsleiter gesperrt worden.

Bitte weiterverarbeiten im Tocco.

Freundliche Grüsse
ThesisBuddy`;

    await mailer.sendMail({ to: secretariatEmail, subject, text });
    console.log(`[secretariatLock] Sperr-Mail an ${secretariatEmail} für DA ${thesisId}`);
    return { sent: true };
  } catch (e) {
    console.error('[secretariatLock] Fehler:', e && e.message);
    return { sent: false, reason: 'exception', error: e && e.message };
  }
}

function notifyLockedAsync(thesisId) {
  Promise.resolve()
    .then(() => notifyLocked(thesisId))
    .catch(e => console.error('[secretariatLock] async error:', e && e.message));
}

module.exports = { notifyChange, notifyChangeAsync, notifyLocked, notifyLockedAsync };
