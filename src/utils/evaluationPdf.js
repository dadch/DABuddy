const PDFDocument = require('pdfkit');

// ---------- Helpers ----------

const ROLE_LABELS = {
  student: 'Student', coach: 'Dozent/in', expert: 'ExpertIn',
  admin: 'Administrator', department_lead: 'FachbereichsleiterIn', field_project_coach: 'Field Project Coach'
};

const fmtNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
};

const fmtGrade = (g) => (g === null || g === undefined) ? '–' : Number(g).toFixed(1);

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

// Streams a PDF of an evaluation to `res`. data = { thesis, milestone, title, kind, evaluation, freeText }
function streamEvaluationPdf(res, data) {
  const { thesis, milestone } = data;
  const isForm = !!data.evaluation;
  const title = data.title || ('Bewertung ' + (milestone.label || ''));
  const footerLeft = 'Bewertung ' + (milestone.label || '');

  const doc = new PDFDocument({
    size: 'A4',
    layout: isForm ? 'landscape' : 'portrait',
    margin: MARGIN,
    bufferPages: true,
  });
  doc.pipe(res);

  if (isForm) {
    renderForm(doc, { thesis, title, evaluation: data.evaluation });
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
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#c0007a')
      .text('hftm', w - MARGIN - 60, 16, { width: 60, align: 'right', lineBreak: false });
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

function drawThesisInfo(doc, thesis, title, startY, fullWidth) {
  let y = startY;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('black').text(title, MARGIN, y);
  y = doc.y + 4;

  const rows = [
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

function renderForm(doc, { thesis, title, evaluation }) {
  let y = drawThesisInfo(doc, thesis, title, CONTENT_TOP, CONTENT_W);

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
    const resVals = ['Ergebnis: ' + (g.name || ''), fmtNum(groupMax), '', fmtNum(groupAchieved), '', '', '', '', '', '', ''];
    const rh = 16;
    y = ensureSpace(rh, y);
    doc.rect(MARGIN, y, CONTENT_W, rh).fillAndStroke('#f5f5f5', '#888');
    doc.fillColor('black').font('Helvetica-Bold').fontSize(FS);
    doc.text(resVals[0], xs[0] + PAD, y + 4, { width: COLS[0].w - 2 * PAD });
    doc.text(resVals[1], xs[1] + PAD, y + 4, { width: COLS[1].w - 2 * PAD });
    doc.text(resVals[3], xs[3] + PAD, y + 4, { width: COLS[3].w - 2 * PAD });
    // "Note: X.X" über die Stufen-Spalten
    doc.text('Note: ' + fmtGrade(g.grade), xs[4] + PAD, y + 4, { width: (COLS[4].w + COLS[5].w + COLS[6].w) - 2 * PAD });
    y += rh;
    y += 4;
  }

  // Gesamtnote
  y = ensureSpace(18, y);
  doc.rect(MARGIN, y, CONTENT_W, 16).fillAndStroke('#d8e2f3', '#666');
  doc.fillColor('black').font('Helvetica-Bold').fontSize(9)
    .text('Gesamtnote (gewichteter Durchschnitt): ' + fmtGrade(evaluation.overall_grade), MARGIN + PAD, y + 3, { width: CONTENT_W - 2 * PAD });
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

module.exports = { streamEvaluationPdf, ROLE_LABELS };
