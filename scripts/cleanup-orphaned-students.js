// Bereinigung nach gelöschtem Diplomjahr (users.year_id steht auf
// ON DELETE SET NULL — Studierende wurden beim Jahr-Löschen nur entkoppelt,
// nicht gelöscht).
//
// Entfernt:
//   1. Diplomarbeiten, deren Diplomjahr nicht mehr existiert (inkl. aller
//      hochgeladenen Dokument-Dateien).
//   2. Diplomarbeiten, deren sämtliche Studierende verwaist sind
//      (Rolle student, year_id NULL) — "deren Arbeiten".
//   3. Verwaiste Studierende (Rolle student, year_id NULL).
//
// Standard ist ein DRY-RUN (nur anzeigen). Erst mit --apply wird gelöscht.
//   node scripts/cleanup-orphaned-students.js            # anzeigen
//   node scripts/cleanup-orphaned-students.js --apply    # löschen
const fs = require('fs');
const { sequelize, User, Thesis, Year, ThesisMilestone, ThesisMilestoneDocument } = require('../src/models');

const APPLY = process.argv.includes('--apply');

async function deleteThesisWithFiles(thesis) {
  const tms = await ThesisMilestone.findAll({
    where: { thesis_id: thesis.id },
    include: [{ model: ThesisMilestoneDocument, as: 'documents' }],
  });
  let files = 0;
  for (const m of tms) {
    for (const doc of (m.documents || [])) {
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        try { fs.unlinkSync(doc.file_path); files++; } catch (e) { console.error('  ! Datei nicht löschbar:', doc.file_path, e.message); }
      }
    }
  }
  await thesis.destroy();
  return files;
}

(async () => {
  try {
    console.log(APPLY ? '== BEREINIGUNG (--apply) ==' : '== DRY-RUN (nichts wird gelöscht; --apply zum Ausführen) ==');

    const validYearIds = (await Year.findAll({ attributes: ['id'] })).map(y => y.id);

    // 1) DAs mit nicht mehr existierendem Jahr
    const orphanTheses = await Thesis.findAll({
      where: validYearIds.length ? { year_id: { [require('sequelize').Op.notIn]: validYearIds } } : {},
      include: [{ model: User, as: 'students', attributes: ['id', 'firstname', 'name'] }],
    });

    // 2) Verwaiste Studierende
    const orphanStudents = await User.findAll({
      where: { role: 'student', year_id: null },
      include: [{ model: Thesis, as: 'studentTheses', attributes: ['id', 'title', 'year_id'], through: { attributes: [] } }],
    });
    const orphanStudentIds = new Set(orphanStudents.map(s => s.id));

    // 3) DAs (mit gültigem Jahr), deren sämtliche Studierende verwaist sind
    const thesesOfOrphans = new Map();
    for (const s of orphanStudents) {
      for (const t of (s.studentTheses || [])) thesesOfOrphans.set(t.id, t);
    }
    const alsoDeleteTheses = [];
    for (const [id] of thesesOfOrphans) {
      if (orphanTheses.some(t => t.id === id)) continue; // schon in Liste 1
      const t = await Thesis.findByPk(id, { include: [{ model: User, as: 'students', attributes: ['id'] }] });
      if (t && t.students.length > 0 && t.students.every(s => orphanStudentIds.has(s.id))) {
        alsoDeleteTheses.push(t);
      }
    }

    console.log(`\nDiplomarbeiten ohne gültiges Diplomjahr: ${orphanTheses.length}`);
    for (const t of orphanTheses) {
      console.log(`  - [${t.id}] "${t.title}" (year_id=${t.year_id}) — Studierende: ${(t.students || []).map(s => s.firstname + ' ' + s.name).join(', ') || 'keine'}`);
    }
    console.log(`\nDiplomarbeiten, deren Studierende alle verwaist sind: ${alsoDeleteTheses.length}`);
    for (const t of alsoDeleteTheses) console.log(`  - [${t.id}] "${t.title}"`);
    console.log(`\nVerwaiste Studierende (Rolle student, ohne Diplomjahr): ${orphanStudents.length}`);
    for (const s of orphanStudents) console.log(`  - [${s.id}] ${s.firstname} ${s.name} <${s.email}>`);

    if (!APPLY) {
      console.log('\nDRY-RUN beendet. Zum tatsächlichen Löschen: node scripts/cleanup-orphaned-students.js --apply');
      process.exit(0);
    }

    let filesDeleted = 0;
    for (const t of [...orphanTheses, ...alsoDeleteTheses]) {
      filesDeleted += await deleteThesisWithFiles(t);
      console.log(`  ok  DA [${t.id}] gelöscht`);
    }
    for (const s of orphanStudents) {
      await s.destroy();
      console.log(`  ok  Studierende(r) [${s.id}] ${s.email} gelöscht`);
    }

    console.log(`\nBereinigung abgeschlossen: ${orphanTheses.length + alsoDeleteTheses.length} DA(s), ${orphanStudents.length} Studierende, ${filesDeleted} Datei(en).`);
    process.exit(0);
  } catch (err) {
    console.error('Bereinigungsfehler:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
