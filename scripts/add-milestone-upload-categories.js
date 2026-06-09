// Idempotente Migration: Upload-Kategorien pro Meilenstein.
//   - milestone_upload_categories(milestone_id, upload_category_id, position)
//   - thesis_milestone_upload_categories(thesis_milestone_id, upload_category_id, position)
//   - thesis_milestone_documents.upload_category_id (FK, NULL = unkategorisiert/Legacy)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "milestone_upload_categories" (
        "milestone_id" INTEGER NOT NULL REFERENCES "milestones"("id") ON DELETE CASCADE,
        "upload_category_id" INTEGER NOT NULL REFERENCES "upload_categories"("id") ON DELETE RESTRICT,
        "position" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("milestone_id", "upload_category_id")
      );
    `);
    console.log('  ok  milestone_upload_categories');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "thesis_milestone_upload_categories" (
        "thesis_milestone_id" INTEGER NOT NULL REFERENCES "thesis_milestones"("id") ON DELETE CASCADE,
        "upload_category_id" INTEGER NOT NULL REFERENCES "upload_categories"("id") ON DELETE RESTRICT,
        "position" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("thesis_milestone_id", "upload_category_id")
      );
    `);
    console.log('  ok  thesis_milestone_upload_categories');

    await sequelize.query(`
      ALTER TABLE "thesis_milestone_documents"
        ADD COLUMN IF NOT EXISTS "upload_category_id" INTEGER NULL;
    `);
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'thesis_milestone_documents'
            AND constraint_name = 'thesis_milestone_documents_upload_category_id_fkey'
        ) THEN
          ALTER TABLE "thesis_milestone_documents"
            ADD CONSTRAINT "thesis_milestone_documents_upload_category_id_fkey"
            FOREIGN KEY ("upload_category_id")
            REFERENCES "upload_categories"("id")
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);
    console.log('  ok  thesis_milestone_documents.upload_category_id (+FK)');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
