const test = require('node:test');
const assert = require('node:assert/strict');
const swarmMode = require('../src/config/swarmMode');
const { User, Year, ThesisLog, SwarmFeedback } = require('../src/models');
const { createSwarmFixture, mkReq, mkRes, closeDb } = require('./helpers/fixtures');
const {
  listSwarmFeedbacks, getMySwarmFeedback, upsertMySwarmFeedback,
  adminUpdateSwarmFeedback, adminDeleteSwarmFeedback,
} = require('../src/controllers/apiController');

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

async function call(handler, user, role, params, body = {}, language = 'de') {
  const req = mkReq({ userId: user.id, userRole: role, params, body });
  req.language = language;
  const res = mkRes();
  await handler(req, res);
  return res;
}

const validBody = (extra = {}) => ({
  criterion_1: '  Ausgangslage klar  ', criterion_2: '', criterion_3: '',
  recommendation: 'continue_with_conditions', condition_what: 'Ziele schärfen', condition_until: '2026-12-01',
  ...extra,
});

const put = (f, user, role, body, language) => call(upsertMySwarmFeedback, user, role, { id: f.tmSwarm.id }, body, language);
const list = (f, user, role, tm = f.tmSwarm) => call(listSwarmFeedbacks, user, role, { id: tm.id });

test('coachIn legt an (created true), ändert (created false), Liste hat 1 Eintrag mit isMine', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const a = await put(f, f.coachIn, 'coach', validBody(), 'fr');
      assert.equal(a.code, 200, JSON.stringify(a.body));
      assert.equal(a.body.created, true);
      assert.equal(a.body.feedback.criterion_1, 'Ausgangslage klar');
      assert.equal(a.body.feedback.criterion_2, null);
      assert.equal(a.body.feedback.author_role, 'coach');
      assert.equal(a.body.feedback.language, 'fr');
      assert.equal(a.body.feedback.author.id, f.coachIn.id);
      assert.equal(a.body.feedback.isMine, true);

      const b = await put(f, f.coachIn, 'coach', validBody({ criterion_2: 'Neu', thesis_id: f.thesisOther.id }), 'de');
      assert.equal(b.code, 200, JSON.stringify(b.body));
      assert.equal(b.body.created, false);
      assert.equal(b.body.feedback.id, a.body.feedback.id);
      assert.equal(b.body.feedback.criterion_2, 'Neu');
      assert.equal(b.body.feedback.language, 'fr', 'Sprache bleibt beim Update');
      const stored = await SwarmFeedback.findByPk(a.body.feedback.id);
      assert.equal(stored.thesis_id, f.thesis.id, 'thesis_id stammt vom Meilenstein, nie aus dem Body');

      const l = await list(f, f.coachIn, 'coach');
      assert.equal(l.code, 200);
      assert.equal(l.body.feedbacks.length, 1);
      assert.equal(l.body.feedbacks[0].isMine, true);
      assert.equal(l.body.feedbacks[0].author.firstname, 'Schwarm');

      const lx = await list(f, f.expertIn, 'expert');
      assert.equal(lx.body.feedbacks[0].isMine, false);

      const m = await call(getMySwarmFeedback, f.coachIn, 'coach', { id: f.tmSwarm.id });
      assert.equal(m.code, 200);
      assert.equal(m.body.canWrite, true);
      assert.equal(m.body.feedback.id, a.body.feedback.id);
      const mx = await call(getMySwarmFeedback, f.expertIn, 'expert', { id: f.tmSwarm.id });
      assert.equal(mx.body.feedback, null);
      assert.equal(mx.body.canWrite, true);
    });
  } finally { await f.cleanup(); }
});

test('recommendation continue löscht condition_what/until', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const a = await put(f, f.coachIn, 'coach', validBody({ recommendation: 'continue' }));
      assert.equal(a.code, 200, JSON.stringify(a.body));
      assert.equal(a.body.feedback.recommendation, 'continue');
      assert.equal(a.body.feedback.condition_what, null);
      assert.equal(a.body.feedback.condition_until, null);
    });
  } finally { await f.cleanup(); }
});

test('fehlende recommendation → 400; drei leere Kriterien → 400', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const a = await put(f, f.coachIn, 'coach', validBody({ recommendation: undefined }));
      assert.equal(a.code, 400);
      assert.equal(a.body.message, 'swarm.feedback.validation.recommendationRequired');
      const b = await put(f, f.coachIn, 'coach', validBody({ recommendation: 'maybe' }));
      assert.equal(b.code, 400);
      assert.equal(b.body.message, 'swarm.feedback.validation.recommendationRequired');
      const c = await put(f, f.coachIn, 'coach', validBody({ criterion_1: '   ', criterion_2: '', criterion_3: null }));
      assert.equal(c.code, 400);
      assert.equal(c.body.message, 'swarm.feedback.validation.criterionRequired');
      const d = await put(f, f.coachIn, 'coach', validBody({ condition_until: '1.12.2026' }));
      assert.equal(d.code, 400);
      assert.equal(d.body.message, 'swarm.feedback.validation.invalidDate');
      const e = await put(f, f.coachIn, 'coach', validBody({ condition_until: '2026-02-30' }));
      assert.equal(e.code, 400);
      assert.equal(e.body.message, 'swarm.feedback.validation.invalidDate');
      const z = await put(f, f.coachIn, 'coach', validBody({ condition_until: '0000-01-01' }));
      assert.equal(z.code, 400);
      assert.equal(z.body.message, 'swarm.feedback.validation.invalidDate');
      assert.equal(await SwarmFeedback.count({ where: { thesis_milestone_id: f.tmSwarm.id } }), 0);
    });
  } finally { await f.cleanup(); }
});

