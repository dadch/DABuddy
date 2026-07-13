// Archivierung einer oder mehrerer Diplomarbeiten als geschachtelte ZIP.
//
// Aufbau der Ziel-Archive-Datei:
//   <Fachbereich>/<Nachname>_<Vorname>.zip
//     ├─ <Meilenstein>/
//     │    ├─ <Kategorie>_V<version>_<YYYYMMDD>.<ext>   ← Uploads (aktuelle + Historie)
//     │    └─ Bewertung_<Bezeichnung>_<Rolle>.pdf       ← 0–3 PDFs je nach Bewertungs-Konfig
//     ├─ Chat.md                                         ← chronologisches Protokoll
//     ├─ Chat-Uploads/                                   ← angefügte Chat-Dateien
//     ├─ Metadata.md                                     ← Header-Daten (Titel, Rollen, Sponsor, …)
//     └─ History.md                                      ← Änderungsprotokoll (thesis_logs)
//
// Verwendet `archiver` für die inneren ZIPs (in-memory) und für das Outer-Archiv
// (direkter Stream zur HTTP-Response).

const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');

const {
  sequelize,
  Thesis, ThesisMilestone, ThesisMilestoneDocument,
  ThesisEvaluation, ThesisLog, ChatMessage, UploadCategory,
  User, Year, Department,
} = require('../models');
const { streamEvaluationPdf, streamFeedbackFormPdf } = require('./evaluationPdf');
const { loadFullEvaluation, loadFeedbackContext } = require('../controllers/evaluationController');

const ROLE_LABELS = {
  student: 'Studierender', coach: 'Dozent', expert: 'Experte',
  admin: 'Administrator', department_lead: 'Fachbereichsleiter',
  field_project_coach: 'Dozent-Transferprojekt',
};

const ACTION_LABELS = {
  document_upload: 'Dokument hochgeladen',
  document_update: 'Dokument aktualisiert',
  document_delete: 'Dokument gelöscht',
  evaluation_create: 'Bewertung erfasst',
  evaluation_update: 'Bewertung aktualisiert',
  milestone_approved: 'Freigabe erteilt',
  milestone_revoked: 'Freigabe zurückgezogen',
  milestone_released: 'Meilenstein freigegeben (gestartet)',
  milestone_locked: 'Meilenstein gesperrt',
  confidentiality_uploaded: 'Geheimhaltungs-Dokument hochgeladen',
  confidentiality_deleted: 'Geheimhaltungs-Dokument gelöscht',
  thesis_locked: 'Diplomarbeit gesperrt',
  thesis_unlocked: 'Diplomarbeit entsperrt',
  feedback_updated: 'Feedbackformular bearbeitet',
  reminder_sent: 'Erinnerung versendet',
};

// ---------- Dateinamen-Helfer ----------------------------------------------

function sanitize(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'unbenannt';
}

function fmtYyyymmdd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function fmtDateTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('de-CH') + ' ' + dt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Metadata.md / History.md / Chat.md -----------------------------

function buildMetadataMd(thesis) {
  const students = (thesis.students || []).map(s => `- ${s.name}, ${s.firstname}${s.email ? ' — ' + s.email : ''}`).join('\n') || '- —';
  const coaches  = (thesis.coaches  || []).map(u => `- ${u.name}, ${u.firstname}${u.email ? ' — ' + u.email : ''}`).join('\n') || '- —';
  const experts  = (thesis.experts  || []).map(u => `- ${u.name}, ${u.firstname}${u.email ? ' — ' + u.email : ''}`).join('\n') || '- —';
  const fpcs     = (thesis.fieldProjectCoaches || []).map(u => `- ${u.name}, ${u.firstname}${u.email ? ' — ' + u.email : ''}`).join('\n') || '- —';
  const dept     = thesis.department ? thesis.department.name : '—';
  const year     = thesis.year ? String(thesis.year.year) : '—';
  const lang     = thesis.language === 'fr' ? 'Französisch' : 'Deutsch';
  return `# Metadata

**Titel:** ${thesis.title || ''}
**Diplomjahr:** ${year}
**Fachbereich:** ${dept}
**Sprache:** ${lang}
**Auftraggeber:** ${thesis.sponsor || '—'}
**Geheimhaltung:** ${thesis.is_confidential ? 'Ja' : 'Nein'}
**Repetent:** ${thesis.is_repetent ? 'Ja' : 'Nein'}
**Gesperrt:** ${thesis.is_locked ? 'Ja' : 'Nein'}${thesis.is_locked && thesis.locked_reason ? ` — Grund: ${thesis.locked_reason}` : ''}

## Studierende
${students}

## Dozent/in
${coaches}

## Expert/in
${experts}

## Dozent Transferprojekt
${fpcs}

---
Archiviert am ${fmtDateTime(new Date())}.
`;
}

