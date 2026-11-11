const test = require('node:test');
const assert = require('node:assert/strict');
const swarmMode = require('../src/config/swarmMode');
const { createSwarmFixture, mkReq, mkRes, closeDb } = require('./helpers/fixtures');
const { showThesisDetail } = require('../src/controllers/dashboardController');
const { downloadThesisMilestoneDocument } = require('../src/controllers/apiController');

test.after(closeDb);

async function withMode(active, fn) {
  const before = swarmMode.isActive();
  try {
    swarmMode.setActive(active);
    return await fn();
  } finally {
    swarmMode.setActive(before);
  }
}

async function download(user, role, doc) {
  const req = mkReq({ userId: user.id, userRole: role, params: { docId: doc.id } });
  const res = mkRes();
  await downloadThesisMilestoneDocument(req, res);
  return res;
}

async function detail(user, role, thesis) {
  const req = mkReq({ userId: user.id, userRole: role, params: { id: thesis.id } });
  req.session.fullName = 'Test';
  const flashes = [];
  req.flash = (type, msg) => { if (type) flashes.push([type, msg]); return {}; };
  const res = mkRes();
  await showThesisDetail(req, res);
  res.flashes = flashes;
  return res;
}

// Die Fixture-Datei existiert nicht auf der Platte: 404 "Dokumentendatei nicht
// gefunden" beweist, dass das Zugriffs-Gate passiert wurde.
const passedGate = (r) => (r.sentFile !== undefined)
  || (r.code === 404 && r.body && r.body.message === 'Dokumentendatei nicht gefunden');

test('Download: coachIn im Schwarmmodus darf docSwarm, nicht docPlain; coachOut bei beiden 403', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const a = await download(f.coachIn, 'coach', f.docSwarm);
      assert.ok(passedGate(a), `Gate nicht passiert: ${a.code} ${JSON.stringify(a.body)}`);
      const b = await download(f.coachIn, 'coach', f.docPlain);
      assert.equal(b.code, 403);
      const c = await download(f.coachOut, 'coach', f.docSwarm);
      assert.equal(c.code, 403);
      const d = await download(f.coachOut, 'coach', f.docPlain);
      assert.equal(d.code, 403);
    });
    await withMode(false, async () => {
      const e = await download(f.coachIn, 'coach', f.docSwarm);
      assert.equal(e.code, 403);
    });
  } finally { await f.cleanup(); }
});

test('Download: Student der Arbeit weiterhin über regulären Zugriff', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(false, async () => {
      const r = await download(f.student, 'student', f.docPlain);
      assert.ok(passedGate(r));
    });
  } finally { await f.cleanup(); }
});

test('showThesisDetail: coachIn ohne Zuweisung rendert shared/thesis-swarm nur mit markiertem Meilenstein', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const r = await detail(f.coachIn, 'coach', f.thesis);
      assert.equal(r.view, 'shared/thesis-swarm');
      assert.equal(r.data.milestones.length, 1);
      assert.equal(r.data.milestones[0].id, f.tmSwarm.id);
      assert.equal(r.data.canWrite, true);
      assert.equal(r.data.swarmFeedbackCanWrite, true);
      assert.equal(r.data.swarmFeedbackCanRead, true);
      assert.deepEqual(r.data.swarmFeedbacksByMilestone, {});
      assert.equal(r.data.logs, undefined);
      assert.equal(typeof r.data.formatFileSize, 'function');
      assert.equal(typeof r.data.fmtDateTime, 'function');
      assert.equal(r.data.milestones[0].documents.length, 1);
    });
  } finally { await f.cleanup(); }
});

test('showThesisDetail: ohne Schwarmmodus bzw. fremder Fachbereich → Redirect; Student → reguläre Ansicht', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(false, async () => {
      const r = await detail(f.coachIn, 'coach', f.thesis);
      assert.equal(r.redirected, '/dashboard');
      assert.equal(r.view, undefined);
    });
    await withMode(true, async () => {
      const r = await detail(f.coachOut, 'coach', f.thesis);
      assert.equal(r.redirected, '/dashboard');
      assert.equal(r.view, undefined);
      const s = await detail(f.student, 'student', f.thesis);
      assert.equal(s.view, 'student/thesis-detail');
      assert.equal(s.data.milestones.length, 2);
    });
  } finally { await f.cleanup(); }
});
