// Einmal-Skript: Setzt das Passwort des Admin-Benutzers (Benutzername "admin") zurück.
// Das Speichern via .save() löst den beforeUpdate-Hook des User-Modells aus, der das
// Passwort mit bcrypt hasht.
const { sequelize, User } = require('../src/models');

const NEW_PASSWORD = 'passwort123';

(async () => {
  try {
    const user = await User.findOne({ where: { username: 'admin' } });
    if (!user) {
      console.error('Kein Benutzer mit Benutzername "admin" gefunden.');
      process.exit(1);
    }

    user.password = NEW_PASSWORD;
    await user.save();

    const ok = await user.validatePassword(NEW_PASSWORD);
    console.log(`Passwort für "admin" zurückgesetzt. Verifikation: ${ok ? 'OK' : 'FEHLGESCHLAGEN'}`);
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('Fehler beim Zurücksetzen des Passworts:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
