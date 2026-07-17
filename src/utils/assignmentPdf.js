// Aufgabenstellungs-PDF (Deutsch) — repliziert die Word-Vorlage
// beispiele/Aufgabenstellung_D.docx (ohne Inhaltsverzeichnis):
//   S.1 Titelseite (Hintergrundbild, farbiges HFTM-Logo, Fachbereich, Titel, Info-Block)
//   S.2 1 Administratives (Student, Thema, Bedingungen, Termine M1/M2)
//   S.3 Fortsetzung (Dozent, Experte, elektronische Freigabe)
//   S.4 2 Aufgabenstellung (Intro + Ergänzungsfeld als Markdown)
//   S.5 3 Beurteilungskriterien Diplomarbeit
// Die Termine M1/M2 stammen aus dem Diplomjahr (je Studienform des Fachbereichs).
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '../../public/images/aufgabenstellung');
const IMG_BACKGROUND = path.join(ASSET_DIR, 'titel-hintergrund.png');
const IMG_LOGO_COLOR = path.join(ASSET_DIR, 'hftm-logo-farbig.jpg');
const IMG_LOGO_GRAY = path.join(ASSET_DIR, 'hftm-logo-grau.jpg');

// Seitengeometrie gemäss Word-Vorlage (A4 hoch).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M_LEFT = 71;
const M_TOP = 85; // 3 cm
const M_BOTTOM = 85;
const TEXT_W = 376; // schmale Textspalte wie in der Vorlage (rechter Rand ~148pt)

