const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const fs = require('fs');
const path = require('path');

// Schullogo (SVG) wird einmal beim Laden des Moduls eingelesen und in
// jedes generierte PDF oben rechts eingebettet. Logo-Datei liegt unter
// public/images/school-logo.svg (vom Schul-Branding bereitgestellt).
const LOGO_PATH = path.join(__dirname, '../../public/images/school-logo.svg');
let LOGO_SVG = null;
try { LOGO_SVG = fs.readFileSync(LOGO_PATH, 'utf8'); }
catch (e) { console.warn('[evaluationPdf] Logo nicht gefunden:', LOGO_PATH); }

// Logo-Breite: ca. 1.5 cm (≈ 42 pt). Höhe skaliert proportional (Logo ist 1:1).
const LOGO_W = 42;
const LOGO_H = 42;

// Platziert das Schullogo oben rechts an Position (rightX, topY).
// rightX = rechte Seitenkante – Rand; topY = vertikaler Abstand vom oberen Seitenrand.
function drawLogo(doc, rightX, topY) {
  if (!LOGO_SVG) return;
  try {
    SVGtoPDF(doc, LOGO_SVG, rightX - LOGO_W, topY, { width: LOGO_W, height: LOGO_H });
  } catch (e) {
    console.warn('[evaluationPdf] SVG konnte nicht eingebettet werden:', e.message);
  }
}

// ---------- Helpers ----------

const ROLE_LABELS = {
  student: 'Student', coach: 'Dozent/in', expert: 'ExpertIn',
  admin: 'Administrator', department_lead: 'FachbereichsleiterIn', field_project_coach: 'Dozent Transferprojekt'
};

const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
};

const fmtGrade = (g) => (g === null || g === undefined) ? '–' : Number(g).toFixed(1);

// ---- Minimaler Markdown-Renderer für pdfkit -----------------------------
// Unterstützt: Überschriften (# bis ####), **fett**, *kursiv*, `code`,
// ungeordnete Listen (- / *), nummerierte Listen (1. 2. …), Absätze.
// Reicht für die Feedback-Rückmeldung. Greift auf `pdfkit`'s continued-text
// zurück, damit Inline-Formate ohne Zeilenumbruch ineinander übergehen.

function _tokenizeInline(text) {
  const tokens = [];
  // Greedy Regex: **fett** | __fett__ | *kursiv* | _kursiv_ | `code`
  const re = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_|`[^`\n]+?`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index), bold: false, italic: false, code: false });
    const t = m[1];
    if (t.startsWith('**') || t.startsWith('__')) tokens.push({ text: t.slice(2, -2), bold: true, italic: false, code: false });
    else if (t.startsWith('`')) tokens.push({ text: t.slice(1, -1), bold: false, italic: false, code: true });
    else tokens.push({ text: t.slice(1, -1), bold: false, italic: true, code: false });
    last = m.index + t.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), bold: false, italic: false, code: false });
  return tokens;
}

function _renderInline(doc, text, opts) {
  const tokens = _tokenizeInline(text);
  // Mehrere Tokens in einer Zeile: alle continued außer dem letzten.
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const isLast = i === tokens.length - 1;
    if (tk.code) doc.font('Courier');
    else if (tk.bold && tk.italic) doc.font('Helvetica-BoldOblique');
    else if (tk.bold) doc.font('Helvetica-Bold');
    else if (tk.italic) doc.font('Helvetica-Oblique');
    else doc.font('Helvetica');
    doc.text(tk.text, { ...opts, continued: !isLast });
  }
}

// Render Markdown ab Position (x, y), kehrt mit neuem doc.y zurück.
// Eingabe-Optionen: { x, y, width, fontSize, lineGap, paragraphGap }.
function renderMarkdown(doc, md, opts) {
  const x = opts.x;
  const width = opts.width;
  const fontSize = opts.fontSize || 9;
  const lineGap = opts.lineGap != null ? opts.lineGap : 1.2;
  const paragraphGap = opts.paragraphGap != null ? opts.paragraphGap : 3;
  doc.x = x;
  doc.y = opts.y;

  const text = String(md == null ? '' : md).replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  // Blöcke zusammensammeln: paragraph | heading | list-item | spacer
  const blocks = [];
  let para = [];
  const flushPara = () => { if (para.length) { blocks.push({ type: 'paragraph', text: para.join(' ') }); para = []; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') { flushPara(); blocks.push({ type: 'spacer' }); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushPara(); blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ul) { flushPara(); blocks.push({ type: 'li', marker: '•', text: ul[1] }); continue; }
    const ol = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ol) { flushPara(); blocks.push({ type: 'li', marker: ol[1] + '.', text: ol[2] }); continue; }
    para.push(line);
  }
  flushPara();

  // Aufeinanderfolgende Spacer kollabieren (max. einer pro Lücke).
  const compact = [];
  for (const b of blocks) {
    if (b.type === 'spacer' && compact.length && compact[compact.length - 1].type === 'spacer') continue;
    compact.push(b);
  }

  const headingSize = (lvl) => fontSize + (lvl === 1 ? 4 : lvl === 2 ? 3 : lvl === 3 ? 2 : 1);
  const bulletIndent = fontSize * 1.4;

  doc.fillColor('black');
  for (let i = 0; i < compact.length; i++) {
    const b = compact[i];
    if (b.type === 'spacer') {
      doc.y += paragraphGap;
      continue;
    }
    if (b.type === 'heading') {
      doc.font('Helvetica-Bold').fontSize(headingSize(b.level));
      doc.x = x;
      _renderInline(doc, b.text, { width, lineGap });
      doc.font('Helvetica').fontSize(fontSize);
      continue;
    }
    if (b.type === 'li') {
      doc.font('Helvetica').fontSize(fontSize);
      const itemY = doc.y;
      doc.text(b.marker, x, itemY, { width: bulletIndent - 2, lineBreak: false });
      doc.x = x + bulletIndent;
      doc.y = itemY;
      _renderInline(doc, b.text, { width: width - bulletIndent, lineGap });
      doc.x = x;
      continue;
    }
    // paragraph
    doc.font('Helvetica').fontSize(fontSize);
    doc.x = x;
    _renderInline(doc, b.text, { width, lineGap });
  }
  doc.font('Helvetica').fontSize(fontSize);
  return doc.y;
}

