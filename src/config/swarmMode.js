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

// Während des Schwarmmodus ist das Login als Studierende/r gesperrt.
const STUDENT_LOGIN_BLOCKED_MESSAGE =
  'Der Uploadtermin der Projektskizze ist abgelaufen. Das System lässt in dieser Phase kein Login durch Studierende zu.';

// Rollen, mit denen sich ein User aktuell einloggen darf: im Schwarmmodus
// ohne «student». Ist danach keine Rolle mehr übrig, ist das Login gesperrt.
function allowedLoginRoles(roles) {
  return isActive() ? roles.filter(r => r !== 'student') : roles;
}

module.exports = { isActive, setActive, allowedLoginRoles, STUDENT_LOGIN_BLOCKED_MESSAGE };
