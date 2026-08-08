// Setzt für alle Nicht-Admin-Konten ein zufälliges, nicht verwendbares Passwort.
// Hintergrund: Die Plattform wird über M365-Login genutzt; der lokale
// Passwort-Login ist nur für Administratoren erlaubt. Damit bekannte Default-
// Passwörter (z.B. das frühere 'password123' für Studierende) nicht mehr als
// Angriffsfläche taugen, werden bestehende Nicht-Admin-Passwörter überschrieben.
//
// Admin-Konten (Primärrolle admin ODER admin in user_roles) bleiben unangetastet.
// Mehrfaches Ausführen ist unschädlich (setzt jeweils neue Zufallswerte).
//
//   node scripts/randomize-nonadmin-passwords.js          # anzeigen (Dry-Run)
//   node scripts/randomize-nonadmin-passwords.js --apply  # ausführen
const bcrypt = require('bcrypt');
const { sequelize, User, UserRole } = require('../src/models');
const { randomPassword } = require('../src/utils/passwordPolicy');

const APPLY = process.argv.includes('--apply');

(async () => {
  try {
    // Admin-User-IDs (Primärrolle oder Sekundärrolle admin).
    const [adminRows] = await sequelize.query(`
      SELECT DISTINCT u.id FROM users u
      LEFT JOIN user_roles r ON r.user_id = u.id
      WHERE u.role = 'admin' OR r.role = 'admin';
    `);
    const adminIds = new Set(adminRows.map(r => r.id));

    const users = await User.findAll({ attributes: ['id', 'username', 'role'] });
    const targets = users.filter(u => !adminIds.has(u.id));

    console.log(APPLY ? '== ANWENDEN (--apply) ==' : '== DRY-RUN (nichts wird geändert; --apply zum Ausführen) ==');
    console.log(`Admins (unangetastet): ${adminIds.size} | Nicht-Admins (Passwort wird zufällig gesetzt): ${targets.length}`);

    if (APPLY) {
      let n = 0;
      for (const u of targets) {
        const hash = await bcrypt.hash(randomPassword(), 10);
        // Direktes UPDATE, um den beforeUpdate-Hash-Hook nicht doppelt anzuwenden.
        await sequelize.query('UPDATE users SET password = :hash WHERE id = :id', { replacements: { hash, id: u.id } });
        n++;
      }
      console.log(`  ok  ${n} Nicht-Admin-Passwort(e) zufällig gesetzt.`);
    }
    console.log('Fertig.');
    process.exit(0);
  } catch (err) {
    console.error('Fehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
