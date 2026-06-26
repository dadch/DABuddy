const {
  sequelize,
  Milestone, ThesisMilestone, Thesis, ThesisLog, User, Year, Department,
  EvaluationForm, EvaluationGroup, EvaluationCriterion,
  ThesisEvaluation, ThesisEvaluationGroup, ThesisEvaluationCriterion,
} = require('../models');
const { computeGroupGrade, computeOverallGrade } = require('../utils/grading');
const { userHasThesisAccess } = require('../utils/thesisAccess');
const { streamEvaluationPdf, streamTransferProjectPdf, streamTransferProjectOverviewPdf, streamThesesListPdf, streamFeedbackFormPdf } = require('../utils/evaluationPdf');
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { /* SDK optional */ }

const emptyLevels = () => ['', '', '', '', '', ''];

// Normalise a 6-element level description array.
const normalizeLevels = (arr) => {
  const out = emptyLevels();
  if (Array.isArray(arr)) {
    for (let i = 0; i < 6; i++) out[i] = (arr[i] === undefined || arr[i] === null) ? '' : String(arr[i]);
  }
  return out;
};

// ---------- Evaluation form templates (admin) ----------

const listForms = async (req, res) => {
  try {
    const forms = await EvaluationForm.findAll({
      include: [{ model: EvaluationGroup, as: 'groups', attributes: ['id'] }],
      order: [['title_de', 'ASC']],
    });
    res.json(forms.map(f => ({
      id: f.id, title_de: f.title_de, title_fr: f.title_fr, groupCount: f.groups ? f.groups.length : 0
    })));
  } catch (e) {
    console.error('Error listing evaluation forms:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const getForm = async (req, res) => {
  try {
    const form = await EvaluationForm.findByPk(req.params.id, {
      include: [{
        model: EvaluationGroup, as: 'groups',
        include: [{ model: EvaluationCriterion, as: 'criteria' }]
      }],
      order: [
        [{ model: EvaluationGroup, as: 'groups' }, 'position', 'ASC'],
        [{ model: EvaluationGroup, as: 'groups' }, { model: EvaluationCriterion, as: 'criteria' }, 'position', 'ASC'],
      ]
    });
    if (!form) return res.status(404).json({ success: false, message: 'Formular nicht gefunden' });
    res.json({ success: true, form });
  } catch (e) {
    console.error('Error fetching evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createForm = async (req, res) => {
  try {
    const { title_de, title_fr } = req.body;
    if (!title_de || !title_fr) return res.status(400).json({ success: false, message: 'Titel (DE und FR) sind erforderlich' });
    const form = await EvaluationForm.create({ title_de, title_fr });
    res.json({ success: true, form });
  } catch (e) {
    console.error('Error creating evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateForm = async (req, res) => {
  try {
    const { title_de, title_fr } = req.body;
    const form = await EvaluationForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Formular nicht gefunden' });
    await form.update({ title_de: title_de ?? form.title_de, title_fr: title_fr ?? form.title_fr });
    res.json({ success: true, form });
  } catch (e) {
    console.error('Error updating evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteForm = async (req, res) => {
  try {
    const form = await EvaluationForm.findByPk(req.params.id);
    if (!form) return res.status(404).json({ success: false, message: 'Formular nicht gefunden' });
    await form.destroy(); // cascades to groups/criteria; milestone refs SET NULL
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createGroup = async (req, res) => {
  try {
    const { formId } = req.params;
    const { name_de, name_fr, weight } = req.body;
    if (!name_de || !name_fr) return res.status(400).json({ success: false, message: 'Gruppenname (DE und FR) sind erforderlich' });
    const form = await EvaluationForm.findByPk(formId);
    if (!form) return res.status(404).json({ success: false, message: 'Formular nicht gefunden' });
    const count = await EvaluationGroup.count({ where: { evaluation_form_id: formId } });
    const group = await EvaluationGroup.create({
      evaluation_form_id: formId, name_de, name_fr,
      weight: weight ?? 1, position: count,
    });
    res.json({ success: true, group });
  } catch (e) {
    console.error('Error creating group:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateGroup = async (req, res) => {
  try {
    const { name_de, name_fr, weight, position } = req.body;
    const group = await EvaluationGroup.findByPk(req.params.groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Gruppe nicht gefunden' });
    await group.update({
      name_de: name_de ?? group.name_de,
      name_fr: name_fr ?? group.name_fr,
      weight: weight ?? group.weight,
      position: position ?? group.position,
    });
    res.json({ success: true, group });
  } catch (e) {
    console.error('Error updating group:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const group = await EvaluationGroup.findByPk(req.params.groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Gruppe nicht gefunden' });
    await group.destroy();
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting group:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createCriterion = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { label_de, label_fr, weight, level_descriptions_de, level_descriptions_fr } = req.body;
    if (!label_de || !label_fr) return res.status(400).json({ success: false, message: 'Kriterium (DE und FR) sind erforderlich' });
    const group = await EvaluationGroup.findByPk(groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Gruppe nicht gefunden' });
    const count = await EvaluationCriterion.count({ where: { evaluation_group_id: groupId } });
    const criterion = await EvaluationCriterion.create({
      evaluation_group_id: groupId, label_de, label_fr,
      weight: weight ?? 1, position: count,
      level_descriptions_de: normalizeLevels(level_descriptions_de),
      level_descriptions_fr: normalizeLevels(level_descriptions_fr),
    });
    res.json({ success: true, criterion });
  } catch (e) {
    console.error('Error creating criterion:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateCriterion = async (req, res) => {
  try {
    const { label_de, label_fr, weight, position, level_descriptions_de, level_descriptions_fr } = req.body;
    const criterion = await EvaluationCriterion.findByPk(req.params.criterionId);
    if (!criterion) return res.status(404).json({ success: false, message: 'Kriterium nicht gefunden' });
    await criterion.update({
      label_de: label_de ?? criterion.label_de,
      label_fr: label_fr ?? criterion.label_fr,
      weight: weight ?? criterion.weight,
      position: position ?? criterion.position,
      level_descriptions_de: level_descriptions_de ? normalizeLevels(level_descriptions_de) : criterion.level_descriptions_de,
      level_descriptions_fr: level_descriptions_fr ? normalizeLevels(level_descriptions_fr) : criterion.level_descriptions_fr,
    });
    res.json({ success: true, criterion });
  } catch (e) {
    console.error('Error updating criterion:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteCriterion = async (req, res) => {
  try {
    const criterion = await EvaluationCriterion.findByPk(req.params.criterionId);
    if (!criterion) return res.status(404).json({ success: false, message: 'Kriterium nicht gefunden' });
    await criterion.destroy();
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting criterion:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Reorder criteria within a group. Body: { order: [criterionId, ...] }
const reorderCriteria = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'Ungültige Reihenfolge' });

    const group = await EvaluationGroup.findByPk(groupId);
    if (!group) return res.status(404).json({ success: false, message: 'Gruppe nicht gefunden' });

    const crits = await EvaluationCriterion.findAll({ where: { evaluation_group_id: groupId }, attributes: ['id'] });
    const validIds = new Set(crits.map(c => c.id));

    await sequelize.transaction(async (t) => {
      let pos = 0;
      for (const raw of order) {
        const cid = parseInt(raw);
        if (!validIds.has(cid)) continue;
        await EvaluationCriterion.update({ position: pos }, { where: { id: cid, evaluation_group_id: groupId }, transaction: t });
        pos += 1;
      }
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Error reordering criteria:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Thesis evaluation (snapshot + fill) ----------

// Build a thesis-scoped snapshot of the assigned form in the thesis language.
// kind: 'single' | 'first' | 'second' | 'final'; evaluatorRole = owning role (null for final/single uses milestone role).
async function buildSnapshot(thesisMilestone, language, kind, evaluatorRole) {
  const form = await EvaluationForm.findByPk(thesisMilestone.evaluation_form_id, {
    include: [{ model: EvaluationGroup, as: 'groups', include: [{ model: EvaluationCriterion, as: 'criteria' }] }],
    order: [
      [{ model: EvaluationGroup, as: 'groups' }, 'position', 'ASC'],
      [{ model: EvaluationGroup, as: 'groups' }, { model: EvaluationCriterion, as: 'criteria' }, 'position', 'ASC'],
    ]
  });
  if (!form) return null;

  return await sequelize.transaction(async (t) => {
    const evaluation = await ThesisEvaluation.create({
      thesis_milestone_id: thesisMilestone.id,
      source_form_id: form.id,
      language,
      kind: kind || 'single',
      evaluator_role: evaluatorRole || null,
      form_title: language === 'fr' ? form.title_fr : form.title_de,
    }, { transaction: t });

    for (const g of form.groups) {
      const sg = await ThesisEvaluationGroup.create({
        thesis_evaluation_id: evaluation.id,
        name: language === 'fr' ? g.name_fr : g.name_de,
        weight: g.weight,
        position: g.position,
      }, { transaction: t });

      for (const c of g.criteria) {
        await ThesisEvaluationCriterion.create({
          thesis_evaluation_group_id: sg.id,
          label: language === 'fr' ? c.label_fr : c.label_de,
          weight: c.weight,
          position: c.position,
          level_descriptions: language === 'fr' ? c.level_descriptions_fr : c.level_descriptions_de,
        }, { transaction: t });
      }
    }
    return evaluation.id;
  });
}

const loadFullEvaluation = (evaluationId) => ThesisEvaluation.findByPk(evaluationId, {
  include: [{
    model: ThesisEvaluationGroup, as: 'groups',
    include: [{ model: ThesisEvaluationCriterion, as: 'criteria' }]
  }],
  order: [
    [{ model: ThesisEvaluationGroup, as: 'groups' }, 'position', 'ASC'],
    [{ model: ThesisEvaluationGroup, as: 'groups' }, { model: ThesisEvaluationCriterion, as: 'criteria' }, 'position', 'ASC'],
  ]
});

// Flatten an evaluation's criteria in stable (group position, criterion position) order.
const flattenCriteria = (evaluation) => {
  const out = [];
  (evaluation.groups || []).slice().sort((a, b) => a.position - b.position).forEach(g => {
    (g.criteria || []).slice().sort((a, b) => a.position - b.position).forEach(c => out.push(c));
  });
  return out;
};

// Recompute group + overall grades and completed flag for an evaluation.
const recomputeEvaluationGrades = async (evaluationId, userId, t) => {
  const fresh = await ThesisEvaluation.findByPk(evaluationId, {
    include: [{ model: ThesisEvaluationGroup, as: 'groups', include: [{ model: ThesisEvaluationCriterion, as: 'criteria' }] }],
    transaction: t,
  });
  const groupGrades = [];
  for (const g of fresh.groups) {
    const grade = computeGroupGrade(g.criteria.map(c => ({ score: c.score, weight: c.weight })));
    await ThesisEvaluationGroup.update({ grade }, { where: { id: g.id }, transaction: t });
    groupGrades.push({ grade, weight: g.weight });
  }
  const overall = computeOverallGrade(groupGrades);
  const allScored = fresh.groups.every(g => g.criteria.every(c => c.score !== null && c.score !== undefined));
  const patch = { overall_grade: overall, completed: allScored };
  if (userId !== undefined) { patch.evaluated_by = userId; patch.evaluated_at = new Date(); }
  await ThesisEvaluation.update(patch, { where: { id: evaluationId }, transaction: t });
};

// Determine config (roles per kind) for a thesis milestone.
const evaluationKinds = (tm) => {
  if (tm.double_evaluation) {
    return {
      first: { role: tm.evaluator_role },
      second: { role: tm.evaluator_role_2 },
      final: { role: null }, // either role 1 or 2
    };
  }
  return { single: { role: tm.evaluator_role } };
};

const canEditKind = (tm, kind, userRole) => {
  if (userRole === 'admin') return true;
  if (kind === 'final') return userRole === tm.evaluator_role || userRole === tm.evaluator_role_2;
  if (kind === 'first') return userRole === tm.evaluator_role;
  if (kind === 'second') return userRole === tm.evaluator_role_2;
  return userRole === tm.evaluator_role; // single
};

// View rules: hidden-until-final for the two individual evaluations.
const canViewKind = (tm, kind, userRole, finalExists) => {
  if (userRole === 'admin') return true;
  if (!tm.double_evaluation) return true; // single: all thesis participants may view
  if (kind === 'final') return true;
  if (kind === 'first') return userRole === tm.evaluator_role || finalExists;
  if (kind === 'second') return userRole === tm.evaluator_role_2 || finalExists;
  return true;
};

// GET the structured evaluation for a thesis milestone (optionally for a specific kind).
// Creates the snapshot lazily when an authorized evaluator/admin opens it.
const getThesisEvaluation = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    let kind = req.query.kind;

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (userRole === 'field_project_coach' && !tm.is_transfer_project) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });
    }

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (!tm.evaluation_form_id) {
      return res.json({ success: true, hasForm: false });
    }

    const kinds = evaluationKinds(tm);
    if (!kind || !kinds[kind]) kind = tm.double_evaluation ? 'final' : 'single';

    const finalExists = tm.double_evaluation
      ? !!(await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind: 'final' } }))
      : false;

    if (!canViewKind(tm, kind, userRole, finalExists)) {
      return res.json({ success: true, hasForm: true, started: false, hidden: true });
    }

    let existing = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind } });

    if (!existing) {
      // Lazy create only when an authorized editor opens it.
      if (!canEditKind(tm, kind, userRole)) {
        return res.json({ success: true, hasForm: true, started: false });
      }
      const thesis = await Thesis.findByPk(tm.thesis_id, { attributes: ['id', 'language'] });
      const language = thesis ? thesis.language : 'de';
      const evalId = await buildSnapshot(tm, language, kind, kinds[kind].role);
      if (!evalId) return res.status(400).json({ success: false, message: 'Zugewiesenes Formular nicht gefunden' });

      // Hinweis: Bei kind === 'final' wird die finale Bewertung bewusst LEER erzeugt.
      // Die Vorschläge der beiden Bewerter werden im Frontend pro Kriterium angezeigt
      // und können einzeln per "Übernehmen"-Button in die finale Bewertung übernommen
      // werden (Score: ersetzt; Kommentar: additiv, idempotent).
      existing = { id: evalId };
    }

    const evaluation = await loadFullEvaluation(existing.id);
    const editable = canEditKind(tm, kind, userRole);

    // Für die finale Bewertung die zwei Vorbewertungen pro Kriterium zur Anzeige
    // mitliefern. Mapping: peers[finalCriterionId] = { first: {...}, second: {...} }.
    let peers = null;
    if (tm.double_evaluation && kind === 'final') {
      const firstEvalRow = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind: 'first' } });
      const secondEvalRow = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind: 'second' } });
      const firstFull = firstEvalRow ? await loadFullEvaluation(firstEvalRow.id) : null;
      const secondFull = secondEvalRow ? await loadFullEvaluation(secondEvalRow.id) : null;
      const finalCrits = flattenCriteria(evaluation);
      const firstCrits = firstFull ? flattenCriteria(firstFull) : [];
      const secondCrits = secondFull ? flattenCriteria(secondFull) : [];
      peers = {};
      finalCrits.forEach((fc, i) => {
        peers[fc.id] = {
          first:  firstCrits[i]  ? { score: firstCrits[i].score,  remark: firstCrits[i].remark,  role: tm.evaluator_role }   : null,
          second: secondCrits[i] ? { score: secondCrits[i].score, remark: secondCrits[i].remark, role: tm.evaluator_role_2 } : null,
        };
      });
    }

    res.json({ success: true, hasForm: true, started: true, kind, editable, evaluation, peers });
  } catch (e) {
    console.error('Error getting thesis evaluation:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Save scores + remarks for a given kind; validate, recompute grades, log.
const saveThesisEvaluation = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const { criteria } = req.body; // [{ id, score, remark }]

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (userRole === 'field_project_coach' && !tm.is_transfer_project) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });
    }

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    const kinds = evaluationKinds(tm);
    let kind = req.body.kind;
    if (!kind || !kinds[kind]) kind = tm.double_evaluation ? 'final' : 'single';

    if (!canEditKind(tm, kind, userRole)) {
      return res.status(403).json({ success: false, message: 'Ihre Rolle ist nicht berechtigt, diese Bewertung vorzunehmen' });
    }

    const existing = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind } });
    if (!existing) return res.status(404).json({ success: false, message: 'Bewertung wurde noch nicht initialisiert' });
    const evaluation = await loadFullEvaluation(existing.id);

    const answers = {};
    (criteria || []).forEach(a => { answers[a.id] = a; });

    const allCriteria = [];
    evaluation.groups.forEach(g => g.criteria.forEach(c => allCriteria.push(c)));
    for (const c of allCriteria) {
      const a = answers[c.id];
      if (!a) continue;
      if (a.score !== null && a.score !== undefined && a.score !== '') {
        const sc = Number(a.score);
        if (!Number.isInteger(sc) || sc < 0 || sc > 5) {
          return res.status(400).json({ success: false, message: `Ungültige Punktzahl bei "${c.label}" (0-5 erlaubt)` });
        }
        if (sc < 3) {
          const remark = (a.remark || '').trim();
          if (remark.length < 10) {
            return res.status(400).json({ success: false, message: `Bei "${c.label}" ist bei einer Bewertung unter 3 eine Bemerkung von mindestens 10 Zeichen erforderlich` });
          }
        }
      }
    }

    await sequelize.transaction(async (t) => {
      for (const c of allCriteria) {
        const a = answers[c.id];
        if (!a) continue;
        const score = (a.score === null || a.score === undefined || a.score === '') ? null : Number(a.score);
        await ThesisEvaluationCriterion.update(
          { score, remark: a.remark ? String(a.remark) : null },
          { where: { id: c.id }, transaction: t }
        );
      }
      await recomputeEvaluationGrades(evaluation.id, userId, t);
    });

    const phaseLabel = kind === 'first' ? 'Bewertung 1' : kind === 'second' ? 'Bewertung 2' : kind === 'final' ? 'Finale Bewertung' : 'Bewertung';
    await ThesisLog.create({
      thesis_id: tm.thesis_id,
      thesis_milestone_id: tm.id,
      user_id: userId,
      action: 'evaluation_update',
      detail: `${tm.label}: ${phaseLabel} gespeichert`,
    });

    const updated = await loadFullEvaluation(evaluation.id);
    res.json({ success: true, message: 'Bewertung gespeichert', evaluation: updated });
  } catch (e) {
    console.error('Error saving thesis evaluation:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// GET a printable PDF of an evaluation (free text or form, optional kind).
const printThesisEvaluation = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).send('Meilenstein nicht gefunden');
    if (userRole === 'field_project_coach' && !tm.is_transfer_project) {
      return res.status(403).send('Keine Berechtigung für diesen Meilenstein');
    }

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).send('Keine Berechtigung');

    const thesis = await Thesis.findByPk(tm.thesis_id, {
      include: [
        { model: Year, as: 'year', attributes: ['year'] },
        { model: Department, as: 'department', attributes: ['name'] },
        { model: User, as: 'students', attributes: ['firstname', 'name'] },
      ]
    });

    // PDF-Sprache richtet sich nach der Diplomarbeit (vereinbart): FR-DA →
    // Meilenstein-Titel auf FR (Fallback DE), sonst DE.
    const isFr = thesis.language === 'fr';
    const tmLabelLocal = (isFr && tm.label_fr) ? tm.label_fr : (tm.label || '');
    const title = 'Bewertung ' + tmLabelLocal;
    const safeName = ('Bewertung_' + (tmLabelLocal || 'Meilenstein')).replace(/[^a-zA-Z0-9_-]+/g, '_');

    // Freitext-Bewertung
    if (!tm.evaluation_form_id) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
      return streamEvaluationPdf(res, { thesis, milestone: tm, title, freeText: tm.evaluation });
    }

    // Formular-Bewertung – passende kind bestimmen + Sichtbarkeit prüfen
    const kinds = evaluationKinds(tm);
    let kind = req.query.kind;
    if (!kind || !kinds[kind]) kind = tm.double_evaluation ? 'final' : 'single';

    const finalExists = tm.double_evaluation
      ? !!(await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind: 'final' } }))
      : false;
    if (!canViewKind(tm, kind, userRole, finalExists)) {
      return res.status(403).send('Diese Einzelbewertung ist verdeckt, bis die finale Bewertung erstellt wurde.');
    }

    const existing = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind } });
    if (!existing) return res.status(404).send('Für diese Bewertung wurde noch nichts erfasst.');
    const evaluation = await loadFullEvaluation(existing.id);

    const phaseLabels = { first: ' (Bewertung 1)', second: ' (Bewertung 2)', final: ' (Finale Bewertung)' };
    const docTitle = title + (phaseLabels[kind] || '');
    const fileSuffix = kind && kind !== 'single' ? ('_' + kind) : '';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}${fileSuffix}.pdf"`);
    streamEvaluationPdf(res, { thesis, milestone: tm, title: docTitle, evaluation });
  } catch (e) {
    console.error('Error printing thesis evaluation:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// Zusammenzug aller Bewertungen der Transferprojekt-Meilensteine einer DA als PDF.
// Sichtbarkeit: Studierende, Dozierende, FachbereichsleiterIn und Admin.
const printTransferProjectSummary = async (req, res) => {
  try {
    const thesisId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const ALLOWED = ['student', 'coach', 'department_lead', 'admin', 'field_project_coach'];
    if (!ALLOWED.includes(userRole)) return res.status(403).send('Keine Berechtigung');

    const access = await userHasThesisAccess(userId, userRole, thesisId);
    if (!access) return res.status(403).send('Keine Berechtigung');

    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Year, as: 'year', attributes: ['year'] },
        { model: Department, as: 'department', attributes: ['name'] },
        { model: User, as: 'students', attributes: ['firstname', 'name'] },
      ]
    });
    if (!thesis) return res.status(404).send('Diplomarbeit nicht gefunden');

    // Alle Transferprojekt-Meilensteine dieser DA, in Reihenfolge nach Fälligkeit.
    const tms = await ThesisMilestone.findAll({
      where: { thesis_id: thesisId, is_transfer_project: true },
      order: [['due_at', 'ASC'], ['id', 'ASC']],
    });

    if (tms.length === 0) {
      return res.status(404).send('Diese Diplomarbeit hat keine Transferprojekt-Meilensteine.');
    }

    // Pro Meilenstein die passende Bewertung lesen (final bei Doppel-, sonst single).
    const items = [];
    const grades = [];
    for (const tm of tms) {
      const item = { milestoneLabel: tm.label, evaluation: null };
      // Bei Doppelbewertung greift die finale Bewertung, sonst die Single.
      // Die Bewertung wird unabhängig vom aktuellen tm.evaluation_form_id geladen
      // (der Snapshot speichert den Formular-Inhalt selbst, das Template kann sich
      // zwischenzeitlich geändert haben).
      const kind = tm.double_evaluation ? 'final' : 'single';
      const evalRow = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind } });
      if (evalRow) {
        item.evaluation = await loadFullEvaluation(evalRow.id);
        if (item.evaluation && item.evaluation.overall_grade !== null && item.evaluation.overall_grade !== undefined) {
          grades.push(Number(item.evaluation.overall_grade));
        }
      }
      items.push(item);
    }

    // Durchschnitt aller vorhandenen Gesamtnoten, auf 1 Komma gerundet.
    let averageGrade = null;
    if (grades.length > 0) {
      const sum = grades.reduce((a, b) => a + b, 0);
      averageGrade = Math.round((sum / grades.length) * 10) / 10;
    }

    const safeName = ('Transferprojekt_' + (thesis.title || 'Diplomarbeit'))
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 80);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    streamTransferProjectPdf(res, { thesis, items, averageGrade });
  } catch (e) {
    console.error('Error printing transfer project summary:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// Gesamtübersicht Transferprojekt: alle (für die jeweilige Rolle sichtbaren)
// Diplomarbeiten des aktuellen Diplomjahres mit ihren Transferprojekt-Noten,
// sortiert nach Nachname/Vorname des ersten Studierenden. Berechtigung:
// FachbereichsleiterIn, Dozent Transferprojekt und Admin.
const printTransferProjectOverview = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const yearId = req.session.selectedYear;

    const ALLOWED = ['department_lead', 'field_project_coach', 'admin'];
    if (!ALLOWED.includes(userRole)) return res.status(403).send('Keine Berechtigung');
    if (!yearId) return res.status(400).send('Kein Diplomjahr ausgewählt');

    const year = await Year.findByPk(yearId);
    if (!year) return res.status(404).send('Diplomjahr nicht gefunden');

    // Transferprojekt-Meilenstein-Vorlagen des Jahres (legt Spaltenreihenfolge fest).
    const tpTemplates = await Milestone.findAll({
      where: { year_id: yearId, is_transfer_project: true },
      order: [['due_at', 'ASC'], ['id', 'ASC']],
    });
    const milestoneLabels = tpTemplates.map(t => t.label);

    // DA-Filter je nach Rolle.
    let thesisWhere = { year_id: yearId };
    let thesisInclude = [
      { model: User, as: 'students', attributes: ['firstname', 'name'] },
      {
        model: ThesisMilestone, as: 'milestones',
        where: { is_transfer_project: true }, required: false,
        include: [{
          model: ThesisEvaluation, as: 'thesisEvaluations',
          attributes: ['kind', 'overall_grade']
        }],
      },
    ];
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const ledIds = ledDepartments.map(d => d.id);
      if (ledIds.length === 0) thesisWhere.id = -1; // kein Treffer
      else thesisWhere.department_id = ledIds;
    } else if (userRole === 'field_project_coach') {
      // Über die fieldProjectCoaches-Beziehung filtern.
      thesisInclude.push({
        model: User, as: 'fieldProjectCoaches', attributes: ['id'],
        where: { id: userId }, required: true, through: { attributes: [] },
      });
    }

    const theses = await Thesis.findAll({
      where: thesisWhere,
      include: thesisInclude,
    });

    // Rows für die Tabelle bauen.
    const rows = theses.map(thesis => {
      const noteByMilestone = {};
      const grades = [];
      // Wir mappen über Label, weil Snapshot.label = Template.label (Snapshot speichert kopierten Wert).
      for (const label of milestoneLabels) {
        const tm = (thesis.milestones || []).find(m => m.label === label);
        let grade = null;
        if (tm) {
          const wantedKind = tm.double_evaluation ? 'final' : 'single';
          const evalRow = (tm.thesisEvaluations || []).find(e => e.kind === wantedKind);
          if (evalRow && evalRow.overall_grade !== null && evalRow.overall_grade !== undefined) {
            grade = Number(evalRow.overall_grade);
          }
        }
        noteByMilestone[label] = grade;
        if (grade !== null) grades.push(grade);
      }
      let average = null;
      if (grades.length > 0) average = Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10;

      // Ersten Studierenden (alphabetisch) für Sortierschlüssel nehmen; alle für Anzeige.
      const sorted = (thesis.students || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '') || (a.firstname || '').localeCompare(b.firstname || '')
      );
      const primary = sorted[0] || { name: '', firstname: '' };
      const studentName = sorted.map(s => s.name).join(' / ') || '—';
      const studentFirstname = sorted.map(s => s.firstname).join(' / ') || '—';

      return {
        sortName: primary.name || '',
        sortFirstname: primary.firstname || '',
        studentName,
        studentFirstname,
        thesisTitle: thesis.title || '',
        noteByMilestone,
        average,
      };
    });

    // Nach Nachname, Vorname sortieren.
    rows.sort((a, b) =>
      a.sortName.localeCompare(b.sortName) || a.sortFirstname.localeCompare(b.sortFirstname)
    );

    const printDate = new Date().toLocaleDateString('de-CH');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Gesamtuebersicht_Transferprojekt_${year.year}.pdf"`);
    streamTransferProjectOverviewPdf(res, {
      year: year.year,
      rows,
      milestoneLabels,
      printDate,
    });
  } catch (e) {
    console.error('Error printing transfer project overview:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// ---------- Feedbackformular ----------

// Berechtigung: am Meilenstein definierte Bewerter-Rolle(n), FachbereichsleiterIn
// und Admin. Für FBL wird die Zuständigkeit zusätzlich von userHasThesisAccess
// auf die geleiteten Fachbereiche eingeschränkt.
function canManageFeedback(tm, userRole) {
  if (userRole === 'admin') return true;
  if (userRole === 'department_lead') return true;
  if (userRole === tm.evaluator_role) return true;
  if (tm.double_evaluation && userRole === tm.evaluator_role_2) return true;
  return false;
}

// Liefert die Daten, die zur Erzeugung/Anzeige des Feedbackformulars gebraucht werden:
// finale Bewertung (Gruppen + Kriterien + Bemerkungen), DA-Stammdaten, Personen.
async function loadFeedbackContext(tm) {
  // Finale Bewertung (bei Doppelbewertung: kind='final'; bei single: kind='single')
  const finalKind = tm.double_evaluation ? 'final' : 'single';
  const evalRow = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id, kind: finalKind } });
  const finalEval = evalRow ? await loadFullEvaluation(evalRow.id) : null;

  const thesis = await Thesis.findByPk(tm.thesis_id, {
    include: [
      { model: Year, as: 'year', attributes: ['year'] },
      { model: Department, as: 'department', attributes: ['name', 'department_lead_id'] },
      { model: User, as: 'students', attributes: ['firstname', 'name'] },
      { model: User, as: 'coaches', attributes: ['firstname', 'name'] },
      { model: User, as: 'experts', attributes: ['firstname', 'name'] },
    ]
  });

  let deptLead = null;
  if (thesis && thesis.department && thesis.department.department_lead_id) {
    deptLead = await User.findByPk(thesis.department.department_lead_id, { attributes: ['firstname', 'name'] });
  }

  const groupGrades = finalEval ? (finalEval.groups || [])
    .slice().sort((a, b) => a.position - b.position)
    .map(g => ({ name: g.name, grade: g.grade != null ? Number(g.grade) : null }))
    : [];
  // Modulnote = Durchschnitt der Gruppen-Noten, auf 1 Komma gerundet.
  const valid = groupGrades.filter(g => g.grade != null);
  const moduleGrade = valid.length > 0
    ? Math.round((valid.reduce((s, g) => s + g.grade, 0) / valid.length) * 10) / 10
    : null;

  const formatNames = (arr) => (arr || []).map(u => `${u.firstname || ''} ${u.name || ''}`.trim()).filter(Boolean).join(', ');
  return {
    thesis, finalEval, groupGrades, moduleGrade,
    coachName: formatNames(thesis ? thesis.coaches : []),
    expertName: formatNames(thesis ? thesis.experts : []),
    deptLeadName: deptLead ? `${deptLead.firstname || ''} ${deptLead.name || ''}`.trim() : '',
  };
}

