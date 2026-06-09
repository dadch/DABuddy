const { sequelize, User, UserRole, Thesis, Department, Year, Milestone, ThesisMilestone, ThesisMilestoneDocument, ThesisLog, ChatMessage, ChatReadReceipt, UploadCategory } = require('../models');
const { Op, fn, col } = require('sequelize');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const archiver = require('archiver');

const CONFIDENTIALITY_TEMPLATE_PATH = path.join(__dirname, '../../beispiele/Geheimhaltungsvereinbarung.pdf');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Es sind nur PDF-Dateien erlaubt'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Chat akzeptiert beliebige Datei-Typen (50 MB Limit).
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, 'chat-' + unique + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const VALID_ROLES = ['student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'];

// FPC darf nur auf Meilensteine mit Transferprojekt-Kennzeichnung zugreifen.
const isFpcBlocked = (tm, userRole) =>
  userRole === 'field_project_coach' && !(tm && tm.is_transfer_project);
// Rollen, die eine Bewertung vornehmen dürfen (ohne Student)
const ASSESSOR_ROLES = ['coach', 'expert', 'admin', 'department_lead', 'field_project_coach'];

// Schreibt einen Eintrag ins Diplomarbeit-Änderungsprotokoll.
const writeThesisLog = async (thesisId, thesisMilestoneId, userId, action, detail) => {
  try {
    await ThesisLog.create({
      thesis_id: thesisId,
      thesis_milestone_id: thesisMilestoneId,
      user_id: userId,
      action,
      detail: detail || null,
    });
  } catch (e) {
    console.error('Fehler beim Schreiben des Diplomarbeit-Logs:', e);
  }
};

// Sync the department_lead_id FK on Department with the user's role + assigned departments.
const syncDepartmentLeadAssignments = async (user, departmentIds) => {
  const targetIds = (departmentIds || []).map(id => parseInt(id)).filter(id => !isNaN(id));

  if (user.role === 'department_lead' && targetIds.length > 0) {
    await Department.update({ department_lead_id: user.id }, { where: { id: targetIds } });
    await Department.update(
      { department_lead_id: null },
      { where: { department_lead_id: user.id, id: { [Op.notIn]: targetIds } } }
    );
  } else {
    await Department.update({ department_lead_id: null }, { where: { department_lead_id: user.id } });
  }
};

// ---------- Thesis ----------

