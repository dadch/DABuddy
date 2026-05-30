const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Mehrfachrollen: ein Eintrag pro (user, role). Die users.role-Spalte bleibt als
// Primärrolle erhalten (Login-Default). Die Primärrolle ist immer auch in user_roles.
const UserRole = sequelize.define('UserRole', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    primaryKey: true,
    allowNull: false,
  },
}, {
  tableName: 'user_roles',
});

module.exports = UserRole;
