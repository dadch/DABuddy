// PDF der Rückmeldung Projektskizze (Schwarmmodus). Beschriftungen kommen über
// die übergebene Übersetzungsfunktion `t` (DE/FR in den Locale-Dateien).
const PDFDocument = require('pdfkit');
const { drawLogo } = require('./evaluationPdf');

const MARGIN = 50;
const LABEL_W = 140;
const CRIT_W = 190;
const GREY = '#666';
const LINE = '#dddddd';
const RECOMMENDATIONS = ['continue', 'continue_with_conditions', 'stop'];

// 'YYYY-MM-DD' als lokales Datum formatieren (kein UTC-Versatz).
function fmtPlainDate(s, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return String(s || '');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale);
}

// data = { feedback, thesis, milestone, language, t }
function streamSwarmFeedbackPdf(res, data) {
  const { feedback, thesis, milestone } = data;
  const language = data.language === 'fr' ? 'fr' : 'de';
  const t = data.t || ((k) => k);
  const locale = language === 'fr' ? 'fr-CH' : 'de-CH';
  const msLabel = (language === 'fr' && milestone && milestone.label_fr) ? milestone.label_fr : ((milestone && milestone.label) || '');

  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: MARGIN, bufferPages: true });
  doc.pipe(res);
  const W = doc.page.width;
  const contentW = W - 2 * MARGIN;
  const bottom = () => doc.page.height - MARGIN;

  drawLogo(doc, W - MARGIN, 8);
  doc.fillColor('black').font('Helvetica-Bold').fontSize(14).text(t('swarm.feedback.title'), MARGIN, MARGIN, { width: contentW - 60 });
  let y = Math.max(doc.y, MARGIN + 20) + 10;

  // Stammdaten
  const author = feedback.author;
  const authorText = author
    ? `${author.firstname || ''} ${author.name || ''}`.trim() + (feedback.author_role ? ` (${t('roles.' + feedback.author_role)})` : '')
    : '—';
  const students = ((thesis && thesis.students) || []).map((s) => `${s.firstname || ''} ${s.name || ''}`.trim()).filter(Boolean).join(', ') || '—';
  const created = feedback.createdAt ? new Date(feedback.createdAt) : new Date();
  const rows = [
    [t('swarm.feedback.student'), students],
    [t('swarm.feedback.author'), authorText || '—'],
    [t('swarm.feedback.date'), created.toLocaleDateString(locale)],
  ];
  if (thesis && thesis.department) rows.push([t('dashboard.department'), thesis.department.name || '']);
  rows.push([t('swarm.feedback.milestone'), msLabel]);
  doc.fontSize(9);
  for (const [label, value] of rows) {
    const h = Math.max(
      doc.font('Helvetica').heightOfString(label, { width: LABEL_W }),
      doc.font('Helvetica').heightOfString(value, { width: contentW - LABEL_W }),
    ) + 2;
    doc.font('Helvetica').fillColor(GREY).text(label, MARGIN, y, { width: LABEL_W });
    doc.fillColor('black').text(value, MARGIN + LABEL_W, y, { width: contentW - LABEL_W });
    y += h;
  }
  y += 10;

  // Kriterien-Tabelle
  const textX = MARGIN + CRIT_W + 10;
  const textW = contentW - CRIT_W - 10;
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(LINE).stroke();
  y += 6;
  for (const n of [1, 2, 3]) {
    const title = t(`swarm.feedback.criteria.c${n}.title`);
    const desc = t(`swarm.feedback.criteria.c${n}.desc`);
    const text = feedback[`criterion_${n}`] || '';
    const leftH = doc.font('Helvetica-Bold').fontSize(9).heightOfString(title, { width: CRIT_W })
      + 2 + doc.font('Helvetica').fontSize(7.5).heightOfString(desc, { width: CRIT_W });
    const rightH = doc.font('Helvetica').fontSize(9).heightOfString(text, { width: textW });
    const rowH = Math.max(leftH, rightH, 30);
    if (y + Math.min(rowH, 120) > bottom()) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(9).fillColor('black').text(title, MARGIN, y, { width: CRIT_W });
    doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(desc, MARGIN, doc.y + 2, { width: CRIT_W });
    doc.font('Helvetica').fontSize(9).fillColor('black').text(text, textX, y, { width: textW });
    y = Math.max(y + rowH, doc.y) + 6;
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor(LINE).stroke();
    y += 8;
  }

  // Empfehlung
  y += 6;
  if (y + 90 > bottom()) { doc.addPage(); y = MARGIN; }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(t('swarm.feedback.recommendation.label'), MARGIN, y, { continued: true });
  doc.font('Helvetica').fontSize(8).fillColor(GREY).text('  ' + t('swarm.feedback.recommendation.hint'));
  y = doc.y + 6;
  for (const opt of RECOMMENDATIONS) {
    doc.lineWidth(0.8).strokeColor('black');
    if (feedback.recommendation === opt) doc.rect(MARGIN, y, 9, 9).fillAndStroke('#000', '#000');
    else doc.rect(MARGIN, y, 9, 9).stroke();
    doc.font('Helvetica').fontSize(9).fillColor('black').text(t('swarm.feedback.recommendation.' + opt), MARGIN + 16, y, { width: contentW - 16 });
    y = Math.max(y + 14, doc.y + 4);
  }

  // Auflage / Stopp
  if (feedback.recommendation !== 'continue' && (feedback.condition_what || feedback.condition_until)) {
    y += 8;
    if (y + 60 > bottom()) { doc.addPage(); y = MARGIN; }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(t('swarm.feedback.conditionTitle'), MARGIN, y, { width: contentW });
    y = doc.y + 4;
    const kv = [];
    if (feedback.condition_what) kv.push([t('swarm.feedback.conditionWhat'), feedback.condition_what]);
    if (feedback.condition_until) kv.push([t('swarm.feedback.conditionUntil'), fmtPlainDate(feedback.condition_until, locale)]);
    for (const [label, value] of kv) {
      if (y + 20 > bottom()) { doc.addPage(); y = MARGIN; }
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(label, MARGIN, y, { width: LABEL_W });
      doc.fillColor('black').text(value, MARGIN + LABEL_W, y, { width: contentW - LABEL_W });
      y = Math.max(y + 12, doc.y) + 4;
    }
  }

  // Fusszeile auf jeder Seite
  const range = doc.bufferedPageRange();
  const footLeft = t('swarm.feedback.listTitle') + (msLabel ? ' – ' + msLabel : '');
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 30;
    doc.font('Helvetica').fontSize(8).fillColor(GREY);
    doc.text(footLeft, MARGIN, fy, { width: contentW - 60, lineBreak: false });
    doc.text(`${i + 1}/${range.count}`, W - MARGIN - 50, fy, { width: 50, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
}

module.exports = { streamSwarmFeedbackPdf };
