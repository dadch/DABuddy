// "Alle benachrichtigen" der Fachbereichsleitung: Empfängerermittlung,
// Versand und Protokollierung.
//
// Empfänger sind alle Dozierenden und Experten, die bei irgendeiner Arbeit der
// aktuellen Dashboard-Ansicht (gewählter Jahrgang + aktiver Fachbereichsfilter)
// zugewiesen sind — jede Person genau einmal. Ist in der ganzen Ansicht keiner
// Arbeit ein Dozent oder Experte zugewiesen, gehen die Mails an alle Personen,
// die die FBL in diesen Fachbereichen als Dozent bzw. Experte zuweisen könnte
// (Mitglied des Fachbereichs + Rolle als Primär- oder Zusatzrolle).
const { Op } = require('sequelize');
const {
  User, UserRole, Department, Thesis,
  DepartmentBroadcast, DepartmentBroadcastRecipient,
} = require('../models');
const mailer = require('../config/mailer');

const ROLES = ['coach', 'expert'];
const SUBJECT_MAX = 255;
const BODY_MAX = 20000;

// Fachbereiche der Ansicht: wie im FBL-Dashboard — gültiger Filter oder alle
// geleiteten Fachbereiche.
async function resolveScopeDepartments(leadUserId, departmentFilter) {
  const led = await Department.findAll({
    where: { department_lead_id: leadUserId },
    attributes: ['id', 'name'],
    order: [['name', 'ASC']],
  });
  const filterId = parseInt(departmentFilter, 10);
  const match = led.find(d => d.id === filterId);
  return match ? [match] : led;
}

function addRecipient(map, user, role) {
  if (!user) return;
  let entry = map.get(user.id);
  if (!entry) {
    entry = { user, roles: new Set() };
    map.set(user.id, entry);
  }
  entry.roles.add(role);
}

function sortRecipients(map) {
  return [...map.values()].sort((a, b) =>
    (a.user.name || '').localeCompare(b.user.name || '', 'de')
    || (a.user.firstname || '').localeCompare(b.user.firstname || '', 'de'));
}

const USER_ATTRS = ['id', 'name', 'firstname', 'email', 'gender', 'language', 'role'];

// Liefert { departments, mode, recipients: [{ user, roles:Set }] }.
async function resolveRecipients({ leadUserId, yearId, departmentFilter }) {
  const departments = await resolveScopeDepartments(leadUserId, departmentFilter);
  const departmentIds = departments.map(d => d.id);
  if (departmentIds.length === 0) return { departments, mode: 'assigned', recipients: [] };

  const theses = await Thesis.findAll({
    where: { year_id: yearId, department_id: departmentIds },
    attributes: ['id'],
    include: [
      { model: User, as: 'coaches', attributes: USER_ATTRS, through: { attributes: [] } },
      { model: User, as: 'experts', attributes: USER_ATTRS, through: { attributes: [] } },
    ],
  });

  const assigned = new Map();
  for (const t of theses) {
    (t.coaches || []).forEach(u => addRecipient(assigned, u, 'coach'));
    (t.experts || []).forEach(u => addRecipient(assigned, u, 'expert'));
  }
  if (assigned.size > 0) {
    return { departments, mode: 'assigned', recipients: sortRecipients(assigned) };
  }

  // Sonderfall: keine Zuweisung in der ganzen Ansicht -> zuweisbarer Pool.
  const pool = await User.findAll({
    attributes: USER_ATTRS,
    include: [
      { model: Department, as: 'departments', where: { id: departmentIds }, attributes: [], through: { attributes: [] } },
      { model: UserRole, as: 'extraRoles', attributes: ['role'], required: false },
    ],
  });
  const fallback = new Map();
  for (const u of pool) {
    const roles = new Set([u.role, ...(u.extraRoles || []).map(r => r.role)]);
    ROLES.filter(r => roles.has(r)).forEach(r => addRecipient(fallback, u, r));
  }
  return { departments, mode: 'fallback', recipients: sortRecipients(fallback) };
}

// Anrede ohne Geschlecht: "Hallo <Vorname>" bzw. "Bonjour <prénom>".
function greeting(lang, firstname) {
  const name = (firstname || '').trim();
  const word = lang === 'fr' ? 'Bonjour' : 'Hallo';
  return name ? `${word} ${name}` : word;
}

