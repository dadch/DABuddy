// Erinnerungs-Job: prüft täglich alle offenen Meilenstein-Aktionen und
// versendet Mails an Bewerter und Approver, je nach hinterlegtem Termin und
// Periodizität. Ab 3 Tagen vor dem jeweiligen Termin wird täglich versendet.
//
// Zielgruppen (Phase 1):
//   - Bewertungen: erste/zweite/finale/single → jeweils zuständige Bewerter
//   - Freigaben:   approval_1, approval_2 → jeweils zuständiger Approver
//   - Feedback:    → Bewerter (single oder final-Rolle bei Doppelbewertung)
//
// Deduplikation: die Tabelle mail_reminders speichert pro
// (thesis_milestone_id, kind, recipient_user_id, sent_at). Erneuter Versand
// erst wieder nach reminder_period_days oder ab der 3-Tage-Frist täglich.
//
// Sprache: nutzt users.language für den Mail-Text (DE Default, FR wenn 'fr').

const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  ThesisMilestone, Thesis, User, Department, ThesisEvaluation, Year,
  MailReminder, ThesisLog,
} = require('../models');
const mailer = require('../config/mailer');
const { getNow } = require('../config/simulatedToday');
const appSettings = require('../config/appSettings');
const { buildThesesCsv } = require('../utils/thesesCsv');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { PassThrough } = require('stream');

// Bereinigt einen Wert für einen Dateinamen. Bewahrt Umlaute (NFC), ersetzt
// nur Pfad-/Steuerzeichen und Whitespace.
function _sanitizeFilename(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120) || 'unbenannt';
}

// Baut ein ZIP mit allen hinterlegten Geheimhaltungs-PDFs eines Fachbereichs.
// Liefert `{ buf, count }`; `null` wenn kein einziges Dokument vorhanden.
async function buildConfidentialityZipBuffer(deptTheses, deptName) {
  const withDocs = deptTheses.filter(t =>
    t.is_confidential
    && t.confidentiality_document_path
    && fs.existsSync(t.confidentiality_document_path));
  if (withDocs.length === 0) return null;

  return await new Promise((resolve, reject) => {
    const chunks = [];
    const sink = new PassThrough();
    sink.on('data',  (c) => chunks.push(c));
    sink.on('end',   () => resolve({ buf: Buffer.concat(chunks), count: withDocs.length }));
    sink.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.warn('gh-zip warning:', err); });
    archive.on('error', reject);
    archive.pipe(sink);

    const deptPart = _sanitizeFilename(deptName);
    const seen = new Set();
    for (const t of withDocs) {
      const students = (t.students || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '') || (a.firstname || '').localeCompare(b.firstname || '')
      );
      const namePart = students.length
        ? students.map(s => `${s.firstname || ''}_${s.name || ''}`.replace(/^_|_$/g, '')).join('_')
        : `DA_${t.id}`;
      const ext = path.extname(t.confidentiality_document_filename || t.confidentiality_document_path) || '.pdf';
      let base = `GH_${deptPart}_${_sanitizeFilename(namePart)}`;
      let candidate = `${base}${ext}`;
      let n = 2;
      while (seen.has(candidate)) { candidate = `${base}_${n}${ext}`; n++; }
      seen.add(candidate);
      archive.file(t.confidentiality_document_path, { name: candidate });
    }
    archive.finalize().catch(reject);
  });
}

// ---- Empfänger-Ermittlung -------------------------------------------------

// Für eine Rolle die zuständigen Personen einer DA liefern.
function peopleForRole(thesis, role) {
  if (!thesis || !role) return [];
  if (role === 'coach')               return thesis.coaches || [];
  if (role === 'expert')              return thesis.experts || [];
  if (role === 'field_project_coach') return thesis.fieldProjectCoaches || [];
  if (role === 'department_lead') {
    const lead = thesis.department && thesis.department.departmentLead;
    return lead ? [lead] : [];
  }
  return [];
}

function pickLang(user) {
  return (user && user.language === 'fr') ? 'fr' : 'de';
}

// ---- Mail-Templates --------------------------------------------------------

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

