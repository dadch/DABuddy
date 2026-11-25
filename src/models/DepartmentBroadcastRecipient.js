const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ein Empfänger einer DepartmentBroadcast-Rundmail inkl. Versandstatus.
// Name/E-Mail werden als Snapshot gespeichert (Nachvollziehbarkeit).
const DepartmentBroadcastRecipient = sequelize.define('DepartmentBroadcastRecipient', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  broadcast_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'department_broadcasts', key: 'id' },
    onDelete: 'CASCADE',
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  // Kommagetrennt: 'coach', 'expert' oder 'coach,expert'
  roles: { type: DataTypes.STRING(64), allowNull: false },
  // 'sent' | 'failed'
  status: { type: DataTypes.STRING(16), allowNull: false },
  error: { type: DataTypes.TEXT, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'department_broadcast_recipients',
  timestamps: false,
  indexes: [{ fields: ['broadcast_id'] }],
});

module.exports = DepartmentBroadcastRecipient;
