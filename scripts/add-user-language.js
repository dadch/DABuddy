// Idempotente Migration: users.language (Profil-Spracheinstellung).
//   - 'de' | 'fr' (weitere Codes können später ergänzt werden — kein ENUM,
//     damit neue Sprachen ohne Migration möglich sind).
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "language" VARCHAR(8) NOT NULL DEFAULT 'de';
    `);
    console.log('  ok  users.language');
    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