// Sehr einfache Markdown -> Klartext-Konvertierung (für die Kriterien-Bezeichnung).
const mdToPlain = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')        // Überschriften
      .replace(/^\s*[-*+]\s+/, '• ')           // Aufzählung
      .replace(/\*\*(.*?)\*\*/g, '$1')          // fett
      .replace(/\*(.*?)\*/g, '$1')              // kursiv
      .replace(/`(.*?)`/g, '$1')                // code
      .replace(/^>\s?/, '')                     // Zitat
    )
    .join('\n');
};

const studentsText = (thesis) => {
  const list = (thesis.students || []).map(s => `${s.name}, ${s.firstname}`);
  return list.length ? list.join(', ') : '—';
};

// ---------- Layout constants (A4 landscape) ----------

const MARGIN = 28;
const PAGE_W = 842;
const PAGE_H = 595;
const CONTENT_W = PAGE_W - 2 * MARGIN;     // 786
const CONTENT_TOP = 48;
const BOTTOM_LIMIT = 558;
const PAD = 3;

// Spalten der Kriterien-Tabelle (Summe der Breiten = CONTENT_W)
const COLS = [
  { key: 'criterion', title: 'Kriterium', w: 156 },
  { key: 'max', title: 'Max.\nPunkte', w: 30 },
  { key: 'weight', title: 'Gewicht', w: 34 },
  { key: 'achieved', title: 'Erreichte\nPunkte', w: 38 },
  { key: 'l5', title: '5', w: 78 },
  { key: 'l4', title: '4', w: 78 },
  { key: 'l3', title: '3', w: 78 },
  { key: 'l2', title: '2', w: 70 },
  { key: 'l1', title: '1', w: 56 },
  { key: 'l0', title: '0', w: 56 },
  { key: 'remark', title: 'Bemerkung (zwingend bei Bewertung unter 3)', w: 112 },
];

const FS = 6.5;        // Zellen-Schriftgrösse
const FS_HEAD = 7;     // Spaltenkopf
const FS_GROUP = 8;    // Gruppen-Header

const colX = () => {
  const xs = [];
  let x = MARGIN;
  for (const c of COLS) { xs.push(x); x += c.w; }
  return xs;
};

// ---------- Public API ----------

