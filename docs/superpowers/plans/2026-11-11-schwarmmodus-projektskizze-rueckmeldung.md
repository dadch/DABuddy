# Schwarmmodus und Rückmeldung Projektskizze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-schaltbarer Schwarmmodus, in dem Dozierende und Experten alle Arbeiten ihres Fachbereichs sehen und auf dem markierten Meilenstein eine nicht benotete Rückmeldung (3 Kriterien, Empfehlung) erfassen; Rückmeldungen werden aufgelistet, als PDF abrufbar und für Studierende nach Ende des Modus sichtbar.

**Architecture:** Ein getrennter Zugriffspfad `swarmAccess` (neues Modul) ergänzt die bestehende Prüfung `userHasThesisAccess`, ohne sie zu verändern; nur Dashboard, eine neue eingeschränkte Detailvorlage, der Dokument-Download des markierten Meilensteins und die Rückmeldungs-Endpunkte nutzen ihn. Rückmeldungen liegen in einer neuen Tabelle `swarm_feedbacks` (eine pro Autor und Meilenstein); der Modus selbst ist ein Schlüssel im bestehenden appSettings-Datei-Store. PDF über pdfkit nach dem Muster von `evaluationPdf.js`.

**Tech Stack:** Node 22, Express 5, Sequelize 6 / Postgres 16, EJS, Bootstrap mit DA-Buddy-Theme, i18next (de/fr), pdfkit. Tests mit dem eingebauten `node:test` gegen die lokale Entwicklungs-DB (eigene Fixtures, werden wieder gelöscht).

**Spec:** `docs/superpowers/specs/2026-11-11-schwarmmodus-projektskizze-rueckmeldung-design.md`

## Global Constraints

- Massgebend für Berechtigungen ist immer `req.session.userRole` (aktive Rolle), nie die Rollenliste der Person.
- `userHasThesisAccess` (apiController.js und `src/utils/thesisAccess.js`) wird **nicht** verändert.
- Schwarmzugriff nur für `coach` und `expert`; Bedingungen: Modus aktiv, Fachbereich der Arbeit ∈ `User.departments`, `thesis.year.is_current = true`, `thesis.is_locked = false`. Vertrauliche Arbeiten (`is_confidential`) werden nicht ausgenommen.
- Studierende sehen Rückmeldungen nur, wenn Modus aus **oder** die Arbeit nicht zum aktuellen Diplomjahr gehört.
- Die Empfehlung heisst in jeder Beschriftung „Empfehlung“ / « Recommandation » und trägt den Hinweis „nicht verbindlich“.
- Jeder sichtbare Text zweisprachig über i18next (`locales/de/translation.json`, `locales/fr/translation.json`), neuer Block `"swarm"` plus Ergänzungen in `milestonesAdmin`, `thesisDetail.actionLabels`, `dashboard.actions`.
- Neue Spalten und Enum-Werte ausschliesslich über das idempotente Skript `scripts/add-swarm-feedback.js`; das Skript wird in `DEPLOYMENT.md` bei den Update-Skripten aufgeführt.
- UI im DA-Buddy-Theme (bestehende Klassen `page-header`, `milestone-card`, Badges wie in den Detail-Views); keine neuen CSS-Frameworks.
- Commit-Messages deutsch, mit `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` als letzter Zeile.

## Review Focus

1. Dozent mit Rolle `field_project_coach` aktiv (Mehrrollen): darf im Schwarmmodus **nichts** sehen; in Rolle `coach` alles. → Test in Task 4.
2. Studierende rufen die Liste direkt über die API ab, während der Modus aktiv ist: 403, keine Daten. → Test in Task 7.
3. Dokument-Download eines **nicht** markierten Meilensteins einer fremden Arbeit im Schwarmmodus: 403, obwohl der markierte Meilenstein derselben Arbeit erlaubt ist. → Test in Task 6.
4. Empfehlung „Auflage“ oder „Stopp“ ohne „WAS/bis WANN“ wird gespeichert (Felder sind optional); Empfehlung „Weiter ohne Auflage“ **löscht** gesetzte WAS/WANN-Werte serverseitig. → Test in Task 7.
5. Modus wird deaktiviert, Arbeit gehört zum Vorjahr und Modus wieder aktiviert: Studierende der Vorjahresarbeit sehen ihre Rückmeldungen weiterhin. → Test in Task 7 (Lese-Regel).

---

## Dateistruktur

**Neu**
- `src/config/swarmMode.js` — Zustand des Modus (appSettings-Schlüssel `swarm_mode`).
- `src/utils/swarmAccess.js` — Schwarmzugriff, Schwarm-Arbeitenliste, Lese-/Schreibregeln für Rückmeldungen.
- `src/models/SwarmFeedback.js` — Tabelle `swarm_feedbacks`.
- `src/utils/swarmFeedbackPdf.js` — PDF einer Rückmeldung.
- `views/admin/swarm-mode.ejs` — Admin-Seite mit Schalter.
- `views/shared/thesis-swarm.ejs` — eingeschränkte Detailansicht.
- `views/shared/swarm-feedback-form.ejs` — Formularseite.
- `views/partials/swarm-feedback-list.ejs` — Liste der Rückmeldungen (in allen Detailansichten und in der eingeschränkten Ansicht eingebunden).
- `scripts/add-swarm-feedback.js` — Migration (Spalten + Enum).
- `test/helpers/fixtures.js`, `test/*.test.js` — Tests.

**Geändert**
- `app.js` — `res.locals.swarmModeActive`.
- `src/controllers/apiController.js` — Modus-API, Rückmeldungs-API, PDF-Endpunkt, Meilenstein-Flag, Download-Gate.
- `src/controllers/dashboardController.js` — Dashboard-Zusatzliste, eingeschränkte Ansicht, Formularseite, Admin-Seite.
- `src/routes/api.js`, `src/routes/dashboard.js`.
- `src/models/Milestone.js`, `src/models/ThesisMilestone.js`, `src/models/ThesisLog.js`, `src/models/index.js`.
- `src/utils/thesisArchive.js` — Labels + Rückmeldungs-PDFs im Archiv.
- `views/partials/header.ejs` — Hinweisbalken.
- `views/admin/dashboard.ejs` — Menüeintrag.
- `views/admin/milestones-management.ejs` — Checkbox.
- `views/coach/dashboard.ejs`, `views/expert/dashboard.ejs` — Zusatzabschnitt.
- `views/{admin,coach,department_lead,expert,field_project_coach,student}/thesis-detail.ejs` — Rückmeldungs-Abschnitt, Log-Labels.
- `locales/de/translation.json`, `locales/fr/translation.json`.
- `package.json` (`"test": "node --test test/*.test.js"`), `README.md`, `DEPLOYMENT.md`.

