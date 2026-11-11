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

test('FBL-Dashboard: Status-Spalte erhält Rückmeldungen und Vorlagen-Flag', async () => {
  const f = await createSwarmFixture();
  const { Department, User, Milestone, SwarmFeedback } = require('../src/models');
  const lead = await User.create({
    username: `swarmtest_lead_${f.dept.id}`, password: 'swarmtest-pw-1', name: 'Lead', firstname: 'Schwarm',
    email: `swarmtest_lead_${f.dept.id}@example.invalid`, role: 'department_lead', language: 'de',
  });
  let template = null;
  try {
    await f.dept.update({ department_lead_id: lead.id });
    template = await Milestone.create({
      year_id: f.year.id, label: `Schwarm-Vorlage-${f.dept.id}`, due_at: new Date(), responsible_role: 'student',
      swarm_feedback_enabled: true,
    });
    await f.tmSwarm.update({ milestone_id: template.id });
    await SwarmFeedback.create({
      thesis_milestone_id: f.tmSwarm.id, thesis_id: f.thesis.id, author_user_id: f.coachIn.id,
      author_role: 'coach', recommendation: 'continue_with_conditions', criterion_1: 'x',
    });
    const r = await dashboardAs(f, lead, 'department_lead', false);
    assert.equal(r.view, 'department_lead/dashboard');
    const mt = r.data.milestoneTemplates.find(m => m.id === template.id);
    assert.equal(mt.swarm_feedback_enabled, true);
    const thesis = r.data.theses.find(t => t.id === f.thesis.id);
    const tm = thesis.milestones.find(m => m.id === f.tmSwarm.id);
    assert.equal(r.data.swarmFeedbackStatus(tm.swarmFeedbacks), 'conditions');
    const plain = thesis.milestones.find(m => m.id === f.tmPlain.id);
    assert.equal(r.data.swarmFeedbackStatus(plain.swarmFeedbacks), 'none');
  } finally {
    await f.dept.update({ department_lead_id: null }).catch(() => {});
    if (template) await template.destroy().catch(() => {});
    await f.cleanup();
    await lead.destroy().catch(() => {});
  }
});
