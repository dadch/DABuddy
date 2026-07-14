const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Department = sequelize.define('Department', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [1, 200],
      notEmpty: true,
    },
  },
  department_lead_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  // Studienform des Fachbereichs: Vollzeit oder Berufsbegleitend.
  // Steuert, welche Meilenstein-Vorlagen (applies_to) beim Anlegen einer
  // Diplomarbeit dieses Fachbereichs übernommen werden.
  study_mode: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'parttime',
    validate: { isIn: [['fulltime', 'parttime']] },
  },
}, {
  tableName: 'departments',
});

module.exports = Department;