// Streams a PDF of an evaluation to `res`. data = { thesis, milestone, title, kind, evaluation, freeText, blank }
// blank: unausgefülltes Formular — Stammdaten-Zeilen leer, keine Punkte/Noten-Summen.
function streamEvaluationPdf(res, data) {
  const { thesis, milestone } = data;
  const isForm = !!data.evaluation;
  const title = data.title || ('Bewertung ' + (milestone.label || ''));
  // blank: der Formulartitel steht für sich (kein "Bewertung "-Präfix davor).
  const footerLeft = data.blank ? title : 'Bewertung ' + (milestone.label || '');

  const doc = new PDFDocument({
    size: 'A4',
    layout: isForm ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
  });
  doc.pipe(res);

  if (isForm) {
    renderForm(doc, { thesis, title, evaluation: data.evaluation, blank: !!data.blank });
  } else {
    renderFreeText(doc, { thesis, milestone, title, freeText: data.freeText });
  }

  // Kopf- und Fusszeile auf jeder Seite ergänzen.
  // Wichtig: untere Marge temporär auf 0 setzen, sonst fügt pdfkit beim Schreiben
  // in den unteren Randbereich automatisch leere Seiten ein.
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const w = doc.page.width;
    const h = doc.page.height;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // Kopf links + Marke rechts
    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text('Diplomarbeitsbeurteilung', MARGIN, 18, { lineBreak: false });
    drawLogo(doc, w - MARGIN, 6);
    // Fusszeile
    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text(footerLeft, MARGIN, h - 22, { lineBreak: false });
    doc.text(`Seite ${i + 1} von ${total}`, w - MARGIN - 160, h - 22, { width: 160, align: 'right', lineBreak: false });
    doc.fillColor('black');

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

// ---------- Thesis info block ----------

function drawThesisInfo(doc, thesis, title, startY, fullWidth, blank) {
  let y = startY;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('black').text(title, MARGIN, y);
  y = doc.y + 4;

  // blank: Stammdaten-Zeilen leer lassen (zum Handausfüllen).
  const rows = blank ? [
    ['Diplomjahr', ''],
    ['Student/in', ''],
    ['Fachbereich', ''],
    ['Titel der Arbeit', ''],
    ['Sprache', ''],
  ] : [
    ['Diplomjahr', thesis.year ? String(thesis.year.year) : ''],
    ['Student/in', studentsText(thesis)],
    ['Fachbereich', thesis.department ? thesis.department.name : ''],
    ['Titel der Arbeit', thesis.title || ''],
    ['Sprache', thesis.language === 'fr' ? 'Französisch' : 'Deutsch'],
  ];
  const labelW = 90;
  const valW = (fullWidth || CONTENT_W) - labelW;
  doc.fontSize(8.5);
  for (const [label, value] of rows) {
    const h = Math.max(
      doc.font('Helvetica-Bold').heightOfString(label, { width: labelW }),
      doc.font('Helvetica').heightOfString(value || '', { width: valW })
    ) + 3;
    doc.font('Helvetica-Bold').fillColor('#333').text(label, MARGIN, y, { width: labelW });
    doc.font('Helvetica').fillColor('black').text(value || '', MARGIN + labelW, y, { width: valW });
    // Trennlinie
    doc.moveTo(MARGIN, y + h - 1).lineTo(MARGIN + (fullWidth || CONTENT_W), y + h - 1).lineWidth(0.3).strokeColor('#ccc').stroke();
    y += h;
  }
  doc.strokeColor('black');
  return y + 6;
}

// ---------- Free-text evaluation (portrait) ----------

function renderFreeText(doc, { thesis, title, freeText }) {
  let y = drawThesisInfo(doc, thesis, title, CONTENT_TOP, doc.page.width - 2 * MARGIN);
  doc.font('Helvetica-Bold').fontSize(10).text('Bewertung', MARGIN, y);
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(9).fillColor('black')
    .text(freeText && freeText.trim() ? freeText : '(Keine Bewertung erfasst.)', MARGIN, y, {
      width: doc.page.width - 2 * MARGIN,
    });
}

// ---------- Form evaluation (landscape table) ----------

function renderForm(doc, { thesis, title, evaluation, blank }) {
  let y = drawThesisInfo(doc, thesis, title, CONTENT_TOP, CONTENT_W, blank);

  const xs = colX();

  const drawTableHeader = (yy) => {
    const h = headerHeight(doc);
    doc.rect(MARGIN, yy, CONTENT_W, h).fillAndStroke('#f0f0f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_HEAD);
    COLS.forEach((c, i) => {
      doc.text(c.title, xs[i] + PAD, yy + PAD, { width: c.w - 2 * PAD });
    });
    return yy + h;
  };

  const ensureSpace = (needed, yy) => {
    if (yy + needed > BOTTOM_LIMIT) {
      doc.addPage();
      return drawTableHeader(CONTENT_TOP);
    }
    return yy;
  };

  y = drawTableHeader(y);

  const groups = (evaluation.groups || []).slice().sort((a, b) => a.position - b.position);
  for (const g of groups) {
    // Gruppen-Header
    y = ensureSpace(18, y);
    const gh = 16;
    doc.rect(MARGIN, y, CONTENT_W, gh).fillAndStroke('#e0e6f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_GROUP)
      .text(g.name || '', MARGIN + PAD, y + 4, { width: CONTENT_W - 2 * PAD });
    y += gh;

    const crits = (g.criteria || []).slice().sort((a, b) => a.position - b.position);
    let groupMax = 0, groupAchieved = 0;
    for (const c of crits) {
      const weight = Number(c.weight) || 0;
      const max = 5 * weight;
      const scored = c.score !== null && c.score !== undefined;
      const achieved = scored ? Number(c.score) * weight : null;
      groupMax += max;
      if (scored) groupAchieved += achieved;

      const levels = c.level_descriptions || [];
      const values = [
        mdToPlain(c.label),
        fmtNum(max),
        fmtNum(weight),
        scored ? fmtNum(achieved) : '',
        levels[5] || '', levels[4] || '', levels[3] || '', levels[2] || '', levels[1] || '', levels[0] || '',
        c.remark || '',
      ];
      const h = rowHeight(doc, values);
      y = ensureSpace(h, y);
      // Highlight der erreichten Stufe (Spalten l5..l0 = index 4..9, Stufe 5..0)
      let highlightCol = -1;
      if (scored) highlightCol = 4 + (5 - Number(c.score)); // score 5 -> col 4, score 0 -> col 9
      drawGridRow(doc, xs, values, y, h, { fontSize: FS, highlightCol });
      y += h;
    }

    // Ergebnis-Zeile der Gruppe
    const resVals = ['Ergebnis: ' + (g.name || ''), fmtNum(groupMax), '', blank ? '' : fmtNum(groupAchieved), '', '', '', '', '', '', ''];
    const rh = 16;
    y = ensureSpace(rh, y);
    doc.rect(MARGIN, y, CONTENT_W, rh).fillAndStroke('#f5f5f5', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS);
    doc.text(resVals[0], xs[0] + PAD, y + 4, { width: COLS[0].w - 2 * PAD });
    doc.text(resVals[1], xs[1] + PAD, y + 4, { width: COLS[1].w - 2 * PAD });
    doc.text(resVals[3], xs[3] + PAD, y + 4, { width: COLS[3].w - 2 * PAD });
    // "Note: X.X" über die Stufen-Spalten (blank: Platz zum Handausfüllen)
    doc.text('Note: ' + (blank ? '' : fmtGrade(g.grade)), xs[4] + PAD, y + 4, { width: (COLS[4].w + COLS[5].w + COLS[6].w) - 2 * PAD });
    y += rh;
    y += 4;
  }

  // Gesamtnote
  y = ensureSpace(18, y);
  doc.rect(MARGIN, y, CONTENT_W, 16).fillAndStroke('#d8e2f3', '#666');
  doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
    .text('Gesamtnote (gewichteter Durchschnitt): ' + (blank ? '' : fmtGrade(evaluation.overall_grade)), MARGIN + PAD, y + 3, { width: CONTENT_W - 2 * PAD });
}

// ---------- Low-level table drawing ----------

function headerHeight(doc) {
  doc.font('Helvetica-Bold').fontSize(FS_HEAD);
  let max = 0;
  COLS.forEach(c => {
    const hh = doc.heightOfString(c.title, { width: c.w - 2 * PAD });
    if (hh > max) max = hh;
  });
  return max + 2 * PAD;
}

function rowHeight(doc, values) {
  doc.font('Helvetica').fontSize(FS);
  let max = 0;
  for (let i = 0; i < COLS.length; i++) {
    const hh = doc.heightOfString(values[i] || '', { width: COLS[i].w - 2 * PAD });
    if (hh > max) max = hh;
  }
  return Math.max(max + 2 * PAD, 14);
}

function drawGridRow(doc, xs, values, y, h, opts) {
  const fontSize = opts.fontSize || FS;
  for (let i = 0; i < COLS.length; i++) {
    const fill = (opts.highlightCol === i) ? '#bcd4f0' : null;
    if (fill) doc.rect(xs[i], y, COLS[i].w, h).fillAndStroke(fill, '#999');
    else doc.rect(xs[i], y, COLS[i].w, h).stroke('#999');
    doc.fillColor('black').font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize)
      .text(values[i] || '', xs[i] + PAD, y + PAD, { width: COLS[i].w - 2 * PAD });
  }
}

// ---------- Transferprojekt-Zusammenzug ----------

// Streams a multi-evaluation PDF: für jeden Transferprojekt-Meilenstein der DA
// wird der Titel "Bewertung <Label>" und dann das vollständige Bewertungsformular
// gezeichnet; am Ende kommt eine Zeile "Note Transferprojekt: X.X" (Durchschnitt
// der Gesamtnoten, gerundet auf 1 Komma). data = { thesis, items, averageGrade }.
// items: [{ milestoneLabel, evaluation? }] — evaluation kann null sein.
function streamTransferProjectPdf(res, data) {
  const { thesis, items, averageGrade } = data;
  const footerLeft = 'Transferprojekt – Zusammenzug Bewertungen';

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true,
  });
  doc.pipe(res);

  // Erste Seite: DA-Stammdaten oben.
  let y = drawThesisInfo(doc, thesis, 'Transferprojekt – Zusammenzug Bewertungen', CONTENT_TOP, CONTENT_W);
  y += 4;

  // Pro Meilenstein: Section-Titel + Formular-Tabelle (oder Platzhalter).
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const sectionTitle = 'Bewertung ' + (item.milestoneLabel || '');

    // Neue Seite, wenn nicht mehr genug Platz für Section-Header + ein paar Zeilen.
    if (y + 60 > BOTTOM_LIMIT) {
      doc.addPage();
      y = CONTENT_TOP;
    }
    // Section-Titel hinten in der Kette (kein page break davor wenn idx > 0 und genug Platz).
    doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
       .text(sectionTitle, MARGIN, y);
    y = doc.y + 4;

    if (!item.evaluation) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#777')
         .text('— noch nicht bewertet —', MARGIN, y);
      y = doc.y + 10;
      doc.fillColor('black');
      continue;
    }

    y = renderFormBody(doc, item.evaluation, y);
    y += 8;
  }

  // Abschlusszeile: Note Transferprojekt
  if (y + 28 > BOTTOM_LIMIT) { doc.addPage(); y = CONTENT_TOP; }
  doc.rect(MARGIN, y, CONTENT_W, 22).fillAndStroke('#d8e2f3', '#666');
  doc.fillColor('black').font('Helvetica-Bold').fontSize(11)
     .text(
       'Note Transferprojekt: ' + (averageGrade !== null && averageGrade !== undefined ? Number(averageGrade).toFixed(1) : '—'),
       MARGIN + PAD,
       y + 5,
       { width: CONTENT_W - 2 * PAD }
     );

  // Kopf-/Fusszeilen
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const w = doc.page.width;
    const h = doc.page.height;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text('Diplomarbeitsbeurteilung', MARGIN, 18, { lineBreak: false });
    drawLogo(doc, w - MARGIN, 6);
    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text(footerLeft, MARGIN, h - 22, { lineBreak: false });
    doc.text(`Seite ${i + 1} von ${total}`, w - MARGIN - 160, h - 22, { width: 160, align: 'right', lineBreak: false });
    doc.fillColor('black');

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

