// Idempotente Migration: Dokumentvorlagen-Bereich.
//   - document_templates(id, description, original_filename, stored_path,
//                        mime_type, size_bytes, uploaded_by_user_id,
//                        created_at, updated_at)
//   Beschreibung ist UNIQUE (case-insensitiv) — pro Vorlage genau ein Eintrag.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "document_templates" (
        "id" SERIAL PRIMARY KEY,
        "description" VARCHAR(255) NOT NULL,
        "original_filename" VARCHAR(255) NOT NULL,
        "stored_path" VARCHAR(500) NOT NULL,
        "mime_type" VARCHAR(150),
        "size_bytes" BIGINT,
        "uploaded_by_user_id" INTEGER NULL
          REFERENCES "users"("id") ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('  ok  document_templates');

    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "document_templates_description_lower_unique"
      ON "document_templates" (LOWER("description"));
    `);
    console.log('  ok  unique(description) — case-insensitive');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
