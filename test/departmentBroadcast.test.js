const test = require('node:test');
const assert = require('node:assert');
const {
  sequelize, User, UserRole, Department, Year, Thesis, DepartmentBroadcast,
} = require('../src/models');
const { resolveRecipients, sendBroadcast, sendDirectMessage, listBroadcasts, validateInput, greeting } = require('../src/utils/departmentBroadcast');
const { closeDb } = require('./helpers/fixtures');

let n = 0;
async function setup() {
  n += 1;
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}${n}`;
  const year = await Year.findOne({ where: { is_current: true } });
  const created = { users: [], depts: [], theses: [] };
  const mkUser = async (key, role, depts, extraRoles = [], extra = {}) => {
    const u = await User.create({
      username: `bctest_${stamp}_${key}`, password: 'bctest-pw-1', name: `BC${key}`, firstname: 'Test',
      email: `bctest_${stamp}_${key}@example.invalid`, role, language: 'de', ...extra,
    });
    for (const r of [role, ...extraRoles]) await UserRole.create({ user_id: u.id, role: r });
    if (depts) await u.setDepartments(depts);
    created.users.push(u);
    return u;
  };
  const lead = await mkUser('lead', 'department_lead');
  const otherLead = await mkUser('otherLead', 'department_lead');
  const mkDept = async (s, leadUser) => {
    const d = await Department.create({ name: `BC-Test-${stamp}-${s}`, department_lead_id: leadUser.id });
    created.depts.push(d);
    return d;
  };
  const deptA = await mkDept('A', lead);
  const deptB = await mkDept('B', lead);
  const deptX = await mkDept('X', otherLead);
  const mkThesis = async (d, coaches = [], experts = []) => {
    const t = await Thesis.create({ title: 'Broadcast-Test', year_id: year.id, department_id: d.id, language: 'de',
      is_confidential: false, is_repetent: false, is_locked: false });
    await t.setCoaches(coaches); await t.setExperts(experts);
    created.theses.push(t);
    return t;
  };
  async function cleanup() {
    await DepartmentBroadcast.destroy({ where: { sender_user_id: created.users.map(u => u.id) } });
    for (const t of created.theses) await sequelize.query('DELETE FROM theses WHERE id = :id', { replacements: { id: t.id } });
    for (const u of created.users) await u.destroy();
    for (const d of created.depts) await d.destroy();
  }
  return { year, lead, otherLead, deptA, deptB, deptX, mkUser, mkThesis, cleanup };
}

const names = r => r.recipients.map(x => x.user.name.replace(/^BC/, '')).sort();

test('assigned: Dozierende und Experten der Ansicht, je Person einmal', async () => {
  const f = await setup();
  try {
    const both = await f.mkUser('both', 'coach', [f.deptA], ['expert']);
    const coachB = await f.mkUser('coachB', 'coach', [f.deptB]);
    const expertA = await f.mkUser('expertA', 'expert', [f.deptA]);
    const coachX = await f.mkUser('coachX', 'coach', [f.deptX]);
    await f.mkUser('idle', 'coach', [f.deptA]);
    await f.mkThesis(f.deptA, [both], [expertA]);
    await f.mkThesis(f.deptA, [], [both]);
    await f.mkThesis(f.deptB, [coachB], []);
    await f.mkThesis(f.deptX, [coachX], []);

    const all = await resolveRecipients({ leadUserId: f.lead.id, yearId: f.year.id });
    assert.strictEqual(all.mode, 'assigned');
    assert.deepStrictEqual(names(all), ['both', 'coachB', 'expertA']);
    const bothEntry = all.recipients.find(r => r.user.id === both.id);
    assert.deepStrictEqual([...bothEntry.roles].sort(), ['coach', 'expert']);

    const onlyB = await resolveRecipients({ leadUserId: f.lead.id, yearId: f.year.id, departmentFilter: String(f.deptB.id) });
    assert.deepStrictEqual(names(onlyB), ['coachB']);

    // Fremder Fachbereich als Filter wird ignoriert -> alle geleiteten.
    const foreign = await resolveRecipients({ leadUserId: f.lead.id, yearId: f.year.id, departmentFilter: String(f.deptX.id) });
    assert.deepStrictEqual(names(foreign), ['both', 'coachB', 'expertA']);
  } finally { await f.cleanup(); }
});

test('fallback: ohne Zuweisung alle zuweisbaren Dozierenden/Experten der Fachbereiche', async () => {
  const f = await setup();
  try {
    await f.mkUser('coachA', 'coach', [f.deptA]);
    await f.mkUser('studentExpert', 'student', [f.deptB], ['expert']);
    await f.mkUser('studentA', 'student', [f.deptA]);
    await f.mkUser('fpcA', 'field_project_coach', [f.deptA]);
    await f.mkUser('coachX', 'coach', [f.deptX]);
    await f.mkThesis(f.deptA);

    const all = await resolveRecipients({ leadUserId: f.lead.id, yearId: f.year.id });
    assert.strictEqual(all.mode, 'fallback');
    assert.deepStrictEqual(names(all), ['coachA', 'studentExpert']);

    const onlyA = await resolveRecipients({ leadUserId: f.lead.id, yearId: f.year.id, departmentFilter: String(f.deptA.id) });
    assert.deepStrictEqual(names(onlyA), ['coachA']);
  } finally { await f.cleanup(); }
});

test('sendBroadcast: Einzelversand, Reply-To, Protokoll inkl. Fehlern', async () => {
  const f = await setup();
  try {
    const ok = await f.mkUser('ok', 'coach', [f.deptA]);
    const bad = await f.mkUser('bad', 'expert', [f.deptA]);
    await f.mkThesis(f.deptA, [ok], [bad]);
    const calls = [];
    const sendFn = async (m) => { calls.push(m); if (m.to === bad.email) throw new Error('SMTP down'); };

    const res = await sendBroadcast({ leadUserId: f.lead.id, yearId: f.year.id, subject: ' Hallo ', body: 'Text', sendFn });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.sent, 1);
    assert.strictEqual(res.failed, 1);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every(c => c.replyTo === f.lead.email && c.subject === 'Hallo'));
    assert.ok(calls.every(c => c.text.startsWith('Hallo Test\n\nText\n')));

    const [entry] = await listBroadcasts({ userId: f.lead.id, userRole: 'department_lead' });
    assert.strictEqual(entry.subject, 'Hallo');
    assert.strictEqual(entry.recipient_mode, 'assigned');
    const byEmail = Object.fromEntries(entry.recipients.map(r => [r.email, r]));
    assert.strictEqual(byEmail[ok.email].status, 'sent');
    assert.strictEqual(byEmail[bad.email].status, 'failed');
    assert.match(byEmail[bad.email].error, /SMTP down/);

    // Fremder FBL sieht den Eintrag nicht, Admin schon.
    const other = await listBroadcasts({ userId: f.otherLead.id, userRole: 'department_lead' });
    assert.ok(!other.some(x => x.id === res.broadcastId));
    const admin = await listBroadcasts({ userId: f.otherLead.id, userRole: 'admin' });
    assert.ok(admin.some(x => x.id === res.broadcastId));
  } finally { await f.cleanup(); }
});

test('sendDirectMessage: nur an Dozent/Experte einer eigenen Arbeit, mit Anrede und Log', async () => {
  const f = await setup();
  try {
    const coach = await f.mkUser('coach', 'coach', [f.deptA], [], { firstname: 'Anna', language: 'fr' });
    const other = await f.mkUser('other', 'coach', [f.deptA]);
    const coachX = await f.mkUser('coachX', 'coach', [f.deptX]);
    const thesis = await f.mkThesis(f.deptA, [coach], []);
    const thesisX = await f.mkThesis(f.deptX, [coachX], []);
    const calls = [];
    const sendFn = async (m) => { calls.push(m); };

    const res = await sendDirectMessage({ leadUserId: f.lead.id, thesisId: thesis.id, recipientUserId: coach.id,
      subject: 'Frage', body: 'Hast du Zeit?', sendFn });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].to, coach.email);
    assert.strictEqual(calls[0].replyTo, f.lead.email);
    assert.ok(calls[0].text.startsWith('Bonjour Anna\n\nHast du Zeit?'));

    const [entry] = await listBroadcasts({ userId: f.lead.id, userRole: 'department_lead' });
    assert.strictEqual(entry.recipient_mode, 'single');
    assert.deepStrictEqual(entry.recipients.map(r => [r.email, r.status, r.roles]), [[coach.email, 'sent', ['coach']]]);

    // Person ist bei der Arbeit nicht zugewiesen
    const notAssigned = await sendDirectMessage({ leadUserId: f.lead.id, thesisId: thesis.id, recipientUserId: other.id,
      subject: 'x', body: 'y', sendFn });
    assert.strictEqual(notAssigned.status, 400);
    // Arbeit aus fremdem Fachbereich
    const foreign = await sendDirectMessage({ leadUserId: f.lead.id, thesisId: thesisX.id, recipientUserId: coachX.id,
      subject: 'x', body: 'y', sendFn });
    assert.strictEqual(foreign.status, 403);
    assert.strictEqual(calls.length, 1);
  } finally { await f.cleanup(); }
});

test('greeting: Hallo/Bonjour + Vorname, ohne Vorname nur Gruss', () => {
  assert.strictEqual(greeting('de', 'Max'), 'Hallo Max');
  assert.strictEqual(greeting('fr', 'Léa'), 'Bonjour Léa');
  assert.strictEqual(greeting(undefined, ' '), 'Hallo');
});

test('validateInput lehnt leere Felder und Zeilenumbrüche im Betreff ab', () => {
  assert.ok(validateInput('', 'x').error);
  assert.ok(validateInput('x', '  ').error);
  assert.ok(validateInput('a\nb', 'x').error);
  assert.deepStrictEqual(validateInput(' a ', ' b '), { subject: 'a', body: 'b' });
});

test.after(closeDb);
