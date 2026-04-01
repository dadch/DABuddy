const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255],
    },
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255],
    },
  },
  filepath: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 500],
    },
  },
  mimetype: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      isIn: [['application/pdf']],
    },
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 50 * 1024 * 1024, // 50MB max
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
  thesis_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'theses',
      key: 'id',
    },
  },
  uploaded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  upload_timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'documents',
  indexes: [
    {
      fields: ['thesis_id'],
    },
    {
      fields: ['uploaded_by'],
    },
    {
      fields: ['document_type'],
    },
  ],
});

module.exports = Document;