// Schwarmmodus: systemweit vom Admin schaltbarer Modus. Zustand liegt im
// appSettings-Store (Key `swarm_mode`).
const appSettings = require('./appSettings');

function isActive() {
  return appSettings.get('swarm_mode') === true;
}

function setActive(active) {
  const next = !!active;
  appSettings.set('swarm_mode', next);
  console.log(`[swarmMode] ${next ? 'aktiviert' : 'deaktiviert'}`);
  return isActive();
}

module.exports = { isActive, setActive };
