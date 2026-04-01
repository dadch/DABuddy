const sequelize = require('../config/database');
const User = require('./User');
const Department = require('./Department');
const Year = require('./Year');
const Thesis = require('./Thesis');
const Document = require('./Document');
const DocumentLog = require('./DocumentLog');
const DocumentDueDate = require('./DocumentDueDate');

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

// Document relationships
Thesis.hasMany(Document, { foreignKey: 'thesis_id', as: 'documents' });
Document.belongsTo(Thesis, { foreignKey: 'thesis_id', as: 'thesis' });

User.hasMany(Document, { foreignKey: 'uploaded_by', as: 'uploadedDocuments' });
Document.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

// DocumentLog relationships
User.hasMany(DocumentLog, { foreignKey: 'user_id', as: 'documentLogs' });
DocumentLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Thesis.hasMany(DocumentLog, { foreignKey: 'thesis_id', as: 'documentLogs' });
DocumentLog.belongsTo(Thesis, { foreignKey: 'thesis_id', as: 'thesis' });

// DocumentDueDate relationships
Year.hasMany(DocumentDueDate, { foreignKey: 'year_id', as: 'documentDueDates' });
DocumentDueDate.belongsTo(Year, { foreignKey: 'year_id', as: 'year' });

module.exports = {
  sequelize,
  User,
  Department,
  Year,
  Thesis,
  Document,
  DocumentLog,
  DocumentDueDate,
};