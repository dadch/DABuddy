// Idempotent migration: milestone approval (Freigabe) feature.
//  - Adds requires_approval / approver_role to milestones + thesis_milestones.
//  - Adds approved_by / approved_at to thesis_milestones.
//  - Adds 'milestone_approved' / 'milestone_revoked' to the thesis_logs action enum.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

async function run() {
  try {
    // approver_role enum types
    await sequelize.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_milestones_approver_role') THEN
          CREATE TYPE "enum_milestones_approver_role" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_thesis_milestones_approver_role') THEN
          CREATE TYPE "enum_thesis_milestones_approver_role" AS ENUM ('student','coach','expert','admin','department_lead','field_project_coach');
        END IF;
      END $$;
    `);
    console.log('  ✓ approver_role ENUM-Typen sichergestellt.');

    await sequelize.query(`
      ALTER TABLE "milestones"
        ADD COLUMN IF NOT EXISTS "requires_approval" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "approver_role" "enum_milestones_approver_role";
    `);
    console.log('  ✓ milestones.requires_approval / approver_role ergänzt.');

    await sequelize.query(`
      ALTER TABLE "thesis_milestones"
        ADD COLUMN IF NOT EXISTS "requires_approval" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "approver_role" "enum_thesis_milestones_approver_role",
        ADD COLUMN IF NOT EXISTS "approved_by" INTEGER REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP WITH TIME ZONE;
    `);
    console.log('  ✓ thesis_milestones Freigabe-Spalten ergänzt.');

    // New log action enum values (ADD VALUE cannot run inside a transaction; run separately)
    await sequelize.query(`ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'milestone_approved';`);
    await sequelize.query(`ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'milestone_revoked';`);
    console.log('  ✓ thesis_logs action-Werte ergänzt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
