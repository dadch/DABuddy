# Schwarmmodus und Rückmeldung Projektskizze — Design

Datum: 2026-11-11 · Branch: `feature/schwarmmodus-projektskizze`

## Absicht und Hintergrund

Zu Beginn des Diplomjahrs präsentieren alle Studierenden ihre Projektskizze an
einem koordinierten Anlass (vor Ort oder online). Anwesend sind alle Dozierenden
und Experten des Fachbereichs. Zu diesem Zeitpunkt sind Dozierende und Experten
den Arbeiten noch nicht zugewiesen. Jede anwesende Fachperson soll zu jeder
präsentierten Arbeit eine kurze, nicht notenrelevante Rückmeldung erfassen
können: drei Kriterien als Freitext und eine Empfehlung (weiter / weiter mit
Auflage / stoppen). Die Rückmeldungen dienen den Studierenden später als
Orientierung, was bis zum nächsten Meilenstein nachzubessern ist oder ob eine
neue Arbeit gesucht werden muss.

Heute sehen Dozierende und Experten nur ihre zugewiesenen Arbeiten. Damit alle
Anwesenden alle Arbeiten ihres Fachbereichs finden, braucht es einen
systemweiten, vom Admin geschalteten **Schwarmmodus**.

Vorlage für Inhalt und Aufbau der Rückmeldung sind die Formulare
`beispiele/Evaluation_Projektskizze_DE.xlsx` und
`beispiele/Evaluation_Esquisse de projet_FR.xlsx`.

## Ziele

- Admin kann den Schwarmmodus systemweit ein- und ausschalten.
- Im Schwarmmodus sehen Dozierende und Experten im Dashboard zusätzlich alle
  nicht gesperrten Arbeiten des aktuellen Diplomjahrs aus ihren Fachbereichen.
- Auf dem dafür markierten Meilenstein („Projektskizze“, „Projektskizze VZ“, …)
  können Dozierende und Experten eine Rückmeldung gemäss Formular erfassen und
  die eigene später korrigieren.
- Alle Rückmeldungen einer Arbeit sind auf dem Meilenstein aufgelistet und
  einzeln als PDF abrufbar, in Deutsch und Französisch.
- Studierende sehen die Rückmeldungen zu ihrer Arbeit, sobald der Schwarmmodus
  deaktiviert ist.

## Nicht-Ziele

- Keine Punkte, keine Noten, kein Einfluss auf bestehende Bewertungen. Das
  bestehende benotete Bewertungsformular zur Projektskizze (`.tbform`) bleibt
  unverändert und unabhängig.
- Keine E-Mail-Benachrichtigungen rund um Rückmeldungen oder Schwarmmodus.
- Keine Mehrfach-Rückmeldungen derselben Person zur selben Arbeit.
- Kein Schwarmzugriff für Studierende, Transferprojekt-Dozenten oder auf
  Arbeiten anderer Fachbereiche.

## Anti-Ziele (was das Feature scheitern liesse)

- Studierende sehen Rückmeldungen, während der Schwarmmodus aktiv ist.
- Der Schwarmzugriff öffnet mehr als Lesen des Präsentationsdokuments und das
  Erfassen der Rückmeldung: kein Upload, keine Freigabe, keine Bewertung, kein
  Chat, keine anderen Meilensteine fremder Arbeiten.
- Rückmeldungen gehen verloren oder werden unlesbar, wenn der Meilenstein
  abgeschlossen oder der Schwarmmodus beendet ist.
- Die Entscheidung wird als verbindlich dargestellt. Sie ist eine Empfehlung
  und muss überall so beschriftet sein.

## Rahmenbedingungen

- Bestehender Stack: Node/Express 5, Sequelize/Postgres, EJS, Bootstrap mit
  dem DA-Buddy-Theme, i18next (de/fr), pdfkit für PDFs.
- `sequelize.sync()` legt nur fehlende Tabellen an. Neue Spalten und
  Enum-Werte brauchen ein idempotentes Skript unter `scripts/` (Muster:
  `scripts/add-assignment-feature.js`), das in `DEPLOYMENT.md` aufgeführt wird.
- Systemweite Einstellungen liegen im Datei-Store `src/config/appSettings.js`
  (Muster: `secretariat_email`).
- Rollen-Stellvertretung: Fachbereichsleitung handelt wie Dozent
  (`src/utils/roles.js`, `actsAs`).
