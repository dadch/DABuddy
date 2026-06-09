const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Versioniertes Dokument eines Diplomarbeit-Meilensteins.
// Alle Versionen bleiben erhalten; die jeweils aktuelle wird über is_current markiert.
const ThesisMilestoneDocument = sequelize.define('ThesisMilestoneDocument', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  thesis_milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'thesis_milestones',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  file_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  file_path: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  mime_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  is_current: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  superseded_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  uploaded_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  uploaded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  // Upload-Kategorie (optional). NULL = unkategorisiert (Default-Slot).
  // Versionen werden pro (thesis_milestone_id, upload_category_id) geführt.
  upload_category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'thesis_milestone_documents',
  indexes: [
    { fields: ['thesis_milestone_id'] },
  ],
});

module.exports = ThesisMilestoneDocument;
