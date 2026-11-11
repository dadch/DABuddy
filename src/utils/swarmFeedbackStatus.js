// Aggregiert die Empfehlungen der Rückmeldungen Projektskizze eines
// Meilensteins zu einem Ampelstatus für die FBL-Übersicht.
//   'none'       keine Rückmeldung vorhanden (grau)
//   'stop'       mindestens eine Rückmeldung "Gestoppt" (rot; übersteuert Auflage)
//   'conditions' mindestens eine Rückmeldung "Weiter mit Auflage" (orange)
//   'ok'         alle anderen Fälle (grün)
function swarmFeedbackStatus(feedbacks) {
  const list = Array.isArray(feedbacks) ? feedbacks : [];
  if (list.length === 0) return 'none';
  const recs = list.map((f) => (f && f.recommendation) || '');
  if (recs.includes('stop')) return 'stop';
  if (recs.includes('continue_with_conditions')) return 'conditions';
  return 'ok';
}

module.exports = { swarmFeedbackStatus };
