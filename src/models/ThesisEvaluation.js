const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Konkrete Bewertung eines Diplomarbeit-Meilensteins.
// Snapshot der Formularstruktur (in der gewählten Sprache der Diplomarbeit).
const ThesisEvaluation = sequelize.define('ThesisEvaluation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'thesis_milestones', key: 'id' },
    onDelete: 'CASCADE',
  },
  // single = normale Einzelbewertung; first/second = Einzelbewertungen der Doppelbewertung;
  // final = finale (zusammengeführte) Bewertung der Doppelbewertung
  kind: {
    type: DataTypes.ENUM('single', 'first', 'second', 'final'),
    allowNull: false,
    defaultValue: 'single',
  },
  // Rolle, der diese (Einzel-)Bewertung gehört (null bei 'final' = beide Rollen)
  evaluator_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Ursprüngliche Formularvorlage (nur als Referenz)
  source_form_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'evaluation_forms', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  language: {
    type: DataTypes.ENUM('de', 'fr'),
    allowNull: false,
    defaultValue: 'de',
  },
  form_title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Gesamtnote (gewichteter Durchschnitt der Gruppennoten), auf Zehntel gerundet
  overall_grade: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
  },
  completed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  evaluated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  evaluated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'thesis_evaluations',
  indexes: [
    { fields: ['thesis_milestone_id'] },
    { unique: true, fields: ['thesis_milestone_id', 'kind'] },
  ],
});

module.exports = ThesisEvaluation;
