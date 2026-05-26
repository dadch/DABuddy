// Idempotent migration: Doppelbewertung (double evaluation).
//  - milestones / thesis_milestones: double_evaluation + evaluator_role_2.
//  - thesis_evaluations: kind + evaluator_role; drop single-column unique on
//    thesis_milestone_id and replace with composite unique (thesis_milestone_id, kind).
// Safe to run multiple times; existing data is preserved (existing evaluations become kind='single').

const { sequelize } = require('../src/models');

async function run() {
  try {
    // Enum types
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_milestones_evaluator_role_2') THEN
          CREATE TYPE "enum_milestones_evaluator_role_2" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_milestones_evaluator_role_2') THEN
          CREATE TYPE "enum_thesis_milestones_evaluator_role_2" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_evaluations_kind') THEN
          CREATE TYPE "enum_thesis_evaluations_kind" AS ENUM ('single','first','second','final');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_evaluations_evaluator_role') THEN
          CREATE TYPE "enum_thesis_evaluations_evaluator_role" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
      END $$;
    `);
    console.log('  ✓ ENUM-Typen sichergestellt.');

    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "double_evaluation" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "evaluator_role_2" "enum_milestones_evaluator_role_2";
    `);
    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "double_evaluation" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "evaluator_role_2" "enum_thesis_milestones_evaluator_role_2";
    `);
    console.log('  ✓ double_evaluation / evaluator_role_2 auf milestones + thesis_milestones ergänzt.');

    await sequelize.query(`
      ALTER TABLE "thesis_evaluations"
        ADD COLUMN IF NOT EXISTS "kind" "enum_thesis_evaluations_kind" NOT NULL DEFAULT 'single',
        ADD COLUMN IF NOT EXISTS "evaluator_role" "enum_thesis_evaluations_evaluator_role";
    `);
    console.log('  ✓ kind / evaluator_role auf thesis_evaluations ergänzt.');

    // Replace single-column unique with composite unique (thesis_milestone_id, kind)
    await sequelize.query(`ALTER TABLE "thesis_evaluations" DROP CONSTRAINT IF EXISTS "thesis_evaluations_thesis_milestone_id_key";`);
    await sequelize.query(`DROP INDEX IF EXISTS "thesis_evaluations_thesis_milestone_id_key";`);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "thesis_evaluations_thesis_milestone_id_kind"
        ON "thesis_evaluations" ("thesis_milestone_id", "kind");
    `);
    console.log('  ✓ Unique-Constraint auf (thesis_milestone_id, kind) umgestellt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
