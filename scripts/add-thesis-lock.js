// Idempotente Migration: Sperren einer Diplomarbeit (abgebrochene Arbeiten).
//   - theses.is_locked            (BOOLEAN NOT NULL DEFAULT false)
//   - theses.locked_at            (TIMESTAMPTZ NULL)
//   - theses.locked_by_user_id    (INT NULL, FK -> users.id, ON DELETE SET NULL)
//   - theses.locked_reason        (TEXT NULL)
//   - thesis_logs.action ENUM erweitert um 'thesis_locked' und 'thesis_unlocked'
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  theses.is_locked');

    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "locked_by_user_id" INTEGER NULL
        REFERENCES "users"("id") ON DELETE SET NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "theses"
        ADD COLUMN IF NOT EXISTS "locked_reason" TEXT NULL;
    `);
    console.log('  ok  theses.locked_at / locked_by_user_id / locked_reason');

    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'thesis_locked';
    `);
    await sequelize.query(`
      ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'thesis_unlocked';
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
