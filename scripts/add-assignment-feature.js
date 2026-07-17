// Idempotente Migration: Aufgabenstellungs-Feature.
//   - years.assignment_m1_fulltime / _parttime  (TIMESTAMPTZ NULL)
//     Termin "Meilenstein 1" (Ausgabe der Aufgabenstellung) je Studienform.
//   - years.assignment_m2_fulltime / _parttime  (TIMESTAMPTZ NULL)
//     Termin "Meilenstein 2" (Abgabe der Diplomarbeit) je Studienform.
//   - milestones.is_assignment          (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.is_assignment   (BOOLEAN NOT NULL DEFAULT false)
//   - thesis_milestones.assignment_text (TEXT NULL — Ergänzungsfeld, Markdown)
//   - thesis_logs.action: neuer Wert 'assignment_updated'
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "years"
        ADD COLUMN IF NOT EXISTS "assignment_m1_fulltime" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "assignment_m1_parttime" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "assignment_m2_fulltime" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "assignment_m2_parttime" TIMESTAMPTZ;
    `);
    console.log('  ok  years.assignment_m1/m2_fulltime/parttime');

    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "is_assignment" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  milestones.is_assignment');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "is_assignment" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "assignment_text" TEXT;
    `);
    console.log('  ok  thesis_milestones.is_assignment / assignment_text');

    // Log-Enum erweitern (Postgres: ADD VALUE ist idempotent mit IF NOT EXISTS)
    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'assignment_updated';
    `);
    console.log('  ok  thesis_logs.action += assignment_updated');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