function buildHistoryMd(logs) {
  if (!logs || logs.length === 0) return '# Änderungsprotokoll\n\n(keine Einträge)\n';
  const rows = ['# Änderungsprotokoll', '', '| Zeitpunkt | Aktion | Person | Detail |', '|---|---|---|---|'];
  for (const l of logs) {
    const who = l.user ? `${l.user.name}, ${l.user.firstname}` : '—';
    const action = ACTION_LABELS[l.action] || l.action;
    const detail = (l.detail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    rows.push(`| ${fmtDateTime(l.createdAt)} | ${action} | ${who} | ${detail} |`);
  }
  return rows.join('\n') + '\n';
}

function buildChatMd(messages) {
  if (!messages || messages.length === 0) return '# Chatprotokoll\n\n(keine Nachrichten)\n';
  const lines = ['# Chatprotokoll', ''];
  for (const m of messages) {
    const who = m.sender ? `${m.sender.name}, ${m.sender.firstname}` : '—';
    const when = fmtDateTime(m.createdAt);
    const attach = m.document_filename ? ` _(Anhang: Chat-Uploads/${m.document_filename})_` : '';
    const text = (m.content || '').replace(/\r?\n/g, '\n> ');
    lines.push(`## ${when} — ${who}${attach}`);
    if (text) lines.push('', `> ${text}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Bewertungs-PDF in Buffer sammeln --------------------------------

// Erzeugt ein Buffer mit dem Feedbackformular-PDF. Voraussetzung ist eine
// finale Bewertung (`ctx.finalEval`), sonst kann das Formular nicht befüllt
// werden — in dem Fall liefert die Funktion `null` und der Aufrufer überspringt.
async function feedbackPdfBuffer(tm) {
  const ctx = await loadFeedbackContext(tm);
  if (!ctx || !ctx.finalEval) return null;
  const language = ctx.thesis && ctx.thesis.language === 'fr' ? 'fr' : 'de';
  const tmLabelLocal = (language === 'fr' && tm.label_fr) ? tm.label_fr : (tm.label || '');
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data',  (c) => chunks.push(c));
    sink.on('end',   () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
    try {
      streamFeedbackFormPdf(sink, {
        language,
        thesis: ctx.thesis,
        milestoneLabel: tmLabelLocal,
        groupGrades: ctx.groupGrades,
        moduleGrade: ctx.moduleGrade,
        feedbackText: tm.feedback_text || '',
        coachName: ctx.coachName,
        expertName: ctx.expertName,
        deptLeadName: ctx.deptLeadName,
      });
    } catch (e) { reject(e); }
  });
}

// Erzeugt ein Buffer mit einer Bewertungs-PDF (Struktur oder Freitext).
// Wichtig: alle Listener werden VOR dem Anstoss des PDF-Generators registriert,
// damit `end` nicht verpasst wird, falls pdfkit schnell fertig ist.
async function evalPdfBuffer(thesis, tm, kind, evaluationRow) {
  const isFr = thesis.language === 'fr';
  const tmLabel = (isFr && tm.label_fr) ? tm.label_fr : (tm.label || '');
  const phaseLabels = { first: ' (Bewertung 1)', second: ' (Bewertung 2)', final: ' (Finale Bewertung)' };
  const title = 'Bewertung ' + tmLabel + (phaseLabels[kind] || '');

  const evaluation = (!tm.evaluation_form_id)
    ? null
    : await loadFullEvaluation(evaluationRow.id);

  return await new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data', (c) => chunks.push(c));
    sink.on('end',  () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
    try {
      if (evaluation) {
        streamEvaluationPdf(sink, { thesis, milestone: tm, title, evaluation });
      } else {
        streamEvaluationPdf(sink, { thesis, milestone: tm, title, freeText: tm.evaluation });
      }
    } catch (e) { reject(e); }
  });
}

// Erzeugt eine kompakte "keine Bewertung erfasst"-PDF als Platzhalter — nicht
// verwendet; Meilensteine ohne Bewertung führen einfach keine Bewertungs-PDF.

// ---------- Aufbau eines Diplomarbeit-Archivs (in-memory Buffer) -----------

async function buildThesisArchiveBuffer(thesisId) {
  console.log('[archive] Start DA', thesisId);
  const thesis = await Thesis.findByPk(thesisId, {
    include: [
      { model: Year, as: 'year' },
      { model: Department, as: 'department' },
      { model: User, as: 'students',            attributes: ['id', 'firstname', 'name', 'email'] },
      { model: User, as: 'coaches',             attributes: ['id', 'firstname', 'name', 'email'] },
      { model: User, as: 'experts',             attributes: ['id', 'firstname', 'name', 'email'] },
      { model: User, as: 'fieldProjectCoaches', attributes: ['id', 'firstname', 'name', 'email'] },
    ],
  });
  if (!thesis) throw new Error('Diplomarbeit nicht gefunden: ' + thesisId);

  const milestones = await ThesisMilestone.findAll({
    where: { thesis_id: thesisId },
    include: [
      {
        model: ThesisMilestoneDocument, as: 'documents',
        include: [{ model: UploadCategory, as: 'uploadCategory' }],
      },
      { model: ThesisEvaluation, as: 'thesisEvaluations' },
    ],
    order: [['due_at', 'ASC'], ['id', 'ASC']],
  });

  const logs = await ThesisLog.findAll({
    where: { thesis_id: thesisId },
    include: [{ model: User, as: 'user', attributes: ['firstname', 'name'] }],
    order: [['createdAt', 'ASC']],
  });

  const chatMessages = await ChatMessage.findAll({
    where: { thesis_id: thesisId },
    include: [{ model: User, as: 'sender', attributes: ['firstname', 'name'] }],
    order: [['createdAt', 'ASC']],
  });
  console.log(`[archive] DA ${thesisId}: ${milestones.length} Meilensteine, ${logs.length} Logs, ${chatMessages.length} Chat-Nachrichten`);

  // Bewertungs- und Feedback-PDFs im Voraus generieren, damit wir sie synchron
  // ins Archiv schieben können und der Buffer-Sammler nicht auf async warten muss.
  const evalEntries = [];
  for (const tm of milestones) {
    const msFolder = sanitize(tm.label || `Meilenstein_${tm.id}`);
    const evals = tm.thesisEvaluations || [];
    for (const ev of evals) {
      const kind = ev.kind;
      let phaseLabel, roleKey;
      if (kind === 'first')       { phaseLabel = 'Bewertung_1'; roleKey = tm.evaluator_role; }
      else if (kind === 'second') { phaseLabel = 'Bewertung_2'; roleKey = tm.evaluator_role_2; }
      else if (kind === 'final')  { phaseLabel = 'Finale_Bewertung'; roleKey = null; }
      else                        { phaseLabel = 'Bewertung'; roleKey = tm.evaluator_role; }
      const roleLabel = roleKey ? ROLE_LABELS[roleKey] || roleKey : '';
      const evalName = `${msFolder}/Bewertung_${phaseLabel}${roleLabel ? '_' + sanitize(roleLabel) : ''}.pdf`;
      try {
        console.log('[archive] Erzeuge Bewertungs-PDF', tm.id, kind);
        const pdfBuf = await evalPdfBuffer(thesis, tm, kind, ev);
        console.log('[archive] Bewertungs-PDF fertig', tm.id, kind, `(${pdfBuf.length} bytes)`);
        evalEntries.push({ name: evalName, buf: pdfBuf });
      } catch (e) {
        console.error('[archive] Bewertungs-PDF fehlgeschlagen:', tm.id, kind, e.message);
      }
    }

    // Feedbackformular als PDF (nur wenn aktiviert UND finale Bewertung vorhanden).
    if (tm.feedback_form_enabled) {
      try {
        console.log('[archive] Erzeuge Feedback-PDF', tm.id);
        const fbBuf = await feedbackPdfBuffer(tm);
        if (fbBuf) {
          console.log('[archive] Feedback-PDF fertig', tm.id, `(${fbBuf.length} bytes)`);
          evalEntries.push({ name: `${msFolder}/Feedbackformular.pdf`, buf: fbBuf });
        } else {
          console.log('[archive] Feedback-PDF übersprungen (keine finale Bewertung)', tm.id);
        }
      } catch (e) {
        console.error('[archive] Feedback-PDF fehlgeschlagen:', tm.id, e.message);
      }
    }
  }

  // Inneres ZIP → PassThrough → Buffer. Listener werden VOR jedem append/pipe
  // registriert, damit das `end`-Event auch bei sehr kleinen Archiven ankommt.
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data',  (c) => chunks.push(c));
    sink.on('end',   () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('inner archive warning:', err); });
    archive.on('error', reject);
    archive.pipe(sink);

    // Metadata.md + History.md + Chat.md
    archive.append(buildMetadataMd(thesis), { name: 'Metadata.md' });
    archive.append(buildHistoryMd(logs),    { name: 'History.md' });
    archive.append(buildChatMd(chatMessages), { name: 'Chat.md' });

    // Chat-Uploads/
    for (const m of chatMessages) {
      if (m.document_path && m.document_filename && fs.existsSync(m.document_path)) {
        archive.file(m.document_path, { name: `Chat-Uploads/${m.document_filename}` });
      }
    }

    // Uploads pro Meilenstein
    for (const tm of milestones) {
      const msFolder = sanitize(tm.label || `Meilenstein_${tm.id}`);
      const docs = (tm.documents || []).slice().sort((a, b) => (a.version || 0) - (b.version || 0));
      for (const d of docs) {
        if (!d.file_path) { console.warn('[archive] Dokument ohne file_path:', d.id); continue; }
        if (!fs.existsSync(d.file_path)) { console.warn('[archive] Datei fehlt auf Disk:', d.file_path); continue; }
        const catLabel = d.uploadCategory ? d.uploadCategory.label : 'Dokument';
        const ext = path.extname(d.file_name || d.file_path) || '';
        const uploadDate = d.uploaded_at || d.createdAt || new Date();
        const namedAs = `${sanitize(catLabel)}_V${d.version || 1}_${fmtYyyymmdd(uploadDate)}${ext}`;
        archive.file(d.file_path, { name: `${msFolder}/${namedAs}` });
      }
    }

    // Bewertungs-PDFs (bereits vorher erzeugt)
    for (const e of evalEntries) {
      archive.append(e.buf, { name: e.name });
    }

    console.log(`[archive] DA ${thesisId}: finalize (evals=${evalEntries.length})`);
    archive.finalize()
      .then(() => console.log(`[archive] DA ${thesisId}: finalize resolved`))
      .catch(reject);
  });
}

// ---------- Outer-Archiv (streamt zur Response) -----------------------------

// Streamt ein Sammel-Archiv aller in `thesisIds` genannten Diplomarbeiten zur
// bereits mit Content-Disposition versehenen Response.
async function streamArchive(res, thesisIds) {
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('outer archive warning:', err); });
  archive.on('error', (err) => { console.error('outer archive error:', err); try { res.status(500).end(); } catch (e) {} });
  archive.pipe(res);

  // Für einheitliche Ordner-Namen pro Fachbereich: pro Thesis Metadaten laden (nur was für den Ordner-Namen nötig ist).
  const theses = await Thesis.findAll({
    where: { id: thesisIds },
    include: [
      { model: Department, as: 'department', attributes: ['name'] },
      { model: User, as: 'students', attributes: ['firstname', 'name'] },
    ],
  });

  const seenPerDept = new Map();
  for (const t of theses) {
    const dept = sanitize((t.department && t.department.name) || 'Fachbereich');
    // Nachname_Vorname aller Studierenden (via / getrennt bei Zweien).
    const students = (t.students || []).map(s => `${s.name}_${s.firstname}`).filter(Boolean);
    const baseStudent = students.length ? sanitize(students.join('_')) : `DA_${t.id}`;
    const key = `${dept}/${baseStudent}`;
    const counter = seenPerDept.get(key) || 0;
    seenPerDept.set(key, counter + 1);
    const suffix = counter === 0 ? '' : `_${counter + 1}`;
    const innerZipName = `${dept}/${baseStudent}${suffix}.zip`;

    try {
      const buf = await buildThesisArchiveBuffer(t.id);
      console.log(`[archive] DA ${t.id} eingebettet als ${innerZipName} (${buf.length} bytes)`);
      archive.append(buf, { name: innerZipName });
    } catch (e) {
      console.error('[archive] Fehler bei DA', t.id, e.message, e.stack);
      archive.append(`Fehler beim Archivieren dieser Diplomarbeit: ${e.message}\n`, { name: `${dept}/${baseStudent}_FEHLER.txt` });
    }
  }

  console.log('[archive] Outer finalize');
  await archive.finalize();
  console.log('[archive] Outer finalize resolved');
}

module.exports = { streamArchive, buildThesisArchiveBuffer, feedbackPdfBuffer };