test('student: Liste 403 bei Modus an, 200 bei Modus aus; Vorjahresarbeit 200 trotz Modus an', async (t) => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const r = await list(f, f.student, 'student');
      assert.equal(r.code, 403);
      const p = await put(f, f.student, 'student', validBody());
      assert.equal(p.code, 403);
      const m = await call(getMySwarmFeedback, f.student, 'student', { id: f.tmSwarm.id });
      assert.equal(m.code, 403);
    });
    await withMode(false, async () => {
      const r = await list(f, f.student, 'student');
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.feedbacks, []);
      const m = await call(getMySwarmFeedback, f.student, 'student', { id: f.tmSwarm.id });
      assert.equal(m.code, 200);
      assert.equal(m.body.canWrite, false);
    });
    const old = await Year.findOne({ where: { is_current: false } });
    if (!old) { t.skip('Kein nicht-aktuelles Jahr in der DB'); return; }
    await f.thesis.update({ year_id: old.id });
    await withMode(true, async () => {
      const r = await list(f, f.student, 'student');
      assert.equal(r.code, 200, JSON.stringify(r.body));
    });
  } finally { await f.cleanup(); }
});

test('coachOut PUT → 403; fpc PUT → 403; expertIn PUT → 200', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      assert.equal((await put(f, f.coachOut, 'coach', validBody())).code, 403);
      assert.equal((await list(f, f.coachOut, 'coach')).code, 403);
      assert.equal((await put(f, f.fpc, 'field_project_coach', validBody())).code, 403);
      const e = await put(f, f.expertIn, 'expert', validBody());
      assert.equal(e.code, 200, JSON.stringify(e.body));
      assert.equal(e.body.feedback.author_role, 'expert');
    });
  } finally { await f.cleanup(); }
});

test('tmPlain: GET → 404', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const r = await list(f, f.coachIn, 'coach', f.tmPlain);
      assert.equal(r.code, 404);
      assert.equal(r.body.message, 'Meilenstein nicht gefunden');
      const m = await call(getMySwarmFeedback, f.coachIn, 'coach', { id: f.tmPlain.id });
      assert.equal(m.code, 404);
      const p = await call(upsertMySwarmFeedback, f.coachIn, 'coach', { id: f.tmPlain.id }, validBody());
      assert.equal(p.code, 404);
      const n = await call(listSwarmFeedbacks, f.coachIn, 'coach', { id: 2147483000 });
      assert.equal(n.code, 404);
    });
  } finally { await f.cleanup(); }
});

test('Log-Einträge swarm_feedback_created/updated vorhanden', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      await put(f, f.coachIn, 'coach', validBody());
      await put(f, f.coachIn, 'coach', validBody({ recommendation: 'stop' }));
    });
    const logs = await ThesisLog.findAll({
      where: { thesis_milestone_id: f.tmSwarm.id, action: ['swarm_feedback_created', 'swarm_feedback_updated'] },
      order: [['id', 'ASC']],
    });
    assert.deepEqual(logs.map((l) => l.action), ['swarm_feedback_created', 'swarm_feedback_updated']);
    assert.equal(logs[0].user_id, f.coachIn.id);
    assert.equal(logs[0].thesis_id, f.thesis.id);
    assert.equal(logs[0].detail, 'Projektskizze: continue_with_conditions');
    assert.equal(logs[1].detail, 'Projektskizze: stop');
  } finally { await f.cleanup(); }
});

