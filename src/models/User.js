const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcrypt');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
      notEmpty: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255],
      notEmpty: true,
    },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100],
      notEmpty: true,
    },
  },
  firstname: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100],
      notEmpty: true,
    },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true,
    },
  },
  role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: false,
    validate: {
      notEmpty: true,
    },
  },
  // Geschlecht: m = männlich, w = weiblich, d = divers (v.a. für Studierende)
  gender: {
    type: DataTypes.ENUM('m', 'w', 'd'),
    allowNull: true,
  },
  // Telefonnummer (optional, freier Text — keine Format-Validierung).
  phone: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
  // Zuletzt gewähltes Diplomjahr (nur Admin/FachbereichsleiterIn nutzen den Switcher;
  // beim nächsten Login wird diese Auswahl wiederhergestellt).
  last_selected_year_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Zuletzt aktive Rolle für Mehrfachrollen-User. Beim nächsten Login wird diese
  // Rolle wieder aktiviert, sofern sie noch zugewiesen ist; sonst Fallback auf users.role.
  last_active_role: {
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'),
    allowNull: true,
  },
  // Bevorzugte GUI-Sprache. Über die Profil-Seite einstellbar.
  language: {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'de',
  },
  // Diplomjahr — nur für Studierende relevant. Andere Rollen bleiben
  // jahresübergreifend und haben year_id = NULL.
  year_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'years', key: 'id' },
  },
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 10);
      }
    },
  },
});

User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = User;