// Wie renderForm, aber ohne den Thesis-Info-Block (der wird einmal global gezeichnet)
// und mit explizitem startY. Liefert das y nach dem letzten Element zurück.
function renderFormBody(doc, evaluation, startY) {
  let y = startY;
  const xs = colX();

  const drawTableHeader = (yy) => {
    const h = headerHeight(doc);
    doc.rect(MARGIN, yy, CONTENT_W, h).fillAndStroke('#f0f0f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_HEAD);
    COLS.forEach((c, i) => doc.text(c.title, xs[i] + PAD, yy + PAD, { width: c.w - 2 * PAD }));
    return yy + h;
  };
  const ensureSpace = (needed, yy) => {
    if (yy + needed > BOTTOM_LIMIT) {
      doc.addPage();
      return drawTableHeader(CONTENT_TOP);
    }
    return yy;
  };

  y = drawTableHeader(y);

  const groups = (evaluation.groups || []).slice().sort((a, b) => a.position - b.position);
  for (const g of groups) {
    y = ensureSpace(18, y);
    const gh = 16;
    doc.rect(MARGIN, y, CONTENT_W, gh).fillAndStroke('#e0e6f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_GROUP)
      .text(g.name || '', MARGIN + PAD, y + 4, { width: CONTENT_W - 2 * PAD });
    y += gh;

    const crits = (g.criteria || []).slice().sort((a, b) => a.position - b.position);
    let groupMax = 0, groupAchieved = 0;
    for (const c of crits) {
      const weight = Number(c.weight) || 0;
      const max = 5 * weight;
      const scored = c.score !== null && c.score !== undefined;
      const achieved = scored ? Number(c.score) * weight : null;
      groupMax += max;
      if (scored) groupAchieved += achieved;

      const levels = c.level_descriptions || [];
      const values = [
        mdToPlain(c.label), fmtNum(max), fmtNum(weight),
        scored ? fmtNum(achieved) : '',
        levels[5] || '', levels[4] || '', levels[3] || '', levels[2] || '', levels[1] || '', levels[0] || '',
        c.remark || '',
      ];
      const h = rowHeight(doc, values);
      y = ensureSpace(h, y);
      let highlightCol = -1;
      if (scored) highlightCol = 4 + (5 - Number(c.score));
      drawGridRow(doc, xs, values, y, h, { fontSize: FS, highlightCol });
      y += h;
    }

    // Ergebnis-Zeile der Gruppe
    const resVals = ['Ergebnis: ' + (g.name || ''), fmtNum(groupMax), '', fmtNum(groupAchieved), '', '', '', '', '', '', ''];
    const rh = 16;
    y = ensureSpace(rh, y);
    doc.rect(MARGIN, y, CONTENT_W, rh).fillAndStroke('#f5f5f5', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS);
    doc.text(resVals[0], xs[0] + PAD, y + 4, { width: COLS[0].w - 2 * PAD });
    doc.text(resVals[1], xs[1] + PAD, y + 4, { width: COLS[1].w - 2 * PAD });
    doc.text(resVals[3], xs[3] + PAD, y + 4, { width: COLS[3].w - 2 * PAD });
    doc.text('Note: ' + fmtGrade(g.grade), xs[4] + PAD, y + 4, { width: (COLS[4].w + COLS[5].w + COLS[6].w) - 2 * PAD });
    y += rh + 4;
  }

  // Gesamtnote der Einzel-Bewertung
  y = ensureSpace(18, y);
  doc.rect(MARGIN, y, CONTENT_W, 16).fillAndStroke('#d8e2f3', '#666');
  doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
    .text('Gesamtnote: ' + fmtGrade(evaluation.overall_grade), MARGIN + PAD, y + 3, { width: CONTENT_W - 2 * PAD });
  return y + 16;
}

// ---------- Gesamtübersicht Transferprojekt (Landscape-Tabelle) ----------

// data = { year, rows, milestoneLabels, printDate }
// rows: [{ studentName, studentFirstname, thesisTitle, noteByMilestone: { [label]: number|null }, average: number|null }]
// milestoneLabels: Array der Meilenstein-Bezeichnungen in Spaltenreihenfolge
function streamTransferProjectOverviewPdf(res, data) {
  const { year, rows, milestoneLabels, printDate } = data;
  const footerLeft = `Diplomjahr ${year || ''}    Druckdatum: ${printDate}`;

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true,
  });
  doc.pipe(res);

  // Titel
  doc.font('Helvetica-Bold').fontSize(13).fillColor('black')
    .text('Gesamtübersicht Transferprojekt', MARGIN, CONTENT_TOP);
  let y = doc.y + 4;
  if (year) {
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text('Diplomjahr ' + year, MARGIN, y);
    y = doc.y + 6;
  }
  doc.fillColor('black');

  // Spaltendefinition: 3 feste + N dynamische (Note Meilenstein) + 1 Gesamtnote.
  const STATIC_COLS = [
    { title: 'Nachname',                 w: 90 },
    { title: 'Vorname',                  w: 80 },
    { title: 'Titel der Diplomarbeit',   w: 220 },
  ];
  const noteColW = 60;
  const finalColW = 70;
  const cols = [
    ...STATIC_COLS,
    ...milestoneLabels.map(l => ({ title: 'Note ' + l, w: noteColW })),
    { title: 'Gesamtnote Transferprojekt', w: finalColW },
  ];
  // Sicherstellen, dass die Summe in CONTENT_W passt (sonst Titel schrumpfen).
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  if (totalW > CONTENT_W) {
    const diff = totalW - CONTENT_W;
    cols[2].w = Math.max(120, cols[2].w - diff);
  }

  const xs = (() => { const a = []; let x = MARGIN; for (const c of cols) { a.push(x); x += c.w; } return a; })();
  const FS_OV = 8;
  const FS_OV_HEAD = 8;

  const rowH = (values) => {
    doc.font('Helvetica').fontSize(FS_OV);
    let max = 0;
    for (let i = 0; i < cols.length; i++) {
      const hh = doc.heightOfString(values[i] || '', { width: cols[i].w - 2 * PAD });
      if (hh > max) max = hh;
    }
    return Math.max(max + 2 * PAD, 16);
  };
  const headerH = (() => {
    doc.font('Helvetica-Bold').fontSize(FS_OV_HEAD);
    let max = 0;
    for (const c of cols) {
      const hh = doc.heightOfString(c.title, { width: c.w - 2 * PAD });
      if (hh > max) max = hh;
    }
    return max + 2 * PAD;
  })();

  const drawHeader = (yy) => {
    doc.rect(MARGIN, yy, cols.reduce((s, c) => s + c.w, 0), headerH).fillAndStroke('#f0f0f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_OV_HEAD);
    cols.forEach((c, i) => doc.text(c.title, xs[i] + PAD, yy + PAD, { width: c.w - 2 * PAD }));
    return yy + headerH;
  };
  const drawRow = (yy, values, h) => {
    for (let i = 0; i < cols.length; i++) {
      doc.rect(xs[i], yy, cols[i].w, h).stroke('#999');
      doc.fillColor('black').font('Helvetica').fontSize(FS_OV)
        .text(values[i] || '', xs[i] + PAD, yy + PAD, { width: cols[i].w - 2 * PAD });
    }
  };

  y = drawHeader(y);

  for (const row of rows) {
    const values = [
      row.studentName || '',
      row.studentFirstname || '',
      row.thesisTitle || '',
      ...milestoneLabels.map(l => {
        const v = row.noteByMilestone[l];
        return (v === null || v === undefined) ? '—' : Number(v).toFixed(1);
      }),
      (row.average === null || row.average === undefined) ? '—' : Number(row.average).toFixed(1),
    ];
    const h = rowH(values);
    if (y + h > BOTTOM_LIMIT) {
      doc.addPage();
      y = drawHeader(CONTENT_TOP);
    }
    drawRow(y, values, h);
    y += h;
  }

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#777')
      .text('Keine Diplomarbeiten für die Auswertung vorhanden.', MARGIN, y + 6);
    doc.fillColor('black');
  }

  // Kopf-/Fusszeile
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const w = doc.page.width;
    const h = doc.page.height;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text('Gesamtübersicht Transferprojekt', MARGIN, 18, { lineBreak: false });
    drawLogo(doc, w - MARGIN, 6);
    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text(footerLeft, MARGIN, h - 22, { lineBreak: false });
    doc.text(`Seite ${i + 1} von ${total}`, w - MARGIN - 160, h - 22, { width: 160, align: 'right', lineBreak: false });
    doc.fillColor('black');

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

// ---------- Diplomarbeiten-Liste (Querformat) ----------

// Streams a landscape PDF list of theses with the columns requested in the
// FBL/Admin dashboard kebab menu. data = { theses, yearLabel, departmentLabel, printDate }
function streamThesesListPdf(res, data) {
  const { theses = [], yearLabel = '', departmentLabel = '', printDate = '' } = data;

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true,
  });
  doc.pipe(res);

  // Titel
  doc.font('Helvetica-Bold').fontSize(13).fillColor('black')
    .text('Diplomarbeiten', MARGIN, CONTENT_TOP);
  let y = doc.y + 4;
  const subtitleParts = [];
  if (yearLabel) subtitleParts.push('Diplomjahr ' + yearLabel);
  if (departmentLabel) subtitleParts.push(departmentLabel);
  if (subtitleParts.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(subtitleParts.join(' · '), MARGIN, y);
    y = doc.y + 6;
  }
  doc.fillColor('black');

  // Spaltendefinition (Querformat A4: CONTENT_W = 786).
  // „Sprache" wurde als eigene Spalte ergänzt; „Repetent" wandert als
  // Klammerbemerkung an den Vornamen. Damit müssen die anderen Spalten
  // etwas schmaler werden — Summe muss weiterhin CONTENT_W ergeben.
  const cols = [
    { title: 'Nachname',                key: 'lastName',   w: 80 },
    { title: 'Vorname',                 key: 'firstName',  w: 105 },
    { title: 'Titel der Diplomarbeit',  key: 'title',      w: 195 },
    { title: 'Sprache',                 key: 'language',   w: 55 },
    { title: 'Fachbereich',             key: 'department', w: 85 },
    { title: 'Dozent/in',               key: 'coach',      w: 90 },
    { title: 'Expert/in',               key: 'expert',     w: 90 },
    { title: 'Auftraggeber',            key: 'sponsor',    w: 86 },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  if (totalW > CONTENT_W) cols[2].w -= (totalW - CONTENT_W);

  const xs = (() => { const a = []; let x = MARGIN; for (const c of cols) { a.push(x); x += c.w; } return a; })();
  const FS = 8;
  const FS_HEAD = 8;

  const rowH = (values) => {
    doc.font('Helvetica').fontSize(FS);
    let max = 0;
    for (let i = 0; i < cols.length; i++) {
      const hh = doc.heightOfString(values[i] || '', { width: cols[i].w - 2 * PAD });
      if (hh > max) max = hh;
    }
    return Math.max(max + 2 * PAD, 16);
  };
  const headerH = (() => {
    doc.font('Helvetica-Bold').fontSize(FS_HEAD);
    let max = 0;
    for (const c of cols) {
      const hh = doc.heightOfString(c.title, { width: c.w - 2 * PAD });
      if (hh > max) max = hh;
    }
    return max + 2 * PAD;
  })();

  const drawHeader = (yy) => {
    doc.rect(MARGIN, yy, cols.reduce((s, c) => s + c.w, 0), headerH).fillAndStroke('#f0f0f0', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS_HEAD);
    cols.forEach((c, i) => doc.text(c.title, xs[i] + PAD, yy + PAD, { width: c.w - 2 * PAD }));
    return yy + headerH;
  };
  const drawRow = (yy, values, h) => {
    for (let i = 0; i < cols.length; i++) {
      doc.rect(xs[i], yy, cols[i].w, h).stroke('#999');
      doc.fillColor('black').font('Helvetica').fontSize(FS)
        .text(values[i] || '', xs[i] + PAD, yy + PAD, { width: cols[i].w - 2 * PAD });
    }
  };

  y = drawHeader(y);

  // Studierende untereinander auflisten — pro Studierender eine Zeile.
  // Dozent/innen und Expert/innen werden komma-separiert (Mehrfachbelegung möglich).
  const rows = [];
  for (const t of theses) {
    const coachNames = (t.coaches || []).map(c => `${c.name || ''}, ${c.firstname || ''}`.replace(/^, |, $/g, '')).join('; ');
    const expertNames = (t.experts || []).map(e => `${e.name || ''}, ${e.firstname || ''}`.replace(/^, |, $/g, '')).join('; ');
    const sponsor = t.sponsor || '';
    const deptName = (t.department && t.department.name) || '';
    const language = t.language === 'fr' ? 'Französisch' : 'Deutsch';
    const students = (t.students || []);
    const repetSuffix = t.is_repetent ? ' (Repetent)' : '';
    if (students.length === 0) {
      rows.push({ lastName: '', firstName: '' + repetSuffix, title: t.title || '', language, department: deptName, coach: coachNames, expert: expertNames, sponsor });
    } else {
      for (const s of students) {
        rows.push({
          lastName: s.name || '',
          firstName: (s.firstname || '') + repetSuffix,
          title: t.title || '',
          language,
          department: deptName,
          coach: coachNames,
          expert: expertNames,
          sponsor,
        });
      }
    }
  }

  // Stabile Sortierung nach Nachname, Vorname (Schweiz-Locale) — ohne den
  // „(Repetent)"-Suffix, damit Repetenten nicht ans Ende gruppiert werden.
  const stripRep = (s) => (s || '').replace(/\s*\(Repetent\)\s*$/, '');
  rows.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'de-CH')
    || stripRep(a.firstName).localeCompare(stripRep(b.firstName), 'de-CH'));

  for (const r of rows) {
    const values = cols.map(c => r[c.key] || '');
    const h = rowH(values);
    if (y + h > BOTTOM_LIMIT) {
      doc.addPage();
      y = drawHeader(CONTENT_TOP);
    }
    drawRow(y, values, h);
    y += h;
  }

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#777')
      .text('Keine Diplomarbeiten vorhanden.', MARGIN, y + 6);
    doc.fillColor('black');
  }

  // Kopf-/Fusszeile auf jeder Seite: links ThesisBuddy, Mitte Druckdatum, rechts Seite x/y.
  // Logo oben rechts.
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const w = doc.page.width;
    const h = doc.page.height;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    drawLogo(doc, w - MARGIN, 6);

    doc.font('Helvetica').fontSize(7).fillColor('#555');
    doc.text('ThesisBuddy', MARGIN, h - 22, { lineBreak: false });
    const midW = 200;
    doc.text(printDate || '', (w - midW) / 2, h - 22, { width: midW, align: 'center', lineBreak: false });
    doc.text(`Seite ${i + 1} von ${total}`, w - MARGIN - 160, h - 22, { width: 160, align: 'right', lineBreak: false });
    doc.fillColor('black');

    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

