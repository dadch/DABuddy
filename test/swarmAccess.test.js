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

test('kein Zugriff auf Arbeit eines anderen Diplomjahrs', () => withFixture(async (f) => {
  const otherYear = await Year.findOne({ where: { is_current: false } });
  if (!otherYear) return; // ohne zweites Jahr in der DB nicht prüfbar
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
