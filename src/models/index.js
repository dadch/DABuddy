const sequelize = require('../config/database');
const User = require('./User');
const Department = require('./Department');
const Year = require('./Year');
const Thesis = require('./Thesis');
const Milestone = require('./Milestone');
const ThesisMilestone = require('./ThesisMilestone');
const ThesisMilestoneDocument = require('./ThesisMilestoneDocument');
const ThesisLog = require('./ThesisLog');
const EvaluationForm = require('./EvaluationForm');
const EvaluationGroup = require('./EvaluationGroup');
const EvaluationCriterion = require('./EvaluationCriterion');
const ThesisEvaluation = require('./ThesisEvaluation');
const ThesisEvaluationGroup = require('./ThesisEvaluationGroup');
const ThesisEvaluationCriterion = require('./ThesisEvaluationCriterion');

User.belongsToMany(Thesis, {
  through: 'thesis_students',
  as: 'studentTheses',
  foreignKey: 'student_id',
  otherKey: 'thesis_id'
});

User.belongsToMany(Thesis, {
  through: 'thesis_coaches',
  as: 'coachedTheses',
  foreignKey: 'coach_id',
  otherKey: 'thesis_id'
});

User.belongsToMany(Thesis, {
  through: 'thesis_experts',
  as: 'expertTheses',
  foreignKey: 'expert_id',
  otherKey: 'thesis_id'
});

User.belongsToMany(Thesis, {
  through: 'thesis_field_project_coaches',
  as: 'fieldProjectCoachTheses',
  foreignKey: 'field_project_coach_id',
  otherKey: 'thesis_id'
});

Thesis.belongsToMany(User, {
  through: 'thesis_students',
  as: 'students',
  foreignKey: 'thesis_id',
  otherKey: 'student_id'
});

Thesis.belongsToMany(User, {
  through: 'thesis_coaches',
  as: 'coaches',
  foreignKey: 'thesis_id',
  otherKey: 'coach_id'
});

Thesis.belongsToMany(User, {
  through: 'thesis_experts',
  as: 'experts',
  foreignKey: 'thesis_id',
  otherKey: 'expert_id'
});

Thesis.belongsToMany(User, {
  through: 'thesis_field_project_coaches',
  as: 'fieldProjectCoaches',
  foreignKey: 'thesis_id',
  otherKey: 'field_project_coach_id'
});

Year.hasMany(Thesis, { foreignKey: 'year_id', as: 'theses' });
Thesis.belongsTo(Year, { foreignKey: 'year_id', as: 'year' });

Department.hasMany(Thesis, { foreignKey: 'department_id', as: 'theses' });
Thesis.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });

Department.belongsTo(User, { foreignKey: 'department_lead_id', as: 'departmentLead' });
User.hasMany(Department, { foreignKey: 'department_lead_id', as: 'ledDepartments' });

User.belongsToMany(Department, {
  through: 'user_departments',
  as: 'departments',
  foreignKey: 'user_id',
  otherKey: 'department_id'
});

Department.belongsToMany(User, {
  through: 'user_departments',
  as: 'users',
  foreignKey: 'department_id',
  otherKey: 'user_id'
});

// Milestone (template) <-> Year
Year.hasMany(Milestone, { foreignKey: 'year_id', as: 'milestones' });
Milestone.belongsTo(Year, { foreignKey: 'year_id', as: 'year' });

// ThesisMilestone <-> Thesis
Thesis.hasMany(ThesisMilestone, { foreignKey: 'thesis_id', as: 'milestones' });
ThesisMilestone.belongsTo(Thesis, { foreignKey: 'thesis_id', as: 'thesis' });

// ThesisMilestone <-> Milestone (template reference, nullable)
Milestone.hasMany(ThesisMilestone, { foreignKey: 'milestone_id', as: 'thesisInstances' });
ThesisMilestone.belongsTo(Milestone, { foreignKey: 'milestone_id', as: 'template' });

// ThesisMilestone <-> User (evaluator)
User.hasMany(ThesisMilestone, { foreignKey: 'evaluated_by', as: 'evaluatedMilestones' });
ThesisMilestone.belongsTo(User, { foreignKey: 'evaluated_by', as: 'evaluator' });

