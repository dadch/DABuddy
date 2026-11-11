const test = require('node:test');
const assert = require('node:assert/strict');
const { swarmFeedbackStatus } = require('../src/utils/swarmFeedbackStatus');

const r = (recommendation) => ({ recommendation });

test('swarmFeedbackStatus: keine Rückmeldung → none', () => {
  assert.equal(swarmFeedbackStatus([]), 'none');
  assert.equal(swarmFeedbackStatus(undefined), 'none');
  assert.equal(swarmFeedbackStatus(null), 'none');
});

test('swarmFeedbackStatus: nur "weiter" → ok', () => {
  assert.equal(swarmFeedbackStatus([r('continue')]), 'ok');
  assert.equal(swarmFeedbackStatus([r('continue'), r('continue')]), 'ok');
});

test('swarmFeedbackStatus: eine Auflage → conditions', () => {
  assert.equal(swarmFeedbackStatus([r('continue'), r('continue_with_conditions')]), 'conditions');
});

test('swarmFeedbackStatus: Gestoppt übersteuert Auflage', () => {
  assert.equal(swarmFeedbackStatus([r('continue_with_conditions'), r('stop'), r('continue')]), 'stop');
  assert.equal(swarmFeedbackStatus([r('stop')]), 'stop');
});
