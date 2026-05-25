const {
  sequelize,
  Milestone, ThesisMilestone, Thesis, ThesisLog,
  EvaluationForm, EvaluationGroup, EvaluationCriterion,
  ThesisEvaluation, ThesisEvaluationGroup, ThesisEvaluationCriterion,
} = require('../models');
const { computeGroupGrade, computeOverallGrade } = require('../utils/grading');
const { userHasThesisAccess } = require('../utils/thesisAccess');

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
async function buildSnapshot(thesisMilestone, language) {
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

// GET the structured evaluation for a thesis milestone.
// Creates the snapshot lazily when the evaluator/admin opens it.
const getThesisEvaluation = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (!tm.evaluation_form_id) {
      return res.json({ success: true, hasForm: false });
    }

    let evaluation = await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id } });

    if (!evaluation) {
      const isEvaluator = userRole === 'admin' || userRole === tm.evaluator_role;
      if (!isEvaluator) {
        return res.json({ success: true, hasForm: true, started: false });
      }
      const thesis = await Thesis.findByPk(tm.thesis_id, { attributes: ['id', 'language'] });
      const evalId = await buildSnapshot(tm, thesis ? thesis.language : 'de');
      if (!evalId) return res.status(400).json({ success: false, message: 'Zugewiesenes Formular nicht gefunden' });
      evaluation = await loadFullEvaluation(evalId);
    } else {
      evaluation = await loadFullEvaluation(evaluation.id);
    }

    res.json({ success: true, hasForm: true, started: true, evaluation });
  } catch (e) {
    console.error('Error getting thesis evaluation:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Save scores + remarks; validate, recompute grades, log.
const saveThesisEvaluation = async (req, res) => {
  try {
    const tmId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const { criteria } = req.body; // [{ id, score, remark }]

    const tm = await ThesisMilestone.findByPk(tmId);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (userRole !== 'admin' && userRole !== tm.evaluator_role) {
      return res.status(403).json({ success: false, message: 'Ihre Rolle ist nicht berechtigt, diese Bewertung vorzunehmen' });
    }

    const evaluation = await loadFullEvaluation(
      (await ThesisEvaluation.findOne({ where: { thesis_milestone_id: tm.id } }) || {}).id
    );
    if (!evaluation) return res.status(404).json({ success: false, message: 'Bewertung wurde noch nicht initialisiert' });

    // Index incoming answers
    const answers = {};
    (criteria || []).forEach(a => { answers[a.id] = a; });

    // Validate
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
      // Persist answers
      for (const c of allCriteria) {
        const a = answers[c.id];
        if (!a) continue;
        const score = (a.score === null || a.score === undefined || a.score === '') ? null : Number(a.score);
        await ThesisEvaluationCriterion.update(
          { score, remark: a.remark ? String(a.remark) : null },
          { where: { id: c.id }, transaction: t }
        );
      }

      // Recompute group grades
      const fresh = await ThesisEvaluation.findByPk(evaluation.id, {
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

      // Completed = every criterion scored
      const allScored = fresh.groups.every(g => g.criteria.every(c => c.score !== null && c.score !== undefined));

      await ThesisEvaluation.update(
        { overall_grade: overall, completed: allScored, evaluated_by: userId, evaluated_at: new Date() },
        { where: { id: evaluation.id }, transaction: t }
      );
    });

    await ThesisLog.create({
      thesis_id: tm.thesis_id,
      thesis_milestone_id: tm.id,
      user_id: userId,
      action: 'evaluation_update',
      detail: `${tm.label}: Bewertung gespeichert`,
    });

    const updated = await loadFullEvaluation(evaluation.id);
    res.json({ success: true, message: 'Bewertung gespeichert', evaluation: updated });
  } catch (e) {
    console.error('Error saving thesis evaluation:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

module.exports = {
  listForms, getForm, createForm, updateForm, deleteForm,
  createGroup, updateGroup, deleteGroup,
  createCriterion, updateCriterion, deleteCriterion, reorderCriteria,
  getThesisEvaluation, saveThesisEvaluation,
};
