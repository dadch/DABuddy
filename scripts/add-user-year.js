// Idempotente Migration: Studierenden-Datensätze bekommen ein Diplomjahr.
//
//   - users.year_id  (INTEGER NULL, FK -> years.id, ON DELETE SET NULL)
//
// Nur Studierende (role='student') werden pro Diplomjahr geführt. Andere
// Rollen (Dozent, Expert, FBL, FPC, Admin) bleiben jahresübergreifend.
//
// Backfill für bestehende Studierende:
//   1. Wenn der/die Studierende an einer DA hängt: das (jüngste) year_id
//      dieser DA(s) übernehmen.
//   2. Sonst: das aktuell markierte Diplomjahr (is_current) übernehmen.
//   3. Wenn nichts davon vorhanden ist: NULL belassen.
const { sequelize } = require('../src/models');

(async () => {
  try {
    await sequelize.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "year_id" INTEGER NULL
        REFERENCES "years"("id") ON DELETE SET NULL;
    `);
    console.log('  ok  users.year_id');

    // Backfill Studierende, deren year_id noch NULL ist.
    // 1) Aus DA-Verknüpfung: nimm das jüngste year_id (Year mit höchster year-Nummer).
    const [assigned] = await sequelize.query(`
      UPDATE "users" u
      SET "year_id" = sub.year_id
      FROM (
        SELECT ts.student_id, y.id AS year_id
        FROM "thesis_students" ts
        JOIN "theses"  t ON t.id = ts.thesis_id
        JOIN "years"   y ON y.id = t.year_id
        WHERE (ts.student_id, y.year) IN (
          SELECT ts2.student_id, MAX(y2.year)
          FROM "thesis_students" ts2
          JOIN "theses"  t2 ON t2.id = ts2.thesis_id
          JOIN "years"   y2 ON y2.id = t2.year_id
          GROUP BY ts2.student_id
        )
      ) sub
      WHERE u.id = sub.student_id
        AND u."role" = 'student'
        AND u."year_id" IS NULL;
    `);
    console.log(`  ok  Backfill über Diplomarbeiten (${(assigned && assigned.rowCount) || 0} Studierende).`);

    // 2) Restliche Studierende ohne year_id → aktuelles Diplomjahr.
    const [orphan] = await sequelize.query(`
      UPDATE "users"
      SET "year_id" = (SELECT id FROM "years" WHERE is_current = true LIMIT 1)
      WHERE "role" = 'student' AND "year_id" IS NULL
        AND EXISTS (SELECT 1 FROM "years" WHERE is_current = true);
    `);
    console.log(`  ok  Backfill über aktuelles Diplomjahr (${(orphan && orphan.rowCount) || 0} Studierende).`);

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