- Zugriff auf eine Arbeit prüft heute `userHasThesisAccess` (apiController)
  bzw. `src/utils/thesisAccess.js`. Diese Prüfung bleibt die Grenze für alle
  bestehenden Aktionen und darf durch den Schwarmmodus **nicht** erweitert
  werden.
- Fachbereichszugehörigkeit von Dozierenden und Experten: `user_departments`
  (Assoziation `User.departments`). Experten sind dort ebenfalls zugeordnet.
- Aktuelles Diplomjahr: `years.is_current`.

## Entscheidungen (so, wie sie gefallen sind)

### Schwarmmodus

- Ein boolescher Wert `swarm_mode` im appSettings-Store. Nur Admin kann ihn
  setzen. Standard: aus.
- Admin-UI: eigene Seite „Schwarmmodus“ im Kebab-Menü des Admin-Dashboards
  (neben „Mail-Einstellungen“), mit Schalter, Status und einer kurzen
  Erklärung, was der Modus bewirkt.
- Solange der Modus aktiv ist, zeigen alle Dashboards (Admin, FBL, Dozent,
  Experte) einen gut sichtbaren Hinweisbalken „Schwarmmodus aktiv“. Studierende
  sehen keinen Hinweis (Entscheid Umsetzer: Studierende müssen den Modus nicht
  kennen; ein Hinweis „Rückmeldungen werden nach der Präsentation
  freigeschaltet“ auf dem Meilenstein genügt).
- Das Ein- und Ausschalten wird in der Serverkonsole protokolliert. Kein
  Eintrag im Änderungsprotokoll der Arbeiten (das ist pro Arbeit, der Modus ist
  global).

### Schwarmzugriff (neu, getrennt vom bestehenden Zugriff)

Eine neue Funktion `swarmAccess(userId, userRole, thesisId)` liefert `true`,
wenn **alle** Bedingungen erfüllt sind:

1. Schwarmmodus aktiv.
2. Rolle ist `coach` oder `expert`.
3. Die Arbeit liegt in einem Fachbereich, dem die Person zugeordnet ist.
4. Die Arbeit gehört zum aktuellen Diplomjahr.
5. Die Arbeit ist nicht gesperrt (`is_locked = false`).

Der Schwarmzugriff wird ausschliesslich an diesen Stellen verwendet:

- Dashboard-Liste (zusätzliche Karten).
- Eingeschränkte Detailansicht (siehe unten).
- Download der Dokumente des markierten Meilensteins.
- Lesen und Schreiben von Rückmeldungen.

Alle anderen Endpunkte prüfen weiterhin nur `userHasThesisAccess`.

### Dashboard im Schwarmmodus

- Dozierende und Experten sehen ihre eigenen Arbeiten wie bisher und darunter
  einen Abschnitt „Weitere Arbeiten im Fachbereich (Schwarmmodus)“ mit allen
  Arbeiten, auf die der Schwarmzugriff zutrifft und die nicht schon oben
  stehen. Karten tragen ein Badge „Schwarm“.
- Das Jahr folgt der bestehenden Jahresauswahl; der Abschnitt erscheint nur,
  wenn das gewählte Jahr das aktuelle ist.
- Die Karte verlinkt wie gewohnt auf `/dashboard/thesis/:id`.

### Eingeschränkte Detailansicht

`/dashboard/thesis/:id` rendert für Personen **ohne** regulären Zugriff, aber
**mit** Schwarmzugriff eine eigene, reduzierte Vorlage. Sie zeigt:

- Titel, Studierende, Fachbereich, Diplomjahr, Vertraulichkeits-Kennzeichen.
- Nur die Meilensteine mit gesetztem `swarm_feedback_enabled` (in der Regel
  einer): Bezeichnung, Termin, die aktuellen Dokumente (pro Upload-Kategorie,
  wie in der regulären Ansicht) mit Download-Link.
- Button „Rückmeldung Projektskizze“ (erfassen bzw. eigene bearbeiten).
- Liste der vorhandenen Rückmeldungen (siehe „Lesen“).

Nicht gezeigt: andere Meilensteine, Bewertungen, Freigaben, Feedbackformular,
Chat, Aufgabenstellung, Änderungsprotokoll.

### Markierung des Meilensteins

- Neues Feld `swarm_feedback_enabled` (Boolean, Default false) auf
  `milestones` (Vorlage) und `thesis_milestones` (Snapshot). Wird wie die
  übrigen Flags beim Anlegen kopiert und über `applyToExisting` nachgetragen.