function evaluatorMail(recipient, thesis, dueAt, lang) {
  const student = (thesis.students || [])[0] || { firstname: '?', name: '?' };
  const dueStr = new Date(dueAt).toLocaleDateString(lang === 'fr' ? 'fr-CH' : 'de-CH');
  if (lang === 'fr') {
    return {
      subject: `ThesisBuddy — Rappel : évaluation à saisir (${student.firstname} ${student.name})`,
      text:
`Bonjour ${recipient.firstname},

Dans le travail de diplôme de ${student.firstname} ${student.name}, l'évaluation doit être saisie. Veuillez la terminer d'ici au ${dueStr}.

Le lien suivant t'amène directement à la plateforme : ${APP_URL()}/login

Cordialement,
Ton ThesisBuddy`,
    };
  }
  return {
    subject: `ThesisBuddy — Erinnerung: Bewertung erfassen (${student.firstname} ${student.name})`,
    text:
`Liebe/r ${recipient.firstname}

In der Diplomarbeit von ${student.firstname} ${student.name} muss die Bewertung erfasst werden. Bitte erledige dies bis zum ${dueStr}.

Der folgende Link führt dich direkt zur Plattform: ${APP_URL()}/login

Herzliche Grüsse
Dein ThesisBuddy`,
  };
}

function approverMail(recipient, thesis, dueAt, lang) {
  const student = (thesis.students || [])[0] || { firstname: '?', name: '?' };
  const dueStr = new Date(dueAt).toLocaleDateString(lang === 'fr' ? 'fr-CH' : 'de-CH');
  if (lang === 'fr') {
    return {
      subject: `ThesisBuddy — Rappel : validation en attente (${student.firstname} ${student.name})`,
      text:
`Bonjour ${recipient.firstname},

Dans le travail de diplôme de ${student.firstname} ${student.name}, une validation est en attente. Merci de la traiter d'ici au ${dueStr}.

${APP_URL()}/login

Cordialement,
Ton ThesisBuddy`,
    };
  }
  return {
    subject: `ThesisBuddy — Erinnerung: Freigabe ausstehend (${student.firstname} ${student.name})`,
    text:
`Liebe/r ${recipient.firstname}

In der Diplomarbeit von ${student.firstname} ${student.name} ist eine Freigabe ausstehend. Bitte erledige dies bis zum ${dueStr}.

${APP_URL()}/login

Herzliche Grüsse
Dein ThesisBuddy`,
  };
}

function feedbackMail(recipient, thesis, dueAt, lang) {
  const student = (thesis.students || [])[0] || { firstname: '?', name: '?' };
  const dueStr = new Date(dueAt).toLocaleDateString(lang === 'fr' ? 'fr-CH' : 'de-CH');
  if (lang === 'fr') {
    return {
      subject: `ThesisBuddy — Rappel : formulaire de feedback à compléter (${student.firstname} ${student.name})`,
      text:
`Bonjour ${recipient.firstname},

Le formulaire de feedback pour le travail de diplôme de ${student.firstname} ${student.name} doit être complété. Merci de le finaliser d'ici au ${dueStr}.

${APP_URL()}/login

Cordialement,
Ton ThesisBuddy`,
    };
  }
  return {
    subject: `ThesisBuddy — Erinnerung: Feedbackformular erfassen (${student.firstname} ${student.name})`,
    text:
`Liebe/r ${recipient.firstname}

Das Feedbackformular für die Diplomarbeit von ${student.firstname} ${student.name} muss ausgefüllt werden. Bitte erledige dies bis zum ${dueStr}.

${APP_URL()}/login

Herzliche Grüsse
Dein ThesisBuddy`,
  };
}

// ---- Zeitregel: Soll heute an diesen Empfänger versendet werden? -----------

const DAY_MS = 24 * 60 * 60 * 1000;

