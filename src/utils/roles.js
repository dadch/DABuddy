// Rollen-Stellvertretung.
//
// Fachbereichsleiter/innen dürfen auf Diplomarbeiten ihres Fachbereichs alle
// Aktionen auslösen, die auch der Dozent/die Dozentin der Arbeit auslösen darf
// (einfache Stellvertreter-Funktion). Alle Berechtigungsprüfungen, die eine
// Meilenstein-Rolle (responsible_role, evaluator_role, approver_role …) mit der
// Session-Rolle vergleichen, laufen über diese Funktion statt über ===.
//
// Der Fachbereichs-Bezug (ist die Person FBL des Fachbereichs dieser Arbeit?)
// wird separat über userHasThesisAccess geprüft.

const DEPUTY_FOR = {
  department_lead: new Set(['coach']),
};

// Darf `userRole` als `requiredRole` handeln?
function actsAs(userRole, requiredRole) {
  if (!userRole || !requiredRole) return false;
  if (userRole === requiredRole) return true;
  const deputies = DEPUTY_FOR[userRole];
  return !!(deputies && deputies.has(requiredRole));
}

module.exports = { actsAs, DEPUTY_FOR };
