// Idempotente Migration: Studienform (Vollzeit/Berufsbegleitend).
//   - departments.study_mode  (VARCHAR(16) NOT NULL DEFAULT 'parttime')
//     Bestehende Fachbereiche sind berufsbegleitend → Default 'parttime'.
//   - milestones.applies_to   (VARCHAR(16) NOT NULL DEFAULT 'all')
//     Bestehende Meilensteine gelten wie bisher für alle.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "departments"
        ADD COLUMN IF NOT EXISTS "study_mode" VARCHAR(16) NOT NULL DEFAULT 'parttime';
    `);
    console.log('  ok  departments.study_mode');

    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "applies_to" VARCHAR(16) NOT NULL DEFAULT 'all';
    `);
    console.log('  ok  milestones.applies_to');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
