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
  ThesisMilestone, Thesis, User, Department, ThesisEvaluation,
  MailReminder, ThesisLog,
} = require('../models');
const mailer = require('../config/mailer');
const { getNow } = require('../config/simulatedToday');

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

// ---- Scheduling ------------------------------------------------------------

let _task = null;

function start() {
  if (_task) return;
  const spec = process.env.MAIL_CRON || '0 7 * * *'; // täglich 07:00
  _task = cron.schedule(spec, async () => {
    try {
      const t0 = Date.now();
      const result = await processReminders();
      console.log(`[reminderJob] Lauf abgeschlossen: sent=${result.sent}, skipped=${result.skipped}, dauer=${Date.now() - t0}ms`);
    } catch (e) {
      console.error('[reminderJob] Fehler im Lauf:', e);
    }
  });
  console.log(`[reminderJob] Cron aktiv: "${spec}"`);
}

module.exports = { start, processReminders };
