const { User, UserRole, Thesis, Department, Year, Milestone, ThesisMilestone, ThesisMilestoneDocument, ThesisLog, EvaluationForm, ThesisEvaluation, ThesisEvaluationGroup, UploadCategory } = require('../models');
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

        // FBL-Dashboard zeigt pro DA eine Übersicht über Meilensteine, Dokumente
        // und Bewertungen — daher hier zusätzlich Snapshots eager-laden.
        theses = await Thesis.findAll({
          where: whereClause,
          include: [
            ...baseInclude,
            {
              model: ThesisMilestone, as: 'milestones', required: false,
              include: [
                { model: UploadCategory, as: 'uploadCategories', through: { attributes: [] }, required: false },
                {
                  model: ThesisMilestoneDocument, as: 'documents', required: false,
                  include: [{ model: UploadCategory, as: 'uploadCategory', required: false }],
                },
                {
                  model: ThesisEvaluation, as: 'thesisEvaluations', required: false,
                  attributes: ['id', 'kind', 'overall_grade', 'evaluated_by'],
                  include: [{ model: User, as: 'evaluator', attributes: ['id', 'firstname', 'name'] }],
                },
              ],
            },
          ],
          order: [['title', 'ASC']],
        });
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

    // Dashboard-Sortierung: nach Studierenden-Nachname/Vorname; bei mehreren
    // Fachbereichen voran nach Fachbereich. Pro Diplomarbeit wird der/die
    // alphabetisch erste Studierende als Sortierschlüssel verwendet.
    const COLLATOR = new Intl.Collator('de-CH', { sensitivity: 'base' });
    const primaryStudentKey = (t) => {
      const list = (t.students || []).slice().sort((a, b) =>
        COLLATOR.compare(a.name || '', b.name || '')
        || COLLATOR.compare(a.firstname || '', b.firstname || '')
      );
      const p = list[0];
      // Ohne Studierende ans Ende sortieren (Marker '~~~~').
      return p ? [p.name || '~~~~', p.firstname || ''] : ['~~~~', '~~~~'];
    };
    const distinctDepartments = new Set(theses.map(t => t.department_id));
    const sortByDepartment = distinctDepartments.size > 1;
    theses.sort((a, b) => {
      if (sortByDepartment) {
        const da = (a.department && a.department.name) || '';
        const db = (b.department && b.department.name) || '';
        const c = COLLATOR.compare(da, db);
        if (c !== 0) return c;
      }
      const [an, af] = primaryStudentKey(a);
      const [bn, bf] = primaryStudentKey(b);
      return COLLATOR.compare(an, bn) || COLLATOR.compare(af, bf);
    });

    // Mehrfachrollen (Primär + Zusatzrollen) — wird vom Role-Switcher-Partial benötigt.
    const roleRows = await UserRole.findAll({ where: { user_id: userId }, attributes: ['role'], raw: true });
    const availableRoles = Array.from(new Set(roleRows.map(r => r.role)));

    const dashboardData = {
      user: {
        fullName: req.session.fullName,
        role: userRole
      },
      selectedYear: selectedYear.year,
      selectedYearObj: { id: selectedYear.id, year: selectedYear.year, label_de: selectedYear.label_de, label_fr: selectedYear.label_fr },
      selectedYearId: selectedYear.id,
      availableRoles,
      currentRole: userRole,
      theses,
      messages: req.flash(),
    };

    if (userRole === 'admin') {
      dashboardData.departments = await Department.findAll({ order: [['name', 'ASC']] });
      dashboardData.selectedDepartment = req.query.department;
      dashboardData.availableYears = await Year.findAll({ order: [['year', 'DESC']], attributes: ['id', 'year', 'label_de', 'label_fr'] });
    } else if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({ where: { department_lead_id: userId }, order: [['name', 'ASC']] });
      dashboardData.departments = ledDepartments;
      dashboardData.selectedDepartment = req.query.department;
      dashboardData.availableYears = await Year.findAll({ order: [['year', 'DESC']], attributes: ['id', 'year', 'label_de', 'label_fr'] });
      // Meilenstein-Vorlagen des Diplomjahres definieren die Spaltenstruktur
      // der FBL-Übersichtstabelle (chronologisch nach Fälligkeit).
      dashboardData.milestoneTemplates = await Milestone.findAll({
        where: { year_id: selectedYearId },
        attributes: [
          'id', 'label', 'due_at', 'allow_upload', 'requires_evaluation',
          'double_evaluation', 'evaluator_role', 'evaluator_role_2',
        ],
        order: [['due_at', 'ASC'], ['id', 'ASC']],
      });
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
    // Dozent Transferprojekt sieht nur Meilensteine mit Transferprojekt-Kennzeichnung.
    const milestoneWhere = { thesis_id: thesisId };
    if (userRole === 'student') milestoneWhere.released = true;
    if (userRole === 'field_project_coach') milestoneWhere.is_transfer_project = true;

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
        { model: UploadCategory, as: 'uploadCategories', through: { attributes: [] }, required: false },
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

    // Log: nur Einträge zu sichtbaren Meilensteinen (oder ohne Meilensteinbezug).
    // Studierende: nur freigegebene; Dozent Transferprojekt: nur Transferprojekt-Meilensteine.
    const logWhere = { thesis_id: thesisId };
    if (userRole === 'student' || userRole === 'field_project_coach') {
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
      include: [
        { model: EvaluationForm, as: 'evaluationForm', attributes: ['id', 'title_de'] },
        { model: UploadCategory, as: 'uploadCategories', through: { attributes: [] } },
      ],
      order: [['due_at', 'ASC']]
    });

    const thesesCount = await Thesis.count({ where: { year_id: selectedYearId } });

    // Aktive Upload-Kategorien zur Auswahl (deaktivierte ausgeblendet, ausser sie
    // sind bereits einem Meilenstein zugewiesen — dann auch sichtbar, damit der
    // Edit-Prefill konsistent bleibt).
    const activeCats = await UploadCategory.findAll({ where: { is_active: true }, order: [['label', 'ASC']] });
    const assignedCatIds = new Set();
    milestones.forEach(m => (m.uploadCategories || []).forEach(c => assignedCatIds.add(c.id)));
    const extraInactive = await UploadCategory.findAll({
      where: { id: Array.from(assignedCatIds), is_active: false },
    });
    const allCats = [...activeCats, ...extraInactive].sort((a, b) => a.label.localeCompare(b.label));

    res.render('admin/milestones-management', {
      user: { fullName: req.session.fullName, role: userRole },
      selectedYear,
      milestones,
      thesesCount,
      uploadCategories: allCats,
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

// Profilseite: zeigt die persönlichen Einstellungen des Benutzers.
// Aktuell: GUI-Sprache (Deutsch/Französisch, weitere Sprachen via locales/).
const showProfile = async (req, res) => {
  try {
    const { SUPPORTED_LANGUAGES } = require('../config/i18n');
    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'username', 'firstname', 'name', 'email', 'language'],
    });
    if (!user) {
      req.flash('error', 'Benutzer nicht gefunden.');
      return res.redirect('/dashboard');
    }
    res.render('profile', {
      user: { id: user.id, fullName: req.session.fullName, role: req.session.userRole },
      profile: user,
      supportedLanguages: SUPPORTED_LANGUAGES,
      messages: req.flash(),
    });
  } catch (e) {
    console.error('showProfile error:', e);
    req.flash('error', 'Profil konnte nicht geladen werden.');
    res.redirect('/dashboard');
  }
};

