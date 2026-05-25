// Idempotent migration: adds the 'field_project_coach' role to existing ENUMs
// and creates the thesis_field_project_coaches join table on an existing system.
// Safe to run multiple times; existing data is preserved.

const { sequelize } = require('../src/models');

const ENUM_TYPES = [
  'enum_users_role',
  'enum_milestones_responsible_role',
  'enum_thesis_milestones_responsible_role',
];

async function run() {
  try {
    for (const typeName of ENUM_TYPES) {
      await sequelize.query(
        `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'field_project_coach';`
      );
      console.log(`  ✓ ${typeName}: Wert 'field_project_coach' sichergestellt.`);
    }

    // Creates the join table thesis_field_project_coaches if it doesn't exist.
    // sync() never drops existing tables/data.
    await sequelize.sync();
    console.log('  ✓ Join-Tabelle thesis_field_project_coaches sichergestellt.');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
