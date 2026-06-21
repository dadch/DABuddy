const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Year = sequelize.define('Year', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: {
      min: 2000,
      max: 2100,
      notEmpty: true,
    },
  },
  // Globales "aktuelles Diplomjahr": vom Administrator gesetzt. Standardvorgabe beim Login.
  is_current: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Frei wählbare zweisprachige Bezeichnung. Wenn gesetzt, wird sie in
  // Dashboards/Switchern statt der reinen Jahreszahl angezeigt.
  // Fallback: String(year).
  label_de: { type: DataTypes.TEXT, allowNull: true },
  label_fr: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'years',
});

module.exports = Year;