// Startet der Erinnerungs-Zeitraum? tm hat reminder_start_at + reminder_period_days.
async function shouldSendToday(tm, kind, recipient, actionDueAt, now) {
  if (!actionDueAt) return false;
  const due = new Date(actionDueAt).getTime();
  const startAt = tm.reminder_start_at ? new Date(tm.reminder_start_at).getTime() : null;
  const period = Math.max(1, tm.reminder_period_days || 7);

  // Nichts tun, wenn Aktion in weiterer Zukunft liegt und Startdatum noch nicht erreicht.
  if (startAt && now < startAt) return false;
  // Nichts tun, wenn Fälligkeit lange in Vergangenheit (>30 Tage überfällig — Grenze).
  if (now > due + 30 * DAY_MS) return false;

  const last = await MailReminder.findOne({
    where: {
      thesis_milestone_id: tm.id, kind: kind,
      recipient_user_id: recipient.id,
    },
    order: [['sent_at', 'DESC']],
  });
  const lastAt = last ? new Date(last.sent_at).getTime() : null;

  const withinThreeDays = (due - now) <= 3 * DAY_MS;
  if (withinThreeDays) {
    // Täglich: nur nicht am selben Kalendertag doppelt.
    if (!lastAt) return true;
    const nowDay = new Date(now).toDateString();
    const lastDay = new Date(lastAt).toDateString();
    return nowDay !== lastDay;
  }
  // Sonst: alle `period` Tage.
  if (!lastAt) return true;
  return (now - lastAt) >= period * DAY_MS;
}

// ---- Kern-Ausführung -------------------------------------------------------

async function processReminders() {
  if (!mailer.isConfigured()) {
    console.log('[reminderJob] SMTP nicht konfiguriert — Job übersprungen.');
    return { sent: 0, skipped: 0, reason: 'not_configured' };
  }
  // Verwendet ggf. das Admin-Override-Datum (simulatedToday), sonst Systemzeit.
  const now = getNow().getTime();

  // Alle relevanten Meilenstein-Snapshots laden (mit DA + Bewertungen).
  const tms = await ThesisMilestone.findAll({
    where: {
      released: true,
      // Optimierung: nur solche mit mindestens einem gesetzten Aktions-Datum.
      [Op.or]: [
        { single_due_at:   { [Op.ne]: null } },
        { first_due_at:    { [Op.ne]: null } },
        { second_due_at:   { [Op.ne]: null } },
        { final_due_at:    { [Op.ne]: null } },
        { feedback_due_at: { [Op.ne]: null } },
        // Approvals: verwende den Meilenstein-due_at als Anhaltspunkt.
        { requires_approval: true },
        { requires_approval_2: true },
      ],
    },
    include: [{
      model: Thesis, as: 'thesis',
      where: { is_locked: false },
      required: true,
      include: [
        { model: User, as: 'students', attributes: ['id', 'firstname', 'name'] },
        { model: User, as: 'coaches', attributes: ['id', 'firstname', 'name', 'email', 'language'] },
        { model: User, as: 'experts', attributes: ['id', 'firstname', 'name', 'email', 'language'] },
        { model: User, as: 'fieldProjectCoaches', attributes: ['id', 'firstname', 'name', 'email', 'language'] },
        { model: Department, as: 'department', include: [{ model: User, as: 'departmentLead', attributes: ['id', 'firstname', 'name', 'email', 'language'] }] },
      ],
    }, {
      model: ThesisEvaluation, as: 'thesisEvaluations', required: false,
      attributes: ['kind', 'overall_grade'],
    }],
  });

  let sent = 0;
  let skipped = 0;

  for (const tm of tms) {
    const thesis = tm.thesis;
    if (!thesis) continue;
    const evalByKind = {};
    (tm.thesisEvaluations || []).forEach(e => { evalByKind[e.kind] = e; });
    const hasGrade = (k) => !!(evalByKind[k] && evalByKind[k].overall_grade != null);

    // --- Bewertungen ---
    if (tm.requires_evaluation) {
      if (tm.double_evaluation) {
        // Bewertung 1 → Rolle 1, bis first_due_at
        if (tm.first_due_at && !hasGrade('first')) {
          await sendReminders(tm, 'first_eval', peopleForRole(thesis, tm.evaluator_role), tm.first_due_at, evaluatorMail, thesis, now);
        }
        if (tm.second_due_at && !hasGrade('second')) {
          await sendReminders(tm, 'second_eval', peopleForRole(thesis, tm.evaluator_role_2), tm.second_due_at, evaluatorMail, thesis, now);
        }
        if (tm.final_due_at && !hasGrade('final')) {
          const both = [...peopleForRole(thesis, tm.evaluator_role), ...peopleForRole(thesis, tm.evaluator_role_2)];
          await sendReminders(tm, 'final_eval', dedupe(both), tm.final_due_at, evaluatorMail, thesis, now);
        }
      } else {
        if (tm.single_due_at && !hasGrade('single')) {
          await sendReminders(tm, 'single_eval', peopleForRole(thesis, tm.evaluator_role), tm.single_due_at, evaluatorMail, thesis, now);
        }
      }
    }

    // --- Freigaben ---
    if (tm.requires_approval && !tm.approved_at) {
      await sendReminders(tm, 'approval_1', peopleForRole(thesis, tm.approver_role), tm.due_at, approverMail, thesis, now);
    }
    if (tm.requires_approval_2 && !tm.approved_at_2) {
      await sendReminders(tm, 'approval_2', peopleForRole(thesis, tm.approver_role_2), tm.due_at, approverMail, thesis, now);
    }

    // --- Feedbackformular ---
    if (tm.feedback_form_enabled && tm.feedback_due_at) {
      const fbFilled = tm.feedback_text && String(tm.feedback_text).trim().length > 0;
      if (!fbFilled) {
        const recipients = tm.double_evaluation
          ? [...peopleForRole(thesis, tm.evaluator_role), ...peopleForRole(thesis, tm.evaluator_role_2)]
          : peopleForRole(thesis, tm.evaluator_role);
        await sendReminders(tm, 'feedback', dedupe(recipients), tm.feedback_due_at, feedbackMail, thesis, now);
      }
    }
  }

  async function sendReminders(tm, kind, recipients, dueAt, tplBuilder, thesis, now) {
    for (const rec of recipients) {
      if (!rec || !rec.email) { skipped++; continue; }
      const should = await shouldSendToday(tm, kind, rec, dueAt, now);
      if (!should) { skipped++; continue; }
      const lang = pickLang(rec);
      const { subject, text } = tplBuilder(rec, thesis, dueAt, lang);
      try {
        await mailer.sendMail({ to: rec.email, subject, text });
        await MailReminder.create({
          thesis_milestone_id: tm.id,
          kind,
          recipient_user_id: rec.id,
          recipient_email: rec.email,
        });
        try {
          await ThesisLog.create({
            thesis_id: tm.thesis_id,
            thesis_milestone_id: tm.id,
            user_id: rec.id,
            action: 'reminder_sent',
            detail: `${tm.label}: ${kind} → ${rec.email}`,
          });
        } catch (e) { /* Log-Fehler ignorieren */ }
        sent++;
      } catch (e) {
        console.error('[reminderJob] Sendfehler', kind, rec.email, e.message);
        skipped++;
      }
    }
  }

  return { sent, skipped };
}

