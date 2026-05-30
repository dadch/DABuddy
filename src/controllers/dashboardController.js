const { User, UserRole, Thesis, Department, Year, Milestone, ThesisMilestone, ThesisMilestoneDocument, ThesisLog, EvaluationForm, ThesisEvaluation, ThesisEvaluationGroup } = require('../models');
const { Op } = require('sequelize');

const showDashboard = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const selectedYearId = req.session.selectedYear;

    if (!userId || !userRole || !selectedYearId) {
      req.flash('error', 'Sitzung abgelaufen. Bitte erneut anmelden.');
      return res.redirect('/login');
    }

    const user = await User.findByPk(userId);
    const selectedYear = await Year.findByPk(selectedYearId);

    if (!user || !selectedYear) {
      req.flash('error', 'Ungültige Sitzungsdaten. Bitte erneut anmelden.');
      return res.redirect('/login');
    }

    let theses = [];

    const baseInclude = [
      { model: Department, as: 'department' },
      { model: Year, as: 'year' },
      { model: User, as: 'students' },
      { model: User, as: 'coaches' },
      { model: User, as: 'experts' },
      { model: User, as: 'fieldProjectCoaches' }
    ];

    if (userRole === 'student') {
      theses = await user.getStudentTheses({ where: { year_id: selectedYearId }, include: baseInclude });
    } else if (userRole === 'coach') {
      theses = await user.getCoachedTheses({ where: { year_id: selectedYearId }, include: baseInclude });
    } else if (userRole === 'expert') {
      theses = await user.getExpertTheses({ where: { year_id: selectedYearId }, include: baseInclude });
    } else if (userRole === 'field_project_coach') {
      theses = await user.getFieldProjectCoachTheses({ where: { year_id: selectedYearId }, include: baseInclude });
    } else if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, attributes: ['id'] });
      const departmentIds = ledDepartments.map(d => d.id);

      if (departmentIds.length > 0) {
        const departmentFilter = req.query.department;
        const whereClause = { year_id: selectedYearId };

        if (departmentFilter && departmentIds.includes(parseInt(departmentFilter))) {
          whereClause.department_id = departmentFilter;
        } else {
          whereClause.department_id = departmentIds;
        }

        theses = await Thesis.findAll({ where: whereClause, include: baseInclude, order: [['title', 'ASC']] });
      }
    } else if (userRole === 'admin') {
      const departmentFilter = req.query.department;
      const whereClause = { year_id: selectedYearId };
      if (departmentFilter) whereClause.department_id = departmentFilter;

      theses = await Thesis.findAll({ where: whereClause, include: baseInclude, order: [['title', 'ASC']] });
    }

    // Studierende landen direkt auf der Detailansicht ihrer Diplomarbeit des gewählten Diplomjahres.
    if (userRole === 'student' && theses.length > 0) {
      return res.redirect('/dashboard/thesis/' + theses[0].id);
    }

    // Mehrfachrollen (Primär + Zusatzrollen) — wird vom Role-Switcher-Partial benötigt.
    const roleRows = await UserRole.findAll({ where: { user_id: userId }, attributes: ['role'], raw: true });
    const availableRoles = Array.from(new Set(roleRows.map(r => r.role)));

    const dashboardData = {
      user: {
        fullName: req.session.fullName,
        role: userRole
      },
      selectedYear: selectedYear.year,
      selectedYearId: selectedYear.id,
      availableRoles,
      currentRole: userRole,
      theses,
      messages: req.flash(),
    };

    if (userRole === 'admin') {
      dashboardData.departments = await Department.findAll({ order: [['name', 'ASC']] });
      dashboardData.selectedDepartment = req.query.department;
      dashboardData.availableYears = await Year.findAll({ order: [['year', 'DESC']], attributes: ['id', 'year'] });
    } else if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, order: [['name', 'ASC']] });
      dashboardData.departments = ledDepartments;
      dashboardData.selectedDepartment = req.query.department;
      dashboardData.availableYears = await Year.findAll({ order: [['year', 'DESC']], attributes: ['id', 'year'] });
    } else {
      dashboardData.availableYears = [];
    }

    res.render(`${userRole}/dashboard`, dashboardData);

  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Dashboard konnte nicht geladen werden');
    req.session.destroy(() => res.redirect('/login'));
  }
};

