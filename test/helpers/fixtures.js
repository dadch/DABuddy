const {
  sequelize, User, Department, Year, Thesis, ThesisMilestone, ThesisMilestoneDocument,
} = require('../../src/models');

async function createSwarmFixture() {
  const stamp = Date.now();
  const year = await Year.findOne({ where: { is_current: true } });
  if (!year) throw new Error('Kein aktuelles Jahr (is_current) in der DB');

  const mkDept = (suffix) => Department.create({ name: `Test-Schwarm-${stamp}${suffix}` });
  const dept = await mkDept('');
  const deptOther = await mkDept('-b');

  const mkUser = (key, role, depts) => User.create({
    username: `swarmtest_${stamp}_${key}`,
    password: 'swarmtest-pw-1',
    name: `Test${key}`,
    firstname: 'Schwarm',
    email: `swarmtest_${stamp}_${key}@example.invalid`,
    role,
    language: 'de',
  }).then(async (u) => { if (depts) await u.setDepartments(depts); return u; });

  const coachIn = await mkUser('coachIn', 'coach', [dept]);
  const coachOut = await mkUser('coachOut', 'coach', [deptOther]);
  const expertIn = await mkUser('expertIn', 'expert', [dept]);
  const fpc = await mkUser('fpc', 'field_project_coach', [dept]);
  const student = await mkUser('student', 'student');
  const studentOther = await mkUser('studentOther', 'student');

  const mkThesis = async (d, students, extra = {}) => {
    const t = await Thesis.create({
      title: 'Schwarm-Test', year_id: year.id, department_id: d.id, language: 'de',
      is_confidential: false, is_repetent: false, is_locked: false, ...extra,
    });
    if (students) await t.setStudents(students);
    return t;
  };
  const thesis = await mkThesis(dept, [student]);
  const thesisOther = await mkThesis(deptOther, [studentOther]);
  const thesisLocked = await mkThesis(dept, null, { is_locked: true });

  const dueAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const mkTm = (label) => ThesisMilestone.create({
    thesis_id: thesis.id, label, due_at: dueAt, released: true, responsible_role: 'student',
    // TODO Task 2: swarm_feedback_enabled
  });
  const tmSwarm = await mkTm('Projektskizze');
  const tmPlain = await mkTm('Pflichtenheft');

  const mkDoc = (tm) => ThesisMilestoneDocument.create({
    thesis_milestone_id: tm.id, file_name: 'x.pdf', file_path: '/nonexistent/x.pdf',
    mime_type: 'application/pdf', file_size: 1, version: 1, is_current: true, uploaded_by: student.id,
  });
  const docSwarm = await mkDoc(tmSwarm);
  const docPlain = await mkDoc(tmPlain);

  let cleaned = false;
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    for (const t of [thesis, thesisOther, thesisLocked]) {
      await sequelize.query('DELETE FROM theses WHERE id = :id', { replacements: { id: t.id } }).catch(() => {});
    }
    for (const u of [coachIn, coachOut, expertIn, fpc, student, studentOther]) await u.destroy().catch(() => {});
    for (const d of [dept, deptOther]) await d.destroy().catch(() => {});
  }

  return {
    year, dept, deptOther, coachIn, coachOut, expertIn, fpc, student, studentOther,
    thesis, thesisOther, thesisLocked, tmSwarm, tmPlain, docSwarm, docPlain, cleanup,
  };
}

function mkRes() {
  const r = {
    code: 200, body: undefined, view: undefined, data: undefined, headers: {}, redirected: undefined, sentFile: undefined,
    status(c) { r.code = c; return r; },
    json(b) { r.body = b; return r; },
    setHeader(k, v) { r.headers[k] = v; return r; },
    send(b) { r.body = b; return r; },
    sendFile(p) { r.sentFile = p; return r; },
    redirect(u) { r.redirected = u; return r; },
    render(view, data) { r.view = view; r.data = data; return r; },
  };
  return r;
}

function mkReq({ userId, userRole, params = {}, body = {}, query = {} } = {}) {
  return { session: { userId, userRole }, params, body, query, headers: {}, flash: () => [] };
}

const closeDb = () => sequelize.close();

module.exports = { createSwarmFixture, mkRes, mkReq, closeDb };