function dedupe(users) {
  const seen = new Set();
  return users.filter(u => u && !seen.has(u.id) && seen.add(u.id));
}

// ---- Sekretariats-Benachrichtigung Transferprojekt -------------------------
//
// Prüft pro Fachbereich im AKTUELLEN Diplomjahr, ob alle nicht-gesperrten DAs
// vollständig transferprojekt-bewertet sind. Wenn ja UND wenn dies noch nicht
// gemeldet wurde, geht eine Mail (mit DA-Liste als CSV) an das im UI hinterlegte
// Sekretariat.
//
// Deduplication: Marker im appSettings-Store unter dem Schlüssel
// `secretariat_notified_transfer:<yearId>:<deptId>` → ISO-Zeitstempel.

function isEvalKindDone(evalByKind, kind) {
  const e = evalByKind[kind];
  return !!(e && e.overall_grade !== null && e.overall_grade !== undefined);
}

// Meilenstein-Bewertung vollständig?
function isMilestoneEvalComplete(tm, evalByKind) {
  if (!tm.requires_evaluation) return true; // keine Bewertung erwartet
  if (tm.double_evaluation) {
    return ['first', 'second', 'final'].every(k => isEvalKindDone(evalByKind, k));
  }
  return isEvalKindDone(evalByKind, 'single');
}

