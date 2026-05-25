const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Snapshot eines Bewertungskriteriums inkl. der bei der Bewertung erfassten
// Punktzahl (0-5) und optionalen Bemerkung.
const ThesisEvaluationCriterion = sequelize.define('ThesisEvaluationCriterion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_evaluation_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'thesis_evaluation_groups', key: 'id' },
    onDelete: 'CASCADE',
  },
  label: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  weight: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: false,
    defaultValue: 1,
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // Qualitätsbeschreibungen Stufe 0..5 (in der gewählten Sprache)
  level_descriptions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: ['', '', '', '', '', ''],
  },
  // Erfasste Punktzahl 0-5 (null = noch nicht bewertet)
  score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 0, max: 5 },
  },
  remark: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'thesis_evaluation_criteria',
  indexes: [{ fields: ['thesis_evaluation_group_id'] }],
});

module.exports = ThesisEvaluationCriterion;
