const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Chat-Nachricht pro Diplomarbeit. content und document sind optional, mindestens
// eines von beidem muss gesetzt sein (wird im Controller geprüft).
const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  thesis_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  content: { type: DataTypes.TEXT, allowNull: true },
  document_path: { type: DataTypes.STRING, allowNull: true },
  document_filename: { type: DataTypes.STRING, allowNull: true },
  document_mimetype: { type: DataTypes.STRING, allowNull: true },
  document_size: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'chat_messages',
});

module.exports = ChatMessage;
