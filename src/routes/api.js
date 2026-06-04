const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const evalCtrl = require('../controllers/evaluationController');
const {
  getYears,
  createYear,
  setCurrentYear,
  deleteYear,
  switchSelectedYear,
  switchActiveRole,
  getThesis,
  createThesis,
  updateThesis,
  deleteThesis,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignUserToDepartment,
  removeUserFromDepartment,
  updateUserDepartments,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  getDepartmentLeadUsers,
  createDepartmentLeadUser,
  updateDepartmentLeadUser,
  deleteDepartmentLeadUser,
  getDepartmentLeadDepartments,
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getThesisMilestones,
  updateThesisMilestoneDueAt,
  setThesisMilestoneApproval,
  setThesisMilestoneReleased,
  uploadThesisMilestoneDocument,
  deleteThesisMilestoneDocument,
  downloadThesisMilestoneDocument,
  evaluateThesisMilestone,
  generateConfidentialityPdf,
  uploadConfidentialityDocument,
  downloadConfidentialityDocument,
  deleteConfidentialityDocument,
  getChatMessages,
  postChatMessage,
  downloadChatAttachment,
} = require('../controllers/apiController');


const router = express.Router();

router.use(requireAuth);

// Year management (Diplomjahre, admin only) + Switcher (admin/department_lead)
router.get('/years', requireRole(['admin']), getYears);
router.post('/years', requireRole(['admin']), createYear);
router.put('/years/:id/current', requireRole(['admin']), setCurrentYear);
router.delete('/years/:id', requireRole(['admin']), deleteYear);
router.post('/year/switch', requireRole(['admin', 'department_lead']), switchSelectedYear);

// Rollen-Switcher (nur sinnvoll für User mit mehreren Rollen; Berechtigung wird im Controller geprüft)
router.post('/role/switch', switchActiveRole);

// Thesis management
router.get('/theses/:id', requireRole(['admin', 'department_lead']), getThesis);
router.post('/theses', requireRole(['admin', 'department_lead']), createThesis);
router.put('/theses/:id', requireRole(['admin', 'department_lead']), updateThesis);
router.delete('/theses/:id', requireRole(['admin', 'department_lead']), deleteThesis);

// User management
router.get('/users', requireRole(['admin', 'department_lead']), getUsers);
router.post('/users', requireRole(['admin', 'department_lead']), createUser);
router.put('/users/:id', requireRole(['admin', 'department_lead']), updateUser);
router.delete('/users/:id', requireRole(['admin', 'department_lead']), deleteUser);

// Department management (admin only)
router.get('/departments', requireRole(['admin']), getDepartments);
router.post('/departments', requireRole(['admin']), createDepartment);
router.put('/departments/:id', requireRole(['admin']), updateDepartment);
router.delete('/departments/:id', requireRole(['admin']), deleteDepartment);

// Student management (admin + department_lead)
router.get('/students', requireRole(['admin', 'department_lead']), getStudents);
router.post('/students', requireRole(['admin', 'department_lead']), createStudent);
router.post('/students/import', requireRole(['admin', 'department_lead']), importStudents);
router.put('/students/:id', requireRole(['admin', 'department_lead']), updateStudent);
router.delete('/students/:id', requireRole(['admin', 'department_lead']), deleteStudent);

// User-Department assignment (admin only)
router.post('/users/assign-department', requireRole(['admin']), assignUserToDepartment);
router.post('/users/remove-department', requireRole(['admin']), removeUserFromDepartment);
router.put('/users/:userId/departments', requireRole(['admin']), updateUserDepartments);

// Department lead specific routes
router.get('/department-lead/users', requireRole(['department_lead']), getDepartmentLeadUsers);
router.post('/department-lead/users', requireRole(['department_lead']), createDepartmentLeadUser);
router.put('/department-lead/users/:id', requireRole(['department_lead']), updateDepartmentLeadUser);
router.delete('/department-lead/users/:id', requireRole(['department_lead']), deleteDepartmentLeadUser);
router.get('/department-lead/departments', requireRole(['department_lead']), getDepartmentLeadDepartments);

