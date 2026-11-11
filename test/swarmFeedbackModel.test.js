const test = require('node:test');
const assert = require('node:assert/strict');
const { createSwarmFixture, closeDb } = require('./helpers/fixtures');
const { SwarmFeedback } = require('../src/models');

test.after(closeDb);

test('SwarmFeedback: eine pro Autor und Meilenstein', async () => {
  const f = await createSwarmFixture();
  try {
    const attrs = {
      thesis_milestone_id: f.tmSwarm.id,
      thesis_id: f.thesis.id,
      author_user_id: f.coachIn.id,
      author_role: 'coach',
      language: 'de',
      criterion_1: 'ok',
      recommendation: 'continue',
    };
    await SwarmFeedback.create(attrs);
    await assert.rejects(SwarmFeedback.create(attrs), { name: 'SequelizeUniqueConstraintError' });
    assert.equal((await f.tmSwarm.getSwarmFeedbacks()).length, 1);
  } finally {
    await f.cleanup();
  }
});
