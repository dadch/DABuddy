// Idempotente Migration: Transferprojekt-Flag auf Meilenstein-Vorlagen und -Instanzen.
//   - milestones.is_transfer_project        (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.is_transfer_project (BOOLEAN NOT NULL DEFAULT false)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "is_transfer_project" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  milestones.is_transfer_project');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "is_transfer_project" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  thesis_milestones.is_transfer_project');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
