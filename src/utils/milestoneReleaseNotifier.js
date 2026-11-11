// Benachrichtigung der Beteiligten beim Starten (Freigeben) oder Sperren
// eines Meilensteins.
//
// Empfänger: Studierende, Dozent/in und Experte/in der Diplomarbeit (die
// Beteiligten gemäss Rollenmodell). Die auslösende Person erhält keine Mail.
// Sprache gemäss users.language (fr → Französisch, sonst Deutsch).
//
// Best effort: Sendefehler werden geloggt, die eigentliche Aktion scheitert
// deshalb nie. Jeder erfolgreiche Versand wird im Änderungsprotokoll der
// Arbeit als 'notification_sent' vermerkt.

const { Thesis, User, ThesisLog } = require('../models');
const mailer = require('../config/mailer');
const { getAppUrl } = require('../config/appUrl');

function fmtDate(d, lang) {
  if (!d) return lang === 'fr' ? 'non défini' : 'nicht festgelegt';
  return new Date(d).toLocaleDateString(lang === 'fr' ? 'fr-CH' : 'de-CH', { timeZone: 'Europe/Zurich' });
}

function studentNames(thesis, lang) {
  const names = (thesis.students || []).map(s => `${s.firstname} ${s.name}`);
  if (names.length === 0) return lang === 'fr' ? 'étudiant·e inconnu·e' : 'unbekannt';
  return names.join(lang === 'fr' ? ' et ' : ' und ');
}

function buildMail(tm, thesis, released, lang) {
  const label = (lang === 'fr' && tm.label_fr) ? tm.label_fr : tm.label;
  const students = studentNames(thesis, lang);
  const due = fmtDate(tm.due_at, lang);
  const link = `${getAppUrl()}/login`;

  if (lang === 'fr') {
    return released ? {
      subject: 'Libération de la prochaine phase du TD',
      text:
`La phase « ${label} » a été libérée pour le travail de ${students}. L'échéance est le ${due}.

Lien vers la plateforme : ${link}

Cordialement
ThesisBuddy`,
    } : {
      subject: 'Blocage d\'une phase du TD',
      text:
`La phase « ${label} » du travail de ${students} a été bloquée à nouveau. Aucune action n'est possible dans cette phase jusqu'à sa prochaine libération.

Lien vers la plateforme : ${link}

Cordialement
ThesisBuddy`,
    };
  }
  return released ? {
    subject: 'Freigabe der nächsten DA-Phase',
    text:
`Die Phase «${label}» wurde für die Arbeit von ${students} freigegeben. Der Fälligkeitstermin ist ${due}.

Link zur Plattform: ${link}

Freundliche Grüsse
ThesisBuddy`,
  } : {
    subject: 'Sperrung einer DA-Phase',
    text:
`Die Phase «${label}» der Arbeit von ${students} wurde wieder gesperrt. Bis zur erneuten Freigabe sind in dieser Phase keine Aktionen möglich.

Link zur Plattform: ${link}

Freundliche Grüsse
ThesisBuddy`,
  };
}

// tm: ThesisMilestone (mit thesis_id, label, label_fr, due_at)
// released: true = freigegeben/gestartet, false = gesperrt
// actorUserId: auslösende Person (erhält keine Mail)
async function notifyMilestoneReleaseChange(tm, released, actorUserId) {
  if (!mailer.isConfigured()) {
    console.log('[milestoneNotify] SMTP nicht konfiguriert — keine Benachrichtigung.');
    return { sent: 0, skipped: 0 };
  }
  const attrs = ['id', 'firstname', 'name', 'email', 'language'];
  const thesis = await Thesis.findByPk(tm.thesis_id, {
    include: [
      { model: User, as: 'students', attributes: attrs },
      { model: User, as: 'coaches',  attributes: attrs },
      { model: User, as: 'experts',  attributes: attrs },
    ],
  });
  if (!thesis) return { sent: 0, skipped: 0 };

  const seen = new Set();
  const recipients = [...(thesis.students || []), ...(thesis.coaches || []), ...(thesis.experts || [])]
    .filter(u => u && !seen.has(u.id) && seen.add(u.id))
    .filter(u => u.id !== actorUserId);

  let sent = 0;
  let skipped = 0;
  const what = released ? 'freigegeben' : 'gesperrt';
  for (const rec of recipients) {
    if (!rec.email) { skipped++; continue; }
    const lang = rec.language === 'fr' ? 'fr' : 'de';
    const { subject, text } = buildMail(tm, thesis, released, lang);
    try {
      await mailer.sendMail({ to: rec.email, subject, text });
      sent++;
      try {
        await ThesisLog.create({
          thesis_id: tm.thesis_id,
          thesis_milestone_id: tm.id,
          user_id: rec.id,
          action: 'notification_sent',
          detail: `${tm.label}: ${what} → ${rec.email}`,
        });
      } catch (e) { /* Log-Fehler ignorieren */ }
    } catch (e) {
      skipped++;
      console.error('[milestoneNotify] Sendfehler', rec.email, e.message);
    }
  }
  console.log(`[milestoneNotify] Meilenstein ${tm.id} ${what}: ${sent} Mail(s) versendet, ${skipped} übersprungen.`);
  return { sent, skipped };
}

module.exports = { notifyMilestoneReleaseChange, buildMail };
