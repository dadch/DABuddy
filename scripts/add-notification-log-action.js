// Idempotente Migration: neuer Log-Aktionswert 'notification_sent'
// (Benachrichtigung der Beteiligten beim Starten/Sperren eines Meilensteins).
//
// Ausführen (lokal):           node scripts/add-notification-log-action.js
// Ausführen (Docker, Prod):    docker compose exec app node scripts/add-notification-log-action.js
//
// Hintergrund: sequelize.sync() erweitert bestehende Postgres-ENUMs nicht.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'notification_sent';
    `);
    console.log('  ok  thesis_logs.action += notification_sent');
    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
