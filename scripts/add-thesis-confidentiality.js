// Idempotente Migration:
//   - theses.is_confidential                      (BOOLEAN NOT NULL DEFAULT false)
//   - theses.confidentiality_document_path        (VARCHAR NULL)
//   - theses.confidentiality_document_filename    (VARCHAR NULL)
//   - thesis_logs.action ENUM erweitert um 'confidentiality_uploaded' und 'confidentiality_deleted'
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "is_confidential" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  theses.is_confidential');

    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "confidentiality_document_path" VARCHAR(255) NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "confidentiality_document_filename" VARCHAR(255) NULL;
    `);
    console.log('  ok  theses.confidentiality_document_path/filename');

    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'confidentiality_uploaded';
    `);
    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'confidentiality_deleted';
    `);
    console.log('  ok  enum_thesis_logs_action erweitert');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