test('DELETE/PUT als coach 403 (Handler-Guard; Route-requireRole nicht per Handleraufruf testbar), als admin bearbeitet/löscht + Log', async (t) => {
  const f = await createSwarmFixture();
  try {
    let fbId;
    await withMode(true, async () => {
      const a = await put(f, f.coachIn, 'coach', validBody());
      fbId = a.body.feedback.id;
    });
    const d = await call(adminDeleteSwarmFeedback, f.coachIn, 'coach', { id: fbId });
    assert.equal(d.code, 403);
    const u = await call(adminUpdateSwarmFeedback, f.expertIn, 'expert', { id: fbId }, validBody({ recommendation: 'stop' }));
    assert.equal(u.code, 403);
    assert.ok(await SwarmFeedback.findByPk(fbId));

    const admin = await User.findOne({ where: { role: 'admin' } });
    if (!admin) { t.skip('Kein Admin in der DB'); return; }

    const bad = await call(adminUpdateSwarmFeedback, admin, 'admin', { id: fbId }, validBody({ criterion_1: '' }));
    assert.equal(bad.code, 400);
    assert.equal(bad.body.message, 'swarm.feedback.validation.criterionRequired');

    const au = await call(adminUpdateSwarmFeedback, admin, 'admin', { id: fbId }, validBody({ recommendation: 'continue', criterion_3: 'Admin' }));
    assert.equal(au.code, 200, JSON.stringify(au.body));
    assert.equal(au.body.feedback.criterion_3, 'Admin');
    assert.equal(au.body.feedback.condition_what, null);
    assert.equal(au.body.feedback.author.id, f.coachIn.id, 'Autor bleibt');
    assert.equal(au.body.feedback.author_role, 'coach');

    const ad = await call(adminDeleteSwarmFeedback, admin, 'admin', { id: fbId });
    assert.equal(ad.code, 200, JSON.stringify(ad.body));
    assert.equal(ad.body.success, true);
    assert.equal(await SwarmFeedback.findByPk(fbId), null);
    const again = await call(adminDeleteSwarmFeedback, admin, 'admin', { id: fbId });
    assert.equal(again.code, 404);

    const logs = await ThesisLog.findAll({
      where: { thesis_milestone_id: f.tmSwarm.id, user_id: admin.id, action: ['swarm_feedback_updated', 'swarm_feedback_deleted'] },
      order: [['id', 'ASC']],
    });
    assert.deepEqual(logs.map((l) => l.action), ['swarm_feedback_updated', 'swarm_feedback_deleted']);
    assert.equal(logs[0].detail, 'Projektskizze: continue');
    assert.equal(logs[1].detail, `Projektskizze: ${f.coachIn.name}, ${f.coachIn.firstname}`);
  } finally { await f.cleanup(); }
});

test('Upsert-Konflikt: Zeile existiert, findOne liefert beim ersten Mal null → 200, created false, eine Zeile', async () => {
  const f = await createSwarmFixture();
  const origFindOne = SwarmFeedback.findOne;
  try {
    await SwarmFeedback.create({
      thesis_milestone_id: f.tmSwarm.id, thesis_id: f.thesis.id, author_user_id: f.coachIn.id,
      author_role: 'coach', language: 'de', criterion_1: 'Alt', recommendation: 'stop',
    });
    let first = true;
    SwarmFeedback.findOne = function stubbed(...args) {
      if (first) { first = false; return Promise.resolve(null); }
      return origFindOne.apply(this, args);
    };
    await withMode(true, async () => {
      const r = await put(f, f.coachIn, 'coach', validBody({ criterion_1: 'Neu' }));
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(r.body.created, false);
      assert.equal(r.body.feedback.criterion_1, 'Neu');
    });
    SwarmFeedback.findOne = origFindOne;
    assert.equal(await SwarmFeedback.count({ where: { thesis_milestone_id: f.tmSwarm.id } }), 1);
    const logs = await ThesisLog.findAll({ where: { thesis_milestone_id: f.tmSwarm.id, action: ['swarm_feedback_created', 'swarm_feedback_updated'] } });
    assert.deepEqual(logs.map((l) => l.action), ['swarm_feedback_updated']);
  } finally { SwarmFeedback.findOne = origFindOne; await f.cleanup(); }
});

test('Upsert parallel: zwei gleichzeitige PUTs → beide 200, genau eine Zeile', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const [a, b] = await Promise.all([
        put(f, f.expertIn, 'expert', validBody()),
        put(f, f.expertIn, 'expert', validBody({ recommendation: 'stop' })),
      ]);
      assert.equal(a.code, 200, JSON.stringify(a.body));
      assert.equal(b.code, 200, JSON.stringify(b.body));
      assert.equal([a.body.created, b.body.created].filter(Boolean).length, 1);
    });
    assert.equal(await SwarmFeedback.count({ where: { thesis_milestone_id: f.tmSwarm.id } }), 1);
  } finally { await f.cleanup(); }
});

test('Markierung entfernt: bestehende Rückmeldungen bleiben lesbar, Erfassen nicht mehr möglich', async () => {
  const f = await createSwarmFixture();
  try {
    await withMode(true, async () => {
      const a = await put(f, f.coachIn, 'coach', validBody());
      assert.equal(a.code, 200, JSON.stringify(a.body));
    });
    await f.tmSwarm.update({ swarm_feedback_enabled: false });
    await withMode(false, async () => {
      const l = await list(f, f.student, 'student');
      assert.equal(l.code, 200, JSON.stringify(l.body));
      assert.equal(l.body.feedbacks.length, 1);
      const m = await call(getMySwarmFeedback, f.student, 'student', { id: f.tmSwarm.id });
      assert.equal(m.code, 200, JSON.stringify(m.body));
    });
    await withMode(true, async () => {
      const w = await put(f, f.expertIn, 'expert', validBody());
      assert.equal(w.code, 404, 'Schreiben setzt die Markierung voraus');
      const p = await list(f, f.coachIn, 'coach', f.tmPlain);
      assert.equal(p.code, 404, 'Unmarkiert ohne Rückmeldungen bleibt 404');
    });
  } finally {
    await f.tmSwarm.update({ swarm_feedback_enabled: true }).catch(() => {});
    await f.cleanup();
  }
});
