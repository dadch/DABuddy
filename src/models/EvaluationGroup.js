const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Bewertungsgruppe einer Formularvorlage. Gruppen können gewichtet werden (Faktor).
const EvaluationGroup = sequelize.define('EvaluationGroup', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  evaluation_form_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'evaluation_forms', key: 'id' },
    onDelete: 'CASCADE',
  },
  name_de: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true, len: [1, 200] },
  },
  name_fr: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true, len: [1, 200] },
  },
  // Gewichtung der Gruppe für den Gesamtdurchschnitt
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
}, {
  tableName: 'evaluation_groups',
  indexes: [{ fields: ['evaluation_form_id'] }],
});

module.exports = EvaluationGroup;