const getThesis = async (req, res) => {
  try {
    const thesis = await Thesis.findByPk(req.params.id, {
      include: [
        { model: Department, as: 'department' },
        { model: Year, as: 'year' },
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' },
        { model: User, as: 'fieldProjectCoaches' }
      ]
    });
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });
    res.json(thesis);
  } catch (error) {
    console.error('Error fetching thesis:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Create a ThesisMilestone snapshot from a Milestone template.
// released: ob der Meilenstein bereits freigegeben (gestartet) ist (erster = true).
const createThesisMilestoneFromTemplate = (thesisId, template, released = false) => ({
  thesis_id: thesisId,
  milestone_id: template.id,
  label: template.label,
  due_at: template.due_at,
  released,
  responsible_role: template.responsible_role,
  allow_upload: template.allow_upload,
  allow_update: template.allow_update,
  requires_evaluation: template.requires_evaluation,
  evaluator_role: template.evaluator_role,
  double_evaluation: template.double_evaluation,
  evaluator_role_2: template.evaluator_role_2,
  evaluation_form_id: template.evaluation_form_id,
  requires_approval: template.requires_approval,
  approver_role: template.approver_role,
  requires_approval_2: template.requires_approval_2,
  approver_role_2: template.approver_role_2,
  is_transfer_project: template.is_transfer_project,
  feedback_form_enabled: template.feedback_form_enabled,
});

const createThesis = async (req, res) => {
  try {
    const { title, department_id, sponsor, students, coach, expert, field_project_coach, language, is_confidential } = req.body;
    const selectedYearId = req.session.selectedYear;
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const ledIds = ledDepartments.map(d => d.id);
      if (!ledIds.includes(parseInt(department_id))) {
        return res.status(403).json({ success: false, message: 'Sie können nur Diplomarbeiten für Fachbereiche erstellen, die Sie leiten.' });
      }
    }

    if (students && students.length > 2) {
      return res.status(400).json({ success: false, message: 'Maximal 2 Studenten können einer Diplomarbeit zugewiesen werden' });
    }

    const thesis = await Thesis.create({
      title,
      department_id,
      sponsor: sponsor || null,
      year_id: selectedYearId,
      language: (language === 'fr') ? 'fr' : 'de',
      is_confidential: !!is_confidential,
    });

    if (students && students.length > 0) {
      const studentUsers = await User.findAll({
        where: { id: students, role: 'student' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      await thesis.setStudents(studentUsers);
    }
    if (coach) {
      const coachUser = await User.findOne({
        where: { id: coach, role: 'coach' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      if (coachUser) await thesis.setCoaches([coachUser]);
    }
    if (expert) {
      const expertUser = await User.findOne({
        where: { id: expert, role: 'expert' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      if (expertUser) await thesis.setExperts([expertUser]);
    }
    if (field_project_coach) {
      const fpcUser = await User.findOne({
        where: { id: field_project_coach, role: 'field_project_coach' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      if (fpcUser) await thesis.setFieldProjectCoaches([fpcUser]);
    }

    // Snapshot milestones for the thesis (earliest milestone is released by default)
    const templates = await Milestone.findAll({
      where: { year_id: selectedYearId },
      include: [{ model: UploadCategory, as: 'uploadCategories', through: { attributes: [] } }],
      order: [['due_at', 'ASC'], ['id', 'ASC']],
    });
    if (templates.length > 0) {
      const createdTms = [];
      for (let i = 0; i < templates.length; i++) {
        const tm = await ThesisMilestone.create(createThesisMilestoneFromTemplate(thesis.id, templates[i], i === 0));
        if (templates[i].uploadCategories && templates[i].uploadCategories.length > 0) {
          await tm.setUploadCategories(templates[i].uploadCategories.map(c => c.id));
        }
        createdTms.push(tm);
      }
    }

    res.json({ success: true, thesis });
  } catch (error) {
    console.error('Error creating thesis:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateThesis = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, department_id, sponsor, students, coach, expert, field_project_coach, language, is_confidential } = req.body;
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    if (students && students.length > 2) {
      return res.status(400).json({ success: false, message: 'Maximal 2 Studenten können einer Diplomarbeit zugewiesen werden' });
    }

    const thesis = await Thesis.findByPk(id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });

    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const ledIds = ledDepartments.map(d => d.id);
      if (!ledIds.includes(thesis.department_id) || (department_id && !ledIds.includes(parseInt(department_id)))) {
        return res.status(403).json({ success: false, message: 'Sie können nur Diplomarbeiten aus Fachbereichen bearbeiten, die Sie leiten.' });
      }
    }

    const oldDepartmentId = thesis.department_id;
    const departmentChanged = oldDepartmentId !== department_id;

    await thesis.update({
      title,
      department_id,
      sponsor: sponsor || null,
      language: (language === 'fr' || language === 'de') ? language : thesis.language,
      ...(is_confidential !== undefined ? { is_confidential: !!is_confidential } : {}),
    });

    if (departmentChanged) {
      const currentStudents = await thesis.getStudents();
      const validStudents = await User.findAll({
        where: { id: currentStudents.map(s => s.id), role: 'student' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      await thesis.setStudents(validStudents);

      const currentCoaches = await thesis.getCoaches();
      const validCoaches = await User.findAll({
        where: { id: currentCoaches.map(c => c.id), role: 'coach' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      await thesis.setCoaches(validCoaches);

      const currentExperts = await thesis.getExperts();
      const validExperts = await User.findAll({
        where: { id: currentExperts.map(e => e.id), role: 'expert' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      await thesis.setExperts(validExperts);

      const currentFpcs = await thesis.getFieldProjectCoaches();
      const validFpcs = await User.findAll({
        where: { id: currentFpcs.map(f => f.id), role: 'field_project_coach' },
        include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
      });
      await thesis.setFieldProjectCoaches(validFpcs);
    }

    if (students !== undefined) {
      if (students.length > 0) {
        const studentUsers = await User.findAll({
          where: { id: students, role: 'student' },
          include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
        });
        await thesis.setStudents(studentUsers);
      } else {
        await thesis.setStudents([]);
      }
    }

    if (coach !== undefined) {
      if (coach) {
        const coachUser = await User.findOne({
          where: { id: coach, role: 'coach' },
          include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
        });
        if (coachUser) await thesis.setCoaches([coachUser]);
      } else {
        await thesis.setCoaches([]);
      }
    }

    if (expert !== undefined) {
      if (expert) {
        const expertUser = await User.findOne({
          where: { id: expert, role: 'expert' },
          include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
        });
        if (expertUser) await thesis.setExperts([expertUser]);
      } else {
        await thesis.setExperts([]);
      }
    }

    if (field_project_coach !== undefined) {
      if (field_project_coach) {
        const fpcUser = await User.findOne({
          where: { id: field_project_coach, role: 'field_project_coach' },
          include: [{ model: Department, as: 'departments', where: { id: department_id }, required: true }]
        });
        if (fpcUser) await thesis.setFieldProjectCoaches([fpcUser]);
      } else {
        await thesis.setFieldProjectCoaches([]);
      }
    }

    res.json({ success: true, thesis });
  } catch (error) {
    console.error('Error updating thesis:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteThesis = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });

    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const ledIds = ledDepartments.map(d => d.id);
      if (!ledIds.includes(thesis.department_id)) {
        return res.status(403).json({ success: false, message: 'Sie können nur Diplomarbeiten aus Fachbereichen löschen, die Sie leiten.' });
      }
    }

    // Remove uploaded milestone document files (all versions)
    const milestones = await ThesisMilestone.findAll({
      where: { thesis_id: thesis.id },
      include: [{ model: ThesisMilestoneDocument, as: 'documents' }]
    });
    for (const m of milestones) {
      (m.documents || []).forEach(doc => {
        if (doc.file_path && fs.existsSync(doc.file_path)) {
          try { fs.unlinkSync(doc.file_path); } catch (e) { console.error('unlink failed', e); }
        }
      });
    }

    await thesis.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting thesis:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Users ----------

// Synchronisiert die user_roles-Tabelle so, dass sie genau {Primärrolle} ∪ {additionalRoles}
// enthält. Wird bei createUser/updateUser/createDepartmentLeadUser/updateDepartmentLeadUser
// aufgerufen.
const ALL_ROLES = ['student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'];
const syncUserRoles = async (userId, primaryRole, additionalRoles, allowedRoles = ALL_ROLES) => {
  const target = new Set([primaryRole]);
  for (const r of additionalRoles || []) {
    if (allowedRoles.includes(r)) target.add(r);
  }
  await UserRole.destroy({ where: { user_id: userId, role: { [Op.notIn]: Array.from(target) } } });
  for (const r of target) {
    await UserRole.findOrCreate({ where: { user_id: userId, role: r } });
  }
};

const getUsers = async (req, res) => {
  try {
    const { department_id, role } = req.query;
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    let whereClause = {};
    let includeClause = [{ model: Department, as: 'departments', attributes: ['id', 'name'], required: false }];
    if (role) whereClause.role = role;

    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const ledIds = ledDepartments.map(d => d.id);
      if (ledIds.length === 0) return res.json([]);
      includeClause = [{ model: Department, as: 'departments', where: { id: ledIds }, attributes: ['id', 'name'], required: true }];
    } else if (department_id) {
      includeClause = [{ model: Department, as: 'departments', where: { id: department_id }, required: true }];
    }

    const users = await User.findAll({
      attributes: ['id', 'username', 'name', 'firstname', 'email', 'role', 'phone'],
      where: whereClause,
      include: [
        ...includeClause,
        { model: UserRole, as: 'extraRoles', attributes: ['role'] },
      ],
      order: [['name', 'ASC'], ['firstname', 'ASC']]
    });

    res.json(users.map(u => {
      const json = u.toJSON();
      json.additional_roles = (json.extraRoles || []).map(r => r.role).filter(r => r !== json.role);
      delete json.extraRoles;
      return json;
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments, additional_roles, phone } = req.body;

    const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const user = await User.create({ username, password, firstname, name, email, role, phone: phone || null });

    if (departments && departments.length > 0) {
      const deptObjs = await Department.findAll({ where: { id: departments } });
      await user.setDepartments(deptObjs);
    }

    await syncDepartmentLeadAssignments(user, departments);
    await syncUserRoles(user.id, role, additional_roles);

    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, firstname: user.firstname, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments, additional_roles, phone } = req.body;

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });

    const existing = await User.findOne({
      where: { [Op.and]: [{ id: { [Op.ne]: id } }, { [Op.or]: [{ username }, { email }] }] }
    });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const updateData = { username, firstname, name, email, role };
    if (phone !== undefined) updateData.phone = phone || null;
    if (password && password.trim() !== '') updateData.password = password;

    await user.update(updateData);

    if (departments !== undefined) {
      if (departments.length > 0) {
        const deptObjs = await Department.findAll({ where: { id: departments } });
        await user.setDepartments(deptObjs);
      } else {
        await user.setDepartments([]);
      }
      await syncDepartmentLeadAssignments(user, departments);
    } else if (user.role !== 'department_lead') {
      await syncDepartmentLeadAssignments(user, []);
    }

    await syncUserRoles(user.id, role, additional_roles);

    res.json({ success: true, user: { id: user.id, username: user.username, firstname: user.firstname, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    if (user.id === req.session.userId) {
      return res.status(400).json({ success: false, message: 'Sie können Ihren eigenen Account nicht löschen' });
    }
    await user.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Departments ----------

const getDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      include: [{ model: User, as: 'departmentLead', attributes: ['id', 'username', 'name', 'firstname', 'email'] }],
      order: [['name', 'ASC']]
    });
    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, department_lead_id } = req.body;
    const existing = await Department.findOne({ where: { name } });
    if (existing) return res.status(400).json({ success: false, message: 'Name des Fachbereichs existiert bereits' });

    if (department_lead_id) {
      const lead = await User.findOne({ where: { id: department_lead_id, role: 'department_lead' } });
      if (!lead) return res.status(400).json({ success: false, message: 'Der ausgewählte Benutzer ist keine FachbereichsleiterIn' });
    }

    const department = await Department.create({ name, department_lead_id: department_lead_id || null });
    const result = await Department.findByPk(department.id, {
      include: [{ model: User, as: 'departmentLead', attributes: ['id', 'username', 'name', 'firstname', 'email'] }]
    });
    res.json({ success: true, department: result });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_lead_id } = req.body;
    const department = await Department.findByPk(id);
    if (!department) return res.status(404).json({ success: false, message: 'Fachbereich nicht gefunden' });

    if (name !== department.name) {
      const existing = await Department.findOne({ where: { name, id: { [Op.ne]: id } } });
      if (existing) return res.status(400).json({ success: false, message: 'Name des Fachbereichs existiert bereits' });
    }

    if (department_lead_id) {
      const lead = await User.findOne({ where: { id: department_lead_id, role: 'department_lead' } });
      if (!lead) return res.status(400).json({ success: false, message: 'Der ausgewählte Benutzer ist keine FachbereichsleiterIn' });
    }

    await department.update({ name, department_lead_id: department_lead_id || null });
    const updated = await Department.findByPk(id, {
      include: [{ model: User, as: 'departmentLead', attributes: ['id', 'username', 'name', 'firstname', 'email'] }]
    });
    res.json({ success: true, department: updated });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Fachbereich nicht gefunden' });
    const count = await Thesis.count({ where: { department_id: department.id } });
    if (count > 0) {
      return res.status(400).json({ success: false, message: 'Fachbereich mit zugehörigen Diplomarbeiten kann nicht gelöscht werden' });
    }
    await department.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const assignUserToDepartment = async (req, res) => {
  try {
    const { userId, departmentId } = req.body;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    const department = await Department.findByPk(departmentId);
    if (!department) return res.status(404).json({ success: false, message: 'Fachbereich nicht gefunden' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Admin-Benutzer können keinen Fachbereichen zugewiesen werden' });
    await user.addDepartment(department);
    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning user to department:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const removeUserFromDepartment = async (req, res) => {
  try {
    const { userId, departmentId } = req.body;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    const department = await Department.findByPk(departmentId);
    if (!department) return res.status(404).json({ success: false, message: 'Fachbereich nicht gefunden' });
    await user.removeDepartment(department);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing user from department:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateUserDepartments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { departmentIds } = req.body;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Admin-Benutzer können keinen Fachbereichen zugewiesen werden' });

    if (departmentIds && departmentIds.length > 0) {
      const depts = await Department.findAll({ where: { id: departmentIds } });
      await user.setDepartments(depts);
    } else {
      await user.setDepartments([]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user departments:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Student management (admin + department_lead) ----------

const STUDENT_DEFAULT_PASSWORD = 'password123';
const VALID_GENDERS = ['m', 'w', 'd'];

const getLedDepartmentIds = async (userId) => {
  const led = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
  return led.map(d => d.id);
};

// Eindeutigen Benutzernamen aus dem lokalen Teil der E-Mail ableiten.
const generateUsername = async (email) => {
  let base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (base.length < 3) base = (base + 'student').slice(0, 20);
  let candidate = base;
  let i = 1;
  while (await User.findOne({ where: { username: candidate } })) {
    candidate = base + i;
    i++;
  }
  return candidate;
};

// Validiert + legt einen Studierenden an. allDepartments: vorab geladene Liste.
// Wirft Error mit verständlicher Meldung bei Problemen.
const createStudentRecord = async ({ name, firstname, email, gender, department, phone }, { actorRole, ledIds, allDepartments }) => {
  name = (name || '').trim();
  firstname = (firstname || '').trim();
  email = (email || '').trim();
  gender = (gender || '').trim().toLowerCase();
  phone = (phone || '').trim() || null;
  const depStr = String(department || '').trim();

  if (!name || !firstname || !email) throw new Error('Name, Vorname und E-Mail sind erforderlich');
  if (!email.includes('@')) throw new Error('Ungültige E-Mail-Adresse: ' + email);
  if (!VALID_GENDERS.includes(gender)) throw new Error('Ungültiges Geschlecht (m/w/d): "' + gender + '"');

  let dep = null;
  if (/^\d+$/.test(depStr)) dep = allDepartments.find(d => d.id === parseInt(depStr));
  if (!dep) dep = allDepartments.find(d => d.name.toLowerCase() === depStr.toLowerCase());
  if (!dep) throw new Error('Fachbereich nicht gefunden: "' + depStr + '"');
  if (actorRole === 'department_lead' && !ledIds.includes(dep.id)) {
    throw new Error('Sie können Studierende nur Ihren Fachbereichen zuweisen: ' + dep.name);
  }

  const existsEmail = await User.findOne({ where: { email } });
  if (existsEmail) throw new Error('E-Mail existiert bereits: ' + email);

  // Studierende melden sich mit ihrer E-Mail an -> Benutzername = E-Mail (sofern Länge passt
  // und frei), sonst aus dem lokalen Teil generiert.
  let username = email;
  if (email.length > 50 || await User.findOne({ where: { username: email } })) {
    username = await generateUsername(email);
  }
  const user = await User.create({
    username, password: STUDENT_DEFAULT_PASSWORD, name, firstname, email, role: 'student', gender, phone,
  });
  await user.setDepartments([dep.id]);
  return user;
};

const getStudents = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    let includeDept = { model: Department, as: 'departments', attributes: ['id', 'name'], through: { attributes: [] } };
    if (userRole === 'department_lead') {
      const ledIds = await getLedDepartmentIds(userId);
      if (ledIds.length === 0) return res.json([]);
      includeDept = { ...includeDept, where: { id: ledIds }, required: true };
    }

    const students = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'username', 'name', 'firstname', 'email', 'gender', 'phone'],
      include: [includeDept],
      order: [['name', 'ASC'], ['firstname', 'ASC']],
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createStudent = async (req, res) => {
  try {
    const actorRole = req.session.userRole;
    const ledIds = actorRole === 'department_lead' ? await getLedDepartmentIds(req.session.userId) : [];
    const allDepartments = await Department.findAll({ attributes: ['id', 'name'] });
    const user = await createStudentRecord(req.body, { actorRole, ledIds, allDepartments });
    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, firstname: user.firstname, email: user.email, gender: user.gender } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Fehler beim Anlegen' });
  }
};

const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = req.session.userRole;
    const { name, firstname, email, gender, department, phone } = req.body;

    const user = await User.findByPk(id, {
      include: [{ model: Department, as: 'departments', attributes: ['id'], through: { attributes: [] } }]
    });
    if (!user || user.role !== 'student') return res.status(404).json({ success: false, message: 'Studierende/r nicht gefunden' });

    const ledIds = actorRole === 'department_lead' ? await getLedDepartmentIds(req.session.userId) : [];
    if (actorRole === 'department_lead') {
      const userDeptIds = user.departments.map(d => d.id);
      if (!userDeptIds.some(d => ledIds.includes(d))) {
        return res.status(403).json({ success: false, message: 'Sie können nur Studierende aus Ihren Fachbereichen bearbeiten.' });
      }
    }

    if (gender !== undefined && gender !== null && gender !== '' && !VALID_GENDERS.includes(String(gender).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Ungültiges Geschlecht (m/w/d)' });
    }
    if (email && !String(email).includes('@')) {
      return res.status(400).json({ success: false, message: 'Ungültige E-Mail-Adresse' });
    }
    if (email && email !== user.email) {
      const exists = await User.findOne({ where: { email, id: { [Op.ne]: id } } });
      if (exists) return res.status(400).json({ success: false, message: 'E-Mail existiert bereits' });
    }

    await user.update({
      name: name ?? user.name,
      firstname: firstname ?? user.firstname,
      email: email ?? user.email,
      gender: (gender === undefined) ? user.gender : (gender || null),
      phone: (phone === undefined) ? user.phone : ((String(phone).trim() || null)),
    });

    if (department !== undefined && department !== null && String(department).trim() !== '') {
      const allDepartments = await Department.findAll({ attributes: ['id', 'name'] });
      const depStr = String(department).trim();
      let dep = /^\d+$/.test(depStr) ? allDepartments.find(d => d.id === parseInt(depStr)) : null;
      if (!dep) dep = allDepartments.find(d => d.name.toLowerCase() === depStr.toLowerCase());
      if (!dep) return res.status(400).json({ success: false, message: 'Fachbereich nicht gefunden' });
      if (actorRole === 'department_lead' && !ledIds.includes(dep.id)) {
        return res.status(403).json({ success: false, message: 'Sie können Studierende nur Ihren Fachbereichen zuweisen.' });
      }
      await user.setDepartments([dep.id]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const actorRole = req.session.userRole;
    const user = await User.findByPk(id, {
      include: [{ model: Department, as: 'departments', attributes: ['id'], through: { attributes: [] } }]
    });
    if (!user || user.role !== 'student') return res.status(404).json({ success: false, message: 'Studierende/r nicht gefunden' });

    if (actorRole === 'department_lead') {
      const ledIds = await getLedDepartmentIds(req.session.userId);
      const userDeptIds = user.departments.map(d => d.id);
      if (!userDeptIds.some(d => ledIds.includes(d))) {
        return res.status(403).json({ success: false, message: 'Sie können nur Studierende aus Ihren Fachbereichen löschen.' });
      }
    }

    await user.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// CSV-Import: pro Zeile "Name; Vorname; E-Mail; Geschlecht; Fachbereich" (Trenner ; oder ,)
const importStudents = async (req, res) => {
  try {
    const actorRole = req.session.userRole;
    const ledIds = actorRole === 'department_lead' ? await getLedDepartmentIds(req.session.userId) : [];
    const allDepartments = await Department.findAll({ attributes: ['id', 'name'] });

    const csv = String(req.body.csv || '');
    const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    let created = 0;
    const errors = [];
    let lineNo = 0;
    for (const line of lines) {
      lineNo++;
      const sep = line.includes(';') ? ';' : ',';
      const parts = line.split(sep).map(p => p.trim());
      const [name, firstname, email, gender, department] = parts;
      // Kopfzeile / ungültige E-Mail überspringen
      if (!email || !email.includes('@')) {
        // Nur als Fehler melden, wenn es nicht offensichtlich eine Kopfzeile ist
        if (lineNo === 1 && /mail/i.test(line)) continue;
        errors.push({ line: lineNo, message: 'Übersprungen (keine gültige E-Mail): ' + line });
        continue;
      }
      try {
        await createStudentRecord({ name, firstname, email, gender, department }, { actorRole, ledIds, allDepartments });
        created++;
      } catch (e) {
        errors.push({ line: lineNo, message: e.message });
      }
    }

    res.json({ success: true, created, errors });
  } catch (error) {
    console.error('Error importing students:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Department lead self-management ----------

const getDepartmentLeadUsers = async (req, res) => {
  try {
    const userId = req.session.userId;
    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ids = ledDepartments.map(d => d.id);
    if (ids.length === 0) return res.json([]);

    const users = await User.findAll({
      include: [
        { model: Department, as: 'departments', where: { id: ids }, through: { attributes: [] } },
        { model: UserRole, as: 'extraRoles', attributes: ['role'] },
      ],
      where: { role: ['student', 'coach', 'expert'] },
      order: [['name', 'ASC'], ['firstname', 'ASC']],
    });
    res.json(users.map(u => {
      const json = u.toJSON();
      json.additional_roles = (json.extraRoles || []).map(r => r.role).filter(r => r !== json.role);
      delete json.extraRoles;
      return json;
    }));
  } catch (error) {
    console.error('Error fetching department lead users:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const FBL_ALLOWED_ROLES = ['student', 'coach', 'expert'];

const createDepartmentLeadUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments, additional_roles, phone } = req.body;
    const userId = req.session.userId;

    if (!FBL_ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle. FachbereichsleiterInnen können nur Studenten-, Dozent/in- oder ExpertIn-Konten erstellen.' });
    }
    if ((additional_roles || []).some(r => !FBL_ALLOWED_ROLES.includes(r))) {
      return res.status(400).json({ success: false, message: 'Zusatzrollen dürfen nur Student, Dozent/in oder ExpertIn sein.' });
    }

    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ledIds = ledDepartments.map(d => d.id);

    if (departments && departments.length > 0) {
      const invalid = departments.filter(d => !ledIds.includes(parseInt(d)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: 'Sie können Benutzer nur Fachbereichen zuweisen, die Sie leiten.' });
      }
    }

    const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const user = await User.create({ username, password, firstname, name, email, role, phone: phone || null });
    if (departments && departments.length > 0) {
      const deptObjs = await Department.findAll({ where: { id: departments } });
      await user.setDepartments(deptObjs);
    }

    await syncUserRoles(user.id, role, additional_roles, FBL_ALLOWED_ROLES);

    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, firstname: user.firstname, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error creating department lead user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateDepartmentLeadUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments, additional_roles, phone } = req.body;
    const userId = req.session.userId;

    if (!FBL_ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle. FachbereichsleiterInnen können nur Studenten-, Dozent/in- oder ExpertIn-Konten verwalten.' });
    }
    if ((additional_roles || []).some(r => !FBL_ALLOWED_ROLES.includes(r))) {
      return res.status(400).json({ success: false, message: 'Zusatzrollen dürfen nur Student, Dozent/in oder ExpertIn sein.' });
    }

    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ledIds = ledDepartments.map(d => d.id);

    const user = await User.findByPk(id, {
      include: [{ model: Department, as: 'departments', through: { attributes: [] } }]
    });
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });

    const userDeptIds = user.departments.map(d => d.id);
    if (!userDeptIds.some(d => ledIds.includes(d))) {
      return res.status(403).json({ success: false, message: 'Sie können nur Benutzer aus Fachbereichen bearbeiten, die Sie leiten.' });
    }

    if (departments && departments.length > 0) {
      const invalid = departments.filter(d => !ledIds.includes(parseInt(d)));
      if (invalid.length > 0) {
        return res.status(400).json({ success: false, message: 'Sie können Benutzer nur Fachbereichen zuweisen, die Sie leiten.' });
      }
    }

    const existing = await User.findOne({
      where: { [Op.and]: [{ id: { [Op.ne]: id } }, { [Op.or]: [{ username }, { email }] }] }
    });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const updateData = { username, firstname, name, email, role };
    if (phone !== undefined) updateData.phone = phone || null;
    if (password && password.trim() !== '') updateData.password = password;
    await user.update(updateData);

    if (departments !== undefined) {
      if (departments.length > 0) {
        const deptObjs = await Department.findAll({ where: { id: departments } });
        await user.setDepartments(deptObjs);
      } else {
        await user.setDepartments([]);
      }
    }

    await syncUserRoles(user.id, role, additional_roles, FBL_ALLOWED_ROLES);

    res.json({ success: true, user: { id: user.id, username: user.username, firstname: user.firstname, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error updating department lead user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteDepartmentLeadUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ledIds = ledDepartments.map(d => d.id);

    const user = await User.findByPk(id, {
      include: [{ model: Department, as: 'departments', through: { attributes: [] } }]
    });
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });

    const userDeptIds = user.departments.map(d => d.id);
    if (!userDeptIds.some(d => ledIds.includes(d))) {
      return res.status(403).json({ success: false, message: 'Sie können nur Benutzer aus Fachbereichen löschen, die Sie leiten.' });
    }

    const studentTheses = await user.getStudentTheses();
    const coachedTheses = await user.getCoachedTheses();
    const expertTheses = await user.getExpertTheses();
    if (studentTheses.length || coachedTheses.length || expertTheses.length) {
      return res.status(400).json({ success: false, message: 'Benutzer mit bestehenden Diplomarbeit-Zuordnungen kann nicht gelöscht werden' });
    }

    await user.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting department lead user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const getDepartmentLeadDepartments = async (req, res) => {
  try {
    const userId = req.session.userId;
    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, order: [['name', 'ASC']] });
    res.json(ledDepartments);
  } catch (error) {
    console.error('Error fetching department lead departments:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Milestones (template) ----------

const getMilestones = async (req, res) => {
  try {
    const { yearId } = req.params;
    const milestones = await Milestone.findAll({
      where: { year_id: yearId },
      include: [{ model: UploadCategory, as: 'uploadCategories', through: { attributes: [] } }],
      order: [['due_at', 'ASC']],
    });
    res.json(milestones);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Normalize + validate milestone config fields from a request body.
const parseMilestoneConfig = (body) => {
  const allow_upload = body.allow_upload === undefined ? true : !!body.allow_upload;
  const allow_update = body.allow_update === undefined ? false : !!body.allow_update;
  const requires_evaluation = body.requires_evaluation === undefined ? false : !!body.requires_evaluation;
  let evaluator_role = requires_evaluation ? (body.evaluator_role || null) : null;
  let evaluation_form_id = requires_evaluation && body.evaluation_form_id ? parseInt(body.evaluation_form_id) : null;
  if (Number.isNaN(evaluation_form_id)) evaluation_form_id = null;
  const double_evaluation = requires_evaluation && (body.double_evaluation === undefined ? false : !!body.double_evaluation);
  const evaluator_role_2 = double_evaluation ? (body.evaluator_role_2 || null) : null;
  const requires_approval = body.requires_approval === undefined ? false : !!body.requires_approval;
  const approver_role = requires_approval ? (body.approver_role || null) : null;
  const requires_approval_2 = body.requires_approval_2 === undefined ? false : !!body.requires_approval_2;
  const approver_role_2 = requires_approval_2 ? (body.approver_role_2 || null) : null;
  const is_transfer_project = body.is_transfer_project === undefined ? false : !!body.is_transfer_project;
  const feedback_form_enabled = body.feedback_form_enabled === undefined ? false : !!body.feedback_form_enabled;
  return { allow_upload, allow_update, requires_evaluation, evaluator_role, double_evaluation, evaluator_role_2, evaluation_form_id, requires_approval, approver_role, requires_approval_2, approver_role_2, is_transfer_project, feedback_form_enabled };
};

const createMilestone = async (req, res) => {
  try {
    const { yearId } = req.params;
    const { label, due_at, responsible_role, applyToExisting } = req.body;

    if (!label || !due_at || !responsible_role) {
      return res.status(400).json({ success: false, message: 'Bezeichnung, Termin und Rolle sind erforderlich' });
    }
    if (!VALID_ROLES.includes(responsible_role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle' });
    }

    const config = parseMilestoneConfig(req.body);
    if (config.requires_evaluation) {
      if (!config.evaluator_role) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Bewertung muss eine bewertende Rolle gewählt werden' });
      }
      if (!ASSESSOR_ROLES.includes(config.evaluator_role)) {
        return res.status(400).json({ success: false, message: 'Ungültige bewertende Rolle' });
      }
      if (config.double_evaluation) {
        if (!config.evaluation_form_id) {
          return res.status(400).json({ success: false, message: 'Für eine Doppelbewertung muss ein Bewertungsformular zugewiesen werden' });
        }
        if (!config.evaluator_role_2 || !ASSESSOR_ROLES.includes(config.evaluator_role_2)) {
          return res.status(400).json({ success: false, message: 'Für eine Doppelbewertung muss eine gültige zweite bewertende Rolle gewählt werden' });
        }
        if (config.evaluator_role_2 === config.evaluator_role) {
          return res.status(400).json({ success: false, message: 'Die beiden bewertenden Rollen müssen unterschiedlich sein' });
        }
      }
    }
    if (config.requires_approval) {
      if (!config.approver_role) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Freigabe 1 muss eine freigebende Rolle gewählt werden' });
      }
      if (!VALID_ROLES.includes(config.approver_role)) {
        return res.status(400).json({ success: false, message: 'Ungültige freigebende Rolle (Freigabe 1)' });
      }
    }
    if (config.requires_approval_2) {
      if (!config.approver_role_2) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Freigabe 2 muss eine freigebende Rolle gewählt werden' });
      }
      if (!VALID_ROLES.includes(config.approver_role_2)) {
        return res.status(400).json({ success: false, message: 'Ungültige freigebende Rolle (Freigabe 2)' });
      }
    }

    const year = await Year.findByPk(yearId);
    if (!year) return res.status(404).json({ success: false, message: 'Diplomjahr nicht gefunden' });

    const milestone = await Milestone.create({ year_id: yearId, label, due_at, responsible_role, ...config });

    // Upload-Kategorien zuweisen (optional)
    const catIds = Array.isArray(req.body.upload_categories)
      ? req.body.upload_categories.map(n => parseInt(n, 10)).filter(Number.isInteger)
      : [];
    if (catIds.length > 0) await milestone.setUploadCategories(catIds);

    if (applyToExisting) {
      const theses = await Thesis.findAll({ where: { year_id: yearId }, attributes: ['id'] });
      if (theses.length > 0) {
        const tms = await ThesisMilestone.bulkCreate(
          theses.map(t => createThesisMilestoneFromTemplate(t.id, milestone)),
          { returning: true }
        );
        // Kategorien an die neuen Snapshots verteilen
        if (catIds.length > 0) {
          for (const tm of tms) await tm.setUploadCategories(catIds);
        }
      }
    }

    res.json({ success: true, milestone });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, due_at, responsible_role, applyToExisting } = req.body;

    if (responsible_role && !VALID_ROLES.includes(responsible_role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle' });
    }

    const milestone = await Milestone.findByPk(id);
    if (!milestone) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    const config = parseMilestoneConfig(req.body);
    if (config.requires_evaluation) {
      if (!config.evaluator_role) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Bewertung muss eine bewertende Rolle gewählt werden' });
      }
      if (!ASSESSOR_ROLES.includes(config.evaluator_role)) {
        return res.status(400).json({ success: false, message: 'Ungültige bewertende Rolle' });
      }
      if (config.double_evaluation) {
        if (!config.evaluation_form_id) {
          return res.status(400).json({ success: false, message: 'Für eine Doppelbewertung muss ein Bewertungsformular zugewiesen werden' });
        }
        if (!config.evaluator_role_2 || !ASSESSOR_ROLES.includes(config.evaluator_role_2)) {
          return res.status(400).json({ success: false, message: 'Für eine Doppelbewertung muss eine gültige zweite bewertende Rolle gewählt werden' });
        }
        if (config.evaluator_role_2 === config.evaluator_role) {
          return res.status(400).json({ success: false, message: 'Die beiden bewertenden Rollen müssen unterschiedlich sein' });
        }
      }
    }
    if (config.requires_approval) {
      if (!config.approver_role) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Freigabe 1 muss eine freigebende Rolle gewählt werden' });
      }
      if (!VALID_ROLES.includes(config.approver_role)) {
        return res.status(400).json({ success: false, message: 'Ungültige freigebende Rolle (Freigabe 1)' });
      }
    }
    if (config.requires_approval_2) {
      if (!config.approver_role_2) {
        return res.status(400).json({ success: false, message: 'Bei aktivierter Freigabe 2 muss eine freigebende Rolle gewählt werden' });
      }
      if (!VALID_ROLES.includes(config.approver_role_2)) {
        return res.status(400).json({ success: false, message: 'Ungültige freigebende Rolle (Freigabe 2)' });
      }
    }

    await milestone.update({
      label: label ?? milestone.label,
      due_at: due_at ?? milestone.due_at,
      responsible_role: responsible_role ?? milestone.responsible_role,
      ...config,
    });

    // Upload-Kategorien synchronisieren (immer komplett ersetzen für die Vorlage).
    let newCatIds = null;
    if (Array.isArray(req.body.upload_categories)) {
      newCatIds = req.body.upload_categories.map(n => parseInt(n, 10)).filter(Number.isInteger);
      await milestone.setUploadCategories(newCatIds);
    }

    if (applyToExisting) {
      // Alle anderen Felder werden auf allen Snapshots aktualisiert. due_at wird
      // nur dort gesetzt, wo es nicht individuell überschrieben wurde — siehe
      // separates Update unten.
      await ThesisMilestone.update(
        {
          label: milestone.label,
          responsible_role: milestone.responsible_role,
          allow_upload: milestone.allow_upload,
          allow_update: milestone.allow_update,
          requires_evaluation: milestone.requires_evaluation,
          evaluator_role: milestone.evaluator_role,
          double_evaluation: milestone.double_evaluation,
          evaluator_role_2: milestone.evaluator_role_2,
          evaluation_form_id: milestone.evaluation_form_id,
          requires_approval: milestone.requires_approval,
          approver_role: milestone.approver_role,
          requires_approval_2: milestone.requires_approval_2,
          approver_role_2: milestone.approver_role_2,
          is_transfer_project: milestone.is_transfer_project,
          feedback_form_enabled: milestone.feedback_form_enabled,
        },
        { where: { milestone_id: milestone.id } }
      );
      // Termin nur dort übernehmen, wo der FBL/Admin ihn nicht individuell
      // gesetzt hat (Override-Schutz).
      await ThesisMilestone.update(
        { due_at: milestone.due_at },
        { where: { milestone_id: milestone.id, due_at_overridden: false } }
      );
      // Snapshot-Kategorien werden NUR ergänzt, nie entfernt (Datenschutz für
      // bereits hochgeladene Dokumente). Existierende Snapshot-Kategorien bleiben
      // bestehen, neue aus dem Template kommen dazu.
      if (newCatIds && newCatIds.length > 0) {
        const snapshots = await ThesisMilestone.findAll({ where: { milestone_id: milestone.id } });
        for (const tm of snapshots) await tm.addUploadCategories(newCatIds);
      }
    }

    res.json({ success: true, milestone });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const deleteMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    // keepUploaded: if true, ThesisMilestones that already have at least one
    // uploaded document are kept (milestone_id becomes null via SET NULL);
    // others are deleted. If false, all related ThesisMilestones (and their
    // document files) are deleted.
    const keepUploaded = req.query.keepUploaded === 'true' || req.body?.keepUploaded === true;

    const milestone = await Milestone.findByPk(id);
    if (!milestone) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    const related = await ThesisMilestone.findAll({
      where: { milestone_id: id },
      include: [{ model: ThesisMilestoneDocument, as: 'documents' }]
    });

    for (const tm of related) {
      const hasDocuments = tm.documents && tm.documents.length > 0;
      if (keepUploaded && hasDocuments) continue;
      // remove document files
      (tm.documents || []).forEach(doc => {
        if (doc.file_path && fs.existsSync(doc.file_path)) {
          try { fs.unlinkSync(doc.file_path); } catch (e) { console.error('unlink failed', e); }
        }
      });
      await tm.destroy(); // cascades to documents + logs (SET NULL on logs)
    }

    await milestone.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting milestone:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Thesis-milestone instances ----------

const userHasThesisAccess = async (userId, userRole, thesisId) => {
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
};

const getThesisMilestones = async (req, res) => {
  try {
    const thesisId = req.params.id;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const access = await userHasThesisAccess(userId, userRole, thesisId);
    if (!access) return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, diese Diplomarbeit anzusehen' });

    // Studierende sehen nur freigegebene Meilensteine.
    const where = { thesis_id: thesisId };
    if (userRole === 'student') where.released = true;

    const milestones = await ThesisMilestone.findAll({
      where,
      include: [
        {
          model: ThesisMilestoneDocument,
          as: 'documents',
          include: [{ model: User, as: 'uploader', attributes: ['id', 'firstname', 'name', 'role'] }]
        },
        { model: User, as: 'evaluator', attributes: ['id', 'firstname', 'name', 'role'] },
        { model: User, as: 'approver', attributes: ['id', 'firstname', 'name', 'role'] },
        { model: User, as: 'approver2', attributes: ['id', 'firstname', 'name', 'role'] }
      ],
      order: [['due_at', 'ASC'], [{ model: ThesisMilestoneDocument, as: 'documents' }, 'version', 'DESC']]
    });
    res.json({ success: true, milestones });
  } catch (error) {
    console.error('Error fetching thesis milestones:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Berechtigung für individuelle Termin-Anpassung: Admin oder FBL des Fachbereichs der DA.
async function canManageThesisMilestoneDueAt(userRole, userId, thesisId) {
  if (userRole === 'admin') return true;
  if (userRole !== 'department_lead') return false;
  const thesis = await Thesis.findByPk(thesisId, { attributes: ['department_id'] });
  if (!thesis) return false;
  const dept = await Department.findByPk(thesis.department_id, { attributes: ['department_lead_id'] });
  return !!(dept && dept.department_lead_id === userId);
}

const updateThesisMilestoneDueAt = async (req, res) => {
  try {
    const { id } = req.params;
    const { due_at } = req.body;
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    if (!due_at) return res.status(400).json({ success: false, message: 'Termin ist erforderlich' });

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (isFpcBlocked(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });

    const allowed = await canManageThesisMilestoneDueAt(userRole, userId, tm.thesis_id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, den Termin zu übersteuern' });

    await tm.update({ due_at, due_at_overridden: true });
    res.json({ success: true, milestone: tm });
  } catch (error) {
    console.error('Error updating thesis milestone due_at:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Setzt den individuellen Termin zurück auf den Vorlagen-Termin (falls vorhanden)
// und entfernt die Override-Markierung. Berechtigung wie Termin-Override.
const resetThesisMilestoneDueAt = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.session.userRole;
    const userId = req.session.userId;

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (isFpcBlocked(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });

    const allowed = await canManageThesisMilestoneDueAt(userRole, userId, tm.thesis_id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, den Termin zurückzusetzen' });

    // Originaltermin aus der zugehörigen Vorlage holen (falls vorhanden).
    let resetDueAt = tm.due_at;
    if (tm.milestone_id) {
      const template = await Milestone.findByPk(tm.milestone_id, { attributes: ['due_at'] });
      if (template) resetDueAt = template.due_at;
    }
    await tm.update({ due_at: resetDueAt, due_at_overridden: false });
    res.json({ success: true, milestone: tm });
  } catch (error) {
    console.error('Error resetting thesis milestone due_at:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Freigabe erteilen oder zurückziehen. Body: { slot: 1|2, approved: true|false }
const setThesisMilestoneApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const slot = Number(req.body.slot) === 2 ? 2 : 1;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (isFpcBlocked(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });

    const requiresField = slot === 2 ? 'requires_approval_2' : 'requires_approval';
    const roleField = slot === 2 ? 'approver_role_2' : 'approver_role';
    const byField = slot === 2 ? 'approved_by_2' : 'approved_by';
    const atField = slot === 2 ? 'approved_at_2' : 'approved_at';

    if (!tm[requiresField]) {
      return res.status(400).json({ success: false, message: `Für diesen Meilenstein ist keine Freigabe ${slot} vorgesehen` });
    }

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (userRole !== 'admin' && userRole !== tm[roleField]) {
      return res.status(403).json({ success: false, message: `Ihre Rolle ist nicht berechtigt, Freigabe ${slot} zu erteilen` });
    }

    if (approved) {
      await tm.update({ [byField]: userId, [atField]: new Date() });
      await writeThesisLog(tm.thesis_id, tm.id, userId, 'milestone_approved', `${tm.label}: Freigabe ${slot} erteilt`);
    } else {
      await tm.update({ [byField]: null, [atField]: null });
      await writeThesisLog(tm.thesis_id, tm.id, userId, 'milestone_revoked', `${tm.label}: Freigabe ${slot} zurückgezogen`);
    }

    res.json({ success: true, message: approved ? `Freigabe ${slot} erteilt` : `Freigabe ${slot} zurückgezogen` });
  } catch (error) {
    console.error('Error setting milestone approval:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// Meilenstein freigeben (starten) oder sperren. Nur der/die Dozent/in der Diplomarbeit oder Admin.
const setThesisMilestoneReleased = async (req, res) => {
  try {
    const { id } = req.params;
    const { released } = req.body;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(id, {
      include: [{ model: Thesis, as: 'thesis', include: [{ model: User, as: 'coaches', attributes: ['id'] }] }]
    });
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    const isCoachOfThesis = tm.thesis && tm.thesis.coaches.some(c => c.id === userId);
    if (userRole !== 'admin' && !(userRole === 'coach' && isCoachOfThesis)) {
      return res.status(403).json({ success: false, message: 'Nur der/die Dozent/in der Diplomarbeit (oder Admin) kann Meilensteine freigeben.' });
    }

    await tm.update({ released: !!released });
    await writeThesisLog(
      tm.thesis_id, tm.id, userId,
      released ? 'milestone_released' : 'milestone_locked',
      `${tm.label}: ${released ? 'freigegeben (gestartet)' : 'gesperrt'}`
    );

    res.json({ success: true, message: released ? 'Meilenstein freigegeben' : 'Meilenstein gesperrt' });
  } catch (error) {
    console.error('Error setting milestone released:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// May the given user upload/add a document version to this thesis milestone?
const canUploadForMilestone = (tm, userRole) =>
  userRole === 'admin' || userRole === tm.responsible_role;

const uploadThesisMilestoneDocument = (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });

    const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch (e) {} };

    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const userRole = req.session.userRole;

      const tm = await ThesisMilestone.findByPk(id, {
        include: [
          { model: ThesisMilestoneDocument, as: 'documents' },
          { model: UploadCategory, as: 'uploadCategories', through: { attributes: [] } },
        ]
      });
      if (!tm) { cleanup(); return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' }); }
      if (isFpcBlocked(tm, userRole)) { cleanup(); return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' }); }

      const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
      if (!access) { cleanup(); return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, für diese Diplomarbeit Dokumente hochzuladen' }); }

      if (!tm.released && userRole !== 'admin') { cleanup(); return res.status(403).json({ success: false, message: 'Dieser Meilenstein ist noch nicht freigegeben.' }); }

      if (!tm.allow_upload) { cleanup(); return res.status(403).json({ success: false, message: 'Für diesen Meilenstein ist kein Dokument-Upload vorgesehen' }); }

      if (!canUploadForMilestone(tm, userRole)) { cleanup(); return res.status(403).json({ success: false, message: 'Ihre Rolle ist nicht berechtigt, dieses Dokument hochzuladen' }); }

      // Kategorie auswählen / validieren. Wenn der Meilenstein Kategorien zugewiesen
      // hat, muss eine gewählt werden und sie muss zu den zulässigen gehören.
      // Ohne zugewiesene Kategorien: NULL (Default-Slot, abwärtskompatibel).
      const categoryIds = (tm.uploadCategories || []).map(c => c.id);
      let categoryId = null;
      if (req.body.upload_category_id !== undefined && req.body.upload_category_id !== '' && req.body.upload_category_id !== null) {
        categoryId = parseInt(req.body.upload_category_id, 10);
        if (!Number.isInteger(categoryId)) { cleanup(); return res.status(400).json({ success: false, message: 'Ungültige Upload-Kategorie' }); }
      }
      if (categoryIds.length > 0) {
        if (categoryId === null) { cleanup(); return res.status(400).json({ success: false, message: 'Bitte eine Upload-Kategorie wählen' }); }
        if (!categoryIds.includes(categoryId)) { cleanup(); return res.status(400).json({ success: false, message: 'Diese Kategorie ist für den Meilenstein nicht zugelassen' }); }
      } else {
        categoryId = null; // ignoriere fälschlich übergebene IDs
      }

      // Versionen werden pro (TM, Kategorie) geführt — gleiche Kategorie => neue Version.
      const existing = (tm.documents || []).filter(d =>
        (d.upload_category_id || null) === categoryId
      );
      const hasExisting = existing.length > 0;

      if (hasExisting && !tm.allow_update) {
        cleanup();
        return res.status(403).json({ success: false, message: 'Für diesen Meilenstein ist keine Aktualisierung erlaubt' });
      }

      const nextVersion = existing.reduce((max, d) => Math.max(max, d.version), 0) + 1;

      // Vorherige aktuelle Version (in derselben Kategorie) als abgelöst markieren.
      if (hasExisting) {
        await ThesisMilestoneDocument.update(
          { is_current: false, superseded_at: new Date() },
          { where: { thesis_milestone_id: tm.id, upload_category_id: categoryId, is_current: true } }
        );
      }

      await ThesisMilestoneDocument.create({
        thesis_milestone_id: tm.id,
        upload_category_id: categoryId,
        file_name: req.file.originalname,
        file_path: req.file.path,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        version: nextVersion,
        is_current: true,
        uploaded_by: userId,
        uploaded_at: new Date(),
      });

      // Kategorie-Label für Log-Eintrag (falls vorhanden).
      const catLabel = (tm.uploadCategories || []).find(c => c.id === categoryId);
      const logDetail = catLabel
        ? `${tm.label} — ${catLabel.label}: ${req.file.originalname} (Version ${nextVersion})`
        : `${tm.label}: ${req.file.originalname} (Version ${nextVersion})`;
      await writeThesisLog(
        tm.thesis_id, tm.id, userId,
        hasExisting ? 'document_update' : 'document_upload',
        logDetail
      );

      res.json({ success: true, message: hasExisting ? 'Aktualisierte Version hochgeladen' : 'Dokument erfolgreich hochgeladen' });
    } catch (error) {
      cleanup();
      console.error('Error uploading milestone document:', error);
      res.status(500).json({ success: false, message: 'Interner Serverfehler' });
    }
  });
};

// Admin-only deletion of a single document version.
const deleteThesisMilestoneDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Nur Administratoren können Dokumente löschen' });
    }

    const doc = await ThesisMilestoneDocument.findByPk(docId, {
      include: [{ model: ThesisMilestone, as: 'thesisMilestone' }]
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Dokument nicht gefunden' });

    const tm = doc.thesisMilestone;
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      try { fs.unlinkSync(doc.file_path); } catch (e) { console.error('unlink failed', e); }
    }
    const wasCurrent = doc.is_current;
    const label = tm ? tm.label : '';
    const docName = doc.file_name;
    const thesisId = tm ? tm.thesis_id : null;
    const tmId = tm ? tm.id : null;
    const catId = doc.upload_category_id ?? null;
    await doc.destroy();

    // Wurde die aktuelle Version gelöscht, die jüngste verbliebene in DERSELBEN
    // Kategorie zur aktuellen befördern.
    if (wasCurrent && tmId) {
      const remaining = await ThesisMilestoneDocument.findOne({
        where: { thesis_milestone_id: tmId, upload_category_id: catId },
        order: [['version', 'DESC']]
      });
      if (remaining) {
        await remaining.update({ is_current: true, superseded_at: null });
      }
    }

    if (thesisId) {
      await writeThesisLog(thesisId, tmId, userId, 'document_delete', `${label}: ${docName} gelöscht`);
    }

    res.json({ success: true, message: 'Dokument erfolgreich gelöscht' });
  } catch (error) {
    console.error('Error deleting milestone document:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const downloadThesisMilestoneDocument = async (req, res) => {
  try {
    const { docId } = req.params;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const doc = await ThesisMilestoneDocument.findByPk(docId, {
      include: [{ model: ThesisMilestone, as: 'thesisMilestone', attributes: ['id', 'thesis_id', 'is_transfer_project'] }]
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Dokument nicht gefunden' });
    if (isFpcBlocked(doc.thesisMilestone, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });

    const access = await userHasThesisAccess(userId, userRole, doc.thesisMilestone.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, dieses Dokument herunterzuladen' });

    if (!fs.existsSync(doc.file_path)) return res.status(404).json({ success: false, message: 'Dokumentendatei nicht gefunden' });

    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name || 'document.pdf'}"`);
    res.sendFile(path.resolve(doc.file_path));
  } catch (error) {
    console.error('Error downloading milestone document:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Geheimhaltung ----------

// Befüllt die ersten drei Felder der Geheimhaltungsvereinbarung-Vorlage und streamt das PDF.
// Berechtigung: Admin und FachbereichsleiterIn.
const generateConfidentialityPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.session.userRole;
    if (!['admin', 'department_lead'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    }
    const thesis = await Thesis.findByPk(id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });
    if (!thesis.is_confidential) {
      return res.status(400).json({ success: false, message: 'Diese Diplomarbeit unterliegt keiner Geheimhaltung' });
    }

    const { unternehmen, student, thema } = req.body || {};
    if (!unternehmen || !student || !thema) {
      return res.status(400).json({ success: false, message: 'Unternehmen, Student/in und Titel müssen angegeben werden' });
    }

    if (!fs.existsSync(CONFIDENTIALITY_TEMPLATE_PATH)) {
      return res.status(500).json({ success: false, message: 'PDF-Vorlage nicht gefunden' });
    }
    const templateBytes = fs.readFileSync(CONFIDENTIALITY_TEMPLATE_PATH);
    const pdf = await PDFDocument.load(templateBytes);
    const form = pdf.getForm();
    // Feldnamen exakt wie in der Vorlage:
    form.getTextField('Unternehmen').setText(String(unternehmen));
    form.getTextField('Student*in').setText(String(student));
    form.getTextField('Thema Diplomarbeit').setText(String(thema));
    // Andere Felder (Unterschriften, Datum) bleiben leer.

    const out = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Geheimhaltungsvereinbarung_DA_${thesis.id}.pdf"`);
    res.send(Buffer.from(out));
  } catch (err) {
    console.error('generateConfidentialityPdf error:', err);
    res.status(500).json({ success: false, message: 'PDF konnte nicht erzeugt werden' });
  }
};

// Upload des unterzeichneten, gescannten PDFs. Berechtigung: Admin und FachbereichsleiterIn.
// Eine bereits vorhandene Datei wird ersetzt (alte Datei wird gelöscht).
const uploadConfidentialityDocument = (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    const cleanup = () => { try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {} };
    try {
      const userRole = req.session.userRole;
      const userId = req.session.userId;
      if (!['admin', 'department_lead'].includes(userRole)) { cleanup(); return res.status(403).json({ success: false, message: 'Keine Berechtigung' }); }
      if (!req.file) return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });

      const thesis = await Thesis.findByPk(req.params.id);
      if (!thesis) { cleanup(); return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' }); }
      if (!thesis.is_confidential) { cleanup(); return res.status(400).json({ success: false, message: 'Diese Diplomarbeit unterliegt keiner Geheimhaltung' }); }
      if (userRole === 'department_lead') {
        const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
        if (!ledDepartments.map(d => d.id).includes(thesis.department_id)) {
          cleanup();
          return res.status(403).json({ success: false, message: 'Nur für Diplomarbeiten aus von Ihnen geleiteten Fachbereichen' });
        }
      }

      if (req.file.mimetype !== 'application/pdf') {
        cleanup();
        return res.status(400).json({ success: false, message: 'Nur PDF-Dateien werden akzeptiert' });
      }

      // Alte Datei entfernen, falls vorhanden.
      if (thesis.confidentiality_document_path && fs.existsSync(thesis.confidentiality_document_path)) {
        try { fs.unlinkSync(thesis.confidentiality_document_path); } catch (e) { /* ignore */ }
      }

      await thesis.update({
        confidentiality_document_path: req.file.path,
        confidentiality_document_filename: req.file.originalname,
      });

      await writeThesisLog(thesis.id, null, userId, 'confidentiality_uploaded', req.file.originalname);
      res.json({ success: true });
    } catch (e) {
      cleanup();
      console.error('uploadConfidentialityDocument error:', e);
      res.status(500).json({ success: false, message: 'Upload fehlgeschlagen' });
    }
  });
};

// Download des unterzeichneten Dokuments für alle, die die Diplomarbeit sehen dürfen.
const downloadConfidentialityDocument = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });

    const access = await userHasThesisAccess(userId, userRole, thesis.id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (!thesis.confidentiality_document_path || !fs.existsSync(thesis.confidentiality_document_path)) {
      return res.status(404).json({ success: false, message: 'Kein Dokument hinterlegt' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${thesis.confidentiality_document_filename || 'Geheimhaltung.pdf'}"`);
    res.sendFile(path.resolve(thesis.confidentiality_document_path));
  } catch (e) {
    console.error('downloadConfidentialityDocument error:', e);
    res.status(500).json({ success: false, message: 'Download fehlgeschlagen' });
  }
};

// Löschen des unterzeichneten Dokuments. Berechtigung: Admin und FachbereichsleiterIn.
const deleteConfidentialityDocument = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    if (!['admin', 'department_lead'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    }
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      if (!ledDepartments.map(d => d.id).includes(thesis.department_id)) {
        return res.status(403).json({ success: false, message: 'Nur für Diplomarbeiten aus von Ihnen geleiteten Fachbereichen' });
      }
    }
    if (!thesis.confidentiality_document_path) {
      return res.status(404).json({ success: false, message: 'Kein Dokument hinterlegt' });
    }
    const oldName = thesis.confidentiality_document_filename;
    if (fs.existsSync(thesis.confidentiality_document_path)) {
      try { fs.unlinkSync(thesis.confidentiality_document_path); } catch (e) { /* ignore */ }
    }
    await thesis.update({ confidentiality_document_path: null, confidentiality_document_filename: null });
    await writeThesisLog(thesis.id, null, userId, 'confidentiality_deleted', oldName || '');
    res.json({ success: true });
  } catch (e) {
    console.error('deleteConfidentialityDocument error:', e);
    res.status(500).json({ success: false, message: 'Löschen fehlgeschlagen' });
  }
};

// ---------- Sperrung einer Diplomarbeit ----------

// Sperrt eine Diplomarbeit (z.B. wegen Abbruch). Studierende dieser Arbeit
// können sich anschliessend nicht mehr einloggen; laufende Sessions werden
// beim nächsten Request beendet (siehe middleware/auth.js).
const lockThesis = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    if (!['admin', 'department_lead'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    }
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      if (!ledDepartments.map(d => d.id).includes(thesis.department_id)) {
        return res.status(403).json({ success: false, message: 'Nur für Diplomarbeiten aus von Ihnen geleiteten Fachbereichen' });
      }
    }
    if (thesis.is_locked) {
      return res.json({ success: true, message: 'Bereits gesperrt' });
    }
    const reason = (req.body && typeof req.body.reason === 'string') ? req.body.reason.trim() : '';
    await thesis.update({
      is_locked: true,
      locked_at: new Date(),
      locked_by_user_id: userId,
      locked_reason: reason || null,
    });
    await writeThesisLog(thesis.id, null, userId, 'thesis_locked', reason || '');
    res.json({ success: true });
  } catch (e) {
    console.error('lockThesis error:', e);
    res.status(500).json({ success: false, message: 'Sperren fehlgeschlagen' });
  }
};

// Hebt die Sperrung einer Diplomarbeit wieder auf.
const unlockThesis = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    if (!['admin', 'department_lead'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Keine Berechtigung' });
    }
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) return res.status(404).json({ success: false, message: 'Diplomarbeit nicht gefunden' });
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      if (!ledDepartments.map(d => d.id).includes(thesis.department_id)) {
        return res.status(403).json({ success: false, message: 'Nur für Diplomarbeiten aus von Ihnen geleiteten Fachbereichen' });
      }
    }
    if (!thesis.is_locked) {
      return res.json({ success: true, message: 'Nicht gesperrt' });
    }
    await thesis.update({
      is_locked: false,
      locked_at: null,
      locked_by_user_id: null,
      locked_reason: null,
    });
    await writeThesisLog(thesis.id, null, userId, 'thesis_unlocked', '');
    res.json({ success: true });
  } catch (e) {
    console.error('unlockThesis error:', e);
    res.status(500).json({ success: false, message: 'Entsperren fehlgeschlagen' });
  }
};

// ---------- Chat ----------

// Liefert Chat-Nachrichten der DA (chronologisch) inkl. Sender und Read-Receipts.
// Markiert beim Aufruf alle nicht-eigenen Nachrichten für den anfragenden User als gelesen.
// Optional ?since=<id>: nur Nachrichten mit id > since (für Polling).
const getChatMessages = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const thesisId = parseInt(req.params.id, 10);

    const access = await userHasThesisAccess(userId, userRole, thesisId);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    const where = { thesis_id: thesisId };
    if (req.query.since) {
      const sinceId = parseInt(req.query.since, 10);
      if (Number.isInteger(sinceId)) where.id = { [Op.gt]: sinceId };
    }

    const messages = await ChatMessage.findAll({
      where,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'firstname', 'name', 'role'] },
        {
          model: ChatReadReceipt,
          as: 'readReceipts',
          include: [{ model: User, as: 'user', attributes: ['id', 'firstname', 'name'] }]
        }
      ],
      order: [['id', 'ASC']],
    });

    // Nicht-eigene Nachrichten als gelesen markieren (idempotent durch PK).
    const toMark = messages.filter(m => m.user_id && m.user_id !== userId).map(m => m.id);
    if (toMark.length > 0) {
      const now = new Date();
      const rows = toMark.map(mid => ({ message_id: mid, user_id: userId, read_at: now }));
      await ChatReadReceipt.bulkCreate(rows, { ignoreDuplicates: true });
    }

    res.json(messages.map(m => ({
      id: m.id,
      thesis_id: m.thesis_id,
      content: m.content,
      document_filename: m.document_filename,
      document_size: m.document_size,
      created_at: m.createdAt,
      sender: m.sender ? {
        id: m.sender.id,
        name: m.sender.name,
        firstname: m.sender.firstname,
        role: m.sender.role,
      } : null,
      read_by: (m.readReceipts || []).map(r => ({
        id: r.user.id,
        name: r.user.name,
        firstname: r.user.firstname,
        read_at: r.read_at,
      })),
    })));
  } catch (err) {
    console.error('getChatMessages error:', err);
    res.status(500).json({ success: false, message: 'Chat konnte nicht geladen werden' });
  }
};

// Neue Nachricht posten (multipart: content + optional document)
const postChatMessage = (req, res) => {
  chatUpload.single('document')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    const cleanup = () => { try { if (req.file) fs.unlinkSync(req.file.path); } catch (e) {} };
    try {
      const userId = req.session.userId;
      const userRole = req.session.userRole;
      const thesisId = parseInt(req.params.id, 10);
      const content = (req.body.content || '').trim();

      const access = await userHasThesisAccess(userId, userRole, thesisId);
      if (!access) { cleanup(); return res.status(403).json({ success: false, message: 'Keine Berechtigung' }); }

      if (!content && !req.file) {
        return res.status(400).json({ success: false, message: 'Nachricht oder Datei erforderlich' });
      }

      const msg = await ChatMessage.create({
        thesis_id: thesisId,
        user_id: userId,
        content: content || null,
        document_path: req.file ? req.file.path : null,
        document_filename: req.file ? req.file.originalname : null,
        document_mimetype: req.file ? req.file.mimetype : null,
        document_size: req.file ? req.file.size : null,
      });
      res.json({ success: true, id: msg.id });
    } catch (e) {
      cleanup();
      console.error('postChatMessage error:', e);
      res.status(500).json({ success: false, message: 'Senden fehlgeschlagen' });
    }
  });
};

// Download eines an eine Chat-Nachricht angehängten Dokuments.
const downloadChatAttachment = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const msg = await ChatMessage.findByPk(req.params.msgId);
    if (!msg) return res.status(404).json({ success: false, message: 'Nachricht nicht gefunden' });

    const access = await userHasThesisAccess(userId, userRole, msg.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (!msg.document_path || !fs.existsSync(msg.document_path)) {
      return res.status(404).json({ success: false, message: 'Datei nicht gefunden' });
    }
    res.setHeader('Content-Type', msg.document_mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${msg.document_filename || 'attachment'}"`);
    res.sendFile(path.resolve(msg.document_path));
  } catch (e) {
    console.error('downloadChatAttachment error:', e);
    res.status(500).json({ success: false, message: 'Download fehlgeschlagen' });
  }
};

// Create/update the evaluation (currently free text) for a thesis milestone.
const evaluateThesisMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { evaluation } = req.body;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });
    if (isFpcBlocked(tm, userRole)) return res.status(403).json({ success: false, message: 'Keine Berechtigung für diesen Meilenstein' });

    if (!tm.requires_evaluation) {
      return res.status(400).json({ success: false, message: 'Für diesen Meilenstein ist keine Bewertung vorgesehen' });
    }

    const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
    if (!access) return res.status(403).json({ success: false, message: 'Keine Berechtigung' });

    if (userRole !== 'admin' && userRole !== tm.evaluator_role) {
      return res.status(403).json({ success: false, message: 'Ihre Rolle ist nicht berechtigt, diese Bewertung vorzunehmen' });
    }

    const isUpdate = tm.evaluation !== null && tm.evaluation !== undefined && tm.evaluation !== '';

    await tm.update({
      evaluation: evaluation ?? null,
      evaluated_by: userId,
      evaluated_at: new Date(),
    });

    await writeThesisLog(
      tm.thesis_id, tm.id, userId,
      isUpdate ? 'evaluation_update' : 'evaluation_create',
      `${tm.label}: Bewertung ${isUpdate ? 'aktualisiert' : 'erfasst'}`
    );

    res.json({ success: true, message: 'Bewertung gespeichert' });
  } catch (error) {
    console.error('Error evaluating milestone:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

// ---------- Diplomjahre (Years) ----------

// Liste aller Jahre inklusive Nutzungszahlen (Diplomarbeiten und Meilenstein-Vorlagen).
const getYears = async (req, res) => {
  try {
    const years = await Year.findAll({ order: [['year', 'DESC']] });
    const ids = years.map(y => y.id);
    if (ids.length === 0) return res.json([]);

    const thesisCounts = await Thesis.findAll({
      attributes: ['year_id', [fn('COUNT', col('id')), 'count']],
      where: { year_id: ids },
      group: ['year_id'],
      raw: true,
    });
    const milestoneCounts = await Milestone.findAll({
      attributes: ['year_id', [fn('COUNT', col('id')), 'count']],
      where: { year_id: ids },
      group: ['year_id'],
      raw: true,
    });
    const tMap = Object.fromEntries(thesisCounts.map(r => [r.year_id, parseInt(r.count, 10)]));
    const mMap = Object.fromEntries(milestoneCounts.map(r => [r.year_id, parseInt(r.count, 10)]));

    res.json(years.map(y => ({
      id: y.id,
      year: y.year,
      is_current: y.is_current,
      thesesCount: tMap[y.id] || 0,
      milestonesCount: mMap[y.id] || 0,
    })));
  } catch (err) {
    console.error('getYears error:', err);
    res.status(500).json({ success: false, message: 'Diplomjahre konnten nicht geladen werden' });
  }
};

const createYear = async (req, res) => {
  try {
    const yearNum = parseInt(req.body.year, 10);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return res.status(400).json({ success: false, message: 'Ungültige Jahreszahl (2000–2100).' });
    }
    const existing = await Year.findOne({ where: { year: yearNum } });
    if (existing) return res.status(409).json({ success: false, message: 'Dieses Diplomjahr existiert bereits.' });
    const created = await Year.create({ year: yearNum, is_current: false });
    res.json({ success: true, year: { id: created.id, year: created.year, is_current: created.is_current } });
  } catch (err) {
    console.error('createYear error:', err);
    res.status(500).json({ success: false, message: 'Diplomjahr konnte nicht angelegt werden' });
  }
};

// Setzt das gewählte Jahr global als aktuell; das bisher aktuelle wird zurückgesetzt.
const setCurrentYear = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const yearId = parseInt(req.params.id, 10);
    const year = await Year.findByPk(yearId, { transaction: t });
    if (!year) { await t.rollback(); return res.status(404).json({ success: false, message: 'Diplomjahr nicht gefunden' }); }
    await Year.update({ is_current: false }, { where: { is_current: true }, transaction: t });
    year.is_current = true;
    await year.save({ transaction: t });
    await t.commit();
    res.json({ success: true });
  } catch (err) {
    await t.rollback();
    console.error('setCurrentYear error:', err);
    res.status(500).json({ success: false, message: 'Aktuelles Diplomjahr konnte nicht gesetzt werden' });
  }
};

const deleteYear = async (req, res) => {
  try {
    const yearId = parseInt(req.params.id, 10);
    const year = await Year.findByPk(yearId);
    if (!year) return res.status(404).json({ success: false, message: 'Diplomjahr nicht gefunden' });
    if (year.is_current) return res.status(400).json({ success: false, message: 'Das aktuelle Diplomjahr kann nicht gelöscht werden.' });

    const thesesCount = await Thesis.count({ where: { year_id: yearId } });
    const milestonesCount = await Milestone.count({ where: { year_id: yearId } });
    if (thesesCount > 0 || milestonesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Löschen nicht möglich: ${thesesCount} Diplomarbeit(en) und ${milestonesCount} Meilenstein-Vorlage(n) verwenden dieses Jahr.`,
      });
    }
    await year.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('deleteYear error:', err);
    res.status(500).json({ success: false, message: 'Diplomjahr konnte nicht gelöscht werden' });
  }
};

// Wechselt für den eingeloggten User die aktive Rolle (nur möglich, wenn dem User
// die gewünschte Rolle zugewiesen ist). Merkt sich die Auswahl in users.last_active_role.
const switchActiveRole = async (req, res) => {
  try {
    const userId = req.session.userId;
    const requested = String(req.body.role || '');
    const rows = await UserRole.findAll({ where: { user_id: userId }, attributes: ['role'], raw: true });
    const roles = rows.map(r => r.role);
    if (!roles.includes(requested)) {
      return res.status(403).json({ success: false, message: 'Diese Rolle ist Ihnen nicht zugewiesen' });
    }
    req.session.userRole = requested;
    await User.update({ last_active_role: requested }, { where: { id: userId } });
    res.json({ success: true });
  } catch (err) {
    console.error('switchActiveRole error:', err);
    res.status(500).json({ success: false, message: 'Rolle konnte nicht gewechselt werden' });
  }
};

// Wechselt für den eingeloggten User das angezeigte Diplomjahr (nur Admin/FachbereichsleiterIn).
// Merkt sich die Auswahl in users.last_selected_year_id.
const switchSelectedYear = async (req, res) => {
  try {
    const role = req.session.userRole;
    if (!['admin', 'department_lead'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Nicht berechtigt' });
    }
    const yearId = parseInt(req.body.yearId, 10);
    const year = await Year.findByPk(yearId);
    if (!year) return res.status(404).json({ success: false, message: 'Diplomjahr nicht gefunden' });

    req.session.selectedYear = year.id;
    await User.update({ last_selected_year_id: year.id }, { where: { id: req.session.userId } });
    res.json({ success: true });
  } catch (err) {
    console.error('switchSelectedYear error:', err);
    res.status(500).json({ success: false, message: 'Diplomjahr konnte nicht gewechselt werden' });
  }
};

// Bereinigt einen Wert für die Verwendung in einem Dateinamen (Unicode-freundlich,
// ersetzt nur die kritischen Pfad-/Steuerzeichen sowie Leerzeichen).
function sanitizeFilenamePart(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>| -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'unbenannt';
}
function formatYyyymmdd(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ZIP-Export aller aktuellen Dokumente einer Upload-Kategorie für die DAs, die der
// jeweilige User im Dashboard sieht (admin: alle bzw. dept-Filter; FBL: nur eigene
// Fachbereiche, ggf. mit Filter). Pro Fachbereich ein Unterordner.
// Dateinamen-Schema: <Nachnamen>_<Vornamen>_<Kategorie>_<YYYYMMDD heute>.<ext>
const bulkDownloadCategoryZip = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const yearId = req.session.selectedYear;

    if (!['admin', 'department_lead'].includes(userRole)) {
      return res.status(403).send('Keine Berechtigung');
    }
    if (!yearId) return res.status(400).send('Kein Diplomjahr ausgewählt');

    const categoryId = parseInt(req.params.id, 10);
    if (!Number.isInteger(categoryId)) return res.status(400).send('Ungültige Kategorie');
    const category = await UploadCategory.findByPk(categoryId);
    if (!category) return res.status(404).send('Kategorie nicht gefunden');

    // Filter analog Dashboard ermitteln.
    const whereThesis = { year_id: yearId };
    const departmentFilter = req.query.department ? parseInt(req.query.department, 10) : null;
    if (userRole === 'department_lead') {
      const ledIds = (await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] })).map(d => d.id);
      if (ledIds.length === 0) return res.status(404).send('Keine Fachbereiche zugewiesen');
      if (departmentFilter && ledIds.includes(departmentFilter)) whereThesis.department_id = departmentFilter;
      else whereThesis.department_id = ledIds;
    } else if (departmentFilter) {
      whereThesis.department_id = departmentFilter;
    }

    // Alle Dokumente der gewünschten Kategorie für die berechtigten DAs holen.
    const docs = await ThesisMilestoneDocument.findAll({
      where: { upload_category_id: categoryId, is_current: true },
      include: [{
        model: ThesisMilestone, as: 'thesisMilestone', attributes: ['id', 'thesis_id'],
        required: true,
        include: [{
          model: Thesis, as: 'thesis', where: whereThesis, required: true,
          attributes: ['id', 'department_id'],
          include: [
            { model: Department, as: 'department', attributes: ['id', 'name'] },
            { model: User, as: 'students', attributes: ['firstname', 'name'] },
          ],
        }],
      }],
    });

    if (docs.length === 0) {
      return res.status(404).send(`Keine Dokumente der Kategorie "${category.label}" im aktuellen Auswahlbereich gefunden.`);
    }

    const todayStr = formatYyyymmdd(new Date());
    const catPart = sanitizeFilenamePart(category.label);
    const safeZipName = sanitizeFilenamePart(category.label) + '_' + todayStr + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeZipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('archive warning:', err); });
    archive.on('error', (err) => { console.error('archive error:', err); try { res.status(500).end(); } catch (e) {} });
    archive.pipe(res);

    // Dateinamen-Duplikate pro Fachbereichs-Ordner verhindern.
    const seenPerFolder = new Map();
    for (const doc of docs) {
      const tm = doc.thesisMilestone;
      if (!tm || !tm.thesis) continue;
      if (!doc.file_path || !fs.existsSync(doc.file_path)) {
        console.warn('Bulk-ZIP: Datei fehlt auf Disk, übersprungen:', doc.file_path);
        continue;
      }

      const dept = tm.thesis.department;
      const folder = sanitizeFilenamePart(dept ? dept.name : 'unbekannt');

      const students = (tm.thesis.students || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '') || (a.firstname || '').localeCompare(b.firstname || '')
      );
      const namesPart = sanitizeFilenamePart(students.map(s => s.name || '').filter(Boolean).join('-') || 'ohne-Namen');
      const firstnamesPart = sanitizeFilenamePart(students.map(s => s.firstname || '').filter(Boolean).join('-') || 'ohne-Vornamen');

      // Original-Erweiterung wiederverwenden (oder .pdf als Default).
      const ext = (path.extname(doc.file_name || '') || '.pdf').toLowerCase();
      let base = `${namesPart}_${firstnamesPart}_${catPart}_${todayStr}`;
      let candidate = `${base}${ext}`;
      const folderSeen = seenPerFolder.get(folder) || new Set();
      let n = 2;
      while (folderSeen.has(candidate)) {
        candidate = `${base}_${n}${ext}`;
        n++;
      }
      folderSeen.add(candidate);
      seenPerFolder.set(folder, folderSeen);

      archive.file(doc.file_path, { name: `${folder}/${candidate}` });
    }

    await archive.finalize();
  } catch (e) {
    console.error('bulkDownloadCategoryZip error:', e);
    if (!res.headersSent) res.status(500).send('Interner Serverfehler');
  }
};

// ---------- Upload-Kategorien (Stammdaten, Admin) ----------

const getUploadCategories = async (req, res) => {
  try {
    // Admin: alle (inkl. inaktive). Andere Rollen (für Auswahl): nur aktive.
    const onlyActive = req.session.userRole !== 'admin' || req.query.onlyActive === '1';
    const where = onlyActive ? { is_active: true } : {};
    const cats = await UploadCategory.findAll({ where, order: [['label', 'ASC']] });
    res.json(cats);
  } catch (err) {
    console.error('getUploadCategories error:', err);
    res.status(500).json({ success: false, message: 'Upload-Kategorien konnten nicht geladen werden' });
  }
};

const createUploadCategory = async (req, res) => {
  try {
    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ success: false, message: 'Bezeichnung erforderlich' });
    const existing = await UploadCategory.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('label')), label.toLowerCase())
    });
    if (existing) return res.status(409).json({ success: false, message: 'Diese Bezeichnung existiert bereits' });
    const cat = await UploadCategory.create({ label, is_active: true });
    res.json({ success: true, category: cat });
  } catch (err) {
    console.error('createUploadCategory error:', err);
    res.status(500).json({ success: false, message: 'Upload-Kategorie konnte nicht angelegt werden' });
  }
};

const updateUploadCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cat = await UploadCategory.findByPk(id);
    if (!cat) return res.status(404).json({ success: false, message: 'Upload-Kategorie nicht gefunden' });

    const updates = {};
    if (req.body.label !== undefined) {
      const label = String(req.body.label).trim();
      if (!label) return res.status(400).json({ success: false, message: 'Bezeichnung erforderlich' });
      const dup = await UploadCategory.findOne({
        where: {
          [Op.and]: [
            { id: { [Op.ne]: id } },
            sequelize.where(sequelize.fn('lower', sequelize.col('label')), label.toLowerCase()),
          ]
        }
      });
      if (dup) return res.status(409).json({ success: false, message: 'Diese Bezeichnung existiert bereits' });
      updates.label = label;
    }
    if (req.body.is_active !== undefined) updates.is_active = !!req.body.is_active;
    await cat.update(updates);
    res.json({ success: true, category: cat });
  } catch (err) {
    console.error('updateUploadCategory error:', err);
    res.status(500).json({ success: false, message: 'Upload-Kategorie konnte nicht aktualisiert werden' });
  }
};

const deleteUploadCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cat = await UploadCategory.findByPk(id);
    if (!cat) return res.status(404).json({ success: false, message: 'Upload-Kategorie nicht gefunden' });
    await cat.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('deleteUploadCategory error:', err);
    res.status(500).json({ success: false, message: 'Upload-Kategorie konnte nicht gelöscht werden' });
  }
};

module.exports = {
  bulkDownloadCategoryZip,
  getUploadCategories,
  createUploadCategory,
  updateUploadCategory,
  deleteUploadCategory,
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
  resetThesisMilestoneDueAt,
  setThesisMilestoneApproval,
  setThesisMilestoneReleased,
  uploadThesisMilestoneDocument,
  deleteThesisMilestoneDocument,
  downloadThesisMilestoneDocument,
  generateConfidentialityPdf,
  uploadConfidentialityDocument,
  downloadConfidentialityDocument,
  deleteConfidentialityDocument,
  lockThesis,
  unlockThesis,
  getChatMessages,
  postChatMessage,
  downloadChatAttachment,
  evaluateThesisMilestone,
};