- Admin setzt das Häkchen in der Meilenstein-Verwaltung („Rückmeldung
  Projektskizze (Schwarm)“). Keine Namensprüfung auf „Projektskizze“.
- Mehrere markierte Meilensteine pro Jahr sind technisch möglich; die UI
  behandelt jeden unabhängig.

### Rückmeldung — Datenmodell

Neue Tabelle `swarm_feedbacks`:

| Spalte | Typ | Bemerkung |
|---|---|---|
| id | integer PK | |
| thesis_milestone_id | FK → thesis_milestones, CASCADE | |
| thesis_id | FK → theses, CASCADE | denormalisiert für Listen |
| author_user_id | FK → users, SET NULL | |
| author_role | string(32) | Rolle zum Zeitpunkt der Erfassung |
| language | string(2) | UI-Sprache der Autorin beim Erfassen (`de`/`fr`) |
| criterion_1 | text | Ausgangslage |
| criterion_2 | text | Herausforderungen – Chancen |
| criterion_3 | text | Erwarteter Nutzen / Ziele |
| recommendation | enum `continue` / `continue_with_conditions` / `stop` | Pflicht |
| condition_what | text, null | nur bei Auflage/Stopp |
| condition_until | date, null | nur bei Auflage/Stopp |
| created_at, updated_at | timestamps | |

Eindeutig: (`thesis_milestone_id`, `author_user_id`). Die Tabelle legt
`sequelize.sync()` an; Spalten auf bestehenden Tabellen und neue Enum-Werte
kommen per Skript `scripts/add-swarm-feedback.js`.

Änderungsprotokoll (`thesis_logs.action`): neue Werte
`swarm_feedback_created`, `swarm_feedback_updated`; `user_id` = Autorin,
`thesis_milestone_id` = Meilenstein, Detail = Bezeichnung + Empfehlung.
Labels in allen Detail-Views, im Archiv und in beiden Sprachdateien ergänzen.

### Rückmeldung — Berechtigungen

- **Erfassen** (eigene Rückmeldung anlegen): Rolle `coach` oder `expert` mit
  Schwarmzugriff **oder** regulärem Zugriff auf die Arbeit; zusätzlich
  Fachbereichsleitung (Stellvertretung) und Admin mit regulärem Zugriff. Die
  Arbeit darf nicht gesperrt sein. Kein Erfassen durch Studierende oder
  Transferprojekt-Dozenten.
- **Bearbeiten**: nur die eigene Rückmeldung, jederzeit, solange die Arbeit
  nicht gesperrt ist. Admin darf jede Rückmeldung bearbeiten.
- **Löschen**: nur Admin (Entscheid Umsetzer, Korrekturfall).
- **Lesen**: alle Rollen mit regulärem oder Schwarmzugriff auf die Arbeit,
  unabhängig vom Status des Meilensteins. Ausnahme Studierende: nur bei
  deaktiviertem Schwarmmodus. Gesperrte Arbeiten: Studierende haben ohnehin
  keinen Zugriff; die übrigen Rollen sehen die Rückmeldungen weiterhin.
- Dozierende und Experten sehen die Rückmeldungen der Kolleginnen und Kollegen
  auch während des aktiven Schwarmmodus (Entscheid Umsetzer).

### Rückmeldung — Formular

Eigene Seite `/dashboard/thesis/:id/swarm-feedback/:tmId` (keine Modal, damit
auf Tablets und am Beamer genug Platz ist). Aufbau gemäss Excel-Vorlage:

1. Kopf: „Rückmeldung Projektskizzenpräsentation“, Student/in (automatisch),
   Dozierende/Experten (automatisch: Name und Rolle der Autorin), Datum.
2. Drei Kriterien, je mit der Beschreibung aus der Vorlage als Hilfetext und
   einem Freitextfeld:
   - Ausgangslage — verständliche Beschreibung des aktuellen Zustands, so dass
     ein Handlungsbedarf klar zu erkennen ist; sinnvolle Projektabgrenzung.
   - Herausforderungen – Chancen — faktenbasierte Begründung des
     Handlungsbedarfs; weshalb muss JETZT gehandelt werden und was passiert,
     wenn nichts gemacht wird?
   - Erwarteter Nutzen / Ziele — Nutzen für das Unternehmen quantitativ und
     qualitativ; betriebswirtschaftlicher Kontext und strategische Ziele;
     ausgewogene SMART-Ziele.
