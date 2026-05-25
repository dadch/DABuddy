const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Bewertungskriterium einer Gruppe. Punktzahl 0-5, Gewichtung (Multiplikator),
// sowie pro Stufe (0-5) eine Qualitätsbeschreibung je Sprache.
const EvaluationCriterion = sequelize.define('EvaluationCriterion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  evaluation_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'evaluation_groups', key: 'id' },
    onDelete: 'CASCADE',
  },
  // Markdown-Text, kann lang sein -> TEXT statt VARCHAR
  label_de: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true },
  },
  label_fr: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { notEmpty: true },
  },
  // Gewichtung (Multiplikator) – fliesst in Total und Maximum der Gruppe ein
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
  // Je 6 Qualitätsbeschreibungen (Stufe 0..5) pro Sprache als Array
  level_descriptions_de: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: ['', '', '', '', '', ''],
  },
  level_descriptions_fr: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: ['', '', '', '', '', ''],
  },
}, {
  tableName: 'evaluation_criteria',
  indexes: [{ fields: ['evaluation_group_id'] }],
});

module.exports = EvaluationCriterion;