// Milestone template management (admin)
router.get('/years/:yearId/milestones', requireRole(['admin']), getMilestones);
router.post('/years/:yearId/milestones', requireRole(['admin']), createMilestone);
router.put('/milestones/:id', requireRole(['admin']), updateMilestone);
router.delete('/milestones/:id', requireRole(['admin']), deleteMilestone);

// Thesis-milestone instances (per thesis)
router.get('/theses/:id/milestones', getThesisMilestones);
router.put('/thesis-milestones/:id/due-at', updateThesisMilestoneDueAt);
router.put('/thesis-milestones/:id/approval', setThesisMilestoneApproval);
router.put('/thesis-milestones/:id/release', setThesisMilestoneReleased);
router.post('/thesis-milestones/:id/document', uploadThesisMilestoneDocument);
router.put('/thesis-milestones/:id/evaluation', evaluateThesisMilestone);

// Versioned milestone documents
router.get('/thesis-milestone-documents/:docId/download', downloadThesisMilestoneDocument);
router.delete('/thesis-milestone-documents/:docId', requireRole(['admin']), deleteThesisMilestoneDocument);

// Geheimhaltung (Confidentiality)
router.post('/theses/:id/confidentiality-pdf', requireRole(['admin', 'department_lead']), generateConfidentialityPdf);
router.post('/theses/:id/confidentiality-document', requireRole(['admin', 'department_lead']), uploadConfidentialityDocument);
router.get('/theses/:id/confidentiality-document', downloadConfidentialityDocument);
router.delete('/theses/:id/confidentiality-document', requireRole(['admin', 'department_lead']), deleteConfidentialityDocument);

// Chat (Berechtigung wird im Controller via userHasThesisAccess geprüft)
router.get('/theses/:id/chat', getChatMessages);
router.post('/theses/:id/chat', postChatMessage);
router.get('/chat-messages/:msgId/attachment', downloadChatAttachment);

// Evaluation form templates (admin)
router.get('/evaluation-forms', requireRole(['admin']), evalCtrl.listForms);
router.post('/evaluation-forms', requireRole(['admin']), evalCtrl.createForm);
router.get('/evaluation-forms/:id', requireRole(['admin']), evalCtrl.getForm);
router.put('/evaluation-forms/:id', requireRole(['admin']), evalCtrl.updateForm);
router.delete('/evaluation-forms/:id', requireRole(['admin']), evalCtrl.deleteForm);
router.post('/evaluation-forms/:formId/groups', requireRole(['admin']), evalCtrl.createGroup);
router.put('/evaluation-groups/:groupId', requireRole(['admin']), evalCtrl.updateGroup);
router.delete('/evaluation-groups/:groupId', requireRole(['admin']), evalCtrl.deleteGroup);
router.post('/evaluation-groups/:groupId/criteria', requireRole(['admin']), evalCtrl.createCriterion);
router.put('/evaluation-groups/:groupId/criteria/reorder', requireRole(['admin']), evalCtrl.reorderCriteria);
router.put('/evaluation-criteria/:criterionId', requireRole(['admin']), evalCtrl.updateCriterion);
router.delete('/evaluation-criteria/:criterionId', requireRole(['admin']), evalCtrl.deleteCriterion);

// Structured thesis evaluation (per thesis milestone)
router.get('/thesis-milestones/:id/evaluation-form', evalCtrl.getThesisEvaluation);
router.put('/thesis-milestones/:id/evaluation-form', evalCtrl.saveThesisEvaluation);
router.get('/thesis-milestones/:id/evaluation.pdf', evalCtrl.printThesisEvaluation);

// Transferprojekt-Zusammenzug (PDF, mehrere Bewertungen + Durchschnittsnote)
router.get('/theses/:id/transfer-project.pdf', evalCtrl.printTransferProjectSummary);

module.exports = router;