// ---------- Feedbackformular (Portrait, ein Blatt) ----------

const FB_LABELS_DE = {
  title: 'Diplomarbeit: Feedback für Studierende',
  name: 'Name',
  year: 'Diplomjahr',
  topic: 'Thema',
  department: 'Fachbereich',
  feedback: 'Rückmeldung',
  finalGrade: 'Modulnote Diplomarbeit',
  coach: 'Dozent/in',
  expert: 'Experte/Expertin',
  deptLead: 'Fachbereichsleiter/in',
  signature: 'Unterschrift',
};
const FB_LABELS_FR = {
  title: 'Travail de diplôme : Feedback pour les étudiant·e·s',
  name: 'Nom',
  year: 'Année du diplôme',
  topic: 'Sujet',
  department: 'Section',
  feedback: 'Retour',
  finalGrade: 'Note module Travail de diplôme',
  coach: 'Enseignant·e',
  expert: 'Expert·e',
  deptLead: 'Responsable de section',
  signature: 'Signature',
};

// data = { language, thesis, milestoneLabel, groupGrades:[{name,grade}], moduleGrade,
//          feedbackText, coachName, expertName, deptLeadName }
function streamFeedbackFormPdf(res, data) {
  const isFr = data.language === 'fr';
  const L = isFr ? FB_LABELS_FR : FB_LABELS_DE;
  const { thesis, milestoneLabel, groupGrades, moduleGrade, feedbackText } = data;

  const PG_MARGIN = 50;
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: PG_MARGIN, bufferPages: true });
  doc.pipe(res);

  const W = doc.page.width;
  const FOOT_TXT = 'Feedbackformular' + (milestoneLabel ? ' – ' + milestoneLabel : '');

  // Schullogo oben rechts
  drawLogo(doc, W - PG_MARGIN, 8);

  // Titel (etwas kleiner als zuvor, damit der Rest mehr Platz hat)
  doc.fillColor('black').font('Helvetica-Bold').fontSize(14)
    .text(L.title, PG_MARGIN, PG_MARGIN);
  let y = doc.y + 10;

  // Stammdaten-Block — kompakter
  const labelW = 110;
  const valW = W - 2 * PG_MARGIN - labelW;
  const studentText = (thesis.students || []).map(s => `${s.firstname || ''} ${s.name || ''}`.trim()).filter(Boolean).join(', ') || '—';
  const rows = [
    [L.name, studentText],
    [L.year, thesis.year ? String(thesis.year.year) : ''],
    [L.topic, thesis.title || ''],
    [L.department, thesis.department ? thesis.department.name : ''],
  ];
  doc.fontSize(9);
  for (const [label, value] of rows) {
    const h = Math.max(
      doc.font('Helvetica').heightOfString(label, { width: labelW }),
      doc.font('Helvetica').heightOfString(value, { width: valW })
    ) + 2;
    doc.font('Helvetica').fillColor('#444').text(label, PG_MARGIN, y, { width: labelW });
    doc.fillColor('black').text(value, PG_MARGIN + labelW, y, { width: valW });
    y += h;
  }

  // Rückmeldung: Markdown-gerendert (Überschriften, **fett**, *kursiv*, Listen).
  // Kleinere Schrift + enger Zeilenabstand, damit das ganze Formular auf eine Seite passt.
  y += 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#222').text(L.feedback, PG_MARGIN, y);
  y = doc.y + 4;
  y = renderMarkdown(doc, feedbackText || '', {
    x: PG_MARGIN,
    y: y,
    width: W - 2 * PG_MARGIN,
    fontSize: 9,
    lineGap: 1.2,
    paragraphGap: 3,
  });
  y += 12;

  // Noten-Tabelle (Gruppen + Modulnote) — kompakter
  const gW = W - 2 * PG_MARGIN;
  const gradeW = 60;
  const rowH = 18;
  doc.lineWidth(0.5).strokeColor('#aaa');
  let yy = y;
  for (const g of (groupGrades || [])) {
    doc.moveTo(PG_MARGIN, yy + rowH).lineTo(PG_MARGIN + gW, yy + rowH).stroke();
    doc.font('Helvetica').fontSize(10).fillColor('black')
      .text(g.name || '', PG_MARGIN + 4, yy + 4, { width: gW - gradeW - 8 });
    doc.text(g.grade != null ? Number(g.grade).toFixed(1) : '—', PG_MARGIN + gW - gradeW, yy + 4, { width: gradeW - 4, align: 'right' });
    yy += rowH;
  }
  // Modulnote (fett)
  doc.moveTo(PG_MARGIN, yy + rowH).lineTo(PG_MARGIN + gW, yy + rowH).stroke();
  doc.font('Helvetica-Bold').fontSize(10)
    .text(L.finalGrade, PG_MARGIN + 4, yy + 4, { width: gW - gradeW - 8 });
  doc.text(moduleGrade != null ? Number(moduleGrade).toFixed(1) : '—', PG_MARGIN + gW - gradeW, yy + 4, { width: gradeW - 4, align: 'right' });
  yy += rowH + 12;

  // Personen-Block (kompakt)
  doc.font('Helvetica').fontSize(9).fillColor('black');
  const persons = [
    [L.coach,    data.coachName || ''],
    [L.expert,   data.expertName || ''],
    [L.deptLead, data.deptLeadName || ''],
  ];
  for (const [label, value] of persons) {
    doc.fillColor('#444').text(label, PG_MARGIN, yy, { width: labelW });
    doc.fillColor('black').text(value, PG_MARGIN + labelW, yy, { width: valW });
    yy += 14;
  }

  // Unterschrift
  yy += 14;
  doc.fillColor('#444').text(L.signature, PG_MARGIN, yy);
  doc.moveTo(PG_MARGIN + labelW, yy + 10).lineTo(W - PG_MARGIN, yy + 10).lineWidth(0.7).strokeColor('#222').stroke();

  // Fusszeile (vergleichbar mit anderen PDFs)
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    const h = doc.page.height;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#555')
      .text(FOOT_TXT, PG_MARGIN, h - 22, { lineBreak: false });
    doc.text(`Seite ${i + 1} von ${total}`, W - PG_MARGIN - 160, h - 22, { width: 160, align: 'right', lineBreak: false });
    doc.fillColor('black');
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
}

module.exports = {
  streamEvaluationPdf,
  streamTransferProjectPdf,
  streamTransferProjectOverviewPdf,
  streamThesesListPdf,
  streamFeedbackFormPdf,
  ROLE_LABELS,
};