---

### Task 1: Testgerüst und Schwarmmodus-Zustand mit Admin-API

**Files:**
- Create: `src/config/swarmMode.js`, `test/helpers/fixtures.js`, `test/swarmMode.test.js`
- Modify: `package.json:10`, `src/controllers/apiController.js` (bei `getSecretariatEmail`, ca. Zeile 2500; Export-Block ca. Zeile 3500), `src/routes/api.js:203` (bei den Admin-Mail-Routen), `app.js:56-66`

**Interfaces:**
- Produces: `swarmMode.isActive(): boolean`, `swarmMode.setActive(active: boolean): boolean` (liefert den neuen Zustand; schreibt `console.log('[swarmMode] aktiviert|deaktiviert')`).
- Produces: `GET /api/admin/swarm-mode → { success: true, active: boolean }`, `PUT /api/admin/swarm-mode` Body `{ active: boolean }` → gleiches Format. Beide `requireRole(['admin'])`.
- Produces: `res.locals.swarmModeActive: boolean` in jeder Antwort (gesetzt in der bestehenden res.locals-Middleware in `app.js`).
- Produces: Fixture-Helfer `createSwarmFixture()` (siehe Schritt 1).

- [ ] **Step 1: Fixture-Helfer schreiben**

`test/helpers/fixtures.js` exportiert `createSwarmFixture()` → Promise mit:
`{ year, dept, deptOther, coachIn, coachOut, expertIn, fpc, student, studentOther, thesis, thesisOther, thesisLocked, tmSwarm, tmPlain, docSwarm, docPlain, cleanup }`.
- `year` = `Year.findOne({ where: { is_current: true } })` (nicht anlegen, nicht ändern).
- `dept`, `deptOther` = neue `Department` mit Namen `Test-Schwarm-<Date.now()>`.
- Users mit `username` Präfix `swarmtest_<Date.now()>_…`, `password` beliebig, `language: 'de'`: `coachIn` (role coach, Mitglied `dept` via `coachIn.setDepartments([dept])`), `coachOut` (coach, Mitglied `deptOther`), `expertIn` (expert, `dept`), `fpc` (field_project_coach, `dept`), `student`, `studentOther`.
- `thesis` (dept, year, `title: 'Schwarm-Test'`, students `[student]`, keine coaches/experts), `thesisOther` (deptOther, year, students `[studentOther]`), `thesisLocked` (dept, year, `is_locked: true`).
- `tmSwarm` = `ThesisMilestone.create({ thesis_id: thesis.id, label: 'Projektskizze', due_at: <in 30 Tagen>, released: true, responsible_role: 'student', swarm_feedback_enabled: true })`, `tmPlain` gleich mit `label: 'Pflichtenheft', swarm_feedback_enabled: false`.
- `docSwarm`, `docPlain` = `ThesisMilestoneDocument.create({ thesis_milestone_id, file_name: 'x.pdf', file_path: '/nonexistent/x.pdf', mime_type: 'application/pdf', file_size: 1, version: 1, is_current: true, uploaded_by: student.id })`.
- `cleanup()` löscht in umgekehrter Reihenfolge (Theses mit CASCADE, Users, Departments) und ist idempotent.
- Zusätzlich exportieren: `mkRes()` (Fake-Response mit `code`, `body`, `status()`, `json()`, `setHeader()`, `send()`, `sendFile()`, `redirect()`), `mkReq({ userId, userRole, params, body, query })`.

Hinweis: `swarm_feedback_enabled` existiert erst nach Task 2; bis dahin das Feld in der Fixture weglassen (Task 2 ergänzt es).

- [ ] **Step 2: Testskript in package.json**

`"test": "node --test test/*.test.js"`.

- [ ] **Step 3: Failing test**

`test/swarmMode.test.js`:
```js
const test = require('node:test'); const assert = require('node:assert/strict');
const swarmMode = require('../src/config/swarmMode');
test('setActive/isActive', () => {
  const before = swarmMode.isActive();
  assert.equal(swarmMode.setActive(true), true);  assert.equal(swarmMode.isActive(), true);
  assert.equal(swarmMode.setActive(false), false); assert.equal(swarmMode.isActive(), false);
  swarmMode.setActive(before);
});
test('PUT /api/admin/swarm-mode schaltet und GET liest', async () => { /* setSwarmMode mit mkReq({userRole:'admin', body:{active:true}}), dann getSwarmMode; assert body.active === true; zurücksetzen */ });
```

- [ ] **Step 4: Run** `npm test` → FAIL (Modul fehlt).

- [ ] **Step 5: `src/config/swarmMode.js` implementieren**

Nutzt `appSettings.get('swarm_mode') === true` bzw. `appSettings.set('swarm_mode', !!active)`.

- [ ] **Step 6: Controller + Route + res.locals**

In `apiController.js` `getSwarmMode`, `setSwarmMode` (Muster `getSecretariatEmail`/`setSecretariatEmail`: Admin-Check, `req.body.active` muss boolean sein, sonst 400). Export ergänzen. In `api.js`: `router.get('/admin/swarm-mode', requireRole(['admin']), getSwarmMode); router.put(... setSwarmMode)`. In `app.js` res.locals-Middleware: `res.locals.swarmModeActive = require('./src/config/swarmMode').isActive();`.

- [ ] **Step 7: Run** `npm test` → PASS.

- [ ] **Step 8: Commit** `Schwarmmodus: Zustand, Admin-API und Testgerüst`

---

### Task 2: Meilenstein-Flag `swarm_feedback_enabled` und Migrationsskript

**Files:**
- Modify: `src/models/Milestone.js:125-129` (nach `feedback_form_enabled`), `src/models/ThesisMilestone.js:181-185`, `src/controllers/apiController.js:172-200` (`createThesisMilestoneFromTemplate`), `:1378-1419` (`parseMilestoneConfig`), `:1609-1626` (applyToExisting-Update), `views/admin/milestones-management.ejs:125,290,492,731,771,820`, `locales/*/translation.json` (`milestonesAdmin`), `DEPLOYMENT.md:216-219`, `test/helpers/fixtures.js`
- Create: `scripts/add-swarm-feedback.js`, `test/milestoneFlag.test.js`

