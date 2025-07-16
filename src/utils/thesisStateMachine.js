// Thesis State Machine
// States: Initial -> Scribble -> Project assignment -> Requirements done -> Assignment done -> Thesis done -> Evaluation confirmed

const THESIS_STATES = {
  INITIAL: 'Initial',
  SCRIBBLE: 'Scribble',
  PROJECT_ASSIGNMENT: 'Project assignment',
  REQUIREMENTS_DONE: 'Requirements done',
  ASSIGNMENT_DONE: 'Assignment done',
  THESIS_DONE: 'Thesis done',
  EVALUATION_CONFIRMED: 'Evaluation confirmed'
};

const STATE_TRANSITIONS = {
  [THESIS_STATES.INITIAL]: [THESIS_STATES.SCRIBBLE],
  [THESIS_STATES.SCRIBBLE]: [THESIS_STATES.PROJECT_ASSIGNMENT, THESIS_STATES.INITIAL],
  [THESIS_STATES.PROJECT_ASSIGNMENT]: [THESIS_STATES.REQUIREMENTS_DONE, THESIS_STATES.SCRIBBLE],
  [THESIS_STATES.REQUIREMENTS_DONE]: [THESIS_STATES.ASSIGNMENT_DONE, THESIS_STATES.PROJECT_ASSIGNMENT],
  [THESIS_STATES.ASSIGNMENT_DONE]: [THESIS_STATES.THESIS_DONE, THESIS_STATES.REQUIREMENTS_DONE],
  [THESIS_STATES.THESIS_DONE]: [THESIS_STATES.EVALUATION_CONFIRMED, THESIS_STATES.ASSIGNMENT_DONE],
  [THESIS_STATES.EVALUATION_CONFIRMED]: [THESIS_STATES.THESIS_DONE]
};

// Role-based transition permissions
const ROLE_PERMISSIONS = {
  // Coach can change most states except specific expert and student transitions
  coach: {
    [THESIS_STATES.INITIAL]: [THESIS_STATES.SCRIBBLE], // Can change from Initial to Scribble
    [THESIS_STATES.SCRIBBLE]: [THESIS_STATES.PROJECT_ASSIGNMENT, THESIS_STATES.INITIAL], // Can change from Scribble to Project assignment
    [THESIS_STATES.PROJECT_ASSIGNMENT]: [THESIS_STATES.REQUIREMENTS_DONE, THESIS_STATES.SCRIBBLE], // Can change from Project assignment to Requirements done
    [THESIS_STATES.REQUIREMENTS_DONE]: [THESIS_STATES.PROJECT_ASSIGNMENT], // Cannot go to Assignment done (expert only)
    [THESIS_STATES.ASSIGNMENT_DONE]: [THESIS_STATES.REQUIREMENTS_DONE], // Cannot go to Thesis done (student only)
    [THESIS_STATES.THESIS_DONE]: [THESIS_STATES.ASSIGNMENT_DONE], // Cannot go to Evaluation confirmed (expert only)
    [THESIS_STATES.EVALUATION_CONFIRMED]: [THESIS_STATES.THESIS_DONE]
  },
  
  // Expert can only change specific transitions
  expert: {
    [THESIS_STATES.REQUIREMENTS_DONE]: [THESIS_STATES.ASSIGNMENT_DONE],
    [THESIS_STATES.THESIS_DONE]: [THESIS_STATES.EVALUATION_CONFIRMED]
  },
  
  // Student can only change one specific transition
  student: {
    [THESIS_STATES.ASSIGNMENT_DONE]: [THESIS_STATES.THESIS_DONE]
  },
  
  // Department lead has specific permissions for Initial to Scribble and Scribble to Project assignment
  department_lead: {
    [THESIS_STATES.INITIAL]: [THESIS_STATES.SCRIBBLE], // Only department_lead can change from Initial to Scribble
    [THESIS_STATES.SCRIBBLE]: [THESIS_STATES.PROJECT_ASSIGNMENT, THESIS_STATES.INITIAL], // Can change from Scribble to Project assignment
    [THESIS_STATES.PROJECT_ASSIGNMENT]: [THESIS_STATES.REQUIREMENTS_DONE, THESIS_STATES.SCRIBBLE],
    [THESIS_STATES.REQUIREMENTS_DONE]: [THESIS_STATES.ASSIGNMENT_DONE, THESIS_STATES.PROJECT_ASSIGNMENT],
    [THESIS_STATES.ASSIGNMENT_DONE]: [THESIS_STATES.THESIS_DONE, THESIS_STATES.REQUIREMENTS_DONE],
    [THESIS_STATES.THESIS_DONE]: [THESIS_STATES.EVALUATION_CONFIRMED, THESIS_STATES.ASSIGNMENT_DONE],
    [THESIS_STATES.EVALUATION_CONFIRMED]: [THESIS_STATES.THESIS_DONE]
  },
  
  // Admin can change any state (for administrative purposes)
  admin: STATE_TRANSITIONS
};

