// Idempotent migration: second approval slot (Freigabe 2).
//  - Adds requires_approval_2 / approver_role_2 to milestones + thesis_milestones.
//  - Adds approved_by_2 / approved_at_2 to thesis_milestones.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_milestones_approver_role_2') THEN
          CREATE TYPE "enum_milestones_approver_role_2" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_milestones_approver_role_2') THEN
          CREATE TYPE "enum_thesis_milestones_approver_role_2" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
      END $$;
    `);
    console.log('  ✓ approver_role_2 ENUM-Typen sichergestellt.');

    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "requires_approval_2" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "approver_role_2" "enum_milestones_approver_role_2";
    `);
    console.log('  ✓ milestones Slot-2-Spalten ergänzt.');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "requires_approval_2" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "approver_role_2" "enum_thesis_milestones_approver_role_2",
        ADD COLUMN IF NOT EXISTS "approved_by_2" INTEGER REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approved_at_2" TIMESTAMP WITH TIME ZONE;
    `);
    console.log('  ✓ thesis_milestones Slot-2-Spalten ergänzt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