**Interfaces:**
- Produces: Spalte `swarm_feedback_enabled BOOLEAN NOT NULL DEFAULT false` auf `milestones` und `thesis_milestones`; Enum-Werte `swarm_feedback_created`, `swarm_feedback_updated`, `swarm_feedback_deleted` auf `enum_thesis_logs_action` (Model-Enum wird in Task 3 ergänzt).
- Produces: `parseMilestoneConfig(body).swarm_feedback_enabled` (Default false).

- [ ] **Step 1: Migrationsskript** `scripts/add-swarm-feedback.js` nach Muster `scripts/add-assignment-feature.js`: zwei `ALTER TABLE … ADD COLUMN IF NOT EXISTS "swarm_feedback_enabled" BOOLEAN NOT NULL DEFAULT false`, drei `ALTER TYPE "enum_thesis_logs_action" ADD VALUE IF NOT EXISTS …`. Kopfkommentar mit Aufrufbeispiel lokal und Docker.

- [ ] **Step 2: Skript lokal ausführen** `node scripts/add-swarm-feedback.js` → vier `ok`-Zeilen.

- [ ] **Step 3: Failing test** `test/milestoneFlag.test.js`:
```js
test('parseMilestoneConfig übernimmt swarm_feedback_enabled', () => {
  assert.equal(parseMilestoneConfig({}).swarm_feedback_enabled, false);
  assert.equal(parseMilestoneConfig({ swarm_feedback_enabled: true }).swarm_feedback_enabled, true);
});
test('createThesisMilestoneFromTemplate kopiert das Flag', () => {
  assert.equal(createThesisMilestoneFromTemplate(1, { swarm_feedback_enabled: true, label: 'x' }).swarm_feedback_enabled, true);
});
```
Beide Funktionen dafür im Export von `apiController.js` ergänzen.

- [ ] **Step 4: Run** → FAIL.

- [ ] **Step 5: Models, Parser, Snapshot-Kopie, applyToExisting** ergänzen (Flag analog `feedback_form_enabled` an allen vier Stellen). Fixture: `swarm_feedback_enabled` in `tmSwarm`/`tmPlain` setzen.

- [ ] **Step 6: Admin-UI** `milestones-management.ejs`: Checkbox `name="swarm_feedback_enabled"` mit ids `addSwarmFeedbackEnabled`/`editSwarmFeedbackEnabled` direkt unter der Feedbackformular-Checkbox (Zeilen 290/492), Badge in der Liste bei Zeile 125 (`<span class="badge bg-info-subtle text-dark">…swarmFeedback</span>`), JS-Zeilen analog 731/771/820. Locale-Keys `milestonesAdmin.swarmFeedbackEnabled` = „Rückmeldung Projektskizze (Schwarm)“ / « Retour esquisse de projet (essaim) », `milestonesAdmin.swarmFeedbackEnabledHint` = „Dozierende und Experten des Fachbereichs erfassen im Schwarmmodus eine nicht benotete Rückmeldung.“ / FR sinngemäss.

- [ ] **Step 7: Run** `npm test` → PASS. App starten, Meilenstein-Verwaltung öffnen, Flag an einer Vorlage setzen mit „auf bestehende anwenden“, per `psql`/Sequelize prüfen, dass `thesis_milestones.swarm_feedback_enabled` gesetzt ist.

- [ ] **Step 8: DEPLOYMENT.md** Skript in den Codeblock bei Zeile 216 aufnehmen.

- [ ] **Step 9: Commit** `Meilenstein-Flag swarm_feedback_enabled und Migration`

---

### Task 3: Modell `SwarmFeedback` und Log-Aktionen

**Files:**
- Create: `src/models/SwarmFeedback.js`, `test/swarmFeedbackModel.test.js`
- Modify: `src/models/index.js` (require bei Zeile 21, Assoziationen nach Zeile 159, Export), `src/models/ThesisLog.js:50-52`, `src/utils/thesisArchive.js:37-54`, alle sechs `views/*/thesis-detail.ejs:5` (ACTION_LABELS), `locales/*/translation.json` (`thesisDetail.actionLabels`)

**Interfaces:**
- Produces: Model `SwarmFeedback` (Tabelle `swarm_feedbacks`, `timestamps: true`, `underscored` global aktiv → `created_at/updated_at`), Felder exakt gemäss Spec-Tabelle; `recommendation: ENUM('continue','continue_with_conditions','stop')`; `condition_until: DATEONLY`; Unique-Index `(thesis_milestone_id, author_user_id)`.
- Produces: Assoziationen `ThesisMilestone.hasMany(SwarmFeedback, { as: 'swarmFeedbacks', foreignKey: 'thesis_milestone_id', onDelete: 'CASCADE' })`, `SwarmFeedback.belongsTo(ThesisMilestone, { as: 'thesisMilestone' })`, `SwarmFeedback.belongsTo(Thesis, { as: 'thesis' })`, `SwarmFeedback.belongsTo(User, { as: 'author', foreignKey: 'author_user_id' })`.
- Produces: `ThesisLog.action` Enum um `swarm_feedback_created`, `swarm_feedback_updated`, `swarm_feedback_deleted`.
- Produces: Labels `thesisDetail.actionLabels.swarmFeedbackCreated|Updated|Deleted` = „Rückmeldung Projektskizze erfasst | geändert | gelöscht“ / « Retour esquisse de projet saisi | modifié | supprimé ».

