const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Bewertungsformular-Vorlage (zweisprachig DE/FR), wiederverwendbar über Meilensteine.
const EvaluationForm = sequelize.define('EvaluationForm', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title_de: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true, len: [1, 200] },
  },
  title_fr: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: true, len: [1, 200] },
  },
}, {
  tableName: 'evaluation_forms',
});

module.exports = EvaluationForm;
