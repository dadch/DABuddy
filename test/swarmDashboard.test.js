const test = require('node:test');
const assert = require('node:assert/strict');
const swarmMode = require('../src/config/swarmMode');
const { createSwarmFixture, mkReq, mkRes, closeDb } = require('./helpers/fixtures');
const { showDashboard, showSwarmMode } = require('../src/controllers/dashboardController');

test.after(closeDb);

async function dashboardAs(f, user, role, active) {
  const before = swarmMode.isActive();
  try {
    swarmMode.setActive(active);
    const req = mkReq({ userId: user.id, userRole: role, query: {} });
    req.session = { userId: user.id, userRole: role, selectedYear: f.year.id, fullName: 'x' };
    req.flash = () => ({});
    const res = mkRes();
    await showDashboard(req, res);
    return res;
  } finally {
    swarmMode.setActive(before);
  }
}

test('Coach sieht im Schwarmmodus fremde Arbeiten des Fachbereichs, ohne gesperrte/andere', async () => {
  const f = await createSwarmFixture();
  try {
    const r = await dashboardAs(f, f.coachIn, 'coach', true);
    assert.equal(r.view, 'coach/dashboard');
    const ids = r.data.swarmTheses.map(t => t.id);
    assert.ok(ids.includes(f.thesis.id));
    assert.ok(!ids.includes(f.thesisOther.id));
    assert.ok(!ids.includes(f.thesisLocked.id));
    const off = await dashboardAs(f, f.coachIn, 'coach', false);
    assert.deepEqual(off.data.swarmTheses, []);
  } finally { await f.cleanup(); }
});

test('Experte erhält swarmTheses im Schwarmmodus', async () => {
  const f = await createSwarmFixture();
  try {
    const r = await dashboardAs(f, f.expertIn, 'expert', true);
    assert.equal(r.view, 'expert/dashboard');
    assert.ok(r.data.swarmTheses.map(t => t.id).includes(f.thesis.id));
  } finally { await f.cleanup(); }
});

test('FPC erhält leere swarmTheses', async () => {
  const f = await createSwarmFixture();
  try {
    const r = await dashboardAs(f, f.fpc, 'field_project_coach', true);
    assert.deepEqual(r.data.swarmTheses, []);
  } finally { await f.cleanup(); }
});

test('showSwarmMode rendert Admin-Seite', async () => {
  const req = mkReq({ userId: 1, userRole: 'admin' });
  req.session.fullName = 'A';
  const res = mkRes();
  await showSwarmMode(req, res);
  assert.equal(res.view, 'admin/swarm-mode');
});
