const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Year = sequelize.define('Year', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: {
      min: 2000,
      max: 2100,
      notEmpty: true,
    },
  },
}, {
  tableName: 'years',
});

module.exports = Year;