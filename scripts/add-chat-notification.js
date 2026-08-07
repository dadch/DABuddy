// Idempotente Migration für Chat-Mail-Benachrichtigungen:
//   - Spalte chat_messages.notified_at (timestamptz, NULL = noch nicht benachrichtigt)
//   - Bestehende Nachrichten werden beim ERSTEN Lauf als bereits benachrichtigt
//     markiert, damit der Deploy keine Mailflut für historische Nachrichten auslöst.
const { sequelize } = require('../src/models');

(async () => {
  try {
    const [cols] = await sequelize.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chat_messages' AND column_name = 'notified_at';
    `);
    if (cols.length > 0) {
      console.log('  ok  chat_messages.notified_at existiert bereits — nichts zu tun.');
    } else {
      await sequelize.query(`
        ALTER TABLE "chat_messages"
          ADD COLUMN "notified_at" TIMESTAMP WITH TIME ZONE NULL;
      `);
      const [, meta] = await sequelize.query(`
        UPDATE "chat_messages" SET "notified_at" = now();
      `);
      console.log(`  ok  Spalte angelegt; ${meta.rowCount} bestehende Nachricht(en) als benachrichtigt markiert.`);
    }
    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
