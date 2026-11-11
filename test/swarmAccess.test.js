const test = require('node:test');
const assert = require('node:assert/strict');
const { createSwarmFixture, closeDb } = require('./helpers/fixtures');
const swarmMode = require('../src/config/swarmMode');
const { User, Year, Thesis } = require('../src/models');
const {
  swarmAccess, listSwarmTheses, canReadSwarmFeedbacks, canWriteSwarmFeedback, swarmDocumentAccess,
} = require('../src/utils/swarmAccess');

test.after(closeDb);

// Führt fn mit Fixture aus, stellt Modus und Daten danach wieder her.
async function withFixture(fn) {
  const before = swarmMode.isActive();
  const f = await createSwarmFixture();
  try {
    swarmMode.setActive(true);
    await fn(f);
  } finally {
    swarmMode.setActive(before);
    await f.cleanup();
  }
}

test('coachIn hat Schwarmzugriff, coachOut nicht, fpc nicht, student nicht', () => withFixture(async (f) => {
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', f.thesis.id), true);
  assert.equal(await swarmAccess(f.expertIn.id, 'expert', f.thesis.id), true);
  assert.equal(await swarmAccess(f.coachOut.id, 'coach', f.thesis.id), false);
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', f.thesisOther.id), false);
  assert.equal(await swarmAccess(f.fpc.id, 'field_project_coach', f.thesis.id), false);
  assert.equal(await swarmAccess(f.student.id, 'student', f.thesis.id), false);
  // Rolle aus der Session zählt: gleiche Person mit anderer aktiver Rolle → kein Schwarmzugriff.
  assert.equal(await swarmAccess(f.coachIn.id, 'department_lead', f.thesis.id), false);
  assert.equal(await swarmAccess(f.coachIn.id, 'admin', f.thesis.id), false);
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', 999999999), false);
}));

test('kein Zugriff bei Modus aus', () => withFixture(async (f) => {
  swarmMode.setActive(false);
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', f.thesis.id), false);
  assert.equal(await swarmAccess(f.expertIn.id, 'expert', f.thesis.id), false);
}));

test('kein Zugriff auf gesperrte Arbeit (thesisLocked)', () => withFixture(async (f) => {
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', f.thesisLocked.id), false);
  assert.equal(await swarmAccess(f.expertIn.id, 'expert', f.thesisLocked.id), false);
}));

test('kein Zugriff auf Arbeit eines anderen Diplomjahrs', (t) => withFixture(async (f) => {
  const otherYear = await Year.findOne({ where: { is_current: false } });
  if (!otherYear) { t.skip('kein nicht-aktuelles Jahr in der DB'); return; }
  await Thesis.update({ year_id: otherYear.id }, { where: { id: f.thesis.id } });
  assert.equal(await swarmAccess(f.coachIn.id, 'coach', f.thesis.id), false);
  assert.deepEqual(await listSwarmTheses(f.coachIn.id, 'coach', otherYear.id), []);
}));

test('listSwarmTheses liefert thesis, nicht thesisOther und nicht thesisLocked; leer für fpc', () => withFixture(async (f) => {
  const ids = (await listSwarmTheses(f.coachIn.id, 'coach', f.year.id)).map((t) => t.id);
  assert.ok(ids.includes(f.thesis.id));
  assert.ok(!ids.includes(f.thesisOther.id));
  assert.ok(!ids.includes(f.thesisLocked.id));
  const idsOut = (await listSwarmTheses(f.coachOut.id, 'coach', f.year.id)).map((t) => t.id);
  assert.ok(idsOut.includes(f.thesisOther.id));
  assert.ok(!idsOut.includes(f.thesis.id));
  assert.deepEqual(await listSwarmTheses(f.fpc.id, 'field_project_coach', f.year.id), []);
  assert.deepEqual(await listSwarmTheses(f.student.id, 'student', f.year.id), []);
  swarmMode.setActive(false);
  assert.deepEqual(await listSwarmTheses(f.coachIn.id, 'coach', f.year.id), []);
}));

test('canReadSwarmFeedbacks: student false bei Modus an, true bei Modus aus; coachIn true bei Modus an', () => withFixture(async (f) => {
  // thesis ohne geladenes year → Funktion lädt das Jahr selbst
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', f.thesis), false);
  assert.equal(await canReadSwarmFeedbacks(f.coachIn.id, 'coach', f.thesis), true);
  assert.equal(await canReadSwarmFeedbacks(f.coachOut.id, 'coach', f.thesis), false);
  assert.equal(await canReadSwarmFeedbacks(f.studentOther.id, 'student', f.thesis), false);
  swarmMode.setActive(false);
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', f.thesis), true);
  assert.equal(await canReadSwarmFeedbacks(f.studentOther.id, 'student', f.thesis), false);
  assert.equal(await canReadSwarmFeedbacks(f.coachIn.id, 'coach', f.thesis), false);
}));

