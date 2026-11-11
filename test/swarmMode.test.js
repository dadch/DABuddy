const test = require('node:test');
const assert = require('node:assert/strict');
const swarmMode = require('../src/config/swarmMode');
const { getSwarmMode, setSwarmMode } = require('../src/controllers/apiController');
const { mkReq, mkRes, closeDb } = require('./helpers/fixtures');

test.after(closeDb);

test('setActive/isActive', () => {
  const before = swarmMode.isActive();
  try {
    assert.equal(swarmMode.setActive(true), true);
    assert.equal(swarmMode.isActive(), true);
    assert.equal(swarmMode.setActive(false), false);
    assert.equal(swarmMode.isActive(), false);
  } finally {
    swarmMode.setActive(before);
  }
});

test('PUT /api/admin/swarm-mode schaltet und GET liest', async () => {
  const before = swarmMode.isActive();
  try {
    const put = mkRes();
    await setSwarmMode(mkReq({ userRole: 'admin', body: { active: true } }), put);
    assert.equal(put.code, 200);
    assert.deepEqual(put.body, { success: true, active: true });
    const get = mkRes();
    await getSwarmMode(mkReq({ userRole: 'admin' }), get);
    assert.equal(get.body.active, true);
  } finally {
    swarmMode.setActive(before);
  }
});

test('Admin-API: Nicht-Admin 403, Nicht-Boolean 400', async () => {
  const r1 = mkRes();
  await setSwarmMode(mkReq({ userRole: 'coach', body: { active: true } }), r1);
  assert.equal(r1.code, 403);
  const r2 = mkRes();
  await getSwarmMode(mkReq({ userRole: 'student' }), r2);
  assert.equal(r2.code, 403);
  const r3 = mkRes();
  await setSwarmMode(mkReq({ userRole: 'admin', body: { active: 'yes' } }), r3);
  assert.equal(r3.code, 400);
});
