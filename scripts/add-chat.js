// Idempotente Migration: Chat pro Diplomarbeit.
//   - chat_messages(id, thesis_id, user_id, content, document_path, document_filename,
//                   document_mimetype, document_size, created_at, updated_at)
//   - chat_read_receipts(message_id, user_id, read_at)  PK(message_id, user_id)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" SERIAL PRIMARY KEY,
        "thesis_id" INTEGER NOT NULL REFERENCES "theses"("id") ON DELETE CASCADE,
        "user_id" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "content" TEXT NULL,
        "document_path" VARCHAR(500) NULL,
        "document_filename" VARCHAR(255) NULL,
        "document_mimetype" VARCHAR(100) NULL,
        "document_size" INTEGER NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "chat_messages_thesis_id_idx" ON "chat_messages"("thesis_id");
    `);
    console.log('  ok  chat_messages');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "chat_read_receipts" (
        "message_id" INTEGER NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "read_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("message_id", "user_id")
      );
    `);
    console.log('  ok  chat_read_receipts');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
