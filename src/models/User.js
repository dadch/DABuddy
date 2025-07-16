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
    type: DataTypes.ENUM('student', 'coach', 'expert', 'admin', 'department_lead'),
    allowNull: false,
    validate: {
      notEmpty: true,
    },
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