const showThesisDetail = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const thesisId = req.params.id;

    if (!userId || !userRole) {
      req.flash('error', 'Sitzung abgelaufen. Bitte erneut anmelden.');
      return res.redirect('/login');
    }

    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Department, as: 'department' },
        { model: Year, as: 'year' },
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' },
        { model: User, as: 'fieldProjectCoaches' },
      ]
    });

    if (!thesis) {
      req.flash('error', 'Diplomarbeit nicht gefunden');
      return res.redirect('/dashboard');
    }

    const hasAccess =
      userRole === 'admin' ||
      (userRole === 'student' && thesis.students.some(s => s.id === userId)) ||
      (userRole === 'coach' && thesis.coaches.some(c => c.id === userId)) ||
      (userRole === 'expert' && thesis.experts.some(e => e.id === userId)) ||
      (userRole === 'field_project_coach' && thesis.fieldProjectCoaches.some(f => f.id === userId)) ||
      (userRole === 'department_lead' && await checkDepartmentLeadAccess(userId, thesis.department_id));

    if (!hasAccess) {
      req.flash('error', 'Sie haben keine Berechtigung, diese Diplomarbeit anzusehen');
      return res.redirect('/dashboard');
    }

    // Studierende sehen nur freigegebene Meilensteine.
    const milestoneWhere = { thesis_id: thesisId };
    if (userRole === 'student') milestoneWhere.released = true;

    const milestones = await ThesisMilestone.findAll({
      where: milestoneWhere,
      include: [
        {
          model: ThesisMilestoneDocument,
          as: 'documents',
          include: [{ model: User, as: 'uploader', attributes: ['id', 'firstname', 'name', 'role'] }]
        },
        { model: User, as: 'evaluator', attributes: ['id', 'firstname', 'name', 'role'] },
        { model: User, as: 'approver', attributes: ['id', 'firstname', 'name', 'role'] },
        { model: User, as: 'approver2', attributes: ['id', 'firstname', 'name', 'role'] },
        {
          model: ThesisEvaluation,
          as: 'thesisEvaluations',
          include: [
            { model: ThesisEvaluationGroup, as: 'groups' },
            { model: User, as: 'evaluator', attributes: ['id', 'firstname', 'name'] }
          ]
        }
      ],
      order: [['due_at', 'ASC'], [{ model: ThesisMilestoneDocument, as: 'documents' }, 'version', 'DESC']]
    });

    // Log: für Studierende nur Einträge zu freigegebenen Meilensteinen (oder ohne Meilensteinbezug).
    const logWhere = { thesis_id: thesisId };
    if (userRole === 'student') {
      const visibleIds = milestones.map(m => m.id);
      logWhere[Op.or] = [{ thesis_milestone_id: null }, { thesis_milestone_id: visibleIds }];
    }
    const logs = await ThesisLog.findAll({
      where: logWhere,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstname', 'name', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    res.render(`${userRole}/thesis-detail`, {
      user: { id: userId, fullName: req.session.fullName, role: userRole },
      thesis,
      milestones,
      logs,
      messages: req.flash(),
      formatFileSize: (bytes) => {
        if (!bytes && bytes !== 0) return '';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
      }
    });

  } catch (error) {
    console.error('Thesis detail error:', error);
    req.flash('error', 'Diplomarbeit-Details konnten nicht geladen werden');
    res.redirect('/dashboard');
  }
};

const checkDepartmentLeadAccess = async (userId, departmentId) => {
  const department = await Department.findByPk(departmentId);
  return department && department.department_lead_id === userId;
};

