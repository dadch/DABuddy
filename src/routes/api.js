const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
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
  changeThesisState,
  getThesisStateOptions,
  getDepartmentLeadUsers,
  createDepartmentLeadUser,
  updateDepartmentLeadUser,
  deleteDepartmentLeadUser,
  getDepartmentLeadDepartments,
  uploadDocument,
  getThesisDocuments,
  deleteDocument,
  downloadDocument,
  getDocumentLogs,
  getDocumentDueDates,
  setDocumentDueDate,
  deleteDocumentDueDate
} = require('../controllers/apiController');


const router = express.Router();

// Apply authentication middleware to all API routes
router.use(requireAuth);

// Thesis management routes (admin and department_lead)
router.get('/theses/:id', requireRole(['admin', 'department_lead']), getThesis);
router.post('/theses', requireRole(['admin', 'department_lead']), createThesis);
router.put('/theses/:id', requireRole(['admin', 'department_lead']), updateThesis);
router.delete('/theses/:id', requireRole(['admin', 'department_lead']), deleteThesis);

// User management routes (admin and department_lead)
router.get('/users', requireRole(['admin', 'department_lead']), getUsers);
router.post('/users', requireRole(['admin', 'department_lead']), createUser);
router.put('/users/:id', requireRole(['admin', 'department_lead']), updateUser);
router.delete('/users/:id', requireRole(['admin', 'department_lead']), deleteUser);

// Department management routes (admin only)
router.get('/departments', requireRole(['admin']), getDepartments);
router.post('/departments', requireRole(['admin']), createDepartment);
router.put('/departments/:id', requireRole(['admin']), updateDepartment);
router.delete('/departments/:id', requireRole(['admin']), deleteDepartment);

// User-Department assignment routes (admin only)
router.post('/users/assign-department', requireRole(['admin']), assignUserToDepartment);
router.post('/users/remove-department', requireRole(['admin']), removeUserFromDepartment);
router.put('/users/:userId/departments', requireRole(['admin']), updateUserDepartments);

// Thesis state management routes (all authenticated users)
router.get('/theses/:id/state-options', getThesisStateOptions);
router.put('/theses/:id/state', changeThesisState);

// Department lead specific routes
router.get('/department-lead/users', requireRole(['department_lead']), getDepartmentLeadUsers);
router.post('/department-lead/users', requireRole(['department_lead']), createDepartmentLeadUser);
router.put('/department-lead/users/:id', requireRole(['department_lead']), updateDepartmentLeadUser);
router.delete('/department-lead/users/:id', requireRole(['department_lead']), deleteDepartmentLeadUser);
router.get('/department-lead/departments', requireRole(['department_lead']), getDepartmentLeadDepartments);

// Document management routes
router.post('/theses/:id/documents', uploadDocument);
router.get('/theses/:id/documents', getThesisDocuments);
router.delete('/documents/:id', deleteDocument);
router.get('/documents/:id/download', downloadDocument);
router.get('/theses/:id/document-logs', getDocumentLogs);

// Document due date management (admin only)
router.get('/years/:yearId/document-due-dates', requireAuth, getDocumentDueDates);
router.post('/document-due-dates', requireAuth, requireRole('admin'), setDocumentDueDate);
router.delete('/years/:yearId/document-due-dates/:documentType', requireAuth, requireRole('admin'), deleteDocumentDueDate);

module.exports = router;