// Idempotente Migration: Telefonnummer pro Benutzer (optional).
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "phone" VARCHAR(40) NULL;
    `);
    console.log('  ok  users.phone');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