// Erstellt einen anonymisierten LLM-Prompt aus der finalen Bewertung. Es kommen
// weder Personennamen noch Auftraggeberdaten in den Prompt — nur Bewertungsgruppen,
// Kriterien-Texte, Note und Bemerkung pro Kriterium sowie die Gruppen-Noten.
function buildSummaryPrompt(finalEval, language, moduleGrade) {
  const lines = [];
  for (const g of (finalEval.groups || []).slice().sort((a, b) => a.position - b.position)) {
    lines.push(`# Bewertungsgruppe: ${g.name}${g.grade != null ? ` (Note ${Number(g.grade).toFixed(1)})` : ''}`);
    for (const c of (g.criteria || []).slice().sort((a, b) => a.position - b.position)) {
      const scoreStr = (c.score === null || c.score === undefined) ? '—' : `${c.score}`;
      const label = String(c.label || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
      const remark = String(c.remark || '').trim();
      lines.push(`- Kriterium: ${label}`);
      lines.push(`  Punkte (0–5): ${scoreStr}`);
      lines.push(`  Bemerkung: ${remark || '—'}`);
    }
    lines.push('');
  }
  const data = lines.join('\n');
  const langInstruction = language === 'fr'
    ? 'Rédige le retour final en français.'
    : 'Schreibe die Rückmeldung auf Deutsch.';
  const isGenuegend = moduleGrade != null && moduleGrade >= 4.0;
  const toneInstruction = isGenuegend
    ? '- TONFALL: Die Modulnote ist genügend (≥ 4.0). Formuliere wohlwollend; hebe Stärken hervor und benenne Schwächen sachlich und konstruktiv.'
    : '- TONFALL: Die Modulnote ist UNGENÜGEND (< 4.0). Beschreibe ausschließlich die Mängel — sachlich, klar und ohne Schmähung. VERMEIDE positive Formulierungen, Lob, Relativierungen oder beschönigende Wendungen. Hintergrund: Bei einem allfälligen Rekurs gegen die Bewertung könnten positive Aussagen als Widerspruch gegen die ungenügende Note ausgelegt werden. Erwähne KEINE Stärken, auch wenn solche in einzelnen Kriterien-Bemerkungen vorkommen.';
  const personalAddress = language === 'fr'
    ? '- Adresse-toi directement à la personne étudiante à la deuxième personne du singulier ("tu"). Commence par une formulation personnelle, par ex. : « Avec ce travail, tu as montré que… ».'
    : '- Sprich die/den Studierende/n direkt in der Du-Form an. Beginne den Text mit einer persönlichen Anrede, z. B.: „Du hast mit dieser Arbeit gezeigt, dass …".';
  return [
    'Du erhältst die Bewertungs-Bemerkungen einer Diplomarbeit, gruppiert nach Bewertungsgruppen und Kriterien.',
    'Erstelle eine zusammenhängende Rückmeldung an die/den Studierende/n als ZUSAMMENHÄNGENDEN FLIESSTEXT in ganzen Sätzen.',
    '',
    'Struktur (zwingend einhalten):',
    '- Pro Bewertungsgruppe genau ein Absatz mit GENAU 3–4 Sätzen, der die Erkenntnisse zu den Kriterien dieser Gruppe zusammenführt.',
    '- Abschließender Absatz mit 2–3 Verbesserungsvorschlägen, ebenfalls als ganze Sätze in zusammenhängender Prosa formuliert (z. B. „Künftig solltest du …, ausserdem empfiehlt sich …").',
    '- KEINE Aufzählungen, KEINE Stichpunkt-Listen, KEINE nummerierten Listen, KEINE Bullet Points — auch nicht im Verbesserungsvorschlags-Absatz.',
    '',
    'Anrede:',
    personalAddress,
    '- Verwende durchgängig die Du-Form (bzw. „tu" auf Französisch). Wechsle nicht in die unpersönliche Form.',
    '',
    'Tonfall und Inhalt:',
    `- Modulnote der Arbeit: ${moduleGrade != null ? Number(moduleGrade).toFixed(1) : 'unbekannt'}.`,
    toneInstruction,
    '- Behalte den fachlichen Bezug zu den Kriterien bei; fasse Stärken bzw. Schwächen sachlich zusammen — keine bloße Wiedergabe einzelner Bemerkungen.',
    '- KEINE Personennamen, KEINE Firmen-/Auftraggeber-Namen, KEINE Titel — auch nicht, falls solche in den Bemerkungen vorkommen.',
    '- Bleib bei dem, was in den Bemerkungen steht; erfinde nichts hinzu.',
    '- Halte die Gesamtlänge so kurz, dass die Rückmeldung mitsamt Notenblock und Unterschrift auf eine A4-Seite passt.',
    `- ${langInstruction}`,
    '',
    'Formatierung:',
    '- Du darfst leichtes Markdown verwenden (z. B. **fett** für einzelne wichtige Begriffe), aber KEINE Markdown-Überschriften (#) und KEINE Listen.',
    '',
    'Bewertungsmaterial:',
    data,
  ].join('\n');
}

// POST /api/thesis-milestones/:id/feedback/generate
// LLM erzeugt einen Vorschlag und speichert ihn als feedback_text. Idempotent:
// wenn bereits Text vorhanden, wird der bestehende zurückgeliefert.
const generateFeedbackProposal = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (!tm.feedback_form_enabled) return res.status(400).json({ success: false, message: 'Feedbackformular ist für diesen Meilenstein nicht aktiviert' });
    if (!canManageFeedback(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    // Idempotenz: bereits vorhandenen Text einfach zurückgeben.
    if (tm.feedback_text && tm.feedback_text.trim().length > 0) {
      return res.json({ success: true, feedback_text: tm.feedback_text, source: 'existing' });
    }

    // Geheimhaltung sperrt die LLM-Aufbereitung; manuelles Erfassen bleibt möglich.
    const thesis = await Thesis.findByPk(tm.thesis_id, { attributes: ['is_confidential', 'language'] });
    if (thesis && thesis.is_confidential) {
      return res.status(403).json({ success: false, message: 'Bei Geheimhaltung wird das Feedbackformular manuell ausgefüllt' });
    }

    // Finale Bewertung muss vorhanden sein.
    const ctx = await loadFeedbackContext(tm);
    if (!ctx.finalEval) return res.status(400).json({ success: false, message: 'Eine finale Bewertung ist Voraussetzung für die Aufbereitung' });

    // Claude API
    if (!Anthropic) return res.status(500).json({ success: false, message: 'Anthropic-SDK nicht installiert' });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'ANTHROPIC_API_KEY nicht konfiguriert' });

    const language = thesis ? thesis.language : 'de';
    const prompt = buildSummaryPrompt(ctx.finalEval, language, ctx.moduleGrade);

    const client = new Anthropic.default({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) return res.status(500).json({ success: false, message: 'Keine Rückmeldung erhalten' });

    await tm.update({ feedback_text: text });
    res.json({ success: true, feedback_text: text, source: 'llm' });
  } catch (err) {
    console.error('generateFeedbackProposal error:', err);
    res.status(500).json({ success: false, message: err.message || 'Fehler bei der LLM-Anfrage' });
  }
};

