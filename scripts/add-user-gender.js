// Idempotent migration: adds the gender (m/w/d) column to users.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_gender') THEN
          CREATE TYPE "enum_users_gender" AS ENUM ('m','w','d');
        END IF;
      END $$;
    `);
    await sequelize.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" "enum_users_gender";`);
    console.log('  ✓ users.gender sichergestellt.');
    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
