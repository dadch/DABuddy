const { sequelize, User, Department, Year } = require('../src/models');

// Idempotent first-init seed.
// - Creates missing tables (sequelize.sync without force, no data is dropped).
// - Inserts default Departments / Year / admin user only if they don't already exist.
// Safe to run on an already-populated system.

async function seedDatabase() {
  try {
    console.log('Synchronizing schema (creating missing tables, no data is dropped)...');
    await sequelize.sync();

    const departmentNames = [
      'Informatik',
      'Maschinenbau',
      'Prozesstechnik',
      'Elektrotechnik',
      'Energie und Umwelttechnik',
      'Systemtechnik',
      'Gebäudeautomation',
    ];

    for (const name of departmentNames) {
      const [, created] = await Department.findOrCreate({
        where: { name },
        defaults: { name, department_lead_id: null },
      });
      if (created) console.log(`  + Fachbereich "${name}" angelegt.`);
    }

    const [year2026, yearCreated] = await Year.findOrCreate({
      where: { year: 2026 },
      defaults: { year: 2026, is_current: true },
    });
    if (yearCreated) console.log('  + Diplomjahr 2026 angelegt (als aktuell markiert).');

    // Falls noch kein Jahr als aktuell markiert ist, 2026 nehmen.
    const currentCount = await Year.count({ where: { is_current: true } });
    if (currentCount === 0) {
      year2026.is_current = true;
      await year2026.save();
      console.log('  + Diplomjahr 2026 nachträglich als aktuell markiert.');
    }

    const [, adminCreated] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        username: 'admin',
        password: 'password123',
        name: 'Administrator',
        firstname: 'System',
        email: 'admin@university.com',
        role: 'admin',
      },
    });
    if (adminCreated) console.log('  + Admin-Konto angelegt (admin / password123).');

    console.log('\nGrundinitialisierung abgeschlossen. Bestehende Daten wurden nicht angetastet.');
  } catch (error) {
    console.error('Fehler beim Seeding:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seedDatabase();
