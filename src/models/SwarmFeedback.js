const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Rückmeldung zur Projektskizze im Schwarmmodus: höchstens eine pro Autor und
// Meilenstein (Unique-Index). Autor kann gelöscht werden (SET NULL), die
// Rückmeldung bleibt dann erhalten.
const SwarmFeedback = sequelize.define('SwarmFeedback', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  thesis_milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'thesis_milestones', key: 'id' },
    onDelete: 'CASCADE',
  },
  thesis_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'theses', key: 'id' },
    onDelete: 'CASCADE',
  },
  author_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  },
  author_role: { type: DataTypes.STRING(32), allowNull: false },
  language: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'de' },
  criterion_1: { type: DataTypes.TEXT, allowNull: true },
  criterion_2: { type: DataTypes.TEXT, allowNull: true },
  criterion_3: { type: DataTypes.TEXT, allowNull: true },
  recommendation: {
    type: DataTypes.ENUM('continue', 'continue_with_conditions', 'stop'),
    allowNull: false,
  },
  condition_what: { type: DataTypes.TEXT, allowNull: true },
  condition_until: { type: DataTypes.DATEONLY, allowNull: true },
}, {
  tableName: 'swarm_feedbacks',
  indexes: [
    { unique: true, fields: ['thesis_milestone_id', 'author_user_id'] },
    { fields: ['thesis_id'] },
  ],
});

module.exports = SwarmFeedback;
