// Einmal-Skript: Tauscht die Anzeige-Reihenfolge von Vorname/Nachname.
// "Vorname Nachname" → "Nachname, Vorname"
// Wirkt auf EJS-Output, JS-Template-Literals und String-Konkatenationen.
// AVATARE (firstname.charAt(0) + name.charAt(0)) bleiben unverändert, da sie
// nicht zum Lesen/Scannen gedacht sind.
const fs = require('fs');
const path = require('path');

const files = [
  'views/admin/dashboard.ejs',
  'views/admin/thesis-detail.ejs',
  'views/department_lead/dashboard.ejs',
  'views/department_lead/thesis-detail.ejs',
  'views/coach/dashboard.ejs',
  'views/coach/thesis-detail.ejs',
  'views/expert/dashboard.ejs',
  'views/expert/thesis-detail.ejs',
  'views/student/dashboard.ejs',
  'views/student/thesis-detail.ejs',
  'views/field_project_coach/dashboard.ejs',
  'views/field_project_coach/thesis-detail.ejs',
  'views/partials/confidentiality-section.ejs',
  'views/partials/student-management.ejs',
  'src/controllers/apiController.js',
  'src/controllers/authController.js',
  'src/controllers/dashboardController.js',
  'src/controllers/evaluationController.js',
  'src/utils/evaluationPdf.js',
];

// Object-Pfad: ein oder mehrere Identifier durch Punkte getrennt, z. B.
// "s", "doc.uploader", "single.evaluator", "thesis.students[0]".
// Wir verwenden eine einfache Klasse, die auch [n] und Bindestriche nicht enthält
// (Identifier + Dots).
const PATH = '[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*';

const patterns = [
  // <%= X.firstname %> <%= X.name %>  →  <%= X.name %>, <%= X.firstname %>
  {
    re: new RegExp(`<%=\\s*(${PATH})\\.firstname\\s*%>\\s+<%=\\s*\\1\\.name\\s*%>`, 'g'),
    rep: '<%= $1.name %>, <%= $1.firstname %>',
  },
  // ${X.firstname} ${X.name}  →  ${X.name}, ${X.firstname}
  {
    re: new RegExp(`\\$\\{\\s*(${PATH})\\.firstname\\s*\\}\\s+\\$\\{\\s*\\1\\.name\\s*\\}`, 'g'),
    rep: '${$1.name}, ${$1.firstname}',
  },
  // X.firstname + ' ' + X.name  →  X.name + ', ' + X.firstname  (einfache und doppelte Anführungszeichen)
  {
    re: new RegExp(`(${PATH})\\.firstname\\s*\\+\\s*'\\s'\\s*\\+\\s*\\1\\.name`, 'g'),
    rep: "$1.name + ', ' + $1.firstname",
  },
  {
    re: new RegExp(`(${PATH})\\.firstname\\s*\\+\\s*"\\s"\\s*\\+\\s*\\1\\.name`, 'g'),
    rep: '$1.name + ", " + $1.firstname',
  },
  // 'von ' + X.firstname + ' ' + X.name  →  'von ' + X.name + ', ' + X.firstname
  // (wird durch Pattern oben bereits erfasst)
  // Standalone (kein Objektpräfix): firstname + ' ' + name  →  name + ', ' + firstname
  // Achtung: nur, wenn vorher KEIN Punkt-Identifier steht. Wir nutzen Lookbehind.
  {
    re: /(^|[^A-Za-z0-9_.])firstname\s*\+\s*'\s'\s*\+\s*name\b/g,
    rep: "$1name + ', ' + firstname",
  },
];

let totalReplaced = 0;
const summary = [];

for (const rel of files) {
  const p = path.join(__dirname, '..', rel);
  if (!fs.existsSync(p)) { console.warn('  missing: ' + rel); continue; }
  let content = fs.readFileSync(p, 'utf8');
  const before = content;
  let perFile = 0;
  for (const { re, rep } of patterns) {
    const matches = content.match(re);
    if (matches) perFile += matches.length;
    content = content.replace(re, rep);
  }
  if (content !== before) {
    fs.writeFileSync(p, content);
    summary.push(`  ${rel}: ${perFile} Ersetzungen`);
    totalReplaced += perFile;
  } else {
    summary.push(`  ${rel}: (keine)`);
  }
}

console.log(summary.join('\n'));
console.log(`Total: ${totalReplaced} Ersetzungen.`);
