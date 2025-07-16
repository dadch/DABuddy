const { User, Thesis, Department, Year } = require('../models');
const { getStateDisplayInfo } = require('../utils/thesisStateMachine');

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

module.exports = {
  showDashboard,
};