// ThesisMilestone <-> User (Freigabe 1 + 2)
ThesisMilestone.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });
ThesisMilestone.belongsTo(User, { foreignKey: 'approved_by_2', as: 'approver2' });

// ThesisMilestone <-> ThesisMilestoneDocument (versioned documents)
ThesisMilestone.hasMany(ThesisMilestoneDocument, { foreignKey: 'thesis_milestone_id', as: 'documents' });
ThesisMilestoneDocument.belongsTo(ThesisMilestone, { foreignKey: 'thesis_milestone_id', as: 'thesisMilestone' });

// ThesisMilestoneDocument <-> User (uploader)
User.hasMany(ThesisMilestoneDocument, { foreignKey: 'uploaded_by', as: 'uploadedDocuments' });
ThesisMilestoneDocument.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

// ThesisLog relationships
Thesis.hasMany(ThesisLog, { foreignKey: 'thesis_id', as: 'logs' });
ThesisLog.belongsTo(Thesis, { foreignKey: 'thesis_id', as: 'thesis' });
ThesisMilestone.hasMany(ThesisLog, { foreignKey: 'thesis_milestone_id', as: 'logs' });
ThesisLog.belongsTo(ThesisMilestone, { foreignKey: 'thesis_milestone_id', as: 'thesisMilestone' });
User.hasMany(ThesisLog, { foreignKey: 'user_id', as: 'thesisLogs' });
ThesisLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Evaluation form templates
EvaluationForm.hasMany(EvaluationGroup, { foreignKey: 'evaluation_form_id', as: 'groups', onDelete: 'CASCADE' });
EvaluationGroup.belongsTo(EvaluationForm, { foreignKey: 'evaluation_form_id', as: 'form' });
EvaluationGroup.hasMany(EvaluationCriterion, { foreignKey: 'evaluation_group_id', as: 'criteria', onDelete: 'CASCADE' });
EvaluationCriterion.belongsTo(EvaluationGroup, { foreignKey: 'evaluation_group_id', as: 'group' });

// Milestone <-> EvaluationForm (template assignment)
EvaluationForm.hasMany(Milestone, { foreignKey: 'evaluation_form_id', as: 'milestones' });
Milestone.belongsTo(EvaluationForm, { foreignKey: 'evaluation_form_id', as: 'evaluationForm' });
ThesisMilestone.belongsTo(EvaluationForm, { foreignKey: 'evaluation_form_id', as: 'evaluationForm' });

// Thesis evaluation snapshot
ThesisMilestone.hasOne(ThesisEvaluation, { foreignKey: 'thesis_milestone_id', as: 'thesisEvaluation', onDelete: 'CASCADE' });
ThesisEvaluation.belongsTo(ThesisMilestone, { foreignKey: 'thesis_milestone_id', as: 'thesisMilestone' });
ThesisEvaluation.hasMany(ThesisEvaluationGroup, { foreignKey: 'thesis_evaluation_id', as: 'groups', onDelete: 'CASCADE' });
ThesisEvaluationGroup.belongsTo(ThesisEvaluation, { foreignKey: 'thesis_evaluation_id', as: 'evaluation' });
ThesisEvaluationGroup.hasMany(ThesisEvaluationCriterion, { foreignKey: 'thesis_evaluation_group_id', as: 'criteria', onDelete: 'CASCADE' });
ThesisEvaluationCriterion.belongsTo(ThesisEvaluationGroup, { foreignKey: 'thesis_evaluation_group_id', as: 'group' });
ThesisEvaluation.belongsTo(User, { foreignKey: 'evaluated_by', as: 'evaluator' });

module.exports = {
  sequelize,
  User,
  Department,
  Year,
  Thesis,
  Milestone,
  ThesisMilestone,
  ThesisMilestoneDocument,
  ThesisLog,
  EvaluationForm,
  EvaluationGroup,
  EvaluationCriterion,
  ThesisEvaluation,
  ThesisEvaluationGroup,
  ThesisEvaluationCriterion,
};
