// Notenberechnung nach der in der Schweiz üblichen Formel:
//   Note = erreichte_Punkte / maximale_Punkte * 5 + 1
// Punktzahl je Kriterium 0-5, Gewichtung als Multiplikator.
// Alle Noten werden auf Zehntel gerundet.

const roundToTenth = (x) => Math.round(x * 10) / 10;

// Berechnet die Note einer Gruppe aus ihren Kriterien.
// criteria: [{ score (0-5|null), weight }]
// Nur Kriterien mit gesetzter Punktzahl fliessen ein. Ohne bewertete Kriterien -> null.
function computeGroupGrade(criteria) {
  let achieved = 0;
  let max = 0;
  let scoredCount = 0;
  for (const c of criteria) {
    if (c.score === null || c.score === undefined) continue;
    const w = Number(c.weight) || 0;
    achieved += Number(c.score) * w;
    max += 5 * w;
    scoredCount += 1;
  }
  if (scoredCount === 0 || max === 0) return null;
  return roundToTenth((achieved / max) * 5 + 1);
}

// Gesamtnote: gewichteter Durchschnitt der Gruppennoten (Gruppengewicht).
// groups: [{ grade (number|null), weight }]
function computeOverallGrade(groups) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const g of groups) {
    if (g.grade === null || g.grade === undefined) continue;
    const w = Number(g.weight) || 0;
    weightedSum += Number(g.grade) * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return null;
  return roundToTenth(weightedSum / weightTotal);
}

module.exports = { roundToTenth, computeGroupGrade, computeOverallGrade };
