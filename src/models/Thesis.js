const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Thesis = sequelize.define('Thesis', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [5, 500],
      notEmpty: true,
    },
  },
  sponsor: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 200],
    },
  },
  year_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'years',
      key: 'id',
    },
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'departments',
      key: 'id',
    },
  },
  // Sprache der Diplomarbeit (bestimmt die Sprache der Bewertungsformulare)
  language: {
    type: DataTypes.ENUM('de', 'fr'),
    allowNull: false,
    defaultValue: 'de',
  },
  // Geheimhaltungspflicht: Wenn aktiv, kann die Geheimhaltungsvereinbarung erzeugt und
  // (unterschrieben + gescannt) hinterlegt werden.
  is_confidential: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  confidentiality_document_path: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  confidentiality_document_filename: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'theses',
});

module.exports = Thesis;
