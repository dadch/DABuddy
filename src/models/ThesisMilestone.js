const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ThesisMilestone = sequelize.define('ThesisMilestone', {
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
  milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'milestones',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 200],
      notEmpty: true,
    },
  },
  due_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  // Freigabe zum Starten: erst nach Freigabe (durch Dozent/in oder Admin) kann am Meilenstein
  // gearbeitet werden (Upload). Der erste Meilenstein ist immer freigegeben.
  released: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  responsible_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: false,
  },
  // Konfigurations-Snapshot aus der Meilenstein-Vorlage
  allow_upload: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  allow_update: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  requires_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  evaluator_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  double_evaluation: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  evaluator_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Zugewiesenes Bewertungsformular (Snapshot-Quelle); null = Freitext-Bewertung
  evaluation_form_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'evaluation_forms', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  // Freigabe 1 – Konfiguration (Snapshot) + Status
  requires_approval: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Freigabe 2 – Konfiguration (Snapshot) + Status
  requires_approval_2: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  approver_role_2: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  approved_by_2: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  approved_at_2: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Freitext-Bewertung (Fallback, wenn kein Formular zugewiesen)
  evaluation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  evaluated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
  },
  evaluated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'thesis_milestones',
  indexes: [
    { fields: ['thesis_id'] },
    { fields: ['milestone_id'] },
  ],
});

module.exports = ThesisMilestone;
