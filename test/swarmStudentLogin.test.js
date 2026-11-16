const test = require('node:test');
const assert = require('node:assert/strict');
const { createSwarmFixture, mkRes, mkReq, closeDb } = require('./helpers/fixtures');
const swarmMode = require('../src/config/swarmMode');
const { UserRole } = require('../src/models');
const { requireAuth } = require('../src/middleware/auth');
const { switchActiveRole } = require('../src/controllers/apiController');

test.after(closeDb);

async function withMode(active, fn) {
  const before = swarmMode.isActive();
  try {
    swarmMode.setActive(active);
    await fn();
  } finally {
    swarmMode.setActive(before);
  }
}

test('allowedLoginRoles: im Schwarmmodus ohne student', () => withMode(true, async () => {
  assert.deepEqual(swarmMode.allowedLoginRoles(['student']), []);
  assert.deepEqual(swarmMode.allowedLoginRoles(['student', 'coach']), ['coach']);
  assert.deepEqual(swarmMode.allowedLoginRoles(['admin']), ['admin']);
}));

test('allowedLoginRoles: ohne Schwarmmodus unverändert', () => withMode(false, async () => {
  assert.deepEqual(swarmMode.allowedLoginRoles(['student']), ['student']);
}));

function mkSessionReq(userRole) {
  const req = mkReq({ userId: 1, userRole });
  req.method = 'GET';
  req.originalUrl = '/dashboard';
  req.session.destroy = (cb) => { req.session.destroyed = true; cb(); };
  return req;
}

test('requireAuth beendet Studierenden-Session im Schwarmmodus', () => withMode(true, async () => {
  const req = mkSessionReq('student');
  const res = mkRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(req.session.destroyed, true);
  assert.equal(res.redirected, '/login?swarm=1');
}));

test('requireAuth lässt Dozierende im Schwarmmodus durch', () => withMode(true, async () => {
  const req = mkSessionReq('coach');
  let nextCalled = false;
  await requireAuth(req, mkRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
}));

test('Rollenwechsel auf student im Schwarmmodus verweigert, sonst erlaubt', async () => {
  const f = await createSwarmFixture();
  const extra = await UserRole.create({ user_id: f.coachIn.id, role: 'student' });
  try {
    await withMode(true, async () => {
      const res = mkRes();
      await switchActiveRole(mkReq({ userId: f.coachIn.id, userRole: 'coach', body: { role: 'student' } }), res);
      assert.equal(res.code, 403);
      assert.equal(res.body.message, swarmMode.STUDENT_LOGIN_BLOCKED_MESSAGE);
    });
    await withMode(false, async () => {
      const req = mkReq({ userId: f.coachIn.id, userRole: 'coach', body: { role: 'student' } });
      const res = mkRes();
      await switchActiveRole(req, res);
      assert.equal(res.code, 200);
      assert.equal(req.session.userRole, 'student');
    });
  } finally {
    await extra.destroy().catch(() => {});
    await f.cleanup();
  }
});
