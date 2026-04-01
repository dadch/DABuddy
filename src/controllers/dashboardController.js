const { User, Thesis, Department, Year, Document, DocumentLog, DocumentDueDate } = require('../models');
const { getStateDisplayInfo } = require('../utils/thesisStateMachine');
const { getRequiredDocuments, getAllowedDocuments, canUserUploadDocument } = require('../utils/documentUpload');

const showDashboard = async (req, res) => {
  try {
    console.log('Dashboard request - Session data:', {
      userId: req.session.userId,
      userRole: req.session.userRole,
      selectedYear: req.session.selectedYear
    });

    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const selectedYearId = req.session.selectedYear;

    if (!userId || !userRole || !selectedYearId) {
      console.log('Missing session data, redirecting to login');
      req.flash('error', 'Session expired. Please login again.');
      return res.redirect('/login');
    }

    console.log('Fetching user and year data...');
    const user = await User.findByPk(userId);
    const selectedYear = await Year.findByPk(selectedYearId);

    if (!user || !selectedYear) {
      console.log('User or year not found:', { user: !!user, selectedYear: !!selectedYear });
      req.flash('error', 'Invalid session data. Please login again.');
      return res.redirect('/login');
    }

    let theses = [];

    if (userRole === 'student') {
      const studentTheses = await user.getStudentTheses({
        where: { year_id: selectedYearId },
        include: [
          { model: Department, as: 'department' },
          { model: Year, as: 'year' },
          { model: User, as: 'students' },
          { model: User, as: 'coaches' },
          { model: User, as: 'experts' }
        ]
      });
      theses = studentTheses;
    } else if (userRole === 'coach') {
      const coachedTheses = await user.getCoachedTheses({
        where: { year_id: selectedYearId },
        include: [
          { model: Department, as: 'department' },
          { model: Year, as: 'year' },
          { model: User, as: 'students' },
          { model: User, as: 'coaches' },
          { model: User, as: 'experts' }
        ]
      });
      theses = coachedTheses;
    } else if (userRole === 'expert') {
      const expertTheses = await user.getExpertTheses({
        where: { year_id: selectedYearId },
        include: [
          { model: Department, as: 'department' },
          { model: Year, as: 'year' },
          { model: User, as: 'students' },
          { model: User, as: 'coaches' },
          { model: User, as: 'experts' }
        ]
      });
      theses = expertTheses;
    } else if (userRole === 'department_lead') {
      // Get departments led by this user
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      
      const departmentIds = ledDepartments.map(dept => dept.id);
      
      if (departmentIds.length > 0) {
        const departmentFilter = req.query.department;
        const whereClause = { year_id: selectedYearId };
        
        if (departmentFilter && departmentIds.includes(parseInt(departmentFilter))) {
          whereClause.department_id = departmentFilter;
        } else {
          whereClause.department_id = departmentIds;
        }
        
        const departmentTheses = await Thesis.findAll({
          where: whereClause,
          include: [
            { model: Department, as: 'department' },
            { model: Year, as: 'year' },
            { model: User, as: 'students' },
            { model: User, as: 'coaches' },
            { model: User, as: 'experts' },
          ],
          order: [['title', 'ASC']]
        });
        theses = departmentTheses;
      }
    } else if (userRole === 'admin') {
      const departmentFilter = req.query.department;
      const whereClause = { year_id: selectedYearId };
      
      if (departmentFilter) {
        whereClause.department_id = departmentFilter;
      }
      
      const allTheses = await Thesis.findAll({
        where: whereClause,
        include: [
          { model: Department, as: 'department' },
          { model: Year, as: 'year' },
          { model: User, as: 'students' },
          { model: User, as: 'coaches' },
          { model: User, as: 'experts' }
        ],
        order: [['title', 'ASC']]
      });
      theses = allTheses;
    }

    const dashboardData = {
      user: {
        fullName: req.session.fullName,
        role: userRole
      },
      selectedYear: selectedYear.year,
      theses,
      messages: req.flash(),
      getStateColor: (state) => getStateDisplayInfo(state).color
    };

    if (userRole === 'admin') {
      dashboardData.departments = await Department.findAll({ order: [['name', 'ASC']] });
      dashboardData.selectedDepartment = req.query.department;
    } else if (userRole === 'department_lead') {
      // Get departments led by this user
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        order: [['name', 'ASC']]
      });
      dashboardData.departments = ledDepartments;
      dashboardData.selectedDepartment = req.query.department;
    }

    res.render(`${userRole}/dashboard`, dashboardData);
    
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Unable to load dashboard');
    // Destroy session to prevent redirect loop
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.redirect('/login');
    });
  }
};

