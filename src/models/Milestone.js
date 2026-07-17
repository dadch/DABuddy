const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Milestone = sequelize.define('Milestone', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  year_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'years',
      key: 'id',
    },
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200],
      notEmpty: true,
    },
  },
  // Französischer Titel; optional. Fallback im UI auf `label` (DE).
  label_fr: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  due_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  responsible_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: false,
  },
  // Ob die verantwortliche Rolle ein Dokument hochladen kann
  allow_upload: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  // Ob nach dem ersten Upload weitere (aktualisierte) Versionen hochgeladen werden dürfen
  allow_update: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Ob das hochgeladene Dokument bewertet wird
  requires_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Welche Rolle die Bewertung vornimmt (bei Doppelbewertung: erste Rolle)
  evaluator_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Doppelbewertung: zwei Rollen bewerten unabhängig, danach finale Bewertung
  double_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Zweite bewertende Rolle (nur bei Doppelbewertung)
  evaluator_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Zugewiesenes Bewertungsformular (optional; sonst Freitext-Bewertung)
  evaluation_form_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'evaluation_forms', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  // Freigabe 1: ob der Meilenstein durch eine bestimmte Rolle freigegeben werden muss
  requires_approval: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Freigabe 2 (optional zusätzlich)
  requires_approval_2: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Für welche Studienform der Meilenstein gilt. Beim Anlegen einer DA werden
  // nur Vorlagen übernommen, deren applies_to zum study_mode des Fachbereichs
  // passt ('all' passt immer).
  applies_to: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'all',
    validate: { isIn: [['all', 'fulltime', 'parttime']] },
  },
  // Transferprojekt-Kennzeichnung (rein deklarativ, ohne weiteres Verhalten).
  is_transfer_project: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Aufgabenstellungs-Meilenstein: Der Verantwortliche füllt das Ergänzungsfeld
  // aus und generiert die Aufgabenstellung als PDF.
  is_assignment: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Feedbackformular am Meilenstein aktivierbar — erzeugt PDF "Diplomarbeit: Feedback
  // für Studierende" basierend auf der finalen Bewertung dieses Meilensteins.
  feedback_form_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Mail-Erinnerungen: ab wann und in welcher Periodizität. Ab 3 Tagen vor
  // dem jeweiligen Termin wird täglich versendet (Fix-Regel).
  reminder_start_at:    { type: DataTypes.DATE, allowNull: true },
  reminder_period_days: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 7 },
  // Per-Kind Fälligkeitsdaten für Bewertungen und Feedback (alle > due_at).
  single_due_at:   { type: DataTypes.DATE, allowNull: true },
  first_due_at:    { type: DataTypes.DATE, allowNull: true },
  second_due_at:   { type: DataTypes.DATE, allowNull: true },
  final_due_at:    { type: DataTypes.DATE, allowNull: true },
  feedback_due_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'milestones',
  indexes: [
    { fields: ['year_id'] },
  ],
});

module.exports = Milestone;
