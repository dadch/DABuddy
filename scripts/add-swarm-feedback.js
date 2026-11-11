// Idempotente Migration: Schwarmmodus / Rückmeldung Projektskizze.
//   - milestones.swarm_feedback_enabled          (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.swarm_feedback_enabled   (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_logs.action: neue Werte 'swarm_feedback_created', 'swarm_feedback_updated',
//     'swarm_feedback_deleted'
//
// Aufruf lokal:  node scripts/add-swarm-feedback.js
// Aufruf Docker: docker compose exec app node scripts/add-swarm-feedback.js
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "swarm_feedback_enabled" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  milestones.swarm_feedback_enabled');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "swarm_feedback_enabled" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  thesis_milestones.swarm_feedback_enabled');

    for (const value of ['swarm_feedback_created', 'swarm_feedback_updated', 'swarm_feedback_deleted']) {
      await sequelize.query(`
        ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS '${value}';
      `);
      console.log(`  ok  thesis_logs.action += ${value}`);
    }

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