- [ ] **Step 1: Failing test**
```js
test('SwarmFeedback: eine pro Autor und Meilenstein', async () => {
  const f = await createSwarmFixture();
  try {
    await SwarmFeedback.create({ thesis_milestone_id: f.tmSwarm.id, thesis_id: f.thesis.id, author_user_id: f.coachIn.id, author_role: 'coach', language: 'de', criterion_1: 'ok', recommendation: 'continue' });
    await assert.rejects(SwarmFeedback.create({ /* gleicher Autor + Meilenstein */ }), /unique|Unique/i);
    assert.equal((await f.tmSwarm.getSwarmFeedbacks()).length, 1);
  } finally { await f.cleanup(); }
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Model + Assoziationen + Export**; einmal `node -e "require('./src/models').sequelize.sync()"` ausführen, damit die Tabelle entsteht.
- [ ] **Step 4: Enum im Model, Archiv-Labels, ACTION_LABELS in sechs Views, Locale-Keys.** Prüfen: `diff views/coach/thesis-detail.ejs views/department_lead/thesis-detail.ejs` bleibt leer.
- [ ] **Step 5: Run** → PASS; `node -e "require('ejs').compile(...)"` für die sechs Views.
- [ ] **Step 6: Commit** `Modell SwarmFeedback und Log-Aktionen`

---

### Task 4: Schwarmzugriff `src/utils/swarmAccess.js`

**Files:**
- Create: `src/utils/swarmAccess.js`, `test/swarmAccess.test.js`

**Interfaces:**
- Produces:
  - `swarmAccess(userId, userRole, thesisId): Promise<boolean>` — fünf Spec-Bedingungen.
  - `listSwarmTheses(userId, userRole, yearId, include): Promise<Thesis[]>` — leer, wenn Modus aus, Rolle nicht coach/expert oder `yearId` nicht das aktuelle Jahr; sonst `Thesis.findAll({ where: { year_id, department_id: <ids aus User.departments>, is_locked: false }, include })`.
  - `canReadSwarmFeedbacks(userId, userRole, thesis): Promise<boolean>` — `thesis` geladen mit `year`; `true` wenn (`userHasThesisAccess` aus `src/utils/thesisAccess.js` **oder** `swarmAccess`) **und** nicht (`userRole === 'student' && swarmMode.isActive() && thesis.year.is_current`).
  - `canWriteSwarmFeedback(userId, userRole, thesis): Promise<boolean>` — `thesis.is_locked === false` und: (`userRole ∈ {coach, expert}` und (`swarmAccess` oder `userHasThesisAccess`)) oder (`userRole ∈ {department_lead, admin}` und `userHasThesisAccess`).
  - `swarmDocumentAccess(userId, userRole, thesisMilestone): Promise<boolean>` — `thesisMilestone.swarm_feedback_enabled && swarmAccess(userId, userRole, thesisMilestone.thesis_id)`.

- [ ] **Step 1: Failing tests** (jeder Test aktiviert den Modus mit `swarmMode.setActive(true)` und stellt den Vorzustand in `finally` wieder her):
```js
test('coachIn hat Schwarmzugriff, coachOut nicht, fpc nicht, student nicht');
test('kein Zugriff bei Modus aus');
test('kein Zugriff auf gesperrte Arbeit (thesisLocked)');
test('listSwarmTheses liefert thesis, nicht thesisOther und nicht thesisLocked; leer für fpc');
test('canReadSwarmFeedbacks: student false bei Modus an, true bei Modus aus; coachIn true bei Modus an');
test('canWriteSwarmFeedback: coachIn true (Modus an), coachIn false (Modus aus, nicht zugewiesen), student false, admin true');
test('swarmDocumentAccess: tmSwarm true, tmPlain false für coachIn');
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implementieren.** `swarmAccess` lädt `Thesis.findByPk(thesisId, { attributes: ['id','department_id','is_locked'], include: [{ model: Year, as: 'year', attributes: ['is_current'] }] })` und `User.findByPk(userId, { include: [{ model: Department, as: 'departments', attributes: ['id'] }] })`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Schwarmzugriff: swarmAccess, Arbeitenliste, Lese-/Schreibregeln`

---

### Task 5: Admin-Seite, Hinweisbalken und Dashboard-Zusatzliste

**Files:**
- Create: `views/admin/swarm-mode.ejs`
- Modify: `src/controllers/dashboardController.js` (`showDashboard` 24-163, neu `showSwarmMode` nach `showMailSettings`, Export), `src/routes/dashboard.js:12`, `views/admin/dashboard.ejs:20`, `views/partials/header.ejs:31`, `views/coach/dashboard.ejs:11-71`, `views/expert/dashboard.ejs:11-70`, `locales/*/translation.json` (`swarm`, `dashboard.actions.swarmMode`)

**Interfaces:**
- Consumes: `listSwarmTheses`, `swarmMode.isActive`, `GET/PUT /api/admin/swarm-mode`, `res.locals.swarmModeActive`.
- Produces: `GET /dashboard/admin/swarm` (admin) rendert `admin/swarm-mode`; `dashboardData.swarmTheses: Thesis[]` für coach/expert (sonst `[]`).

- [ ] **Step 1: Admin-Seite.** Aufbau wie `mail-settings.ejs` (Breadcrumb, `page-header`, eine Card): Statuszeile (Badge grün „aktiv“ / grau „inaktiv“), Schalter (Bootstrap `form-switch`), Erklärtext `swarm.mode.description` (drei Sätze: wer was sieht, dass Studierende Rückmeldungen erst nach Deaktivierung sehen, dass der Modus systemweit gilt). JS: `fetch('/api/admin/swarm-mode')` beim Laden, `PUT` beim Umschalten, Erfolg/Fehler-Alert.
- [ ] **Step 2: Route + Controller + Menüeintrag** (`<li><a class="dropdown-item" href="/dashboard/admin/swarm"><i class="bi bi-people-fill"></i> …swarm.mode.title</a></li>` direkt nach Mail-Einstellungen).
- [ ] **Step 3: Hinweisbalken** in `header.ejs` vor den Flash-Alerts: `<% if (swarmModeActive && user && ['admin','department_lead','coach','expert'].includes(user.role)) { %><div class="alert alert-warning d-flex align-items-center gap-2 mb-3" role="status"><i class="bi bi-people-fill"></i> <%= t('swarm.banner') %></div><% } %>`. Text: „Schwarmmodus aktiv: Dozierende und Experten sehen alle Arbeiten ihres Fachbereichs und können Rückmeldungen zur Projektskizze erfassen.“
- [ ] **Step 4: Dashboard-Daten.** In `showDashboard` nach der Sortierung: `const ownIds = new Set(theses.map(t => t.id)); dashboardData.swarmTheses = (await listSwarmTheses(userId, userRole, selectedYearId, baseInclude)).filter(t => !ownIds.has(t.id))`, gleich sortiert (Sortierfunktion in eine lokale Funktion `sortTheses(list)` auslagern und zweimal aufrufen).
- [ ] **Step 5: Views.** `coach/dashboard.ejs`: nach dem bestehenden `<% } %>` (Zeile 71) Abschnitt `<% if (swarmTheses && swarmTheses.length) { %><h2 class="h4 mt-4"><i class="bi bi-people-fill"></i> <%= t('swarm.dashboard.sectionTitle') %></h2>` + gleiche Karten mit zusätzlichem `<span class="badge bg-warning text-dark ms-2"><%= t('swarm.dashboard.badge') %></span>` im Header; der Leerzustand oben („keine Arbeiten“) darf nicht erscheinen, wenn `swarmTheses` nicht leer ist. `expert/dashboard.ejs`: zweite Tabelle mit gleichem Aufbau unter Überschrift, Badge in der Titelzelle. Kartenmarkup in ein Partial `views/partials/thesis-card.ejs` ziehen, damit es nicht doppelt steht (Parameter `thesis`, `swarm`).
- [ ] **Step 6: Verifikation (manuell, App läuft).** Admin: Schalter an → Balken erscheint im Admin-Dashboard; mit Test-Login eines Dozenten (Fixture-User aus Task 1 lässt sich mit bekanntem Passwort anlegen) Dashboard aufrufen → Abschnitt mit Badge; Schalter aus → Abschnitt verschwindet. Expertenansicht ebenso. Screenshot nicht nötig, `curl -b jar` auf `/dashboard` und `grep` auf `swarm.dashboard.sectionTitle`-Text genügt.
- [ ] **Step 7: Commit** `Schwarmmodus: Admin-Seite, Hinweisbalken, Dashboard-Zusatzliste`

---

### Task 6: Eingeschränkte Detailansicht und Dokument-Download

**Files:**
- Create: `views/shared/thesis-swarm.ejs`, `test/swarmDetail.test.js`
- Modify: `src/controllers/dashboardController.js:199-210` (`showThesisDetail`), `src/controllers/apiController.js` (`downloadThesisMilestoneDocument`, ca. Zeile 2110), `locales/*/translation.json` (`swarm.restricted.*`)

**Interfaces:**
- Consumes: `swarmAccess`, `swarmDocumentAccess`, `canWriteSwarmFeedback`.
- Produces: `/dashboard/thesis/:id` rendert `shared/thesis-swarm` mit `{ user, thesis, milestones (nur swarm_feedback_enabled, mit documents+uploader+uploadCategories), canWrite: boolean, swarmFeedbacksByMilestone: {} (Task 9 füllt), messages, formatFileSize, fmtDateTime }`, wenn `hasAccess` false und `swarmAccess` true.
- Produces: Download-Gate: `access || await swarmDocumentAccess(userId, userRole, doc.thesisMilestone)`; dafür `attributes` des Includes um `swarm_feedback_enabled` erweitern.

- [ ] **Step 1: Failing test**
```js
test('Download: coachIn im Schwarmmodus darf docSwarm (sendFile aufgerufen), nicht docPlain (403); coachOut 403 bei beiden');
test('showThesisDetail: coachIn ohne Zuweisung rendert shared/thesis-swarm; student der Arbeit rendert student/thesis-detail');
```
(`res.render` im Fake-Response aufzeichnen: `render(view, data)` → `r.view = view; r.data = data`.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Download-Gate** erweitern (nur diese eine Zeile plus Include-Attribut).
- [ ] **Step 4: Controller-Zweig.** In `showThesisDetail`: wenn `!hasAccess` → `if (await swarmAccess(userId, userRole, thesis.id)) { … render shared/thesis-swarm … return; }` sonst wie bisher Redirect. Meilensteine laden: `ThesisMilestone.findAll({ where: { thesis_id, swarm_feedback_enabled: true }, include: [documents(+uploader, +uploadCategory), uploadCategories], order: due_at })`.
- [ ] **Step 5: Vorlage** `shared/thesis-swarm.ejs`: Header-Include, Breadcrumb zurück zum Dashboard, `page-header` mit Titel, Badge „Schwarm“ und Vertraulichkeits-Badge (`thesis.is_confidential` → bestehender Key `confidentiality.*` nachschlagen), Stammdaten (Studierende, Fachbereich, Jahr), Hinweis `swarm.restricted.hint` („Eingeschränkte Ansicht im Schwarmmodus: nur Präsentationsdokument und Rückmeldungen.“). Pro Meilenstein eine `milestone-card`: Label (`milestoneLabel(m)`), Termin, Dokumentliste (Markup von `coach/thesis-detail.ejs:195-262` übernehmen, ohne Upload-Buttons und ohne Admin-Löschen), Button `swarm.feedback.button` → `/dashboard/thesis/<id>/swarm-feedback/<tm.id>` (nur wenn `canWrite`), Platzhalter `<%- include('../partials/swarm-feedback-list', { … }) %>` (Partial kommt in Task 9; bis dahin leeres Partial anlegen).
- [ ] **Step 6: Run** → PASS; EJS-Compile der neuen Vorlage; manuell: Dozent ohne Zuweisung öffnet Karte → eingeschränkte Ansicht, Dokument-Link funktioniert, kein Chat-Link.
- [ ] **Step 7: Commit** `Schwarmmodus: eingeschränkte Detailansicht und Dokument-Download`

---

### Task 7: Rückmeldungs-API

**Files:**
- Modify: `src/controllers/apiController.js` (neuer Abschnitt `// ---------- Rückmeldung Projektskizze (Schwarm) ----------` vor `// ---------- Sperrung einer Diplomarbeit`), `src/routes/api.js` (nach Zeile 181), `test/swarmFeedbackApi.test.js` (Create)

