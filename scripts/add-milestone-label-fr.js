// Idempotente Migration: Zweisprachige Meilenstein-Titel.
//   - milestones.label_fr            (TEXT NULL) — Vorlagen
//   - thesis_milestones.label_fr     (TEXT NULL) — Snapshots
// Das bestehende Feld `label` bleibt der primäre DE-Titel; `label_fr` ist
// optional. Beim Rendern wird `label_fr` bevorzugt, wenn die Benutzersprache
// FR ist, sonst fällt das System auf `label` (DE) zurück.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "label_fr" TEXT NULL;
    `);
    console.log('  ok  milestones.label_fr');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "label_fr" TEXT NULL;
    `);
    console.log('  ok  thesis_milestones.label_fr');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
