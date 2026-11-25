// Idempotente Migration: "Alle benachrichtigen" der Fachbereichsleitung.
//
// Neue Tabellen:
//   - department_broadcasts           (eine Zeile pro Rundmail)
//   - department_broadcast_recipients (eine Zeile pro Empfänger inkl. Status)
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "department_broadcasts" (
        "id" SERIAL PRIMARY KEY,
        "sender_user_id" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "sender_name" VARCHAR(255) NOT NULL,
        "year_id" INTEGER NULL REFERENCES "years"("id") ON DELETE SET NULL,
        "department_ids" INTEGER[] NOT NULL DEFAULT '{}',
        "recipient_mode" VARCHAR(16) NOT NULL,
        "subject" VARCHAR(255) NOT NULL,
        "body" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_department_broadcasts_department_ids"
      ON "department_broadcasts" USING GIN ("department_ids");
    `);
    console.log('  ok  department_broadcasts');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "department_broadcast_recipients" (
        "id" SERIAL PRIMARY KEY,
        "broadcast_id" INTEGER NOT NULL REFERENCES "department_broadcasts"("id") ON DELETE CASCADE,
        "user_id" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "name" VARCHAR(255) NOT NULL,
        "email" VARCHAR(255) NOT NULL,
        "roles" VARCHAR(64) NOT NULL,
        "status" VARCHAR(16) NOT NULL,
        "error" TEXT NULL,
        "sent_at" TIMESTAMPTZ NULL
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "department_broadcast_recipients_broadcast_id"
      ON "department_broadcast_recipients" ("broadcast_id");
    `);
    console.log('  ok  department_broadcast_recipients');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