**Interfaces:**
- Consumes: `canReadSwarmFeedbacks`, `canWriteSwarmFeedback`, `SwarmFeedback`, `writeThesisLog`.
- Produces:
  - `GET /api/thesis-milestones/:id/swarm-feedbacks` → `{ success, feedbacks: [{ id, author: { id, firstname, name }, author_role, language, criterion_1..3, recommendation, condition_what, condition_until, created_at, updated_at, isMine }] }` sortiert `created_at ASC`. 403 wenn `canReadSwarmFeedbacks` false; 404 wenn Meilenstein fehlt oder `swarm_feedback_enabled` false.
  - `GET /api/thesis-milestones/:id/swarm-feedbacks/mine` → `{ success, feedback: <obj|null>, canWrite: boolean }`.
  - `PUT /api/thesis-milestones/:id/swarm-feedbacks/mine` Body `{ criterion_1, criterion_2, criterion_3, recommendation, condition_what, condition_until }` → upsert für `author_user_id = session.userId`; `author_role = session.userRole`; `language = req.language || 'de'` (i18next setzt `req.language`; Fallback `res.locals.lang`). Validierung: `recommendation` ∈ Enum sonst 400 `swarm.feedback.validation.recommendationRequired`; mindestens ein Kriterium nicht leer sonst 400 `…criterionRequired`; bei `recommendation === 'continue'` werden `condition_what/condition_until` auf `null` gesetzt; `condition_until` muss `YYYY-MM-DD` oder leer sein. Log `swarm_feedback_created` bzw. `_updated`, Detail `${tm.label}: ${recommendation}`. Antwort `{ success, feedback, created: boolean }`.
  - `PUT /api/swarm-feedbacks/:id` (Admin) — gleiche Validierung, bearbeitet fremde Rückmeldung; Log `swarm_feedback_updated` mit `user_id = admin`.
  - `DELETE /api/swarm-feedbacks/:id` (Admin) → Log `swarm_feedback_deleted`, Detail `${tm.label}: <Autorname>`.
  - Fehlertexte wie im übrigen Controller deutsch; die Validierungs-Keys werden als `message` gesendet und im Frontend über `t()` aufgelöst (Frontend-Keys in Task 8).