/**
 * Get available next states for a thesis based on current state and user role
 * @param {string} currentState - Current state of the thesis
 * @param {string} userRole - Role of the user (student, coach, expert, admin, department_lead)
 * @returns {Array} Array of available next states
 */
function getAvailableNextStates(currentState, userRole) {
  const rolePermissions = ROLE_PERMISSIONS[userRole];
  if (!rolePermissions) {
    return [];
  }
  
  return rolePermissions[currentState] || [];
}

/**
 * Check if a state transition is valid for a given role
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @param {string} userRole - Role of the user
 * @returns {boolean} True if transition is allowed
 */
function isTransitionAllowed(fromState, toState, userRole) {
  const availableStates = getAvailableNextStates(fromState, userRole);
  return availableStates.includes(toState);
}

/**
 * Get all possible states
 * @returns {Object} Object containing all thesis states
 */
function getAllStates() {
  return THESIS_STATES;
}

/**
 * Get state display information (badge color, etc.)
 * @param {string} state - The state to get display info for
 * @returns {Object} Display information
 */
function getStateDisplayInfo(state) {
  const stateInfo = {
    [THESIS_STATES.INITIAL]: { color: 'secondary', icon: 'bi-circle' },
    [THESIS_STATES.SCRIBBLE]: { color: 'info', icon: 'bi-pencil' },
    [THESIS_STATES.PROJECT_ASSIGNMENT]: { color: 'primary', icon: 'bi-clipboard' },
    [THESIS_STATES.REQUIREMENTS_DONE]: { color: 'warning', icon: 'bi-check-circle' },
    [THESIS_STATES.ASSIGNMENT_DONE]: { color: 'success', icon: 'bi-check-circle-fill' },
    [THESIS_STATES.THESIS_DONE]: { color: 'dark', icon: 'bi-file-earmark-check' },
    [THESIS_STATES.EVALUATION_CONFIRMED]: { color: 'success', icon: 'bi-award' }
  };
  
  return stateInfo[state] || { color: 'secondary', icon: 'bi-circle' };
}

/**
 * Get the order/priority of states for sorting
 * @param {string} state - The state to get order for
 * @returns {number} Order number (lower = earlier in process)
 */
function getStateOrder(state) {
  const stateOrder = {
    [THESIS_STATES.INITIAL]: 1,
    [THESIS_STATES.SCRIBBLE]: 2,
    [THESIS_STATES.PROJECT_ASSIGNMENT]: 3,
    [THESIS_STATES.REQUIREMENTS_DONE]: 4,
    [THESIS_STATES.ASSIGNMENT_DONE]: 5,
    [THESIS_STATES.THESIS_DONE]: 6,
    [THESIS_STATES.EVALUATION_CONFIRMED]: 7
  };
  
  return stateOrder[state] || 0;
}

module.exports = {
  THESIS_STATES,
  STATE_TRANSITIONS,
  ROLE_PERMISSIONS,
  getAvailableNextStates,
  isTransitionAllowed,
  getAllStates,
  getStateDisplayInfo,
  getStateOrder
};