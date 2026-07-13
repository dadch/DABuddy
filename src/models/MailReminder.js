const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Protokolliert versendete Erinnerungs-Mails. Der Scheduler nutzt die Tabelle
// zur Deduplikation: pro (thesis_milestone_id, kind, recipient_user_id) wird
// die letzte Versendung geprüft, um Doppelversand am selben Tag bzw. innerhalb
// der Periodizität zu verhindern.
const MailReminder = sequelize.define('MailReminder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  thesis_milestone_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'thesis_milestones', key: 'id' },
    onDelete: 'CASCADE',
  },
  // z. B. 'first_eval', 'second_eval', 'final_eval', 'single_eval',
  //       'approval_1', 'approval_2', 'feedback'
  kind: { type: DataTypes.STRING(32), allowNull: false },
  recipient_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  },
  recipient_email: { type: DataTypes.STRING(255), allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'mail_reminders',
  timestamps: false,
  indexes: [
    { fields: ['thesis_milestone_id', 'kind', 'recipient_user_id'] },
  ],
});

module.exports = MailReminder;