function footer(lang, senderName, departmentNames) {
  if (lang === 'fr') {
    return `\n\n--\nCe message a été envoyé via ThesisBuddy par ${senderName} (direction de filière ${departmentNames}).`;
  }
  return `\n\n--\nDiese Nachricht wurde über ThesisBuddy von ${senderName} (Fachbereichsleitung ${departmentNames}) versendet.`;
}

function composeText(user, body, senderName, departmentNames) {
  return `${greeting(user.language, user.firstname)}\n\n${body}${footer(user.language, senderName, departmentNames)}`;
}

function validateInput(subject, body) {
  const s = typeof subject === 'string' ? subject.trim() : '';
  const b = typeof body === 'string' ? body.trim() : '';
  if (!s) return { error: 'Bitte einen Betreff eingeben.' };
  if (!b) return { error: 'Bitte eine Nachricht eingeben.' };
  if (s.length > SUBJECT_MAX) return { error: `Der Betreff darf höchstens ${SUBJECT_MAX} Zeichen lang sein.` };
  if (/[\r\n]/.test(s)) return { error: 'Der Betreff darf keine Zeilenumbrüche enthalten.' };
  if (b.length > BODY_MAX) return { error: `Die Nachricht darf höchstens ${BODY_MAX} Zeichen lang sein.` };
  return { subject: s, body: b };
}

// Versendet die Rundmail einzeln an jeden Empfänger und protokolliert jeden
// Versuch. sendFn ist für Tests austauschbar.
async function sendBroadcast({ leadUserId, yearId, departmentFilter, subject, body, sendFn = mailer.sendMail }) {
  const input = validateInput(subject, body);
  if (input.error) return { ok: false, status: 400, message: input.error };

  const sender = await User.findByPk(leadUserId, { attributes: ['id', 'name', 'firstname', 'email'] });
  if (!sender) return { ok: false, status: 403, message: 'Unbekannter Absender.' };

  const { departments, mode, recipients } = await resolveRecipients({ leadUserId, yearId, departmentFilter });
  if (departments.length === 0) return { ok: false, status: 403, message: 'Sie leiten keinen Fachbereich.' };
  if (recipients.length === 0) return { ok: false, status: 400, message: 'Es gibt keine Empfänger für diese Ansicht.' };

  const senderName = `${sender.firstname} ${sender.name}`.trim();
  const departmentNames = departments.map(d => d.name).join(', ');

  const broadcast = await DepartmentBroadcast.create({
    sender_user_id: sender.id,
    sender_name: senderName,
    year_id: yearId,
    department_ids: departments.map(d => d.id),
    recipient_mode: mode,
    subject: input.subject,
    body: input.body,
  });

  const { sent, failed } = await deliver({ broadcast, recipients, sender, senderName, departmentNames, sendFn });
  return { ok: true, broadcastId: broadcast.id, mode, sent, failed };
}

// Versendet an jeden Empfänger einzeln und protokolliert jeden Versuch.
async function deliver({ broadcast, recipients, sender, senderName, departmentNames, sendFn }) {
  let sent = 0;
  let failed = 0;
  for (const { user, roles } of recipients) {
    const row = {
      broadcast_id: broadcast.id,
      user_id: user.id,
      name: `${user.firstname} ${user.name}`.trim(),
      email: user.email || '',
      roles: ROLES.filter(r => roles.has(r)).join(','),
    };
    try {
      if (!user.email) throw new Error('Keine E-Mail-Adresse hinterlegt.');
      await sendFn({
        to: user.email,
        subject: broadcast.subject,
        text: composeText(user, broadcast.body, senderName, departmentNames),
        replyTo: sender.email || undefined,
      });
      await DepartmentBroadcastRecipient.create({ ...row, status: 'sent', sent_at: new Date() });
      sent += 1;
    } catch (e) {
      await DepartmentBroadcastRecipient.create({ ...row, status: 'failed', error: String(e && e.message || e).slice(0, 2000) });
      failed += 1;
    }
  }
  return { sent, failed };
}