// Speichert die Profil-Einstellungen (aktuell nur Sprache).
const updateProfile = async (req, res) => {
  try {
    const { SUPPORTED_LANGUAGES } = require('../config/i18n');
    const lang = (req.body && req.body.language) ? String(req.body.language) : '';
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      req.flash('error', 'Ungültige Sprachauswahl.');
      return res.redirect('/dashboard/profile');
    }
    const user = await User.findByPk(req.session.userId);
    if (!user) {
      req.flash('error', 'Benutzer nicht gefunden.');
      return res.redirect('/dashboard');
    }
    await user.update({ language: lang });
    req.session.language = lang;
    req.flash('success', req.t('profile.saved'));
    res.redirect('/dashboard/profile');
  } catch (e) {
    console.error('updateProfile error:', e);
    req.flash('error', 'Profil konnte nicht gespeichert werden.');
    res.redirect('/dashboard/profile');
  }
};

const showDocumentTemplates = async (req, res) => {
  try {
    // Optionaler Rücksprung-Kontext: ?from=<thesisId>. Wir validieren nur das
    // Format; die Berechtigungsprüfung erfolgt beim Aufruf der Detailseite.
    let fromThesisId = null;
    let fromThesisTitle = '';
    if (req.query.from) {
      const id = parseInt(req.query.from, 10);
      if (Number.isInteger(id) && id > 0) {
        const t = await Thesis.findByPk(id, { attributes: ['id', 'title'] });
        if (t) { fromThesisId = t.id; fromThesisTitle = t.title || ''; }
      }
    }
    res.render('templates', {
      user: { id: req.session.userId, fullName: req.session.fullName, role: req.session.userRole },
      fromThesisId,
      fromThesisTitle,
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showDocumentTemplates:', error);
    req.flash('error', 'Vorlagen-Seite konnte nicht geladen werden.');
    res.redirect('/dashboard');
  }
};

const showUploadCategoriesManagement = async (req, res) => {
  try {
    if (req.session.userRole !== 'admin') {
      req.flash('error', 'Zugriff verweigert. Nur Administratoren können Upload-Kategorien verwalten.');
      return res.redirect('/dashboard');
    }
    res.render('admin/upload-categories', {
      user: { fullName: req.session.fullName, role: req.session.userRole },
      messages: req.flash(),
    });
  } catch (error) {
    console.error('Error in showUploadCategoriesManagement:', error);
    req.flash('error', 'Beim Laden der Upload-Kategorien ist ein Fehler aufgetreten.');
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
  showDocumentTemplates,
  showProfile,
  updateProfile,
  showYearsManagement,
  showUploadCategoriesManagement,
  showMilestonesManagement,
  showEvaluationForms,
  showEvaluationFormEditor,
};