test('canWriteSwarmFeedback: coachIn true (Modus an), coachIn false (Modus aus, nicht zugewiesen), student false, admin true', () => withFixture(async (f) => {
  const admin = await User.create({
    username: `swarmtest_d${f.dept.id}_admin`, password: 'swarmtest-pw-1', name: 'TestAdmin',
    firstname: 'Schwarm', email: `swarmtest_d${f.dept.id}_admin@example.invalid`, role: 'admin', language: 'de',
  });
  try {
    assert.equal(await canWriteSwarmFeedback(f.coachIn.id, 'coach', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(f.expertIn.id, 'expert', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(f.coachOut.id, 'coach', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(f.student.id, 'student', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(f.fpc.id, 'field_project_coach', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(admin.id, 'admin', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(admin.id, 'admin', f.thesisLocked), false);
    swarmMode.setActive(false);
    assert.equal(await canWriteSwarmFeedback(f.coachIn.id, 'coach', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(admin.id, 'admin', f.thesis), true);
  } finally {
    await admin.destroy().catch(() => {});
  }
}));

test('swarmDocumentAccess: tmSwarm true, tmPlain false für coachIn', () => withFixture(async (f) => {
  assert.equal(await swarmDocumentAccess(f.coachIn.id, 'coach', f.tmSwarm), true);
  assert.equal(await swarmDocumentAccess(f.coachIn.id, 'coach', f.tmPlain), false);
  assert.equal(await swarmDocumentAccess(f.coachOut.id, 'coach', f.tmSwarm), false);
  assert.equal(await swarmDocumentAccess(f.student.id, 'student', f.tmSwarm), false);
  swarmMode.setActive(false);
  assert.equal(await swarmDocumentAccess(f.coachIn.id, 'coach', f.tmSwarm), false);
}));

test('canReadSwarmFeedbacks: Student abgewiesen, wenn Jahr nicht mitgeladen (Modus an)', () => withFixture(async (f) => {
  // ohne year_id und ohne year-Assoziation
  const noYearId = await Thesis.findByPk(f.thesis.id, { attributes: ['id', 'is_locked'] });
  assert.equal(noYearId.year_id, undefined);
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', noYearId), false);
  // year inkludiert, aber ohne is_current
  const yearNoFlag = await Thesis.findByPk(f.thesis.id, {
    attributes: ['id', 'is_locked'], include: [{ model: Year, as: 'year', attributes: ['id'] }],
  });
  assert.equal(yearNoFlag.year.is_current, undefined);
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', yearNoFlag), false);
  // Gegenprobe: Modus aus → Student mit regulärem Zugriff darf lesen
  swarmMode.setActive(false);
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', noYearId), true);
  assert.equal(await canReadSwarmFeedbacks(f.student.id, 'student', yearNoFlag), true);
}));

test('canRead/canWrite: null-Arbeit ergibt false', () => withFixture(async (f) => {
  assert.equal(await canReadSwarmFeedbacks(f.coachIn.id, 'coach', null), false);
  assert.equal(await canWriteSwarmFeedback(f.coachIn.id, 'coach', undefined), false);
  assert.equal(await swarmDocumentAccess(f.coachIn.id, 'coach', null), false);
}));

test('canWriteSwarmFeedback: zugewiesener Coach bei Modus aus, Fachbereichsleitung', () => withFixture(async (f) => {
  const mkLead = (key) => User.create({
    username: `swarmtest_d${f.dept.id}_${key}`, password: 'swarmtest-pw-1', name: `Test${key}`,
    firstname: 'Schwarm', email: `swarmtest_d${f.dept.id}_${key}@example.invalid`, role: 'department_lead', language: 'de',
  });
  const lead = await mkLead('lead');
  const leadOther = await mkLead('leadOther');
  try {
    await f.dept.update({ department_lead_id: lead.id });
    await f.deptOther.update({ department_lead_id: leadOther.id });
    await f.thesis.setCoaches([f.coachIn]);

    swarmMode.setActive(false);
    // regulärer Zugriff (|| userHasThesisAccess) trägt auch ohne Schwarmmodus
    assert.equal(await canWriteSwarmFeedback(f.coachIn.id, 'coach', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(f.coachOut.id, 'coach', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(lead.id, 'department_lead', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(leadOther.id, 'department_lead', f.thesis), false);

    swarmMode.setActive(true);
    assert.equal(await canWriteSwarmFeedback(lead.id, 'department_lead', f.thesis), true);
    assert.equal(await canWriteSwarmFeedback(leadOther.id, 'department_lead', f.thesis), false);
    assert.equal(await canWriteSwarmFeedback(lead.id, 'department_lead', f.thesisLocked), false);
    // FBL erhält keinen Schwarmzugriff, auch nicht im eigenen Fachbereich
    assert.equal(await swarmAccess(lead.id, 'department_lead', f.thesis.id), false);
  } finally {
    await f.thesis.setCoaches([]).catch(() => {});
    await f.dept.update({ department_lead_id: null }).catch(() => {});
    await f.deptOther.update({ department_lead_id: null }).catch(() => {});
    await lead.destroy().catch(() => {});
    await leadOther.destroy().catch(() => {});
  }
}));
