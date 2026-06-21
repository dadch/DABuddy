// Idempotente Migration: Zweisprachige Bezeichnungen für Diplomjahre und
// Upload-Kategorien.
//   - years.label_de            (TEXT NULL)  — optionaler DE-Klartext
//   - years.label_fr            (TEXT NULL)  — FR-Klartext
//   - upload_categories.label_fr (TEXT NULL) — FR-Bezeichnung; `label` bleibt DE
// Fallback im UI: lokalisierte Bezeichnung wenn gesetzt, sonst Jahreszahl
// (Year) bzw. DE-Label (UploadCategory).
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`ALTER TABLE "years" ADD COLUMN IF NOT EXISTS "label_de" TEXT NULL;`);
    await sequelize.query(`ALTER TABLE "years" ADD COLUMN IF NOT EXISTS "label_fr" TEXT NULL;`);
    console.log('  ok  years.label_de / label_fr');

    await sequelize.query(`ALTER TABLE "upload_categories" ADD COLUMN IF NOT EXISTS "label_fr" TEXT NULL;`);
    console.log('  ok  upload_categories.label_fr');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
