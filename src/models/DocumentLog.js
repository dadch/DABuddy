const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DocumentLog = sequelize.define('DocumentLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  thesis_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'theses',
      key: 'id',
    },
  },
  document_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255],
    },
  },
  document_type: {
    type: DataTypes.ENUM(
      'Project Scribble',
      'Project Order',
      'Requirements Specification',
      'Thesis Assignment',
      'Minutes',
      'Worktime Report',
      'Thesis Document',
      'Abstract',
      'Monetary Benefit Description'
    ),
    allowNull: false,
  },
  upload_timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  action: {
    type: DataTypes.ENUM('upload', 'replace', 'delete'),
    allowNull: false,
    defaultValue: 'upload',
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIP: true,
    },
  },
}, {
  tableName: 'document_logs',
  indexes: [
    {
      fields: ['user_id'],
    },
    {
      fields: ['thesis_id'],
    },
    {
      fields: ['upload_timestamp'],
    },
    {
      fields: ['document_type'],
    },
  ],
});

module.exports = DocumentLog;