- [ ] **Step 1: Failing tests** (Modus an, Fixture):
```js
test('coachIn legt an (created true), ändert (created false), Liste hat 1 Eintrag mit isMine');
test('recommendation continue löscht condition_what/until');
test('fehlende recommendation → 400; drei leere Kriterien → 400');
test('student: Liste 403 bei Modus an, 200 bei Modus aus; Vorjahresarbeit (year_id auf nicht-aktuelles Jahr setzen) 200 trotz Modus an');
test('coachOut PUT → 403; fpc PUT → 403; expertIn PUT → 200');
test('tmPlain: GET → 404');
test('Log-Einträge swarm_feedback_created/updated vorhanden');
test('DELETE als coach 403 (Route requireRole), als admin löscht + Log');
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implementieren** (Handler `listSwarmFeedbacks`, `getMySwarmFeedback`, `upsertMySwarmFeedback`, `adminUpdateSwarmFeedback`, `adminDeleteSwarmFeedback`; gemeinsame `validateSwarmFeedbackBody(body) → { ok, errorKey, values }`). Routen: drei unter `thesis-milestones`, zwei unter `swarm-feedbacks` mit `requireRole(['admin'])`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Rückmeldung Projektskizze: API`

---

### Task 8: Formularseite

**Files:**
- Create: `views/shared/swarm-feedback-form.ejs`
- Modify: `src/controllers/dashboardController.js` (neu `showSwarmFeedbackForm`), `src/routes/dashboard.js:7` (danach `router.get('/dashboard/thesis/:id/swarm-feedback/:tmId', requireAuth, …)`), `locales/*/translation.json` (`swarm.feedback.*`), `test/swarmDetail.test.js` (ergänzen)

**Interfaces:**
- Consumes: `canWriteSwarmFeedback`, `GET …/swarm-feedbacks/mine`, `PUT …/swarm-feedbacks/mine`.
- Produces: Seite rendert `shared/swarm-feedback-form` mit `{ user, thesis, milestone, existing: <feedback|null> }`; 403-Redirect mit Flash, wenn `canWriteSwarmFeedback` false oder Meilenstein nicht `swarm_feedback_enabled` oder nicht zu `thesis` gehört.