const showThesisDetail = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const thesisId = req.params.id;
    
    if (!userId || !userRole) {
      req.flash('error', 'Session expired. Please login again.');
      return res.redirect('/login');
    }

    // Get thesis with all relationships
    const thesis = await Thesis.findByPk(thesisId, {
      include: [
        { model: Department, as: 'department' },
        { model: Year, as: 'year' },
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' },
        { 
          model: Document, 
          as: 'documents',
          include: [
            { model: User, as: 'uploader', attributes: ['id', 'firstname', 'name'] }
          ],
          order: [['upload_timestamp', 'DESC']]
        }
      ]
    });

    if (!thesis) {
      req.flash('error', 'Thesis not found');
      return res.redirect('/dashboard');
    }

    // Check if user has access to this thesis
    const hasAccess = 
      userRole === 'admin' ||
      (userRole === 'student' && thesis.students.some(s => s.id === userId)) ||
      (userRole === 'coach' && thesis.coaches.some(c => c.id === userId)) ||
      (userRole === 'expert' && thesis.experts.some(e => e.id === userId)) ||
      (userRole === 'department_lead' && await checkDepartmentLeadAccess(userId, thesis.department_id));

    if (!hasAccess) {
      req.flash('error', 'You do not have permission to view this thesis');
      return res.redirect('/dashboard');
    }

    // Get due dates for the current year
    const dueDates = await DocumentDueDate.findAll({
      where: { year_id: thesis.year_id },
      order: [['document_type', 'ASC']]
    });

    // Create a map of due dates by document type
    const dueDateMap = {};
    dueDates.forEach(dd => {
      dueDateMap[dd.document_type] = dd.due_date;
    });

    // Get document requirements and permissions
    const requiredDocuments = getRequiredDocuments(thesis.state);
    const allowedDocuments = getAllowedDocuments(thesis.state);
    
    // Determine user's role in relation to this thesis
    let thesisUserRole = userRole;
    if (userRole === 'student' && thesis.students.some(student => student.id === userId)) {
      thesisUserRole = 'student';
    } else if (userRole === 'coach' && thesis.coaches.some(coach => coach.id === userId)) {
      thesisUserRole = 'coach';
    }

    // Check which documents user can upload
    const uploadableDocuments = allowedDocuments.filter(docType => 
      canUserUploadDocument(thesis.state, docType, thesisUserRole)
    );

    // Determine which documents to display
    // Students see only documents for current state, others see all documents
    const displayableDocuments = userRole === 'student' ? allowedDocuments : [
      'Project Scribble',
      'Project Order', 
      'Requirements Specification',
      'Thesis Assignment',
      'Minutes',
      'Worktime Report',
      'Thesis Document',
      'Abstract',
      'Monetary Benefit Description'
    ];

    // Get document logs
    const documentLogs = await DocumentLog.findAll({
      where: { thesis_id: thesisId },
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstname', 'name'] }
      ],
      order: [['upload_timestamp', 'DESC']],
      limit: 10
    });

    // Group documents by type
    const documentsByType = {};
    thesis.documents.forEach(doc => {
      if (!documentsByType[doc.document_type]) {
        documentsByType[doc.document_type] = [];
      }
      documentsByType[doc.document_type].push(doc);
    });

    const detailData = {
      user: {
        id: userId,
        fullName: req.session.fullName,
        role: userRole
      },
      thesis,
      documents: thesis.documents,
      documentsByType,
      documentLogs,
      requiredDocuments,
      allowedDocuments,
      displayableDocuments,
      uploadableDocuments,
      thesisUserRole,
      dueDateMap,
      messages: req.flash(),
      getStateColor: (state) => getStateDisplayInfo(state).color,
      formatFileSize: (bytes) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
      }
    };

    res.render(`${userRole}/thesis-detail`, detailData);
    
  } catch (error) {
    console.error('Thesis detail error:', error);
    req.flash('error', 'Unable to load thesis details');
    res.redirect('/dashboard');
  }
};

// Helper function to check department lead access
const checkDepartmentLeadAccess = async (userId, departmentId) => {
  const department = await Department.findByPk(departmentId);
  return department && department.department_lead_id === userId;
};

const showDueDatesManagement = async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const selectedYearId = req.session.selectedYear;

    if (userRole !== 'admin') {
      req.flash('error', 'Access denied. Only administrators can manage due dates.');
      return res.redirect('/dashboard');
    }

    const user = await User.findByPk(userId);
    const selectedYear = await Year.findByPk(selectedYearId);

    if (!user || !selectedYear) {
      req.flash('error', 'Invalid session data. Please login again.');
      return res.redirect('/login');
    }

    // Get all years
    const years = await Year.findAll({
      order: [['year', 'DESC']]
    });

    // Get current due dates for selected year
    const dueDates = await DocumentDueDate.findAll({
      where: { year_id: selectedYearId },
      order: [['document_type', 'ASC']]
    });

    // Define all document types
    const documentTypes = [
      'Project Scribble',
      'Project Order',
      'Requirements Specification',
      'Thesis Assignment',
      'Minutes',
      'Worktime Report',
      'Thesis Document',
      'Abstract',
      'Monetary Benefit Description'
    ];

    // Create a map of due dates by document type
    const dueDateMap = {};
    dueDates.forEach(dd => {
      dueDateMap[dd.document_type] = dd.due_date;
    });

    res.render('admin/due-dates-management', {
      user,
      selectedYear,
      years,
      documentTypes,
      dueDateMap,
      getStateDisplayInfo
    });
  } catch (error) {
    console.error('Error in showDueDatesManagement:', error);
    req.flash('error', 'An error occurred while loading the due dates management page.');
    res.redirect('/dashboard');
  }
};

module.exports = {
  showDashboard,
  showThesisDetail,
  showDueDatesManagement
};