const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ThesisMilestone = sequelize.define('ThesisMilestone', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'theses',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'milestones',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200],
      notEmpty: true,
    },
  },
  // Französischer Titel (Snapshot zum Zeitpunkt der DA-Erstellung).
  label_fr: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  due_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  // Freigabe zum Starten: erst nach Freigabe (durch Dozent/in oder Admin) kann am Meilenstein
  // gearbeitet werden (Upload). Der erste Meilenstein ist immer freigegeben.
  released: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  responsible_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: false,
  },
  // Konfigurations-Snapshot aus der Meilenstein-Vorlage
  allow_upload: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  allow_update: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  requires_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  evaluator_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  double_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  evaluator_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Zugewiesenes Bewertungsformular (Snapshot-Quelle); null = Freitext-Bewertung
  evaluation_form_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'evaluation_forms', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  // Freigabe 1 – Konfiguration (Snapshot) + Status
  requires_approval: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Freigabe 2 – Konfiguration (Snapshot) + Status
  requires_approval_2: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  approved_by_2: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  approved_at_2: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Freitext-Bewertung (Fallback, wenn kein Formular zugewiesen)
  evaluation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  evaluated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  evaluated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Transferprojekt-Kennzeichnung (aus der Meilenstein-Vorlage übernommen).
  is_transfer_project: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Markiert individuell gesetzten Termin pro DA (vom FBL oder Admin überschrieben).
  // Schützt due_at vor Überschreiben bei Vorlagen-Update mit applyToExisting.
  due_at_overridden: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Feedbackformular am Meilenstein aktivierbar (aus der Vorlage übernommen).
  feedback_form_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Rückmeldungstext für das Feedbackformular (vom Dozent/Experte bearbeitbar,
  // optional vom LLM vorbereitet). Wird beim PDF-Druck verwendet und persistiert.
  feedback_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Mail-Erinnerungen (Snapshot aus der Vorlage). Individuelle Overrides
  // werden über die -_overridden-Flags geschützt.
  reminder_start_at:                 { type: DataTypes.DATE,    allowNull: true },
  reminder_period_days:              { type: DataTypes.INTEGER, allowNull: true, defaultValue: 7 },
  reminder_start_at_overridden:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  reminder_period_days_overridden:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Per-Kind Fälligkeitsdaten (Snapshot; alle > due_at).
  single_due_at:   { type: DataTypes.DATE, allowNull: true },
  first_due_at:    { type: DataTypes.DATE, allowNull: true },
  second_due_at:   { type: DataTypes.DATE, allowNull: true },
  final_due_at:    { type: DataTypes.DATE, allowNull: true },
  feedback_due_at: { type: DataTypes.DATE, allowNull: true },
  single_due_at_overridden:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  first_due_at_overridden:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  second_due_at_overridden:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  final_due_at_overridden:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  feedback_due_at_overridden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  tableName: 'thesis_milestones',
  indexes: [
    { fields: ['thesis_id'] },
    { fields: ['milestone_id'] },
  ],
});

module.exports = ThesisMilestone;
