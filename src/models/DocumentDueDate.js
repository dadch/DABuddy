const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DocumentDueDate = sequelize.define('DocumentDueDate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
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
  year_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'years',
      key: 'id',
    },
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Due date for this document type in this academic year',
  },
}, {
  tableName: 'document_due_dates',
  indexes: [
    {
      unique: true,
      fields: ['document_type', 'year_id'],
    },
    {
      fields: ['year_id'],
    },
  ],
});

module.exports = DocumentDueDate;