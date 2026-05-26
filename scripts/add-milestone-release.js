// Idempotent migration: Meilenstein-Freigabe zum Starten (released).
//  - Adds thesis_milestones.released (boolean, default false).
//  - For existing data: marks the first milestone per thesis (earliest due_at) as released,
//    plus any milestone that already has uploaded documents (laufende Arbeit nicht sperren).
//  - Adds 'milestone_released' / 'milestone_locked' to the thesis_logs action enum.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "released" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ✓ thesis_milestones.released ergänzt.');

    // Bestehende Daten: ersten Meilenstein je Diplomarbeit + bereits bearbeitete freigeben.
    await sequelize.query(`
      UPDATE "thesis_milestones" tm SET "released" = true
      WHERE tm.id IN (
        SELECT DISTINCT ON ("thesis_id") id
        FROM "thesis_milestones"
        ORDER BY "thesis_id", "due_at" ASC, id ASC
      )
      OR EXISTS (
        SELECT 1 FROM "thesis_milestone_documents" d WHERE d."thesis_milestone_id" = tm.id
      );
    `);
    console.log('  ✓ Bestehende Meilensteine: erster je Diplomarbeit + bereits bearbeitete freigegeben.');

    await sequelize.query(`ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'milestone_released';`);
    await sequelize.query(`ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'milestone_locked';`);
    console.log('  ✓ thesis_logs action-Werte ergänzt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
