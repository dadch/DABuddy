const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Lesebestätigung: pro (Nachricht, User) ein Eintrag mit Zeitstempel.
const ChatReadReceipt = sequelize.define('ChatReadReceipt', {
  message_id: { type: DataTypes.INTEGER, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, primaryKey: true },
  read_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'chat_read_receipts',
});

module.exports = ChatReadReceipt;
