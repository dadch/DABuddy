const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('stream');
const swarmMode = require('../src/config/swarmMode');
const { SwarmFeedback, User, ThesisMilestone, Thesis, Department } = require('../src/models');
const { i18next } = require('../src/config/i18n');
const { streamSwarmFeedbackPdf } = require('../src/utils/swarmFeedbackPdf');
const { createSwarmFixture, mkReq, closeDb } = require('./helpers/fixtures');
const { downloadSwarmFeedbackPdf } = require('../src/controllers/apiController');

test.after(closeDb);

async function withMode(active, fn) {
  const before = swarmMode.isActive();
  try { swarmMode.setActive(active); return await fn(); } finally { swarmMode.setActive(before); }
}

const collect = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (c) => chunks.push(c));
  stream.on('end', () => resolve(Buffer.concat(chunks)));
  stream.on('error', reject);
});

async function mkFeedback(f, extra = {}) {
  return SwarmFeedback.create({
    thesis_milestone_id: f.tmSwarm.id, thesis_id: f.thesis.id, author_user_id: f.coachIn.id, author_role: 'coach', language: 'de',
    criterion_1: 'Klar beschrieben', criterion_2: 'Zeile 1\nZeile 2', criterion_3: null,
    recommendation: 'continue_with_conditions', condition_what: 'Ziele schärfen', condition_until: '2026-12-15',
    ...extra,
  });
}

async function loadFull(sf) {
  const feedback = await SwarmFeedback.findByPk(sf.id, { include: [{ model: User, as: 'author' }, { model: ThesisMilestone, as: 'thesisMilestone' }] });
  const thesis = await Thesis.findByPk(feedback.thesisMilestone.thesis_id, {
    include: [{ model: User, as: 'students' }, { model: Department, as: 'department' }],
  });
  return { feedback, thesis, milestone: feedback.thesisMilestone };
}

for (const language of ['de', 'fr']) {
  test(`streamSwarmFeedbackPdf liefert PDF-Buffer (${language})`, async () => {
    const f = await createSwarmFixture();
    try {
      const sf = await mkFeedback(f);
      const sink = new PassThrough();
      const done = collect(sink);
      streamSwarmFeedbackPdf(sink, { ...(await loadFull(sf)), language, t: i18next.getFixedT(language) });
      const buf = await done;
      assert.equal(buf.slice(0, 4).toString(), '%PDF');
      assert.ok(buf.length > 1000);
    } finally { await f.cleanup(); }
  });
}

test('streamSwarmFeedbackPdf wirft nicht bei fehlenden Feldern', async () => {
  const f = await createSwarmFixture();
  try {
    const sf = await mkFeedback(f, { criterion_1: null, criterion_2: null, recommendation: 'continue', condition_what: null, condition_until: null });
    const data = await loadFull(sf);
    data.feedback.author = null;
    data.thesis.students = [];
    data.thesis.department = null;
    const sink = new PassThrough();
    const done = collect(sink);
    streamSwarmFeedbackPdf(sink, { ...data, language: 'de', t: i18next.getFixedT('de') });
    assert.equal((await done).slice(0, 4).toString(), '%PDF');
  } finally { await f.cleanup(); }
});

async function callPdf(user, role, id, lang = 'de') {
  const res = new PassThrough();
  res.headers = {};
  res.locals = { lang };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; res.end(); return res; };
  const req = mkReq({ userId: user.id, userRole: role, params: { id } });
  req.t = i18next.getFixedT(lang);
  const done = collect(res);
  await downloadSwarmFeedbackPdf(req, res);
  res.buf = await done;
  return res;
}

test('GET pdf: Student bei Modus an 403; coachIn 200 PDF; coachOut 403; unbekannt 404', async () => {
  const f = await createSwarmFixture();
  try {
    const sf = await mkFeedback(f);
    await withMode(true, async () => {
      const s = await callPdf(f.student, 'student', sf.id);
      assert.equal(s.code, 403);
      const ok = await callPdf(f.coachIn, 'coach', sf.id, 'fr');
      assert.equal(ok.code, undefined);
      assert.equal(ok.headers['Content-Type'], 'application/pdf');
      assert.match(ok.headers['Content-Disposition'], /^inline; filename="Rueckmeldung_Projektskizze_/);
      assert.equal(ok.buf.slice(0, 4).toString(), '%PDF');
      assert.equal((await callPdf(f.coachOut, 'coach', sf.id)).code, 403);
      assert.equal((await callPdf(f.coachIn, 'coach', 999999999)).code, 404);
    });
  } finally { await f.cleanup(); }
});

test('Archiv einer Arbeit enthält die Rückmeldungs-PDF', async () => {
  const { buildThesisArchiveBuffer } = require('../src/utils/thesisArchive');
  const f = await createSwarmFixture();
  try {
    await mkFeedback(f);
    const buf = await buildThesisArchiveBuffer(f.thesis.id);
    // Kein ZIP-Leser im Projekt: Dateinamen stehen unkomprimiert in den
    // Local-File-Headern bzw. im Central Directory des ZIP.
    const names = buf.toString('latin1').match(/[^\x00/]*\/Rueckmeldung_Projektskizze_[^\x00]*?\.pdf/g) || [];
    assert.ok(buf.includes(Buffer.from('Rueckmeldung_Projektskizze_')), 'Eintrag fehlt im Archiv');
    assert.ok(names.some(n => /Rueckmeldung_Projektskizze_.*\.pdf$/.test(n)), JSON.stringify(names));
  } finally { await f.cleanup(); }
});
