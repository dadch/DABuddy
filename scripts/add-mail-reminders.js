// Idempotente Migration: Mail-Erinnerungen-Feature.
//
// Ergänzungen an Meilenstein-Vorlagen und -Snapshots:
//   - reminder_start_at        (TIMESTAMPTZ NULL) — Datum ab dem Erinnerungen gesendet werden
//   - reminder_period_days     (INT NULL DEFAULT 7) — Wiederholungsintervall
//   - Per-Kind Bewertungs-Fälligkeiten (jedes NULL, muss > due_at liegen):
//     * single_due_at, first_due_at, second_due_at, final_due_at
//   - feedback_due_at          (TIMESTAMPTZ NULL) — Abgabedatum Feedbackformular
//
// Zusätzlich auf thesis_milestones die "overridden"-Flags analog zu due_at_overridden.
//
// Neue Tabelle "mail_reminders" für Deduplizierung:
//   (thesis_milestone_id, kind, recipient_user_id, sent_at)
//
// Log-Enum-Erweiterung um 'reminder_sent'.
const { sequelize } = require('../src/models');

async function addCols(table, cols) {
  for (const [name, ddl] of cols) {
    await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${name}" ${ddl};`);
    console.log(`  ok  ${table}.${name}`);
  }
}

(async () => {
  try {
    // Meilenstein-Vorlagen
    await addCols('milestones', [
      ['reminder_start_at',    'TIMESTAMPTZ NULL'],
      ['reminder_period_days', 'INTEGER NULL DEFAULT 7'],
      ['single_due_at',        'TIMESTAMPTZ NULL'],
      ['first_due_at',         'TIMESTAMPTZ NULL'],
      ['second_due_at',        'TIMESTAMPTZ NULL'],
      ['final_due_at',         'TIMESTAMPTZ NULL'],
      ['feedback_due_at',      'TIMESTAMPTZ NULL'],
    ]);

    // Meilenstein-Snapshots (kopierte Werte + individuelle Overrides)
    await addCols('thesis_milestones', [
      ['reminder_start_at',           'TIMESTAMPTZ NULL'],
      ['reminder_period_days',        'INTEGER NULL DEFAULT 7'],
      ['reminder_start_at_overridden','BOOLEAN NOT NULL DEFAULT false'],
      ['reminder_period_days_overridden','BOOLEAN NOT NULL DEFAULT false'],
      ['single_due_at',        'TIMESTAMPTZ NULL'],
      ['first_due_at',         'TIMESTAMPTZ NULL'],
      ['second_due_at',        'TIMESTAMPTZ NULL'],
      ['final_due_at',         'TIMESTAMPTZ NULL'],
      ['feedback_due_at',      'TIMESTAMPTZ NULL'],
      ['single_due_at_overridden',   'BOOLEAN NOT NULL DEFAULT false'],
      ['first_due_at_overridden',    'BOOLEAN NOT NULL DEFAULT false'],
      ['second_due_at_overridden',   'BOOLEAN NOT NULL DEFAULT false'],
      ['final_due_at_overridden',    'BOOLEAN NOT NULL DEFAULT false'],
      ['feedback_due_at_overridden', 'BOOLEAN NOT NULL DEFAULT false'],
    ]);

    // Erinnerungs-Protokoll (Deduplication)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "mail_reminders" (
        "id" SERIAL PRIMARY KEY,
        "thesis_milestone_id" INTEGER NOT NULL REFERENCES "thesis_milestones"("id") ON DELETE CASCADE,
        "kind" VARCHAR(32) NOT NULL,
        "recipient_user_id" INTEGER NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "recipient_email" VARCHAR(255) NULL,
        "sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_mail_reminders_tm_kind_user"
      ON "mail_reminders" ("thesis_milestone_id", "kind", "recipient_user_id");
    `);
    console.log('  ok  mail_reminders');

    // Log-Enum
    await sequelize.query(`ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS 'reminder_sent';`);
    console.log('  ok  enum_thesis_logs_action += reminder_sent');

    console.log('Migration abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Migrationsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
