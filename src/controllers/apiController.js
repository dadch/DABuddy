const { User, Thesis, Department, Year, Milestone, ThesisMilestone, ThesisMilestoneDocument, ThesisLog } = require('../models');
const { Op } = require('sequelize');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

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

const VALID_ROLES = ['student', 'coach', 'expert', 'admin', 'department_lead', 'field_project_coach'];
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

// Create a ThesisMilestone snapshot from a Milestone template
const createThesisMilestoneFromTemplate = (thesisId, template) => ({
  thesis_id: thesisId,
  milestone_id: template.id,
  label: template.label,
  due_at: template.due_at,
  responsible_role: template.responsible_role,
  allow_upload: template.allow_upload,
  allow_update: template.allow_update,
  requires_evaluation: template.requires_evaluation,
  evaluator_role: template.evaluator_role,
  evaluation_form_id: template.evaluation_form_id,
  requires_approval: template.requires_approval,
  approver_role: template.approver_role,
  requires_approval_2: template.requires_approval_2,
  approver_role_2: template.approver_role_2,
});

const createThesis = async (req, res) => {
  try {
    const { title, department_id, sponsor, students, coach, expert, field_project_coach, language } = req.body;
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

    // Snapshot milestones for the thesis
    const templates = await Milestone.findAll({ where: { year_id: selectedYearId } });
    if (templates.length > 0) {
      await ThesisMilestone.bulkCreate(templates.map(t => createThesisMilestoneFromTemplate(thesis.id, t)));
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
    const { title, department_id, sponsor, students, coach, expert, field_project_coach, language } = req.body;
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
      attributes: ['id', 'username', 'name', 'firstname', 'email', 'role'],
      where: whereClause,
      include: includeClause,
      order: [['name', 'ASC'], ['firstname', 'ASC']]
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments } = req.body;

    const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const user = await User.create({ username, password, firstname, name, email, role });

    if (departments && departments.length > 0) {
      const deptObjs = await Department.findAll({ where: { id: departments } });
      await user.setDepartments(deptObjs);
    }

    await syncDepartmentLeadAssignments(user, departments);

    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, firstname: user.firstname, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments } = req.body;

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, message: 'Benutzer nicht gefunden' });

    const existing = await User.findOne({
      where: { [Op.and]: [{ id: { [Op.ne]: id } }, { [Op.or]: [{ username }, { email }] }] }
    });
    if (existing) return res.status(400).json({ success: false, message: 'Benutzername oder E-Mail existiert bereits' });

    const updateData = { username, firstname, name, email, role };
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

// ---------- Department lead self-management ----------

