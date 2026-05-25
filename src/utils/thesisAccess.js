const { Thesis, User, Department } = require('../models');

// Prüft, ob ein Benutzer Zugriff auf eine Diplomarbeit hat (Beteiligte oder Admin).
async function userHasThesisAccess(userId, userRole, thesisId) {
  if (userRole === 'admin') return true;
  const thesis = await Thesis.findByPk(thesisId, {
    include: [
      { model: User, as: 'students', attributes: ['id'] },
      { model: User, as: 'coaches', attributes: ['id'] },
      { model: User, as: 'experts', attributes: ['id'] },
      { model: User, as: 'fieldProjectCoaches', attributes: ['id'] },
      { model: Department, as: 'department', attributes: ['id', 'department_lead_id'] },
    ]
  });
  if (!thesis) return false;
  if (userRole === 'student' && thesis.students.some(s => s.id === userId)) return true;
  if (userRole === 'coach' && thesis.coaches.some(c => c.id === userId)) return true;
  if (userRole === 'expert' && thesis.experts.some(e => e.id === userId)) return true;
  if (userRole === 'field_project_coach' && thesis.fieldProjectCoaches.some(f => f.id === userId)) return true;
  if (userRole === 'department_lead' && thesis.department && thesis.department.department_lead_id === userId) return true;
  return false;
}

module.exports = { userHasThesisAccess };
