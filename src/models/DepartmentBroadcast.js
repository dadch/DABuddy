const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Nachricht einer Fachbereichsleitung ("Alle benachrichtigen" oder Einzel-
// nachricht an einen Dozenten/Experten). Pro Versand
// ein Eintrag; die einzelnen Empfänger stehen in DepartmentBroadcastRecipient.
// department_ids hält die Fachbereiche der Dashboard-Ansicht zum Versandzeit-
// punkt — darüber wird die Sichtbarkeit im Nachrichten-Log bestimmt.
const DepartmentBroadcast = sequelize.define('DepartmentBroadcast', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sender_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  },
  // Name zum Versandzeitpunkt, damit das Log auch nach Löschung lesbar bleibt.
  sender_name: { type: DataTypes.STRING(255), allowNull: false },
  year_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'years', key: 'id' },
    onDelete: 'SET NULL',
  },
  department_ids: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
  // 'assigned': zugewiesene Dozierende/Experten der Arbeiten;
  // 'fallback': keine Zuweisung vorhanden -> alle zuweisbaren Personen;
  // 'single':   Einzelnachricht an einen Dozenten/Experten.
  recipient_mode: { type: DataTypes.STRING(16), allowNull: false },
  subject: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
}, {
  tableName: 'department_broadcasts',
  timestamps: true,
  updatedAt: false,
});

module.exports = DepartmentBroadcast;