const getDepartmentLeadUsers = async (req, res) => {
  try {
    const userId = req.session.userId;
    const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
    const ids = ledDepartments.map(d => d.id);
    if (ids.length === 0) return res.json([]);

    const users = await User.findAll({
      include: [{ model: Department, as: 'departments', where: { id: ids }, through: { attributes: [] } }],
      where: { role: ['student', 'coach', 'expert'] }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching department lead users:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const createDepartmentLeadUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments } = req.body;
    const userId = req.session.userId;

    if (!['student', 'coach', 'expert'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle. FachbereichsleiterInnen können nur Studenten-, Coach- oder ExpertIn-Konten erstellen.' });
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

    const user = await User.create({ username, password, firstname, name, email, role });
    if (departments && departments.length > 0) {
      const deptObjs = await Department.findAll({ where: { id: departments } });
      await user.setDepartments(deptObjs);
    }

    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, firstname: user.firstname, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Error creating department lead user:', error);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};

const updateDepartmentLeadUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments } = req.body;
    const userId = req.session.userId;

    if (!['student', 'coach', 'expert'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Ungültige Rolle. FachbereichsleiterInnen können nur Studenten-, Coach- oder ExpertIn-Konten verwalten.' });
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
    const milestones = await Milestone.findAll({ where: { year_id: yearId }, order: [['due_at', 'ASC']] });
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
  const requires_approval = body.requires_approval === undefined ? false : !!body.requires_approval;
  const approver_role = requires_approval ? (body.approver_role || null) : null;
  const requires_approval_2 = body.requires_approval_2 === undefined ? false : !!body.requires_approval_2;
  const approver_role_2 = requires_approval_2 ? (body.approver_role_2 || null) : null;
  return { allow_upload, allow_update, requires_evaluation, evaluator_role, evaluation_form_id, requires_approval, approver_role, requires_approval_2, approver_role_2 };
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

    if (applyToExisting) {
      const theses = await Thesis.findAll({ where: { year_id: yearId }, attributes: ['id'] });
      if (theses.length > 0) {
        await ThesisMilestone.bulkCreate(theses.map(t => createThesisMilestoneFromTemplate(t.id, milestone)));
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

    if (applyToExisting) {
      await ThesisMilestone.update(
        {
          label: milestone.label,
          due_at: milestone.due_at,
          responsible_role: milestone.responsible_role,
          allow_upload: milestone.allow_upload,
          allow_update: milestone.allow_update,
          requires_evaluation: milestone.requires_evaluation,
          evaluator_role: milestone.evaluator_role,
          evaluation_form_id: milestone.evaluation_form_id,
          requires_approval: milestone.requires_approval,
          approver_role: milestone.approver_role,
          requires_approval_2: milestone.requires_approval_2,
          approver_role_2: milestone.approver_role_2,
        },
        { where: { milestone_id: milestone.id } }
      );
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

    const milestones = await ThesisMilestone.findAll({
      where: { thesis_id: thesisId },
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

const updateThesisMilestoneDueAt = async (req, res) => {
  try {
    const { id } = req.params;
    const { due_at } = req.body;
    const userRole = req.session.userRole;

    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Nur Administratoren können den Termin pro Diplomarbeit übersteuern' });
    }
    if (!due_at) return res.status(400).json({ success: false, message: 'Termin ist erforderlich' });

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

    await tm.update({ due_at });
    res.json({ success: true, milestone: tm });
  } catch (error) {
    console.error('Error updating thesis milestone due_at:', error);
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
        include: [{ model: ThesisMilestoneDocument, as: 'documents' }]
      });
      if (!tm) { cleanup(); return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' }); }

      const access = await userHasThesisAccess(userId, userRole, tm.thesis_id);
      if (!access) { cleanup(); return res.status(403).json({ success: false, message: 'Sie haben keine Berechtigung, für diese Diplomarbeit Dokumente hochzuladen' }); }

      if (!tm.allow_upload) { cleanup(); return res.status(403).json({ success: false, message: 'Für diesen Meilenstein ist kein Dokument-Upload vorgesehen' }); }

      if (!canUploadForMilestone(tm, userRole)) { cleanup(); return res.status(403).json({ success: false, message: 'Ihre Rolle ist nicht berechtigt, dieses Dokument hochzuladen' }); }

      const existing = tm.documents || [];
      const hasExisting = existing.length > 0;

      if (hasExisting && !tm.allow_update) {
        cleanup();
        return res.status(403).json({ success: false, message: 'Für diesen Meilenstein ist keine Aktualisierung erlaubt' });
      }

      const nextVersion = existing.reduce((max, d) => Math.max(max, d.version), 0) + 1;

      // Mark previous current version(s) as superseded (all documents are kept)
      if (hasExisting) {
        await ThesisMilestoneDocument.update(
          { is_current: false, superseded_at: new Date() },
          { where: { thesis_milestone_id: tm.id, is_current: true } }
        );
      }

      await ThesisMilestoneDocument.create({
        thesis_milestone_id: tm.id,
        file_name: req.file.originalname,
        file_path: req.file.path,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        version: nextVersion,
        is_current: true,
        uploaded_by: userId,
        uploaded_at: new Date(),
      });

      await writeThesisLog(
        tm.thesis_id, tm.id, userId,
        hasExisting ? 'document_update' : 'document_upload',
        `${tm.label}: ${req.file.originalname} (Version ${nextVersion})`
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
    await doc.destroy();

    // If we deleted the current version, promote the latest remaining one.
    if (wasCurrent && tmId) {
      const remaining = await ThesisMilestoneDocument.findOne({
        where: { thesis_milestone_id: tmId },
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
      include: [{ model: ThesisMilestone, as: 'thesisMilestone', attributes: ['id', 'thesis_id'] }]
    });
    if (!doc) return res.status(404).json({ success: false, message: 'Dokument nicht gefunden' });

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

// Create/update the evaluation (currently free text) for a thesis milestone.
const evaluateThesisMilestone = async (req, res) => {
  try {
    const { id } = req.params;
    const { evaluation } = req.body;
    const userId = req.session.userId;
    const userRole = req.session.userRole;

    const tm = await ThesisMilestone.findByPk(id);
    if (!tm) return res.status(404).json({ success: false, message: 'Meilenstein nicht gefunden' });

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

module.exports = {
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
};
