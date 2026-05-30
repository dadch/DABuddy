// Idempotente Migration:
//   - Tabelle user_roles(user_id INT FK, role enum_users_role) mit UNIQUE(user_id, role)
//   - Spalte users.last_active_role (enum_users_role, NULL) — zuletzt aktive Rolle pro User
//   - Bestehende users.role wird in user_roles dupliziert (Primärrolle ist immer in user_roles)
const { sequelize } = require('../src/models');

(async () => {
  try {
    // user_roles Tabelle
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" "enum_users_role" NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        PRIMARY KEY ("user_id", "role")
      );
    `);
    console.log('  ok  user_roles table');

    // last_active_role: gleicher ENUM wie users.role
    await sequelize.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "last_active_role" "enum_users_role" NULL;
    `);
    console.log('  ok  users.last_active_role');

    // Bestehende Primärrolle in user_roles spiegeln (idempotent durch ON CONFLICT DO NOTHING)
    await sequelize.query(`
      INSERT INTO "user_roles" ("user_id", "role", "created_at", "updated_at")
      SELECT "id", "role", now(), now() FROM "users"
      ON CONFLICT ("user_id", "role") DO NOTHING;
    `);
    console.log('  ok  Primärrollen in user_roles dupliziert.');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