const showMilestonesManagement = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const selectedYearId = req.session.selectedYear;

    if (userRole !== 'admin') {
      req.flash('error', 'Zugriff verweigert. Nur Administratoren können Meilensteine verwalten.');
      return res.redirect('/dashboard');
    }

    const selectedYear = await Year.findByPk(selectedYearId);
    if (!selectedYear) {
      req.flash('error', 'Ungültige Sitzungsdaten. Bitte erneut anmelden.');
      return res.redirect('/login');
    }

    const milestones = await Milestone.findAll({
      where: { year_id: selectedYearId },
      include: [{ model: EvaluationForm, as: 'evaluationForm', attributes: ['id', 'title_de'] }],
      order: [['due_at', 'ASC']]
    });

    const thesesCount = await Thesis.count({ where: { year_id: selectedYearId } });

    res.render('admin/milestones-management', {
      user: { fullName: req.session.fullName, role: userRole },
      selectedYear,
      milestones,
      thesesCount,
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showMilestonesManagement:', error);
    req.flash('error', 'Beim Laden der Meilenstein-Verwaltung ist ein Fehler aufgetreten.');
    res.redirect('/dashboard');
  }
};

// Chat-Seite einer Diplomarbeit. Sichtbar für alle DA-Beteiligten + Admin/FBL.
const showThesisChat = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const thesisId = req.params.id;

    if (!userId || !userRole) {
      req.flash('error', 'Sitzung abgelaufen. Bitte erneut anmelden.');
      return res.redirect('/login');
    }

    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Department, as: 'department' },
        { model: User, as: 'students', attributes: ['id'] },
        { model: User, as: 'coaches', attributes: ['id'] },
        { model: User, as: 'experts', attributes: ['id'] },
        { model: User, as: 'fieldProjectCoaches', attributes: ['id'] },
      ]
    });
    if (!thesis) {
      req.flash('error', 'Diplomarbeit nicht gefunden');
      return res.redirect('/dashboard');
    }

    const isInvolved =
      userRole === 'admin' ||
      thesis.students.some(s => s.id === userId) ||
      thesis.coaches.some(c => c.id === userId) ||
      thesis.experts.some(e => e.id === userId) ||
      thesis.fieldProjectCoaches.some(f => f.id === userId) ||
      (userRole === 'department_lead' && (await Department.findByPk(thesis.department_id))?.department_lead_id === userId);

    if (!isInvolved) {
      req.flash('error', 'Sie haben keine Berechtigung für diesen Chat');
      return res.redirect('/dashboard');
    }

    res.render('chat', {
      user: { id: userId, fullName: req.session.fullName, role: userRole },
      thesis: { id: thesis.id, title: thesis.title },
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Chat error:', error);
    req.flash('error', 'Chat konnte nicht geladen werden');
    res.redirect('/dashboard');
  }
};

const showYearsManagement = async (req, res) => {
  try {
    if (req.session.userRole !== 'admin') {
      req.flash('error', 'Zugriff verweigert. Nur Administratoren können Diplomjahre verwalten.');
      return res.redirect('/dashboard');
    }
    res.render('admin/years-management', {
      user: { fullName: req.session.fullName, role: req.session.userRole },
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showYearsManagement:', error);
    req.flash('error', 'Beim Laden der Diplomjahr-Verwaltung ist ein Fehler aufgetreten.');
    res.redirect('/dashboard');
  }
};

const showEvaluationForms = async (req, res) => {
  try {
    if (req.session.userRole !== 'admin') {
      req.flash('error', 'Zugriff verweigert. Nur Administratoren können Bewertungsformulare verwalten.');
      return res.redirect('/dashboard');
    }
    res.render('admin/evaluation-forms', {
      user: { fullName: req.session.fullName, role: req.session.userRole },
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showEvaluationForms:', error);
    req.flash('error', 'Beim Laden der Bewertungsformulare ist ein Fehler aufgetreten.');
    res.redirect('/dashboard');
  }
};

const showEvaluationFormEditor = async (req, res) => {
  try {
    if (req.session.userRole !== 'admin') {
      req.flash('error', 'Zugriff verweigert.');
      return res.redirect('/dashboard');
    }
    res.render('admin/evaluation-form-editor', {
      user: { fullName: req.session.fullName, role: req.session.userRole },
      formId: req.params.id,
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showEvaluationFormEditor:', error);
    req.flash('error', 'Beim Laden des Formular-Editors ist ein Fehler aufgetreten.');
    res.redirect('/dashboard');
  }
};

module.exports = {
  showDashboard,
  showThesisDetail,
  showThesisChat,
  showYearsManagement,
  showMilestonesManagement,
  showEvaluationForms,
  showEvaluationFormEditor,
};