- [ ] **Step 1: Locale-Keys** (DE-Texte aus der Excel-Vorlage, FR aus der französischen Vorlage):
  - `swarm.feedback.title` „Rückmeldung Projektskizzenpräsentation“ / « Retour sur la présentation de l'esquisse de projet »
  - `swarm.feedback.button` „Rückmeldung Projektskizze“, `swarm.feedback.buttonEdit` „Eigene Rückmeldung bearbeiten“
  - `swarm.feedback.student` „Student/in“, `swarm.feedback.author` „Dozierende / Experten“, `swarm.feedback.date` „Datum“
  - `swarm.feedback.criteria.c1.title` „Ausgangslage“, `.desc` „Verständliche Beschreibung des aktuellen Zustands bzw. der aktuellen Situation, so dass ein Handlungsbedarf klar zu erkennen ist. Sinnvolle Projektabgrenzung.“
  - `…c2.title` „Herausforderungen – Chancen“, `.desc` „Faktenbasierte Begründung des Handlungsbedarfs. Weshalb muss JETZT gehandelt werden und was passiert, wenn nichts gemacht wird?“
  - `…c3.title` „Erwarteter Nutzen / Ziele“, `.desc` „Nutzen für das Unternehmen quantitativ und qualitativ. Der betriebswirtschaftliche Kontext und der Einbezug strategischer Ziele werden aufgeführt. Ausgewogene SMART-Ziele.“
  - `swarm.feedback.recommendation.label` „Empfehlung“, `.hint` „Die Empfehlung ist nicht verbindlich.“, `.continue` „Weiter ohne Auflage“, `.continue_with_conditions` „Weiter mit Auflage“, `.stop` „Gestoppt – neue Diplomarbeit suchen“
  - `swarm.feedback.conditionTitle` „Bei Auflage oder Stopp“, `.conditionWhat` „WAS ist nachzuliefern“, `.conditionUntil` „bis WANN“
  - `swarm.feedback.save` „Speichern“, `.cancel` „Abbrechen“, `.saved` „Rückmeldung gespeichert.“
  - `swarm.feedback.validation.recommendationRequired` „Bitte eine Empfehlung wählen.“, `.criterionRequired` „Bitte mindestens ein Kriterium ausfüllen.“
  - FR jeweils aus der FR-Vorlage (« Situation initiale », « Défis - Opportunités », « Avantages attendus / Objectifs », « Continuer sans condition », « Continuer avec condition », « Arrêté - chercher nouveau sujet », « QUOI faire », « jusqu'à QUAND »).
- [ ] **Step 2: Failing test** `showSwarmFeedbackForm: coachIn (Modus an) → render shared/swarm-feedback-form; student → redirect; tmPlain → redirect`.
- [ ] **Step 3: Controller + Route.**
- [ ] **Step 4: Vorlage.** Breadcrumb Dashboard › Arbeit › Rückmeldung. Kopfblock (Student/in aus `thesis.students`, Autor = `user.fullName` + Rolle, Datum heute). Drei Blöcke: Titel fett, Beschreibung als `form-text`, `<textarea rows="4" name="criterion_N">`. Radiogruppe `recommendation` mit drei Optionen und Hinweis. Bedingter Block (`condition_what` Textarea, `condition_until` `<input type="date">`), per JS ein-/ausgeblendet, wenn `recommendation !== 'continue'`. Buttons Speichern/Abbrechen. JS: Vorbelegung aus `existing`; Submit → `fetch(PUT …/mine, JSON)`; bei `success` → `window.location = '/dashboard/thesis/<id>'`; bei 400 → Fehlermeldung über `t(message)`-Map (die Keys als JSON-Objekt in die Seite rendern, wie `L` in `mail-settings.ejs`).
- [ ] **Step 5: Run** → PASS; manuell im Browser: Formular ausfüllen, speichern, zurück auf der Arbeit; erneut öffnen → vorbelegt.
- [ ] **Step 6: Commit** `Rückmeldung Projektskizze: Formularseite`

---

### Task 9: Rückmeldungsliste auf dem Meilenstein (alle Ansichten)

**Files:**
- Create/ersetzen: `views/partials/swarm-feedback-list.ejs`
- Modify: `src/controllers/dashboardController.js` (`showThesisDetail`: Rückmeldungen laden; eingeschränkte Ansicht ebenso), alle sechs `views/*/thesis-detail.ejs` (Einfügepunkt direkt vor `<!-- Feedbackformular -->`, Zeile ≈ 372), `views/shared/thesis-swarm.ejs`, `locales/*/translation.json` (`swarm.feedback.listTitle`, `.none`, `.studentHidden`, `.pdf`, `.byRole`)

**Interfaces:**
- Consumes: `canReadSwarmFeedbacks`, `SwarmFeedback` mit `author`.
- Produces: Render-Daten `swarmFeedbacksByMilestone: { [tmId]: SwarmFeedback[] }`, `swarmFeedbackCanRead: boolean`, `swarmFeedbackCanWrite: boolean`; Partial-Parameter `{ m, feedbacks, canRead, canWrite, thesisId, user }`.

- [ ] **Step 1: Controller.** In `showThesisDetail` nach dem Laden der Meilensteine: wenn irgendein `m.swarm_feedback_enabled`: `canRead = await canReadSwarmFeedbacks(...)`, `canWrite = await canWriteSwarmFeedback(...)`, `SwarmFeedback.findAll({ where: { thesis_id }, include: [{ model: User, as: 'author', attributes: ['id','firstname','name'] }], order: [['created_at','ASC']] })` → nach `thesis_milestone_id` gruppieren. Gleiches im Zweig der eingeschränkten Ansicht.
- [ ] **Step 2: Partial.** `<% if (m.swarm_feedback_enabled) { %>` Abschnitt `border rounded p-2 mt-3`: Kopfzeile mit Titel `swarm.feedback.listTitle` („Rückmeldungen Projektskizze“) und rechts Button (`canWrite`: eigene vorhanden → `buttonEdit`, sonst `button`) als Link auf die Formularseite. Inhalt: wenn `!canRead` → `<small class="text-muted">…studentHidden</small>` („Die Rückmeldungen werden nach der Präsentationsveranstaltung freigeschaltet.“); sonst wenn leer → `…none`; sonst Liste: pro Eintrag Zeile mit Autor „Name, Vorname“ · Rolle (ROLE_LABELS) · Datum (`fmtDateTime(f.created_at)`) · Badge Empfehlung (`continue` → `bg-success`, `continue_with_conditions` → `bg-warning text-dark`, `stop` → `bg-danger`; Text `swarm.feedback.recommendation.<wert>`) · Link `swarm.feedback.pdf` auf `/api/swarm-feedbacks/<id>/pdf` (`target="_blank"`) · Bootstrap-Collapse mit den drei Kriterien (Titel fett, Text mit `white-space: pre-wrap`) und ggf. WAS/bis WANN. Für Admin zusätzlich Button „Löschen“ (`fetch DELETE`, danach `location.reload()`; kein `confirm()`-Dialog, stattdessen zweistufiger Button „Löschen → Wirklich löschen?“).
- [ ] **Step 3: Einbinden** in den sechs Detail-Views (eine Zeile `<%- include('../partials/swarm-feedback-list', { m, feedbacks: (swarmFeedbacksByMilestone||{})[m.id] || [], canRead: swarmFeedbackCanRead, canWrite: swarmFeedbackCanWrite, thesisId: thesis.id, user, fmtDateTime, ROLE_LABELS }) %>`) und in `thesis-swarm.ejs`. `minimalCard`-Zweig (gesperrte, nicht abgelaufene Meilensteine in der Studentenansicht) unverändert lassen; der Abschnitt gehört in den Normalzweig.
- [ ] **Step 4: Verifikation.** `diff views/coach/thesis-detail.ejs views/department_lead/thesis-detail.ejs` leer; EJS-Compile aller Views; manuell: Student bei Modus an sieht Hinweis, bei Modus aus die Liste; Dozent sieht Liste und Button; Admin sieht Löschen.
- [ ] **Step 5: Commit** `Rückmeldung Projektskizze: Liste auf dem Meilenstein`

---

### Task 10: PDF und Archiv

**Files:**
- Create: `src/utils/swarmFeedbackPdf.js`, `test/swarmFeedbackPdf.test.js`
- Modify: `src/controllers/apiController.js` (neu `downloadSwarmFeedbackPdf`), `src/routes/api.js` (`router.get('/swarm-feedbacks/:id/pdf', downloadSwarmFeedbackPdf)`), `src/utils/thesisArchive.js:252-290`

**Interfaces:**
- Consumes: `drawLogo`-Muster aus `evaluationPdf.js` (Logo-Code kopieren oder `drawLogo` dort exportieren; Export bevorzugt), `canReadSwarmFeedbacks`.
- Produces: `streamSwarmFeedbackPdf(res, { feedback, thesis, milestone, language }): void` — pipe auf `res`, A4 hoch, Rand 50; Beschriftungen in `language` (`'de'|'fr'`), Freitexte unverändert. Aufbau: Logo rechts oben; Titel; Stammdaten (Student/in, Dozierende/Experten = `author.firstname author.name (Rolle)`, Datum `created_at` lokal `de-CH`/`fr-CH`, Fachbereich, Meilenstein); Tabelle mit drei Zeilen (linke Spalte Titel + Beschreibung klein grau, rechte Spalte Text); Block „Empfehlung (nicht verbindlich)“ mit drei Zeilen und `☒`/`☐` (Zeichen über `Helvetica` nicht verfügbar → kleine Rechtecke mit `doc.rect`, gefüllt bei Auswahl); Block WAS/bis WANN nur bei Auflage/Stopp; Fusszeile `Rückmeldung Projektskizze – <Meilenstein>`. Mehrseitig erlaubt (`bufferPages: true`), wenn Texte lang sind.
- Produces: `GET /api/swarm-feedbacks/:id/pdf` → `Content-Type: application/pdf`, `Content-Disposition: inline; filename="Rueckmeldung_Projektskizze_<Student>_<Autor>.pdf"` (Namen über die `sanitize`-Logik aus `thesisArchive.js`, exportieren oder lokal kopieren), Sprache = `res.locals.lang`.
- Produces: Archiv legt pro Rückmeldung `<msFolder>/Rueckmeldung_Projektskizze_<Autor>.pdf` ab (Sprache `thesis.language` wie bei den übrigen Archiv-PDFs, Fallback `'de'`).

- [ ] **Step 1: Failing test**
```js
test('streamSwarmFeedbackPdf liefert PDF-Buffer', async () => { /* PassThrough-Sink wie thesisArchive.feedbackPdfBuffer; assert buf.slice(0,4).toString() === '%PDF'; für language de und fr */ });
test('GET pdf: student 403 bei Modus an; coachIn 200 mit Content-Type application/pdf');
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: PDF-Modul, Endpunkt, Route.**
- [ ] **Step 4: Archiv:** nach dem Feedbackformular-Block in der Meilensteinschleife: `if (tm.swarm_feedback_enabled) { for (const sf of await SwarmFeedback.findAll({ where: { thesis_milestone_id: tm.id }, include: author })) evalEntries.push({ name, buf: await swarmPdfBuffer(...) }) }`.
- [ ] **Step 5: Run** → PASS. Manuell: PDF im Browser öffnen (DE und FR, Umschalten über die Sprachwahl), Layout mit Excel-Vorlage vergleichen; Archiv einer Testarbeit erzeugen und ZIP-Inhalt prüfen (`unzip -l`).
- [ ] **Step 6: Commit** `Rückmeldung Projektskizze: PDF und Archiv`

---

### Task 11: Dokumentation, Gesamtprüfung

**Files:**
- Modify: `README.md` (neuer Abschnitt „Schwarmmodus und Rückmeldung Projektskizze“ vor „Mail-Konfiguration“), `DEPLOYMENT.md` (Skript bereits in Task 2), `docs/superpowers/specs/…design.md` (nur falls Entscheidungen abwichen: nachtragen)

- [ ] **Step 1: README-Abschnitt** (≈15 Zeilen): Zweck, Admin-Schalter, wer was sieht, Markierung in der Meilensteinvorlage, Sichtbarkeit für Studierende, PDF, Migrationsskript.
- [ ] **Step 2: Gesamtlauf** `npm test` → alle PASS; `node --check` auf allen geänderten JS-Dateien; EJS-Compile aller Views; App-Start ohne Fehler; Hinweisbalken an/aus.
- [ ] **Step 3: Durchlauf des Szenarios** mit zwei Browser-Sitzungen (Admin + Fixture-Dozent): Modus an → Dozent sieht fremde Arbeit → öffnet eingeschränkte Ansicht → lädt Dokument → erfasst Rückmeldung mit Auflage → PDF öffnet → Modus aus → Dozent sieht Arbeit nicht mehr → Student (Fixture) sieht Rückmeldung → Admin sieht Log-Einträge.
- [ ] **Step 4: Commit** `Schwarmmodus: Dokumentation`

---

## Self-Review

**Spec coverage.** Modus + Admin-UI + Balken (T1, T5); Schwarmzugriff mit fünf Bedingungen inkl. Mehrrollen-Regel (T4); Dashboard-Zusatzliste nur im aktuellen Jahr (T4/T5); eingeschränkte Ansicht mit Dokumenten (T6); Meilenstein-Flag ohne Namensprüfung + applyToExisting (T2); Datenmodell + Unique + Log-Werte + Labels (T3); Berechtigungen Erfassen/Bearbeiten/Löschen/Lesen inkl. Studenten-Regel nur aktuelles Jahr (T4, T7); Formular mit allen Feldern, Hilfetexten, Pflichtregeln, Bedingungsblock (T8); Liste mit Badge, PDF-Link, Studenten-Hinweis, statusunabhängig (T9); PDF zweisprachig + Archiv (T10); Doku + Migration in DEPLOYMENT (T2, T11). Vertrauliche Arbeiten nicht ausgenommen: keine zusätzliche Bedingung in T4 (bewusst).

**Step scan.** Jede Codeaufgabe nennt Datei, Signatur und Werte; Bodies nur, wo die Spec Texte fixiert (Locale-Texte, PDF-Aufbau). Keine „TBD“-Zeilen.

**Type consistency.** `swarmAccess`, `listSwarmTheses`, `canReadSwarmFeedbacks`, `canWriteSwarmFeedback`, `swarmDocumentAccess` (T4) werden in T5–T10 mit denselben Namen und Parametern verwendet; `swarmFeedbacksByMilestone`/`swarmFeedbackCanRead`/`swarmFeedbackCanWrite` (T9) stimmen mit T6-Platzhalter überein (T6 übergibt `swarmFeedbacksByMilestone: {}`, T9 ersetzt). Enum-Werte `continue|continue_with_conditions|stop` durchgehend.

**Review Focus.** Alle fünf Punkte haben einen Test im genannten Task.

**Proportion.** Plan ≈ 2× Spec-Länge, überwiegend Entscheidungen und Testfälle, keine Funktionskörper.
