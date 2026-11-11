// Chat-Benachrichtigungen: Beteiligte (Studierende, Dozent, Experte) erhalten
// zeitverzögert eine E-Mail, wenn neue Chat-Nachrichten zu ihrer Diplomarbeit
// eingetroffen sind.
//
// Regeln:
//   - Verzögerung 5 Minuten (CHAT_NOTIFY_DELAY_MIN übersteuerbar, v.a. für Tests).
//   - Eine Mail pro Empfänger und Diplomarbeit, auch wenn im Fenster mehrere
//     Nachrichten eingingen (Sammel-Benachrichtigung via notified_at-Marker).
//   - Eigene Nachrichten lösen keine Mail an den Absender aus.
//   - Bereits in der Plattform gelesene Nachrichten (ChatReadReceipt) zählen
//     für den jeweiligen Empfänger nicht.
//   - Mail-Sprache gemäss users.language (fr → Französisch, sonst Deutsch).
//   - Best effort: Nachrichten werden nach dem Lauf immer als benachrichtigt
//     markiert (kein Retry, keine Mailflut nach SMTP-Ausfall).
const cron = require('node-cron');
const { Op } = require('sequelize');
const { ChatMessage, ChatReadReceipt, Thesis, User } = require('../models');
const { sendMail, isConfigured } = require('../config/mailer');
const { getAppUrl } = require('../config/appUrl');

const DELAY_MIN = () => {
  const n = parseInt(process.env.CHAT_NOTIFY_DELAY_MIN || '5', 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
};

// Anrede gemäss Geschlecht (m/w/d, d bzw. unbekannt → neutrale Form).
const greetingDe = (u) => (u.gender === 'w' ? 'Liebe' : u.gender === 'm' ? 'Lieber' : 'Liebe/r');
const greetingFr = (u) => (u.gender === 'w' ? 'Chère' : u.gender === 'm' ? 'Cher' : 'Cher·ère');

function chatMail(recipient, thesis, lang) {
  const students = (thesis.students || []).map(s => `${s.firstname} ${s.name}`);
  const names = students.length ? students.join(lang === 'fr' ? ' et ' : ' und ') : '?';
  const link = `${getAppUrl()}/dashboard/thesis/${thesis.id}/chat`;
  if (lang === 'fr') {
    return {
      subject: `ThesisBuddy — Nouveau message de chat (${names})`,
      text:
`${greetingFr(recipient)} ${recipient.firstname}

Tu as reçu un nouveau message de chat concernant le travail de diplôme de ${names}. Le lien suivant t'amène directement au message.

${link}

Meilleures salutations
ThesisBuddy`,
    };
  }
  return {
    subject: `ThesisBuddy — Neue Chat-Nachricht (${names})`,
    text:
`${greetingDe(recipient)} ${recipient.firstname}

Du hast eine neue Chat-Nachricht zur Diplomarbeit von ${names} erhalten. Der folgende Link führt direkt zur Nachricht.

${link}

Viele Grüsse
ThesisBuddy`,
  };
}

async function runOnce() {
  const cutoff = new Date(Date.now() - DELAY_MIN() * 60 * 1000);
  const pending = await ChatMessage.findAll({
    where: { notified_at: null, created_at: { [Op.lte]: cutoff } },
    attributes: ['id', 'thesis_id', 'user_id'],
    order: [['thesis_id', 'ASC'], ['id', 'ASC']],
  });
  if (pending.length === 0) return;

  const byThesis = new Map();
  for (const m of pending) {
    if (!byThesis.has(m.thesis_id)) byThesis.set(m.thesis_id, []);
    byThesis.get(m.thesis_id).push(m);
  }

  const mailerReady = isConfigured();
  if (!mailerReady) console.warn('[chatNotify] Mailer nicht konfiguriert — Nachrichten werden ohne Versand markiert.');

  for (const [thesisId, messages] of byThesis) {
    try {
      const thesis = await Thesis.findByPk(thesisId, {
        include: [
          { model: User, as: 'students', attributes: ['id', 'firstname', 'name', 'email', 'gender', 'language'] },
          { model: User, as: 'coaches', attributes: ['id', 'firstname', 'name', 'email', 'gender', 'language'] },
          { model: User, as: 'experts', attributes: ['id', 'firstname', 'name', 'email', 'gender', 'language'] },
        ],
      });
      if (thesis && mailerReady) {
        // Beteiligte = Studierende + Dozent + Experte, dedupliziert.
        const recipients = new Map();
        for (const u of [...(thesis.students || []), ...(thesis.coaches || []), ...(thesis.experts || [])]) {
          recipients.set(u.id, u);
        }
        const msgIds = messages.map(m => m.id);
        const receipts = await ChatReadReceipt.findAll({ where: { message_id: msgIds }, attributes: ['message_id', 'user_id'] });
        const readBy = new Set(receipts.map(r => `${r.user_id}:${r.message_id}`));

        for (const recipient of recipients.values()) {
          const relevant = messages.filter(m => m.user_id !== recipient.id && !readBy.has(`${recipient.id}:${m.id}`));
          if (relevant.length === 0 || !recipient.email) continue;
          const lang = recipient.language === 'fr' ? 'fr' : 'de';
          const { subject, text } = chatMail(recipient, thesis, lang);
          try {
            await sendMail({ to: recipient.email, subject, text });
            console.log(`[chatNotify] Mail an ${recipient.email} (DA ${thesisId}, ${relevant.length} Nachricht(en), ${lang})`);
          } catch (e) {
            console.error(`[chatNotify] Versand an ${recipient.email} fehlgeschlagen:`, e.message);
          }
        }
      }
    } catch (e) {
      console.error(`[chatNotify] Fehler bei DA ${thesisId}:`, e.message);
    } finally {
      // Fenster für diese Nachrichten schliessen — unabhängig vom Versanderfolg.
      await ChatMessage.update(
        { notified_at: new Date() },
        { where: { id: messages.map(m => m.id) } }
      ).catch(e => console.error('[chatNotify] Markieren fehlgeschlagen:', e.message));
    }
  }
}

let _task = null;

function start() {
  if (_task) return;
  _task = cron.schedule('* * * * *', () => {
    runOnce().catch(e => console.error('[chatNotify] Lauf fehlgeschlagen:', e.message));
  });
  console.log(`[chatNotify] Cron aktiv: jede Minute, Verzögerung ${DELAY_MIN()} Min.`);
}

function stop() {
  if (_task) { _task.stop(); _task = null; }
}

module.exports = { start, stop, runOnce };
