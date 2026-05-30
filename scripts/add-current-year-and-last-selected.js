// Idempotente Migration:
//   - years.is_current  (BOOLEAN NOT NULL DEFAULT false)
//   - users.last_selected_year_id  (INTEGER NULL, FK -> years.id ON DELETE SET NULL)
//
// Anschliessend: Sicherstellen, dass genau ein Jahr als aktuell markiert ist.
// Reihenfolge bei der Auswahl des Fallback-Jahres:
//   1) Jahr 2026, wenn vorhanden
//   2) sonst das numerisch höchste Jahr
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "years"
        ADD COLUMN IF NOT EXISTS "is_current" BOOLEAN NOT NULL DEFAULT false;
    `);
    console.log('  ok  years.is_current');

    await sequelize.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "last_selected_year_id" INTEGER NULL;
    `);
    // FK erst hinzufügen, wenn er noch nicht existiert.
    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'users'
            AND constraint_name = 'users_last_selected_year_id_fkey'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "users_last_selected_year_id_fkey"
            FOREIGN KEY ("last_selected_year_id")
            REFERENCES "years"("id")
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);
    console.log('  ok  users.last_selected_year_id (+FK)');

    // Falls noch kein Jahr aktuell ist, eines auswählen.
    const [[{ count }]] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM "years" WHERE "is_current" = true;`
    );
    if (count === 0) {
      const [[fallback]] = await sequelize.query(`
        SELECT "id", "year" FROM "years"
        ORDER BY ("year" = 2026) DESC, "year" DESC
        LIMIT 1;
      `);
      if (fallback) {
        await sequelize.query(
          `UPDATE "years" SET "is_current" = true WHERE "id" = ${fallback.id};`
        );
        console.log(`  ok  Jahr ${fallback.year} als aktuell markiert.`);
      } else {
        console.log('  -- kein Jahr vorhanden; bitte zuerst ein Diplomjahr anlegen.');
      }
    } else if (count > 1) {
      // Mehr als ein Jahr aktuell → nur das jüngste behalten.
      await sequelize.query(`
        UPDATE "years" SET "is_current" = false
        WHERE "id" NOT IN (
          SELECT "id" FROM "years" WHERE "is_current" = true
          ORDER BY "year" DESC LIMIT 1
        );
      `);
      console.log('  ok  Mehrfache Markierungen bereinigt.');
    } else {
      console.log('  -- es ist bereits ein Jahr als aktuell markiert.');
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
