const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Änderungsprotokoll pro Diplomarbeit für Dokument- und Bewertungsänderungen.
const ThesisLog = sequelize.define('ThesisLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'theses',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  thesis_milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'thesis_milestones',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  action: {
    type: DataTypes.ENUM(
      'document_upload',
      'document_update',
      'document_delete',
      'evaluation_create',
      'evaluation_update',
      'milestone_approved',
      'milestone_revoked',
      'milestone_released',
      'milestone_locked',
      'confidentiality_uploaded',
      'confidentiality_deleted',
      'thesis_locked',
      'thesis_unlocked',
      'feedback_updated'
    ),
    allowNull: false,
  },
  // Freitext-Detail, z.B. Dokumentname oder Meilenstein-Bezeichnung
  detail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'thesis_logs',
  indexes: [
    { fields: ['thesis_id'] },
    { fields: ['thesis_milestone_id'] },
  ],
});

module.exports = ThesisLog;
