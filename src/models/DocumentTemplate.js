const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Globale Dokumentvorlagen (Word, Excel, PowerPoint, PDF), die Studierenden
// in jeder Diplomarbeitsseite zum Download angeboten werden. Upload und
// Löschen sind Admin/FBL vorbehalten.
const DocumentTemplate = sequelize.define('DocumentTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { notEmpty: true, len: [1, 255] },
  },
  original_filename: { type: DataTypes.STRING(255), allowNull: false },
  stored_path:       { type: DataTypes.STRING(500), allowNull: false },
  mime_type:         { type: DataTypes.STRING(150), allowNull: true },
  size_bytes:        { type: DataTypes.BIGINT,      allowNull: true },
  uploaded_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'document_templates',
});

module.exports = DocumentTemplate;
