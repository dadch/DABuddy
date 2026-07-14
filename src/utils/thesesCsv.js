// Erzeugt die "Diplomarbeitenliste als CSV" aus einer bereits geladenen
// Thesis-Sammlung. Das Format ist identisch zu dem, was der Admin/FBL im
// Kebab-Menü unter „Diplomarbeitenliste als CSV" bekommt. Wird u.a. vom
// Sekretariats-Job als Anhang verwendet.
//
// Erwartete Struktur pro Thesis (Sequelize-Instanz oder Plain-Object):
//   { title, sponsor, students:[{name,firstname}], coaches:[…], experts:[…],
//     department:{name} }

function sanitize(v) {
  return String(v == null ? '' : v).replace(/[;\r\n]+/g, ' ').trim();
}

function buildThesesCsv(theses) {
  const rows = [];
  for (const t of (theses || [])) {
    const coachNames  = (t.coaches  || []).map(c => `${c.name || ''}, ${c.firstname || ''}`.replace(/^, |, $/g, '')).join(' / ');
    const expertNames = (t.experts  || []).map(e => `${e.name || ''}, ${e.firstname || ''}`.replace(/^, |, $/g, '')).join(' / ');
    const deptName    = (t.department && t.department.name) || '';
    const language    = t.language === 'fr' ? 'Französisch' : 'Deutsch';
    const students    = t.students || [];
    const repetSuffix = t.is_repetent ? ' (Repetent)' : '';
    const baseRow = {
      title: t.title || '',
      language,
      department: deptName,
      coach: coachNames,
      expert: expertNames,
      sponsor: t.sponsor || '',
    };
    if (students.length === 0) {
      rows.push({ lastName: '', firstName: repetSuffix.trimStart(), ...baseRow });
    } else {
      for (const s of students) {
        rows.push({ lastName: s.name || '', firstName: (s.firstname || '') + repetSuffix, ...baseRow });
      }
    }
  }
  // Sortierung: Nachname, Vorname (ohne den „(Repetent)"-Suffix).
  const stripRep = (s) => (s || '').replace(/\s*\(Repetent\)\s*$/, '');
  rows.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'de-CH')
    || stripRep(a.firstName).localeCompare(stripRep(b.firstName), 'de-CH'));

  const header = ['Nachname', 'Vorname', 'Titel der Diplomarbeit', 'Sprache', 'Fachbereich', 'Dozent/in', 'Expert/in', 'Auftraggeber'];
  const lines = [header.join(';')];
  for (const row of rows) {
    lines.push([row.lastName, row.firstName, row.title, row.language, row.department, row.coach, row.expert, row.sponsor].map(sanitize).join(';'));
  }
  // UTF-8 BOM, damit Excel die Datei korrekt mit Umlauten öffnet.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = { buildThesesCsv };
