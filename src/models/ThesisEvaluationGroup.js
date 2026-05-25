const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Snapshot einer Bewertungsgruppe in einer konkreten Diplomarbeit-Bewertung.
const ThesisEvaluationGroup = sequelize.define('ThesisEvaluationGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_evaluation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'thesis_evaluations', key: 'id' },
    onDelete: 'CASCADE',
  },
  name: {
    type: DataTypes.STRING,
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
  // Note der Gruppe (erreichte/maximale Punkte * 5 + 1), auf Zehntel gerundet
  grade: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
  },
}, {
  tableName: 'thesis_evaluation_groups',
  indexes: [{ fields: ['thesis_evaluation_id'] }],
});

module.exports = ThesisEvaluationGroup;
