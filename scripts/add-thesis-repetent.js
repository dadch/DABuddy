// Idempotente Migration: Repetenten-Kennzeichen auf der Diplomarbeit.
//   - theses.is_repetent  (BOOLEAN NOT NULL DEFAULT false)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "is_repetent" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  theses.is_repetent');
    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
