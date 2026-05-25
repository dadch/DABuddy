const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const evalCtrl = require('../controllers/evaluationController');
const {
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
  uploadThesisMilestoneDocument,
  deleteThesisMilestoneDocument,
  downloadThesisMilestoneDocument,
  evaluateThesisMilestone,
} = require('../controllers/apiController');


const router = express.Router();

router.use(requireAuth);

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
router.post('/thesis-milestones/:id/document', uploadThesisMilestoneDocument);
router.put('/thesis-milestones/:id/evaluation', evaluateThesisMilestone);

// Versioned milestone documents
router.get('/thesis-milestone-documents/:docId/download', downloadThesisMilestoneDocument);
router.delete('/thesis-milestone-documents/:docId', requireRole(['admin']), deleteThesisMilestoneDocument);

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

module.exports = router;
