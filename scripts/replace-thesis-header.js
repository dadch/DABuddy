// Ersetzt in allen 6 thesis-detail.ejs den alten Page-Header + Informations-Block
// (Zeilen 10–125 inkl.) durch zwei Partial-Includes.
const fs = require('fs');
const path = require('path');

const files = [
  'views/admin/thesis-detail.ejs',
  'views/coach/thesis-detail.ejs',
  'views/expert/thesis-detail.ejs',
  'views/student/thesis-detail.ejs',
  'views/department_lead/thesis-detail.ejs',
  'views/field_project_coach/thesis-detail.ejs',
];

const newBlock = [
  `<%- include('../partials/thesis-page-header', { thesis: thesis, user: user }) %>`,
  ``,
  `<div class="row">`,
  `    <div class="col-lg-12">`,
  `        <%- include('../partials/thesis-info-card', { thesis: thesis, user: user }) %>`,
  ``,
].join('\n');

for (const rel of files) {
  const p = path.join(__dirname, '..', rel);
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  // Find start: line containing the page-header div opener
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && lines[i].includes('d-flex justify-content-between align-items-center mb-4')) { start = i; }
    if (start !== -1 && lines[i].includes("include('../partials/confidentiality-section'")) { end = i; break; }
  }
  if (start === -1 || end === -1) {
    console.error('  SKIP (markers not found): ' + rel);
    continue;
  }
  // Replace lines[start..end-1] with newBlock; keep the confidentiality include line.
  const before = lines.slice(0, start).join('\n');
  const after = lines.slice(end).join('\n');
  const updated = before + '\n' + newBlock + after;
  fs.writeFileSync(p, updated);
  console.log('  ok  ' + rel + ' (' + start + '..' + (end - 1) + ' → ' + newBlock.split('\n').length + ' Zeilen)');
}
