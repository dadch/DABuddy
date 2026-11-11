// Schwarmzugriff: einzige Stelle, die Zugriff über `userHasThesisAccess`
// (src/utils/thesisAccess.js) hinaus gewährt. Alle anderen Endpunkte prüfen
// weiterhin nur `userHasThesisAccess`.
//
// `swarmAccess` ist nur dann true, wenn ALLE fünf Bedingungen erfüllt sind:
//   1. Schwarmmodus aktiv.
//   2. Aktive Session-Rolle ist `coach` oder `expert` (nie Student,
//      Transferprojekt-Dozent, Fachbereichsleitung oder Admin).
//   3. Die Arbeit liegt in einem Fachbereich, dem die Person zugeordnet ist
//      (`user_departments`).
//   4. Die Arbeit gehört zum aktuellen Diplomjahr (`years.is_current`).
//   5. Die Arbeit ist nicht gesperrt (`is_locked = false`).
//
// Verwendet nur für: Dashboard-Liste, eingeschränkte Detailansicht, Download
// der Dokumente des markierten Meilensteins, Lesen/Schreiben von Rückmeldungen.
const { Thesis, User, Department, Year } = require('../models');
const swarmMode = require('../config/swarmMode');
const { userHasThesisAccess } = require('./thesisAccess');

const SWARM_ROLES = ['coach', 'expert'];

// IDs der Fachbereiche, denen die Person zugeordnet ist.
async function userDepartmentIds(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id'],
    include: [{ model: Department, as: 'departments', attributes: ['id'], through: { attributes: [] } }],
  });
  return user ? user.departments.map((d) => d.id) : [];
}

async function swarmAccess(userId, userRole, thesisId) {
  if (!swarmMode.isActive()) return false;
  if (!SWARM_ROLES.includes(userRole)) return false;
  const thesis = await Thesis.findByPk(thesisId, {
    attributes: ['id', 'department_id', 'is_locked'],
    include: [{ model: Year, as: 'year', attributes: ['is_current'] }],
  });
  if (!thesis || thesis.is_locked !== false) return false;
  if (!thesis.year || thesis.year.is_current !== true) return false;
  const deptIds = await userDepartmentIds(userId);
  return deptIds.includes(thesis.department_id);
}

// Arbeiten, die die Person im Schwarmmodus zusätzlich sieht (Dashboard).
// Bereits zugewiesene Arbeiten werden nicht ausgefiltert; das macht der Aufrufer.
async function listSwarmTheses(userId, userRole, yearId, include = []) {
  if (!swarmMode.isActive()) return [];
  if (!SWARM_ROLES.includes(userRole)) return [];
  const current = await Year.findOne({ where: { is_current: true }, attributes: ['id'] });
  if (!current || Number(yearId) !== current.id) return [];
  const deptIds = await userDepartmentIds(userId);
  if (deptIds.length === 0) return [];
  return Thesis.findAll({
    where: { year_id: current.id, department_id: deptIds, is_locked: false },
    include,
  });
}

// Liegt die Arbeit im aktuellen Diplomjahr? Nutzt `thesis.year`, falls mit
// `is_current` geladen; sonst wird das Jahr nachgeladen (bei fehlendem
// `year_id` über die Arbeit). Ist das Jahr nicht bestimmbar, gilt die Arbeit
// als aktuell (fail-closed: Studierende werden dann abgewiesen).
async function isCurrentYearThesis(thesis) {
  if (thesis.year && typeof thesis.year.is_current === 'boolean') return thesis.year.is_current;
  let yearId = thesis.year_id;
  if (yearId == null && thesis.id != null) {
    const reloaded = await Thesis.findByPk(thesis.id, { attributes: ['id', 'year_id'] });
    yearId = reloaded ? reloaded.year_id : null;
  }
  const year = yearId != null ? await Year.findByPk(yearId, { attributes: ['is_current'] }) : null;
  return year ? year.is_current === true : true;
}

// Lesen der Rückmeldungen: regulärer oder Schwarmzugriff; Studierende nur,
// solange der Schwarmmodus für das aktuelle Jahr nicht aktiv ist.
async function canReadSwarmFeedbacks(userId, userRole, thesis) {
  if (!thesis) return false;
  const hasAccess = await userHasThesisAccess(userId, userRole, thesis.id)
    || await swarmAccess(userId, userRole, thesis.id);
  if (!hasAccess) return false;
  if (userRole === 'student' && swarmMode.isActive() && await isCurrentYearThesis(thesis)) return false;
  return true;
}

// Erfassen einer Rückmeldung: nie auf gesperrten Arbeiten.
// Dozent/Experte: Schwarm- oder regulärer Zugriff; FBL/Admin: regulärer Zugriff.
async function canWriteSwarmFeedback(userId, userRole, thesis) {
  if (!thesis || thesis.is_locked !== false) return false;
  if (SWARM_ROLES.includes(userRole)) {
    return await swarmAccess(userId, userRole, thesis.id)
      || await userHasThesisAccess(userId, userRole, thesis.id);
  }
  if (userRole === 'department_lead' || userRole === 'admin') {
    return userHasThesisAccess(userId, userRole, thesis.id);
  }
  return false;
}

// Download der Dokumente des markierten Meilensteins per Schwarmzugriff.
async function swarmDocumentAccess(userId, userRole, thesisMilestone) {
  if (!thesisMilestone || !thesisMilestone.swarm_feedback_enabled) return false;
  return swarmAccess(userId, userRole, thesisMilestone.thesis_id);
}

module.exports = {
  swarmAccess, listSwarmTheses, canReadSwarmFeedbacks, canWriteSwarmFeedback, swarmDocumentAccess,
};
