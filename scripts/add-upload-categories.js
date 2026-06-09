// Idempotente Migration: Stammdatentabelle für Upload-Kategorien
// (vom Administrator gepflegt; aktiv/deaktiviert per Flag).
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "upload_categories" (
        "id" SERIAL PRIMARY KEY,
        "label" VARCHAR(120) NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "upload_categories_label_idx"
        ON "upload_categories" (LOWER("label"));
    `);
    console.log('  ok  upload_categories');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
