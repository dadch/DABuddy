// Idempotente Migration: Markierung für individuell gesetzte Termine pro Snapshot.
// Wenn due_at_overridden = true, schützt das Bulk-Update aus dem Vorlagen-Update
// das due_at-Feld vor Überschreiben.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "due_at_overridden" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  thesis_milestones.due_at_overridden');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
