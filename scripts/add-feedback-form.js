// Idempotente Migration: Feedbackformular pro Meilenstein.
//   - milestones.feedback_form_enabled        (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.feedback_form_enabled (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.feedback_text         (TEXT NULL — Rückmeldungstext)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "feedback_form_enabled" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  milestones.feedback_form_enabled');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "feedback_form_enabled" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  thesis_milestones.feedback_form_enabled');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "feedback_text" TEXT NULL;
    `);
    console.log('  ok  thesis_milestones.feedback_text');

    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
