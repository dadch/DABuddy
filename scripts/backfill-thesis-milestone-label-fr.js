// Idempotenter Backfill: thesis_milestones.label_fr aus der Meilenstein-Vorlage
// nachtragen. Betrifft Snapshots, die vor der Einführung der label_fr-Kopie
// angelegt wurden. Überschreibt nichts, was bereits gesetzt ist.
const { sequelize } = require('../src/models');

(async () => {
  try {
    const [, meta] = await sequelize.query(`
      UPDATE thesis_milestones tm
      SET label_fr = m.label_fr
      FROM milestones m
      WHERE tm.milestone_id = m.id
        AND (tm.label_fr IS NULL OR tm.label_fr = '')
        AND m.label_fr IS NOT NULL AND m.label_fr <> '';
    `);
    console.log(`  ok  ${meta.rowCount} Snapshot(s) mit label_fr nachgetragen.`);
    const [[rest]] = await sequelize.query(`
      SELECT count(*) AS n FROM thesis_milestones
      WHERE (label_fr IS NULL OR label_fr = '');
    `);
    console.log(`  info  ${rest.n} Snapshot(s) weiterhin ohne label_fr (Vorlage gelöscht oder Vorlage ohne FR-Bezeichnung).`);
    console.log('Backfill abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('Backfill-Fehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
