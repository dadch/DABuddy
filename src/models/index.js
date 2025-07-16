const sequelize = require('../config/database');
const User = require('./User');
const Department = require('./Department');
const Year = require('./Year');
const Thesis = require('./Thesis');

User.belongsToMany(Thesis, { 
  through: 'thesis_students',
  as: 'studentTheses',
  foreignKey: 'student_id',
  otherKey: 'thesis_id'
});

User.belongsToMany(Thesis, { 
  through: 'thesis_coaches',
  as: 'coachedTheses',
  foreignKey: 'coach_id',
  otherKey: 'thesis_id'
});

User.belongsToMany(Thesis, { 
  through: 'thesis_experts',
  as: 'expertTheses',
  foreignKey: 'expert_id',
  otherKey: 'thesis_id'
});

Thesis.belongsToMany(User, { 
  through: 'thesis_students',
  as: 'students',
  foreignKey: 'thesis_id',
  otherKey: 'student_id'
});

Thesis.belongsToMany(User, { 
  through: 'thesis_coaches',
  as: 'coaches',
  foreignKey: 'thesis_id',
  otherKey: 'coach_id'
});

Thesis.belongsToMany(User, { 
  through: 'thesis_experts',
  as: 'experts',
  foreignKey: 'thesis_id',
  otherKey: 'expert_id'
});

Year.hasMany(Thesis, { foreignKey: 'year_id', as: 'theses' });
Thesis.belongsTo(Year, { foreignKey: 'year_id', as: 'year' });

Department.hasMany(Thesis, { foreignKey: 'department_id', as: 'theses' });
Thesis.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });

Department.belongsTo(User, { foreignKey: 'department_lead_id', as: 'departmentLead' });
User.hasMany(Department, { foreignKey: 'department_lead_id', as: 'ledDepartments' });

// User-Department many-to-many relationship
User.belongsToMany(Department, { 
  through: 'user_departments',
  as: 'departments',
  foreignKey: 'user_id',
  otherKey: 'department_id'
});

Department.belongsToMany(User, { 
  through: 'user_departments',
  as: 'users',
  foreignKey: 'department_id',
  otherKey: 'user_id'
});


module.exports = {
  sequelize,
  User,
  Department,
  Year,
  Thesis,
};