async function processSecretariatNotifications() {
  const secretariatEmail = appSettings.get('secretariat_email');
  if (!secretariatEmail) {
    console.log('[secretariatNotify] Keine Sekretariats-Mail hinterlegt — Job übersprungen.');
    return { checked: 0, sent: 0, reason: 'no_secretariat_email' };
  }
  if (!mailer.isConfigured()) {
    console.log('[secretariatNotify] SMTP nicht konfiguriert — Job übersprungen.');
    return { checked: 0, sent: 0, reason: 'smtp_not_configured' };
  }

  // Nur aktuelles Diplomjahr.
  const currentYear = await Year.findOne({ where: { is_current: true } });
  if (!currentYear) {
    console.log('[secretariatNotify] Kein aktuelles Diplomjahr (is_current=true) markiert — Job übersprungen.');
    return { checked: 0, sent: 0, reason: 'no_current_year' };
  }
  console.log(`[secretariatNotify] Start · Jahr ${currentYear.year} · Sekretariat: ${secretariatEmail}`);

  // Alle Fachbereiche, in denen es DAs im aktuellen Jahr gibt.
  const theses = await Thesis.findAll({
    where: { year_id: currentYear.id },
    attributes: ['id', 'department_id', 'is_locked'],
  });
  const deptIds = Array.from(new Set(theses.filter(t => !t.is_locked).map(t => t.department_id)));
  if (deptIds.length === 0) return { checked: 0, sent: 0 };

  let checked = 0;
  let sent = 0;
  for (const deptId of deptIds) {
    checked++;
    const markerKey = `secretariat_notified_transfer:${currentYear.id}:${deptId}`;
    if (appSettings.get(markerKey)) {
      console.log(`[secretariatNotify] Bereits versendet für Fachbereich ${deptId} / Jahr ${currentYear.year}`);
      continue;
    }

    // Alle DAs des Fachbereichs (nicht gesperrt) laden — mit Transferprojekt-
    // Meilensteinen und deren Bewertungen. Geheimhaltungs-Felder werden für
    // den optionalen ZIP-Anhang mitgeliefert (nicht in `attributes`
    // restriktiert, damit alle Felder verfügbar sind).
    const deptTheses = await Thesis.findAll({
      where: { year_id: currentYear.id, department_id: deptId, is_locked: false },
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name'] },
        { model: User, as: 'students', attributes: ['id', 'firstname', 'name'] },
        { model: User, as: 'coaches',  attributes: ['id', 'firstname', 'name'] },
        { model: User, as: 'experts',  attributes: ['id', 'firstname', 'name'] },
        {
          model: ThesisMilestone, as: 'milestones', required: false,
          where: { is_transfer_project: true },
          include: [{ model: ThesisEvaluation, as: 'thesisEvaluations', required: false,
                      attributes: ['kind', 'overall_grade'] }],
        },
      ],
    });

    if (deptTheses.length === 0) continue;

    // Muss mindestens ein Transferprojekt-Meilenstein im Fachbereich existieren
    // — sonst wäre die Meldung sinnfrei.
    const anyTransfer = deptTheses.some(t => (t.milestones || []).length > 0);
    const deptLabel = (deptTheses[0].department && deptTheses[0].department.name) || `#${deptId}`;
    if (!anyTransfer) {
      console.log(`[secretariatNotify] Fachbereich "${deptLabel}" hat keine Transferprojekt-Meilensteine — übersprungen.`);
      continue;
    }

    // Alle DAs vollständig? Eine DA gilt als vollständig, wenn ALLE ihrer
    // Transferprojekt-Meilensteine (falls welche existieren) vollständig
    // bewertet sind. DAs OHNE Transferprojekt-Meilensteine sind trivial ok
    // (sie tragen nichts zur Prüfung bei).
    let complete = true;
    let blocker = null;
    for (const t of deptTheses) {
      const tms = t.milestones || [];
      if (tms.length === 0) continue; // DA hat keinen TP-Meilenstein → egal
      for (const tm of tms) {
        const evalByKind = {};
        (tm.thesisEvaluations || []).forEach(e => { evalByKind[e.kind] = e; });
        if (!isMilestoneEvalComplete(tm, evalByKind)) {
          const stName = (t.students || []).map(s => `${s.name}, ${s.firstname}`).join(' / ') || `DA ${t.id}`;
          const missing = tm.double_evaluation
            ? ['first','second','final'].filter(k => !isEvalKindDone(evalByKind, k)).join('/')
            : (isEvalKindDone(evalByKind, 'single') ? '' : 'single');
          blocker = `${stName} → Meilenstein „${tm.label}" (fehlend: ${missing || '?'})`;
          complete = false;
          break;
        }
      }
      if (!complete) break;
    }
    if (!complete) {
      console.log(`[secretariatNotify] Fachbereich "${deptLabel}" noch unvollständig — Blocker: ${blocker}`);
      continue;
    }

    // Mail vorbereiten.
    const deptName = deptTheses[0].department ? deptTheses[0].department.name : `#${deptId}`;
    const csv = buildThesesCsv(deptTheses);
    const csvName = `Diplomarbeiten_${currentYear.year}_${deptName.replace(/\s+/g, '_')}.csv`;
    const subject = `ThesisBuddy — Transferprojekt abgeschlossen: ${deptName}`;
    const text =
`Liebes Sekretariat

Die Diplomarbeiten im Fachbereich ${deptName} sind nun vollständig. Die Titel sind festgelegt und das Bewerterteam wurde hinterlegt. Anhand der angehängten Liste können nun die DA-Kurse im Tocco angelegt werden.

Freundliche Grüsse
ThesisBuddy`;

    const attachments = [
      { filename: csvName, content: Buffer.from(csv, 'utf8'), contentType: 'text/csv; charset=utf-8' },
    ];
    // ZIP mit Geheimhaltungs-PDFs anhängen, falls welche vorhanden sind.
    try {
      const gh = await buildConfidentialityZipBuffer(deptTheses, deptName);
      if (gh) {
        attachments.push({
          filename: 'Geheimhaltungsvereinbarungen.zip',
          content: gh.buf,
          contentType: 'application/zip',
        });
        console.log(`[secretariatNotify] ${gh.count} Geheimhaltungs-PDFs zum ZIP hinzugefügt (${deptName}).`);
      }
    } catch (e) {
      console.error(`[secretariatNotify] Geheimhaltungs-ZIP fehlgeschlagen (${deptName}):`, e.message);
    }

    try {
      await mailer.sendMail({
        to: secretariatEmail,
        subject,
        text,
        attachments,
      });
      appSettings.set(markerKey, new Date().toISOString());
      console.log(`[secretariatNotify] Mail gesendet für Fachbereich ${deptName} (${deptTheses.length} DAs)`);
      // Optional: Log pro DA.
      try {
        for (const t of deptTheses) {
          await ThesisLog.create({
            thesis_id: t.id,
            user_id: null,
            action: 'reminder_sent',
            detail: `Sekretariats-Mail an ${secretariatEmail} versendet (Fachbereich ${deptName} vollständig).`,
          });
        }
      } catch (e) { /* Log-Fehler ignorieren */ }
      sent++;
    } catch (e) {
      console.error(`[secretariatNotify] Sendfehler für ${deptName}:`, e.message);
    }
  }
  return { checked, sent };
}

// ---- Scheduling ------------------------------------------------------------

let _task = null;

function start() {
  if (_task) return;
  const spec = process.env.MAIL_CRON || '0 7 * * *'; // täglich 07:00
  _task = cron.schedule(spec, async () => {
    try {
      const t0 = Date.now();
      const rem = await processReminders();
      const sec = await processSecretariatNotifications();
      console.log(`[reminderJob] Lauf abgeschlossen: reminders(sent=${rem.sent}, skipped=${rem.skipped}), sekretariat(checked=${sec.checked}, sent=${sec.sent}), dauer=${Date.now() - t0}ms`);
    } catch (e) {
      console.error('[reminderJob] Fehler im Lauf:', e);
    }
  });
  console.log(`[reminderJob] Cron aktiv: "${spec}"`);
}

module.exports = { start, processReminders, processSecretariatNotifications };