const fmtDT = (d) => {
  if (!d) return '(noch nicht festgelegt)';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())} Uhr`;
};

const personList = (arr) => (arr || []).map(p => `${p.firstname} ${p.name}`).join(', ') || '—';

// ---------- Markdown (Ergänzungsfeld) ----------

// Inline-Segmente: **fett**, *kursiv*, `code` (Code wird als normaler Text gesetzt).
function inlineSegments(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('*')) out.push({ text: tok.slice(1, -1), italic: true });
    else out.push({ text: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter(s => s.text.length > 0);
}

function drawInline(doc, text, x, width, { fontSize = 10, lineGap = 2 } = {}) {
  const segs = inlineSegments(text);
  if (segs.length === 0) { doc.moveDown(0.5); return; }
  doc.fontSize(fontSize);
  segs.forEach((s, i) => {
    doc.font(s.bold ? 'Helvetica-Bold' : (s.italic ? 'Helvetica-Oblique' : 'Helvetica'));
    if (i === 0) doc.text(s.text, x, doc.y, { width, lineGap, continued: i < segs.length - 1 });
    else doc.text(s.text, { width, lineGap, continued: i < segs.length - 1 });
  });
  doc.font('Helvetica');
}

const BOTTOM_LIMIT = PAGE_H - M_BOTTOM;
function ensureSpace(doc, needed) {
  if (doc.y + needed > BOTTOM_LIMIT) doc.addPage();
}

// Einfacher Block-Renderer: Überschriften (#, ##, ###), Aufzählungen (-, *, +),
// nummerierte Listen (1.), Trennlinie (---), Absätze. Fällt bei allem anderen
// auf Fliesstext zurück.
function renderMarkdown(doc, md, x, width) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  let para = [];
  const flushPara = () => {
    if (para.length === 0) return;
    const text = para.join(' ').trim();
    para = [];
    if (!text) return;
    ensureSpace(doc, 24);
    drawInline(doc, text, x, width, { fontSize: 10, lineGap: 2 });
    doc.moveDown(0.5);
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const hr = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);

    if (line.trim() === '') { flushPara(); continue; }
    if (h) {
      flushPara();
      const level = h[1].length;
      const size = level === 1 ? 14 : level === 2 ? 12 : 11;
      ensureSpace(doc, size + 14);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(size).text(h[2], x, doc.y, { width });
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10);
      continue;
    }
    if (hr) {
      flushPara();
      ensureSpace(doc, 12);
      doc.moveTo(x, doc.y + 4).lineTo(x + width, doc.y + 4).lineWidth(0.5).strokeColor('#999').stroke();
      doc.strokeColor('black');
      doc.moveDown(0.8);
      continue;
    }
    if (ul || ol) {
      flushPara();
      const bullet = ul ? '•' : `${ol[1]}.`;
      const content = ul ? ul[1] : ol[2];
      ensureSpace(doc, 18);
      const y0 = doc.y;
      doc.font('Helvetica').fontSize(10).text(bullet, x + 6, y0, { width: 18, lineBreak: false });
      doc.y = y0;
      drawInline(doc, content, x + 24, width - 24, { fontSize: 10, lineGap: 2 });
      doc.moveDown(0.2);
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
}

// ---------- Bausteine ----------

function h1(doc, number, text) {
  doc.font('Helvetica-Bold').fontSize(20).fillColor('black')
    .text(`${number} ${text}`, M_LEFT, doc.y, { width: TEXT_W });
  doc.moveDown(0.6);
}

function subLabel(doc, text) {
  ensureSpace(doc, 30);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(text, M_LEFT, doc.y, { width: TEXT_W });
  doc.moveDown(0.1);
}

function bodyText(doc, text) {
  doc.font('Helvetica').fontSize(10).fillColor('black').text(text, M_LEFT, doc.y, { width: TEXT_W, lineGap: 2 });
  doc.moveDown(0.7);
}

// ---------- Public API ----------

// data = { thesis, tm, m1, m2 }
//   thesis: inkl. department, year, students, coaches, experts
//   tm:     Aufgabenstellungs-ThesisMilestone (assignment_text)
//   m1/m2:  Termine aus dem Diplomjahr (Date|null), je nach Studienform
function streamAssignmentPdf(res, { thesis, tm, m1, m2 }) {
  const doc = new PDFDocument({
    size: [PAGE_W, PAGE_H],
    margins: { top: M_TOP, bottom: M_BOTTOM, left: M_LEFT, right: PAGE_W - M_LEFT - TEXT_W },
    bufferPages: true,
    info: { Title: 'Aufgabenstellung Diplomarbeit' },
  });
  doc.pipe(res);

  const deptName = thesis.department ? thesis.department.name : '';
  const yearLabel = thesis.year ? ((thesis.year.label_de && thesis.year.label_de.trim()) || String(thesis.year.year)) : '';
  const students = personList(thesis.students);
  const coaches = personList(thesis.coaches);
  const experts = personList(thesis.experts);

  // ----- Seite 1: Titelseite (keine Kopfzeile, kein graues Logo) -----
  try { doc.image(IMG_BACKGROUND, 20, 0, { width: 527.65, height: 584.2 }); } catch (e) { /* Asset fehlt */ }

  doc.font('Helvetica').fontSize(11).fillColor('#333').text(`Fachbereich ${deptName}`, 75, 46, { width: 320, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(21).fillColor('black').text('Diplomarbeits-', 75, 64, { width: 330 });
  doc.font('Helvetica-Bold').fontSize(21).text('aufgabenstellung', 75, doc.y - 2, { width: 330 });

  try { doc.image(IMG_LOGO_COLOR, 472, 398, { width: 62 }); } catch (e) { /* Asset fehlt */ }

  // Info-Block unten links
  let iy = 640;
  const infoRows = [
    ['Student/in', students],
    ['Dozent/in', coaches],
    ['Experte/Expertin', experts],
    ['Datum', fmtDT(m1)],
  ];
  for (const [label, value] of infoRows) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(label, M_LEFT, iy, { width: 120, lineBreak: false });
    doc.font('Helvetica').fontSize(10).text(value, M_LEFT + 130, iy, { width: 320 });
    iy = Math.max(doc.y, iy + 14) + 4;
  }

  // ----- 1 Administratives -----
  doc.addPage();
  doc.y = M_TOP;
  h1(doc, '1', 'Administratives');

  subLabel(doc, 'Student/in');
  bodyText(doc, students);
  subLabel(doc, 'Thema');
  bodyText(doc, thesis.title || '—');
  subLabel(doc, 'Allgemeine Bedingungen');
  bodyText(doc,
    `Es gilt der Leitfaden Diplomarbeit ${yearLabel} (ThesisBuddy/Vorlagen). Die Diplomarbeit muss elektronisch ` +
    'auf ThesisBuddy abgegeben werden. Elektronische Erzeugnisse (Virtuelle Maschinen, CAD-Files, Programmcode, usw.) ' +
    'müssen in geeigneter Form (USB-Festplatte, Memory Stick, Wetransfer o.ä.) abgegeben werden. ' +
    'Dies ist mit der/dem Dozent*in zu organisieren.');
  subLabel(doc, 'Arbeitsort');
  bodyText(doc,
    'Der Arbeitsort wird vom Studierenden festgelegt. Die Sitzungen mit Dozenten und Experten finden grundsätzlich ' +
    'am Schulort (Grenchen/Biel) oder per Microsoft Teams statt.');
  subLabel(doc, 'Ausgabe der Aufgabenstellung');
  bodyText(doc, fmtDT(m1));
  subLabel(doc, 'Abgabe der Diplomarbeit');
  bodyText(doc, `${fmtDT(m2)} gemäss Abgabe-Terminierung auf ThesisBuddy`);
  subLabel(doc, 'Besprechungen mit dem Betreuungsteam');
  bodyText(doc,
    'Mit dem/der Dozent*in sind mindestens 2 Besprechungen und eine Besprechung mit dem/der Expert*in abzuhalten. ' +
    'Die frühzeitige Organisation und die Planung obliegen in der Verantwortung des/der Student*in.');
  subLabel(doc, 'Präsentation der Diplomarbeit');
  bodyText(doc,
    'Die Präsentation der Diplomarbeit erfolgt in der Regel 2-4 Wochen nach der Abgabe. Details dazu werden ' +
    'spätestens anlässlich der Abgabe der Diplomarbeit bekanntgegeben.');

  // Fortsetzung auf neuer Seite (wie in der Vorlage)
  doc.addPage();
  doc.y = M_TOP;
  subLabel(doc, 'Dozent/in');
  bodyText(doc, coaches);
  subLabel(doc, 'Experte/in');
  bodyText(doc, experts);
  subLabel(doc, 'Elektronische Freigabe');
  bodyText(doc, 'Dozent: Ausfüllen und generieren der Aufgabenstellung auf ThesisBuddy.');
  bodyText(doc, 'Experte: durch Freigabe – Freigabebutton auf ThesisBuddy.');
  bodyText(doc, 'Fachbereichsleitung: durch Freigabe – Freigabebutton auf ThesisBuddy.');

  // ----- 2 Aufgabenstellung -----
  doc.addPage();
  doc.y = M_TOP;
  h1(doc, '2', 'Aufgabenstellung');
  bodyText(doc,
    'Die Diplomarbeit ist gemäss dem letzten Stand des Pflichtenhefts im Moodle-Kurs der Diplomarbeit zu erstellen. ' +
    'Die Arbeitspakete sind zu planen und zu priorisieren. Änderungen am Umfang sind mit dem/der Dozent*in und ' +
    'dem/der Expert*in abzusprechen und zu protokollieren.');
  bodyText(doc, 'Ergänzend zum Pflichtenheft gelten folgende Korrekturen und Auflagen:');
  const supplement = (tm && tm.assignment_text && tm.assignment_text.trim())
    ? tm.assignment_text.trim()
    : '(Keine Ergänzungen erfasst.)';
  renderMarkdown(doc, supplement, M_LEFT, TEXT_W);

  // ----- 3 Beurteilungskriterien -----
  doc.addPage();
  doc.y = M_TOP;
  h1(doc, '3', 'Beurteilungskriterien Diplomarbeit');
  bodyText(doc, 'Auf ThesisBuddy kann unter Vorlagen das Dokument Beurteilungskriterien_DA_D.pdf heruntergeladen werden.');

  // ----- Kopf-/Fusszeile (alle Seiten ausser Titelseite) -----
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try { doc.image(IMG_LOGO_GRAY, PAGE_W - 106, 24, { width: 40 }); } catch (e) { /* Asset fehlt */ }
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Aufgabenstellung Diplomarbeit', M_LEFT, PAGE_H - 40, { lineBreak: false });
    doc.text(String(i + 1), PAGE_W - M_LEFT - 40, PAGE_H - 40, { width: 40, align: 'right', lineBreak: false });
    doc.fillColor('black');
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

module.exports = { streamAssignmentPdf };
