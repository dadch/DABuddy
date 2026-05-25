// Idempotent migration: widen criterion label columns from VARCHAR(255) to TEXT
// so long (Markdown) criterion designations can be stored. Safe + non-destructive.

const { sequelize } = require('../src/models');

async function run() {
  try {
    await sequelize.query(`
      ALTER TABLE "evaluation_criteria"
        ALTER COLUMN "label_de" TYPE TEXT,
        ALTER COLUMN "label_fr" TYPE TEXT;
    `);
    console.log('  ✓ evaluation_criteria.label_de/label_fr -> TEXT');

    await sequelize.query(`
      ALTER TABLE "thesis_evaluation_criteria"
        ALTER COLUMN "label" TYPE TEXT;
    `);
    console.log('  ✓ thesis_evaluation_criteria.label -> TEXT');

    console.log('\nMigration abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler bei der Migration:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