// Einzelnachricht an einen Dozenten/Experten, ausgelöst in der Zeile einer
// Arbeit. Der Inhalt muss nichts mit der Arbeit zu tun haben; die Arbeit dient
// nur der Berechtigungsprüfung (Fachbereich der FBL, Person ist dort Dozent
// oder Experte) und bestimmt Fachbereich/Jahrgang des Log-Eintrags.
async function sendDirectMessage({ leadUserId, thesisId, recipientUserId, subject, body, sendFn = mailer.sendMail }) {
  const input = validateInput(subject, body);
  if (input.error) return { ok: false, status: 400, message: input.error };

  const sender = await User.findByPk(leadUserId, { attributes: ['id', 'name', 'firstname', 'email'] });
  if (!sender) return { ok: false, status: 403, message: 'Unbekannter Absender.' };

  const thesis = await Thesis.findByPk(parseInt(thesisId, 10) || 0, {
    attributes: ['id', 'year_id', 'department_id'],
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name', 'department_lead_id'] },
      { model: User, as: 'coaches', attributes: USER_ATTRS, through: { attributes: [] } },
      { model: User, as: 'experts', attributes: USER_ATTRS, through: { attributes: [] } },
    ],
  });
  if (!thesis || !thesis.department || thesis.department.department_lead_id !== leadUserId) {
    return { ok: false, status: 403, message: 'Keine Berechtigung für diese Diplomarbeit.' };
  }
  const rid = parseInt(recipientUserId, 10);
  const map = new Map();
  (thesis.coaches || []).filter(u => u.id === rid).forEach(u => addRecipient(map, u, 'coach'));
  (thesis.experts || []).filter(u => u.id === rid).forEach(u => addRecipient(map, u, 'expert'));
  if (map.size === 0) {
    return { ok: false, status: 400, message: 'Die Person ist bei dieser Diplomarbeit weder Dozent noch Experte.' };
  }

  const senderName = `${sender.firstname} ${sender.name}`.trim();
  const broadcast = await DepartmentBroadcast.create({
    sender_user_id: sender.id,
    sender_name: senderName,
    year_id: thesis.year_id,
    department_ids: [thesis.department_id],
    recipient_mode: 'single',
    subject: input.subject,
    body: input.body,
  });
  const { sent, failed } = await deliver({
    broadcast, recipients: [...map.values()], sender, senderName,
    departmentNames: thesis.department.name, sendFn,
  });
  const failedRow = failed
    ? await DepartmentBroadcastRecipient.findOne({ where: { broadcast_id: broadcast.id, status: 'failed' } })
    : null;
  return { ok: true, broadcastId: broadcast.id, sent, failed, error: failedRow ? failedRow.error : null };
}

// Log: FBL sieht alle Rundmails, die einen ihrer Fachbereiche betreffen;
// Admin sieht alles.
async function listBroadcasts({ userId, userRole, limit = 200 }) {
  const where = {};
  if (userRole !== 'admin') {
    const led = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ids = led.map(d => d.id);
    if (ids.length === 0) return [];
    where.department_ids = { [Op.overlap]: ids };
  }
  const rows = await DepartmentBroadcast.findAll({
    where,
    include: [{ model: DepartmentBroadcastRecipient, as: 'recipients' }],
    order: [['createdAt', 'DESC'], [{ model: DepartmentBroadcastRecipient, as: 'recipients' }, 'name', 'ASC']],
    limit,
  });
  const allDeptIds = [...new Set(rows.flatMap(r => r.department_ids || []))];
  const depts = allDeptIds.length
    ? await Department.findAll({ where: { id: allDeptIds }, attributes: ['id', 'name'] })
    : [];
  const deptName = new Map(depts.map(d => [d.id, d.name]));
  return rows.map(r => ({
    id: r.id,
    created_at: r.createdAt,
    sender_name: r.sender_name,
    subject: r.subject,
    body: r.body,
    recipient_mode: r.recipient_mode,
    departments: (r.department_ids || []).map(id => deptName.get(id) || `#${id}`),
    recipients: (r.recipients || []).map(x => ({
      name: x.name, email: x.email, roles: x.roles ? x.roles.split(',') : [],
      status: x.status, error: x.error, sent_at: x.sent_at,
    })),
  }));
}

module.exports = { resolveRecipients, sendBroadcast, sendDirectMessage, listBroadcasts, validateInput, greeting, composeText };
