const test = require('node:test');
const assert = require('node:assert/strict');
const { closeDb } = require('./helpers/fixtures');
const { parseMilestoneConfig, createThesisMilestoneFromTemplate } = require('../src/controllers/apiController');

test.after(closeDb);

test('parseMilestoneConfig übernimmt swarm_feedback_enabled', () => {
  assert.equal(parseMilestoneConfig({}).swarm_feedback_enabled, false);
  assert.equal(parseMilestoneConfig({ swarm_feedback_enabled: true }).swarm_feedback_enabled, true);
});

test('createThesisMilestoneFromTemplate kopiert das Flag', () => {
  assert.equal(createThesisMilestoneFromTemplate(1, { swarm_feedback_enabled: true, label: 'x' }).swarm_feedback_enabled, true);
});