3. „Empfehlung“ (Radio, Pflicht): Weiter ohne Auflage / Weiter mit Auflage /
   Gestoppt – neue Diplomarbeit suchen. Hilfetext: „Die Empfehlung ist nicht
   verbindlich.“
4. Bei Auflage oder Stopp eingeblendet: „WAS ist nachzuliefern“ (Text) und
   „bis WANN“ (Datum).
5. Speichern führt zurück zur Detailansicht der Arbeit. Mindestens eines der
   drei Kriterien muss ausgefüllt sein (Entscheid Umsetzer); die Empfehlung
   ist Pflicht.

Alle Texte zweisprachig über i18next. Die Beschreibungstexte der Kriterien
sind Übersetzungsschlüssel und werden nicht pro Rückmeldung gespeichert.

### Rückmeldung — Lesen

Auf dem markierten Meilenstein (reguläre Detailansichten aller Rollen und die
eingeschränkte Ansicht) ein Abschnitt „Rückmeldungen Projektskizze“:

- Liste mit Autor/in, Rolle, Datum, Empfehlung als farbiges Badge, Link
  „PDF“, aufklappbar die drei Texte und ggf. Auflage.
- Sortierung nach Erfassungsdatum.
- Studierende sehen während des aktiven Schwarmmodus statt der Liste den
  Hinweis „Die Rückmeldungen werden nach der Präsentationsveranstaltung
  freigeschaltet.“
- Der Abschnitt ist unabhängig davon sichtbar, ob der Meilenstein
  freigegeben, abgeschlossen oder abgelaufen ist.

### PDF

- `src/utils/swarmFeedbackPdf.js` mit pdfkit, gleiche Kopfzeile/Logo/Schriften
  wie `evaluationPdf.js`. Eine A4-Seite, Aufbau wie die Excel-Vorlage: Titel,
  Student/in, Dozierende/Experten, Datum, Tabelle Kriterium/Beschreibung/Text,
  Empfehlung mit Kästchen (angekreuzt), WAS/bis WANN.
- Beschriftungen in der UI-Sprache der abrufenden Person; die Freitexte so,
  wie sie erfasst wurden.
- Endpunkt `GET /api/swarm-feedbacks/:id/pdf`, gleiche Leserechte wie die
  Liste. Dateiname `Rueckmeldung_Projektskizze_<Student>_<Autor>.pdf`.
- Archiv-Export (`thesisArchive.js`): alle Rückmeldungs-PDFs im Ordner des
  Meilensteins ablegen (Entscheid Umsetzer).

### API (Vorschlag, Umsetzer darf Pfade anpassen)

- `GET /api/admin/swarm-mode`, `PUT /api/admin/swarm-mode` (Admin).
- `GET /api/thesis-milestones/:id/swarm-feedbacks` — Liste (Leserechte).
- `GET /api/thesis-milestones/:id/swarm-feedbacks/mine` — eigene.
- `PUT /api/thesis-milestones/:id/swarm-feedbacks/mine` — anlegen/ändern.
- `DELETE /api/swarm-feedbacks/:id` — Admin.
- `GET /api/swarm-feedbacks/:id/pdf`.
- Meilenstein-Verwaltung: `swarm_feedback_enabled` in Create/Update inkl.
  `applyToExisting`.

## Dem Umsetzer überlassen

- Exakte Dateinamen, Routen- und Modulnamen innerhalb der bestehenden
  Struktur (`src/controllers`, `src/utils`, `views/<rolle>/`).
- Gestaltung der Badges, der Liste und des Hinweisbalkens innerhalb des
  DA-Buddy-Themes (keine Bootstrap-Standardoptik).
- Ob die eingeschränkte Ansicht eine eigene Vorlage oder die bestehende
  Detailvorlage mit Flag ist; eine eigene Vorlage wird empfohlen, damit nichts
  durchsickert.
- Aufbau der PDF-Seite im Detail, solange sie der Excel-Vorlage folgt.
- Reihenfolge der Umsetzung und Verifikation (keine Testsuite vorhanden;
  Verifikation per Handler-Tests mit Fake-Request wie bei den
  Benachrichtigungen und per laufender App).

## Offene Punkte für die Auftraggeberin / den Auftraggeber

Keine zum Zeitpunkt der Erstellung; Rückfragen aus der Umsetzer-Prüfung
werden hier ergänzt.