// PUT /api/thesis-milestones/:id/feedback
// Manuelle Bearbeitung — gleiche Berechtigung wie generate.
const saveFeedback = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const text = (req.body && typeof req.body.feedback_text === 'string') ? req.body.feedback_text : '';

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (!tm.feedback_form_enabled) return res.status(400).json({ success: false, message: 'Feedbackformular nicht aktiviert' });
    if (!canManageFeedback(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    const previous = tm.feedback_text == null ? '' : String(tm.feedback_text);
    const next = text == null ? '' : String(text);
    await tm.update({ feedback_text: next || null });

    // Protokollierung nur bei tatsächlicher Änderung — verhindert leere
    // Einträge beim Öffnen+Schliessen ohne Bearbeitung.
    if (previous !== next) {
      try {
        await ThesisLog.create({
          thesis_id: tm.thesis_id,
          thesis_milestone_id: tm.id,
          user_id: userId,
          action: 'feedback_updated',
          detail: `${tm.label}: Feedbackformular bearbeitet`,
        });
      } catch (e) { console.warn('feedback_updated log failed:', e.message); }
    }

    res.json({ success: true, feedback_text: next });
  } catch (err) {
    console.error('saveFeedback error:', err);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// GET /api/thesis-milestones/:id/feedback (für Pre-Fill im UI)
const getFeedback = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (!tm.feedback_form_enabled) return res.status(400).json({ success: false, message: 'Feedbackformular nicht aktiviert' });
    if (!canManageFeedback(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    const thesis = await Thesis.findByPk(tm.thesis_id, { attributes: ['is_confidential'] });
    const ctx = await loadFeedbackContext(tm);

    res.json({
      success: true,
      feedback_text: tm.feedback_text || '',
      has_final_evaluation: !!ctx.finalEval,
      is_confidential: !!(thesis && thesis.is_confidential),
      module_grade: ctx.moduleGrade,
      group_grades: ctx.groupGrades,
    });
  } catch (err) {
    console.error('getFeedback error:', err);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// GET /api/thesis-milestones/:id/feedback.pdf
// PDF erzeugen — Voraussetzung: finale Bewertung vorhanden.
const printFeedbackForm = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).send('Meilenstein nicht gefunden');
    if (!tm.feedback_form_enabled) return res.status(400).send('Feedbackformular nicht aktiviert');
    if (!canManageFeedback(tm, userRole)) return res.status(403).send('Keine Berechtigung');
    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).send('Keine Berechtigung');

    const ctx = await loadFeedbackContext(tm);
    if (!ctx.finalEval) return res.status(400).send('Eine finale Bewertung ist Voraussetzung');

    const language = ctx.thesis && ctx.thesis.language === 'fr' ? 'fr' : 'de';
    const tmLabelLocal = (language === 'fr' && tm.label_fr) ? tm.label_fr : (tm.label || '');
    const safeName = ('Feedback_' + (tmLabelLocal || 'Meilenstein')).replace(/[^a-zA-Z0-9_-]+/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`);
    streamFeedbackFormPdf(res, {
      language,
      thesis: ctx.thesis,
      milestoneLabel: tmLabelLocal,
      groupGrades: ctx.groupGrades,
      moduleGrade: ctx.moduleGrade,
      feedbackText: tm.feedback_text || '',
      coachName: ctx.coachName,
      expertName: ctx.expertName,
      deptLeadName: ctx.deptLeadName,
    });
  } catch (err) {
    console.error('printFeedbackForm error:', err);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// Lädt die im Dashboard sichtbaren Diplomarbeiten gefiltert nach Diplomjahr
// + optionalem Fachbereichs-Filter. Liefert { year, departmentLabel, theses }.
// Wird sowohl vom PDF- als auch vom CSV-Export verwendet.
async function loadDashboardThesesForExport(req) {
  const userId = req.session.userId;
  const userRole = req.session.userRole;
  const yearId = req.session.selectedYear;

  if (!['admin', 'department_lead'].includes(userRole)) {
    return { error: { status: 403, message: 'Keine Berechtigung' } };
  }
  if (!yearId) return { error: { status: 400, message: 'Kein Diplomjahr ausgewählt' } };

  const year = await Year.findByPk(yearId);
  if (!year) return { error: { status: 404, message: 'Diplomjahr nicht gefunden' } };

  const whereClause = { year_id: yearId };
  const departmentFilter = req.query.department ? parseInt(req.query.department, 10) : null;
  let departmentLabel = '';

  if (userRole === 'department_lead') {
    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id', 'name'] });
    const ledIds = ledDepartments.map(d => d.id);
    if (ledIds.length === 0) {
      whereClause.id = -1;
    } else if (departmentFilter && ledIds.includes(departmentFilter)) {
      whereClause.department_id = departmentFilter;
      const d = ledDepartments.find(x => x.id === departmentFilter);
      departmentLabel = d ? d.name : '';
    } else {
      whereClause.department_id = ledIds;
    }
  } else if (departmentFilter) {
    whereClause.department_id = departmentFilter;
    const d = await Department.findByPk(departmentFilter);
    departmentLabel = d ? d.name : '';
  }

  const theses = await Thesis.findAll({
    where: whereClause,
    include: [
      { model: Department, as: 'department', attributes: ['name'] },
      { model: User, as: 'students', attributes: ['firstname', 'name'] },
      { model: User, as: 'coaches', attributes: ['firstname', 'name'] },
      { model: User, as: 'experts', attributes: ['firstname', 'name'] },
    ],
    order: [['title', 'ASC']],
  });

  return { year, departmentLabel, theses };
}

// Druckt eine Liste aller im Dashboard sichtbaren Diplomarbeiten als PDF
// (Querformat). Spiegelt die Filter (Diplomjahr + optional Fachbereich) des
// Dashboards. Zugriff: Admin (alle Fachbereiche im Jahr) und
// FachbereichsleiterIn (nur eigene Fachbereiche).
const printThesesList = async (req, res) => {
  try {
    const r = await loadDashboardThesesForExport(req);
    if (r.error) return res.status(r.error.status).send(r.error.message);

    const printDate = new Date().toLocaleDateString('de-CH');
    const filename = `Diplomarbeiten_${r.year.year}${r.departmentLabel ? '_' + r.departmentLabel.replace(/\s+/g, '_') : ''}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    streamThesesListPdf(res, {
      theses: r.theses,
      yearLabel: String(r.year.year),
      departmentLabel: r.departmentLabel,
      printDate,
    });
  } catch (e) {
    console.error('Error printing theses list:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// Exportiert die gleiche Liste als CSV (Trennzeichen ;, kein Textbegrenzer).
// Felder enthalten von Natur aus keine Strichpunkte / Zeilenumbrüche; falls
// doch, werden sie zu Leerzeichen ersetzt, damit das Format intakt bleibt.
const exportThesesListCsv = async (req, res) => {
  try {
    const r = await loadDashboardThesesForExport(req);
    if (r.error) return res.status(r.error.status).send(r.error.message);

    const sanitize = (v) => String(v == null ? '' : v).replace(/[;\r\n]+/g, ' ').trim();

    const rows = [];
    for (const t of r.theses) {
      const coachNames = (t.coaches || []).map(c => `${c.name || ''}, ${c.firstname || ''}`.replace(/^, |, $/g, '')).join(' / ');
      const expertNames = (t.experts || []).map(e => `${e.name || ''}, ${e.firstname || ''}`.replace(/^, |, $/g, '')).join(' / ');
      const deptName = (t.department && t.department.name) || '';
      const students = t.students || [];
      const baseRow = {
        title: t.title || '',
        department: deptName,
        coach: coachNames,
        expert: expertNames,
        sponsor: t.sponsor || '',
      };
      if (students.length === 0) {
        rows.push({ lastName: '', firstName: '', ...baseRow });
      } else {
        for (const s of students) {
          rows.push({ lastName: s.name || '', firstName: s.firstname || '', ...baseRow });
        }
      }
    }
    rows.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || '', 'de-CH')
      || (a.firstName || '').localeCompare(b.firstName || '', 'de-CH'));

    const header = ['Nachname', 'Vorname', 'Titel der Diplomarbeit', 'Fachbereich', 'Dozent/in', 'Expert/in', 'Auftraggeber'];
    const lines = [header.join(';')];
    for (const row of rows) {
      lines.push([row.lastName, row.firstName, row.title, row.department, row.coach, row.expert, row.sponsor].map(sanitize).join(';'));
    }
    // UTF-8 BOM, damit Excel die Datei korrekt mit Umlauten öffnet.
    const csv = '﻿' + lines.join('\r\n') + '\r\n';

    const filename = `Diplomarbeiten_${r.year.year}${r.departmentLabel ? '_' + r.departmentLabel.replace(/\s+/g, '_') : ''}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error('Error exporting theses list CSV:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

module.exports = {
  listForms, getForm, createForm, updateForm, deleteForm,
  createGroup, updateGroup, deleteGroup,
  createCriterion, updateCriterion, deleteCriterion, reorderCriteria,
  getThesisEvaluation, saveThesisEvaluation, printThesisEvaluation,
  printTransferProjectSummary,
  printTransferProjectOverview,
  printThesesList,
  exportThesesListCsv,
  getFeedback, generateFeedbackProposal, saveFeedback, printFeedbackForm,
};
