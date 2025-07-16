const { User, Thesis, Department, Year } = require('../models');
const { getAvailableNextStates, isTransitionAllowed, getStateDisplayInfo } = require('../utils/thesisStateMachine');

const getThesis = async (req, res) => {
  try {
    const thesis = await Thesis.findByPk(req.params.id, {
      include: [
        { model: Department, as: 'department' },
        { model: Year, as: 'year' },
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' }
      ]
    });
    
    if (!thesis) {
      return res.status(404).json({ success: false, message: 'Thesis not found' });
    }
    
    res.json(thesis);
  } catch (error) {
    console.error('Error fetching thesis:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createThesis = async (req, res) => {
  try {
    const { title, department_id, sponsor, students, coach, expert } = req.body;
    const selectedYearId = req.session.selectedYear;
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    // Department lead authorization check
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      
      if (!ledDepartmentIds.includes(parseInt(department_id))) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only create theses for departments you lead.' 
        });
      }
    }
    
    // Validate students (maximum 2)
    if (students && students.length > 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Maximum 2 students can be assigned to a thesis' 
      });
    }
    
    const thesis = await Thesis.create({
      title,
      department_id,
      sponsor: sponsor || null,
      year_id: selectedYearId
    });
    
    // Assign students
    if (students && students.length > 0) {
      const studentUsers = await User.findAll({
        where: { id: students, role: 'student' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      await thesis.setStudents(studentUsers);
    }
    
    // Assign coach
    if (coach) {
      const coachUser = await User.findOne({
        where: { id: coach, role: 'coach' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      if (coachUser) {
        await thesis.setCoaches([coachUser]);
      }
    }
    
    // Assign expert
    if (expert) {
      const expertUser = await User.findOne({
        where: { id: expert, role: 'expert' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      if (expertUser) {
        await thesis.setExperts([expertUser]);
      }
    }
    
    res.json({ success: true, thesis });
  } catch (error) {
    console.error('Error creating thesis:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateThesis = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, department_id, sponsor, students, coach, expert } = req.body;
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    // Validate students (maximum 2)
    if (students && students.length > 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Maximum 2 students can be assigned to a thesis' 
      });
    }
    
    const thesis = await Thesis.findByPk(id);
    if (!thesis) {
      return res.status(404).json({ success: false, message: 'Thesis not found' });
    }
    
    // Department lead authorization check
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      
      // Check if user can edit this thesis (original department) and new department (if changing)
      if (!ledDepartmentIds.includes(thesis.department_id) || 
          (department_id && !ledDepartmentIds.includes(parseInt(department_id)))) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only edit theses from departments you lead.' 
        });
      }
    }
    
    const oldDepartmentId = thesis.department_id;
    const departmentChanged = oldDepartmentId !== department_id;
    
    await thesis.update({
      title,
      department_id,
      sponsor: sponsor || null
    });
    
    // If department changed, remove invalid user assignments
    if (departmentChanged) {
      // Remove students not in the new department
      const currentStudents = await thesis.getStudents();
      const validStudents = await User.findAll({
        where: { id: currentStudents.map(s => s.id), role: 'student' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      await thesis.setStudents(validStudents);
      
      // Remove coaches not in the new department
      const currentCoaches = await thesis.getCoaches();
      const validCoaches = await User.findAll({
        where: { id: currentCoaches.map(c => c.id), role: 'coach' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      await thesis.setCoaches(validCoaches);
      
      // Remove experts not in the new department
      const currentExperts = await thesis.getExperts();
      const validExperts = await User.findAll({
        where: { id: currentExperts.map(e => e.id), role: 'expert' },
        include: [{
          model: Department,
          as: 'departments',
          where: { id: department_id },
          required: true
        }]
      });
      await thesis.setExperts(validExperts);
    }
    
    // Update student assignments
    if (students !== undefined) {
      if (students.length > 0) {
        const studentUsers = await User.findAll({
          where: { id: students, role: 'student' },
          include: [{
            model: Department,
            as: 'departments',
            where: { id: department_id },
            required: true
          }]
        });
        await thesis.setStudents(studentUsers);
      } else {
        await thesis.setStudents([]);
      }
    }
    
    // Update coach assignment
    if (coach !== undefined) {
      if (coach) {
        const coachUser = await User.findOne({
          where: { id: coach, role: 'coach' },
          include: [{
            model: Department,
            as: 'departments',
            where: { id: department_id },
            required: true
          }]
        });
        if (coachUser) {
          await thesis.setCoaches([coachUser]);
        }
      } else {
        await thesis.setCoaches([]);
      }
    }
    
    // Update expert assignment
    if (expert !== undefined) {
      if (expert) {
        const expertUser = await User.findOne({
          where: { id: expert, role: 'expert' },
          include: [{
            model: Department,
            as: 'departments',
            where: { id: department_id },
            required: true
          }]
        });
        if (expertUser) {
          await thesis.setExperts([expertUser]);
        }
      } else {
        await thesis.setExperts([]);
      }
    }
    
    res.json({ success: true, thesis });
  } catch (error) {
    console.error('Error updating thesis:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteThesis = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    const thesis = await Thesis.findByPk(req.params.id);
    if (!thesis) {
      return res.status(404).json({ success: false, message: 'Thesis not found' });
    }
    
    // Department lead authorization check
    if (userRole === 'department_lead') {
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      
      if (!ledDepartmentIds.includes(thesis.department_id)) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only delete theses from departments you lead.' 
        });
      }
    }
    
    await thesis.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting thesis:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getUsers = async (req, res) => {
  try {
    const { department_id, role } = req.query;
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    let whereClause = {};
    let includeClause = [{
      model: Department,
      as: 'departments',
      attributes: ['id', 'name'],
      required: false
    }];
    
    if (role) {
      whereClause.role = role;
    }
    
    // Department lead filtering
    if (userRole === 'department_lead') {
      // Get departments led by this user
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      
      if (ledDepartmentIds.length === 0) {
        return res.json([]);
      }
      
      // Override includeClause to only show users from led departments
      includeClause = [{
        model: Department,
        as: 'departments',
        where: { id: ledDepartmentIds },
        attributes: ['id', 'name'],
        required: true
      }];
    } else if (department_id) {
      includeClause = [{
        model: Department,
        as: 'departments',
        where: { id: department_id },
        required: true
      }];
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
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments } = req.body;
    
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }
    
    const user = await User.create({
      username,
      password,
      firstname,
      name,
      email,
      role
    });
    
    // Assign departments if provided
    if (departments && departments.length > 0) {
      const departmentObjects = await Department.findAll({
        where: { id: departments }
      });
      await user.setDepartments(departmentObjects);
    }
    
    const userResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      firstname: user.firstname,
      email: user.email,
      role: user.role
    };
    
    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if username or email already exists (excluding current user)
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.and]: [
          { id: { [require('sequelize').Op.ne]: id } },
          {
            [require('sequelize').Op.or]: [
              { username },
              { email }
            ]
          }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }
    
    // Update user fields
    const updateData = { username, firstname, name, email, role };
    
    // Only update password if provided
    if (password && password.trim() !== '') {
      updateData.password = password;
    }
    
    await user.update(updateData);
    
    // Update departments if provided
    if (departments !== undefined) {
      if (departments.length > 0) {
        const departmentObjects = await Department.findAll({
          where: { id: departments }
        });
        await user.setDepartments(departmentObjects);
      } else {
        await user.setDepartments([]);
      }
    }
    
    const userResponse = {
      id: user.id,
      username: user.username,
      firstname: user.firstname,
      name: user.name,
      email: user.email,
      role: user.role
    };
    
    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (user.id === req.session.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete your own account' 
      });
    }
    
    await user.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      include: [
        { 
          model: User, 
          as: 'departmentLead',
          attributes: ['id', 'username', 'name', 'firstname', 'email']
        }
      ],
      order: [['name', 'ASC']]
    });
    
    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, department_lead_id } = req.body;
    
    const existingDepartment = await Department.findOne({
      where: { name }
    });
    
    if (existingDepartment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Department name already exists' 
      });
    }
    
    if (department_lead_id) {
      const departmentLead = await User.findOne({
        where: { id: department_lead_id, role: 'department_lead' }
      });
      
      if (!departmentLead) {
        return res.status(400).json({ 
          success: false, 
          message: 'Selected user is not a department lead' 
        });
      }
    }
    
    const department = await Department.create({
      name,
      department_lead_id: department_lead_id || null
    });
    
    const departmentWithLead = await Department.findByPk(department.id, {
      include: [
        { 
          model: User, 
          as: 'departmentLead',
          attributes: ['id', 'username', 'name', 'firstname', 'email']
        }
      ]
    });
    
    res.json({ success: true, department: departmentWithLead });
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, department_lead_id } = req.body;
    
    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    
    if (name !== department.name) {
      const existingDepartment = await Department.findOne({
        where: { name, id: { [require('sequelize').Op.ne]: id } }
      });
      
      if (existingDepartment) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department name already exists' 
        });
      }
    }
    
    if (department_lead_id) {
      const departmentLead = await User.findOne({
        where: { id: department_lead_id, role: 'department_lead' }
      });
      
      if (!departmentLead) {
        return res.status(400).json({ 
          success: false, 
          message: 'Selected user is not a department lead' 
        });
      }
    }
    
    await department.update({
      name,
      department_lead_id: department_lead_id || null
    });
    
    const updatedDepartment = await Department.findByPk(id, {
      include: [
        { 
          model: User, 
          as: 'departmentLead',
          attributes: ['id', 'username', 'name', 'firstname', 'email']
        }
      ]
    });
    
    res.json({ success: true, department: updatedDepartment });
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    
    const thesesCount = await Thesis.count({ where: { department_id: department.id } });
    if (thesesCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete department with associated theses' 
      });
    }
    
    await department.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const assignUserToDepartment = async (req, res) => {
  try {
    const { userId, departmentId } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const department = await Department.findByPk(departmentId);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    
    // Check if user is admin (admins don't need department assignment)
    if (user.role === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin users cannot be assigned to departments' 
      });
    }
    
    await user.addDepartment(department);
    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning user to department:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const removeUserFromDepartment = async (req, res) => {
  try {
    const { userId, departmentId } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const department = await Department.findByPk(departmentId);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    
    await user.removeDepartment(department);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing user from department:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateUserDepartments = async (req, res) => {
  try {
    const { userId } = req.params;
    const { departmentIds } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if user is admin (admins don't need department assignment)
    if (user.role === 'admin') {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin users cannot be assigned to departments' 
      });
    }
    
    if (departmentIds && departmentIds.length > 0) {
      const departments = await Department.findAll({
        where: { id: departmentIds }
      });
      await user.setDepartments(departments);
    } else {
      await user.setDepartments([]);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user departments:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const changeThesisState = async (req, res) => {
  try {
    const { id } = req.params;
    const { newState } = req.body;
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    // Find the thesis
    const thesis = await Thesis.findByPk(id, {
      include: [
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' },
        { model: Department, as: 'department' }
      ]
    });
    
    if (!thesis) {
      return res.status(404).json({ success: false, message: 'Thesis not found' });
    }
    
    // Check if user has permission to change this thesis state
    let hasPermission = false;
    
    if (userRole === 'admin') {
      hasPermission = true;
    } else if (userRole === 'department_lead') {
      // Check if user leads the department
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      hasPermission = ledDepartmentIds.includes(thesis.department_id);
    } else if (userRole === 'coach') {
      // Check if user is a coach of this thesis
      hasPermission = thesis.coaches.some(coach => coach.id === userId);
    } else if (userRole === 'expert') {
      // Check if user is an expert of this thesis
      hasPermission = thesis.experts.some(expert => expert.id === userId);
    } else if (userRole === 'student') {
      // Check if user is a student of this thesis
      hasPermission = thesis.students.some(student => student.id === userId);
    }
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to change the state of this thesis' 
      });
    }
    
    // Check if the state transition is allowed for this role
    if (!isTransitionAllowed(thesis.state, newState, userRole)) {
      return res.status(400).json({ 
        success: false, 
        message: `State transition from "${thesis.state}" to "${newState}" is not allowed for your role` 
      });
    }
    
    // Update the thesis state
    await thesis.update({ state: newState });
    
    res.json({ 
      success: true, 
      message: `Thesis state changed to "${newState}"`,
      thesis: {
        id: thesis.id,
        state: thesis.state,
        stateDisplay: getStateDisplayInfo(thesis.state)
      }
    });
  } catch (error) {
    console.error('Error changing thesis state:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getThesisStateOptions = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.session.userRole;
    const userId = req.session.userId;
    
    // Find the thesis
    const thesis = await Thesis.findByPk(id, {
      include: [
        { model: User, as: 'students' },
        { model: User, as: 'coaches' },
        { model: User, as: 'experts' },
        { model: Department, as: 'department' }
      ]
    });
    
    if (!thesis) {
      return res.status(404).json({ success: false, message: 'Thesis not found' });
    }
    
    // Check if user has permission to view this thesis
    let hasPermission = false;
    
    if (userRole === 'admin') {
      hasPermission = true;
    } else if (userRole === 'department_lead') {
      // Check if user leads the department
      const ledDepartments = await Department.findAll({
        where: { department_lead_id: userId },
        attributes: ['id']
      });
      const ledDepartmentIds = ledDepartments.map(dept => dept.id);
      hasPermission = ledDepartmentIds.includes(thesis.department_id);
    } else if (userRole === 'coach') {
      hasPermission = thesis.coaches.some(coach => coach.id === userId);
    } else if (userRole === 'expert') {
      hasPermission = thesis.experts.some(expert => expert.id === userId);
    } else if (userRole === 'student') {
      hasPermission = thesis.students.some(student => student.id === userId);
    }
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to view this thesis' 
      });
    }
    
    // Get available next states for this role
    const availableStates = getAvailableNextStates(thesis.state, userRole);
    const stateOptions = availableStates.map(state => ({
      value: state,
      label: state,
      display: getStateDisplayInfo(state)
    }));
    
    res.json({
      success: true,
      currentState: thesis.state,
      currentStateDisplay: getStateDisplayInfo(thesis.state),
      availableStates: stateOptions
    });
  } catch (error) {
    console.error('Error getting thesis state options:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Department lead specific functions
const getDepartmentLeadUsers = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get departments led by this user
    const ledDepartments = await Department.findAll({
      where: { department_lead_id: userId },
      attributes: ['id']
    });
    
    const departmentIds = ledDepartments.map(dept => dept.id);
    
    if (departmentIds.length === 0) {
      return res.json([]);
    }
    
    // Get users who belong to these departments
    const users = await User.findAll({
      include: [
        {
          model: Department,
          as: 'departments',
          where: { id: departmentIds },
          through: { attributes: [] }
        }
      ],
      where: {
        role: ['student', 'coach', 'expert'] // Only these roles can be managed
      }
    });
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching department lead users:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createDepartmentLeadUser = async (req, res) => {
  try {
    const { username, password, firstname, name, email, role, departments } = req.body;
    const userId = req.session.userId;
    
    // Validate role - department leads can only create these roles
    if (!['student', 'coach', 'expert'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Department leads can only create student, coach, or expert accounts.' 
      });
    }
    
    // Get departments led by this user
    const ledDepartments = await Department.findAll({
      where: { department_lead_id: userId },
      attributes: ['id']
    });
    
    const ledDepartmentIds = ledDepartments.map(dept => dept.id);
    
    // Validate that all selected departments are led by this user
    if (departments && departments.length > 0) {
      const invalidDepartments = departments.filter(deptId => !ledDepartmentIds.includes(parseInt(deptId)));
      if (invalidDepartments.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'You can only assign users to departments you lead.' 
        });
      }
    }
    
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }
    
    const user = await User.create({
      username,
      password,
      firstname,
      name,
      email,
      role
    });
    
    // Assign departments if provided
    if (departments && departments.length > 0) {
      const departmentObjects = await Department.findAll({
        where: { id: departments }
      });
      await user.setDepartments(departmentObjects);
    }
    
    const userResponse = {
      id: user.id,
      username: user.username,
      name: user.name,
      firstname: user.firstname,
      email: user.email,
      role: user.role
    };
    
    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Error creating department lead user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateDepartmentLeadUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, firstname, name, email, role, departments } = req.body;
    const userId = req.session.userId;
    
    // Validate role - department leads can only update these roles
    if (!['student', 'coach', 'expert'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Department leads can only manage student, coach, or expert accounts.' 
      });
    }
    
    // Get departments led by this user
    const ledDepartments = await Department.findAll({
      where: { department_lead_id: userId },
      attributes: ['id']
    });
    
    const ledDepartmentIds = ledDepartments.map(dept => dept.id);
    
    // Check if user belongs to any of the departments led by this user
    const user = await User.findByPk(id, {
      include: [
        {
          model: Department,
          as: 'departments',
          through: { attributes: [] }
        }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userDepartmentIds = user.departments.map(dept => dept.id);
    const hasPermission = userDepartmentIds.some(deptId => ledDepartmentIds.includes(deptId));
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only edit users from departments you lead.' 
      });
    }
    
    // Validate that all selected departments are led by this user
    if (departments && departments.length > 0) {
      const invalidDepartments = departments.filter(deptId => !ledDepartmentIds.includes(parseInt(deptId)));
      if (invalidDepartments.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'You can only assign users to departments you lead.' 
        });
      }
    }
    
    // Check if username or email already exists (excluding current user)
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.and]: [
          { id: { [require('sequelize').Op.ne]: id } },
          {
            [require('sequelize').Op.or]: [
              { username },
              { email }
            ]
          }
        ]
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }
    
    // Update user fields
    const updateData = { username, firstname, name, email, role };
    
    // Only update password if provided
    if (password && password.trim() !== '') {
      updateData.password = password;
    }
    
    await user.update(updateData);
    
    // Update departments if provided
    if (departments !== undefined) {
      if (departments.length > 0) {
        const departmentObjects = await Department.findAll({
          where: { id: departments }
        });
        await user.setDepartments(departmentObjects);
      } else {
        await user.setDepartments([]);
      }
    }
    
    const userResponse = {
      id: user.id,
      username: user.username,
      firstname: user.firstname,
      name: user.name,
      email: user.email,
      role: user.role
    };
    
    res.json({ success: true, user: userResponse });
  } catch (error) {
    console.error('Error updating department lead user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteDepartmentLeadUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;
    
    // Get departments led by this user
    const ledDepartments = await Department.findAll({
      where: { department_lead_id: userId },
      attributes: ['id']
    });
    
    const ledDepartmentIds = ledDepartments.map(dept => dept.id);
    
    // Check if user belongs to any of the departments led by this user
    const user = await User.findByPk(id, {
      include: [
        {
          model: Department,
          as: 'departments',
          through: { attributes: [] }
        }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const userDepartmentIds = user.departments.map(dept => dept.id);
    const hasPermission = userDepartmentIds.some(deptId => ledDepartmentIds.includes(deptId));
    
    if (!hasPermission) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only delete users from departments you lead.' 
      });
    }
    
    // Check if user has any thesis associations
    const studentTheses = await user.getStudentTheses();
    const coachedTheses = await user.getCoachedTheses();
    const expertTheses = await user.getExpertTheses();
    
    if (studentTheses.length > 0 || coachedTheses.length > 0 || expertTheses.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete user with existing thesis associations' 
      });
    }
    
    await user.destroy();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting department lead user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getDepartmentLeadDepartments = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get departments led by this user
    const ledDepartments = await Department.findAll({
      where: { department_lead_id: userId },
      order: [['name', 'ASC']]
    });
    
    res.json(ledDepartments);
  } catch (error) {
    console.error('Error fetching department lead departments:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
  changeThesisState,
  getThesisStateOptions,
  getDepartmentLeadUsers,
  createDepartmentLeadUser,
  updateDepartmentLeadUser,
  deleteDepartmentLeadUser,
  getDepartmentLeadDepartments
};