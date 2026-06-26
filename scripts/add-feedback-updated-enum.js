// Idempotente Migration: erweitert das enum_thesis_logs_action um den
// Wert 'feedback_updated', damit Änderungen am Feedbackformular protokolliert
// werden können (insbesondere durch FachbereichsleiterInnen).
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'feedback_updated';
    `);
    console.log('  ok  enum_thesis_logs_action += feedback_updated');
    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
