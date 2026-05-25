// Idempotent migration for evaluation forms feature:
//  - Creates evaluation form template + thesis evaluation snapshot tables (via sync).
//  - Adds milestones.evaluation_form_id and thesis_milestones.evaluation_form_id.
//  - Adds theses.language (de/fr).
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    // Thesis language enum + column
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_theses_language') THEN
          CREATE TYPE "enum_theses_language" AS ENUM ('de','fr');
        END IF;
      END $$;
    `);
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "language" "enum_theses_language" NOT NULL DEFAULT 'de';
    `);
    console.log('  ✓ theses.language sichergestellt.');

    // New tables (evaluation_forms, evaluation_groups, evaluation_criteria,
    // thesis_evaluations, thesis_evaluation_groups, thesis_evaluation_criteria)
    await sequelize.sync();
    console.log('  ✓ Bewertungsformular-Tabellen sichergestellt.');

    // FK columns on milestones + thesis_milestones (after evaluation_forms exists)
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "evaluation_form_id" INTEGER
          REFERENCES "evaluation_forms"("id") ON UPDATE CASCADE ON DELETE SET NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "evaluation_form_id" INTEGER
          REFERENCES "evaluation_forms"("id") ON UPDATE CASCADE ON DELETE SET NULL;
    `);
    console.log('  ✓ evaluation_form_id auf milestones und thesis_milestones sichergestellt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
