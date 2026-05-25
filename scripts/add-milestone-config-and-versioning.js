// Idempotent migration for the extended milestone configuration:
//  - Adds config columns (allow_upload, allow_update, requires_evaluation, evaluator_role)
//    to milestones and thesis_milestones.
//  - Adds evaluation columns (evaluation, evaluated_by, evaluated_at) to thesis_milestones.
//  - Creates thesis_milestone_documents (versioned documents) and thesis_logs tables.
//  - Migrates any existing inline document on thesis_milestones into the new
//    versioned documents table (as version 1, current), then drops the inline columns.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    // 1. Create evaluator_role enum types (if missing)
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_milestones_evaluator_role') THEN
          CREATE TYPE "enum_milestones_evaluator_role" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_milestones_evaluator_role') THEN
          CREATE TYPE "enum_thesis_milestones_evaluator_role" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
      END $$;
    `);
    console.log('  ✓ Evaluator-Role ENUM-Typen sichergestellt.');

    // 2. Add config columns to milestones
    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "allow_upload" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "allow_update" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "requires_evaluation" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "evaluator_role" "enum_milestones_evaluator_role";
    `);
    console.log('  ✓ Konfigurationsspalten auf milestones ergänzt.');

    // 3. Add config + evaluation columns to thesis_milestones
    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "allow_upload" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "allow_update" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "requires_evaluation" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "evaluator_role" "enum_thesis_milestones_evaluator_role",
        ADD COLUMN IF NOT EXISTS "evaluation" TEXT,
        ADD COLUMN IF NOT EXISTS "evaluated_by" INTEGER REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "evaluated_at" TIMESTAMP WITH TIME ZONE;
    `);
    console.log('  ✓ Konfigurations- und Bewertungsspalten auf thesis_milestones ergänzt.');

    // 4. Create the new tables (thesis_milestone_documents, thesis_logs). sync() never drops data.
    await sequelize.sync();
    console.log('  ✓ Tabellen thesis_milestone_documents und thesis_logs sichergestellt.');

    // 5. Migrate any existing inline document into the versioned documents table.
    const [inlineCol] = await sequelize.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='thesis_milestones' AND column_name='file_path';
    `);
    if (inlineCol.length > 0) {
      const [migrated] = await sequelize.query(`
        INSERT INTO "thesis_milestone_documents"
          ("thesis_milestone_id","file_name","file_path","mime_type","file_size","version","is_current","uploaded_by","uploaded_at","created_at","updated_at")
        SELECT id, file_name, file_path, mime_type, file_size, 1, true, uploaded_by,
               COALESCE(uploaded_at, NOW()), NOW(), NOW()
        FROM "thesis_milestones"
        WHERE file_path IS NOT NULL
        RETURNING id;
      `);
      console.log(`  ✓ ${migrated.length} bestehende Inline-Dokumente migriert.`);

      // 6. Drop the now-unused inline columns.
      await sequelize.query(`
        ALTER TABLE "thesis_milestones"
          DROP COLUMN IF EXISTS "file_name",
          DROP COLUMN IF EXISTS "file_path",
          DROP COLUMN IF EXISTS "mime_type",
          DROP COLUMN IF EXISTS "file_size",
          DROP COLUMN IF EXISTS "uploaded_by",
          DROP COLUMN IF EXISTS "uploaded_at";
      `);
      console.log('  ✓ Alte Inline-Dokumentspalten entfernt.');
    }

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
