const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Stammdatentabelle für Upload-Kategorien. Vom Administrator gepflegt.
// is_active steuert die Sichtbarkeit als Auswahl-Option (Soft-Deaktivierung).
const UploadCategory = sequelize.define('UploadCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  label: {
    type: DataTypes.STRING(120),
    allowNull: false,
    validate: { notEmpty: true, len: [1, 120] },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'upload_categories',
});

module.exports = UploadCategory;
