# Export/Import von Bewertungsformularen (.tbform) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bewertungsformulare können auf `/dashboard/admin/evaluation-forms` als `.tbform`-Datei (JSON) exportiert und aus einer solchen Datei als neues Formular importiert werden.

**Architecture:** Zwei neue admin-only API-Endpunkte im bestehenden `evaluationController` (Export liefert JSON-Download mit `Content-Disposition`, Import validiert und legt Formular+Gruppen+Kriterien in einer Transaktion an). Frontend: Export-Button pro Zeile, Import-Button im Seitenkopf mit verstecktem File-Input + `FileReader` (kein Multer).

**Tech Stack:** Express 5, Sequelize 6 (PostgreSQL), EJS-View mit Vanilla-JS (bestehender Stil der Seite).

**Spec:** `docs/superpowers/specs/2026-08-03-evaluation-form-export-import-design.md`

## Global Constraints

- Dateiendung: `.tbform`; Dateiname = DE-Titel, bereinigt mit `replace(/[^a-zA-Z0-9_-]+/g, '_')` (gleiches Muster wie beim Blank-PDF).
- Format-Kennung: `format: "thesisbuddy-evaluation-form"`, `version: 1`.
- Keine Datenbank-IDs in der Exportdatei.
- Import legt **immer ein neues Formular an**; DE-Titelkollision → « (Import)», dann « (Import 2)», …
- Alle Fehlermeldungen deutsch, Antwortstil wie bestehende Endpunkte (`{ success, message }`).
- Beide Routen admin-only (`requireRole(['admin'])` wie die übrigen `/evaluation-forms`-Routen).
- Projekt hat keine Test-Infrastruktur (`npm test` ist Platzhalter) → Verifikation via `node --check` und manuell im Browser (Task 4).

---

### Task 1: Export-Endpunkt

**Files:**
- Modify: `src/controllers/evaluationController.js` (Konstanten nach `normalizeLevels` ≈ Zeile 35 einfügen; `exportForm` direkt nach `printBlankEvaluationForm` ≈ Zeile 119; Export in `module.exports` ≈ Zeile 1211)
- Modify: `src/routes/api.js` (neue Route nach Zeile 223, vor `GET /evaluation-forms/:id`)

**Interfaces:**
- Consumes: bestehende Modelle `EvaluationForm`/`EvaluationGroup`/`EvaluationCriterion`, Helper `normalizeLevels` (alle bereits im Controller vorhanden).
- Produces: `GET /api/evaluation-forms/:id/export` → Download `<safeName>.tbform`; Konstanten `TBFORM_FORMAT`, `TBFORM_VERSION` (verwendet Task 2).

- [ ] **Step 1: Konstanten und `exportForm` im Controller ergänzen**

Direkt nach der `normalizeLevels`-Funktion einfügen:

```js
// Dateiformat für Export/Import von Formularvorlagen (.tbform)
const TBFORM_FORMAT = 'thesisbuddy-evaluation-form';
const TBFORM_VERSION = 1;
```

Direkt nach `printBlankEvaluationForm` (vor `createForm`) einfügen:

```js
// GET /api/evaluation-forms/:id/export — Formularvorlage als .tbform-Datei
// (JSON ohne Datenbank-IDs), z.B. zum Übertragen auf ein anderes System.
const exportForm = async (req, res) => {
  try {
    const form = await EvaluationForm.findByPk(req.params.id, {
      include: [{
        model: EvaluationGroup, as: 'groups',
        include: [{ model: EvaluationCriterion, as: 'criteria' }]
      }],
      order: [
        [{ model: EvaluationGroup, as: 'groups' }, 'position', 'ASC'],
        [{ model: EvaluationGroup, as: 'groups' }, { model: EvaluationCriterion, as: 'criteria' }, 'position', 'ASC'],
      ]
    });
    if (!form) return res.status(404).json({ success: false, message: 'Formular nicht gefunden' });

    const payload = {
      format: TBFORM_FORMAT,
      version: TBFORM_VERSION,
      exported_at: new Date().toISOString(),
      form: {
        title_de: form.title_de,
        title_fr: form.title_fr,
        groups: (form.groups || []).map(g => ({
          name_de: g.name_de,
          name_fr: g.name_fr,
          weight: Number(g.weight),
          position: g.position,
          criteria: (g.criteria || []).map(c => ({
            label_de: c.label_de,
            label_fr: c.label_fr,
            weight: Number(c.weight),
            position: c.position,
            level_descriptions_de: normalizeLevels(c.level_descriptions_de),
            level_descriptions_fr: normalizeLevels(c.level_descriptions_fr),
          })),
        })),
      },
    };

    const safeName = (form.title_de || 'Formular').replace(/[^a-zA-Z0-9_-]+/g, '_');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.tbform"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error('Error exporting evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};
```

In `module.exports` die Zeile

```js
  listForms, getForm, createForm, updateForm, deleteForm, printBlankEvaluationForm,
```

ersetzen durch:

```js
  listForms, getForm, createForm, updateForm, deleteForm, printBlankEvaluationForm,
  exportForm,
```

(Nur `exportForm` — `importForm` existiert erst ab Task 2; ein Export eines noch nicht definierten Bezeichners würde beim Laden des Moduls eine ReferenceError werfen.)

- [ ] **Step 2: Route registrieren**

In `src/routes/api.js` nach der Zeile

```js
router.get('/evaluation-forms/:id/blank.pdf', requireRole(['admin']), evalCtrl.printBlankEvaluationForm);
```

einfügen (muss **vor** `GET /evaluation-forms/:id` stehen):

```js
router.get('/evaluation-forms/:id/export', requireRole(['admin']), evalCtrl.exportForm);
```

- [ ] **Step 3: Syntax prüfen**

Run: `node --check src/controllers/evaluationController.js && node --check src/routes/api.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/controllers/evaluationController.js src/routes/api.js
git commit -m "Export von Bewertungsformularen als .tbform-Datei"
```

---

### Task 2: Import-Endpunkt

**Files:**
- Modify: `src/controllers/evaluationController.js` (`importForm` direkt nach `exportForm`; Export in `module.exports`, falls in Task 1 noch nicht geschehen)
- Modify: `src/routes/api.js` (neue Route nach der Export-Route aus Task 1)

**Interfaces:**
- Consumes: `TBFORM_FORMAT`, `TBFORM_VERSION`, `normalizeLevels`, `sequelize` (alle im Controller vorhanden), `express` (in `api.js` bereits importiert: `const express = require('express');`).
- Produces: `POST /api/evaluation-forms/import` — Body = Dateiinhalt (JSON), Antwort `{ success: true, form }` mit dem neu angelegten Formular (inkl. `form.id`) bzw. HTTP 400 `{ success: false, message }`.

- [ ] **Step 1: `importForm` im Controller ergänzen**

Direkt nach `exportForm` einfügen:

```js
// POST /api/evaluation-forms/import — Formularvorlage aus .tbform-Datei anlegen.
// Legt immer ein neues Formular an; bei DE-Titelkollision wird « (Import)»
// bzw. « (Import 2)», … angehängt.
const importForm = async (req, res) => {
  try {
    const data = req.body;
    if (!data || data.format !== TBFORM_FORMAT) {
      return res.status(400).json({ success: false, message: 'Datei ist kein gültiges ThesisBuddy-Formular (.tbform)' });
    }
    if (data.version !== TBFORM_VERSION) {
      return res.status(400).json({ success: false, message: `Nicht unterstützte Formatversion: ${data.version}` });
    }
    const src = data.form;
    if (!src || typeof src.title_de !== 'string' || !src.title_de.trim()
             || typeof src.title_fr !== 'string' || !src.title_fr.trim()) {
      return res.status(400).json({ success: false, message: 'Titel (DE und FR) fehlen in der Datei' });
    }
    const groups = Array.isArray(src.groups) ? src.groups : [];
    for (const g of groups) {
      if (!g || typeof g.name_de !== 'string' || !g.name_de.trim()
             || typeof g.name_fr !== 'string' || !g.name_fr.trim()) {
        return res.status(400).json({ success: false, message: 'Ungültige Gruppe in der Datei (Name DE/FR erforderlich)' });
      }
      for (const c of (Array.isArray(g.criteria) ? g.criteria : [])) {
        if (!c || typeof c.label_de !== 'string' || !c.label_de.trim()
               || typeof c.label_fr !== 'string' || !c.label_fr.trim()) {
          return res.status(400).json({ success: false, message: 'Ungültiges Kriterium in der Datei (Label DE/FR erforderlich)' });
        }
      }
    }

    // Titelkollision auflösen: « (Import)», « (Import 2)», …
    let title_de = src.title_de.trim();
    if (await EvaluationForm.findOne({ where: { title_de } })) {
      let n = 1;
      let candidate = `${title_de} (Import)`;
      while (await EvaluationForm.findOne({ where: { title_de: candidate } })) {
        n += 1;
        candidate = `${title_de} (Import ${n})`;
      }
      title_de = candidate;
    }

    const num = (v, dflt) => (Number.isFinite(Number(v)) ? Number(v) : dflt);

    const form = await sequelize.transaction(async (t) => {
      const created = await EvaluationForm.create(
        { title_de, title_fr: src.title_fr.trim() }, { transaction: t });
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const group = await EvaluationGroup.create({
          evaluation_form_id: created.id,
          name_de: g.name_de.trim(),
          name_fr: g.name_fr.trim(),
          weight: num(g.weight, 1),
          position: num(g.position, gi),
        }, { transaction: t });
        const criteria = Array.isArray(g.criteria) ? g.criteria : [];
        for (let ci = 0; ci < criteria.length; ci++) {
          const c = criteria[ci];
          await EvaluationCriterion.create({
            evaluation_group_id: group.id,
            label_de: c.label_de,
            label_fr: c.label_fr,
            weight: num(c.weight, 1),
            position: num(c.position, ci),
            level_descriptions_de: normalizeLevels(c.level_descriptions_de),
            level_descriptions_fr: normalizeLevels(c.level_descriptions_fr),
          }, { transaction: t });
        }
      }
      return created;
    });

    res.json({ success: true, form });
  } catch (e) {
    console.error('Error importing evaluation form:', e);
    res.status(500).json({ success: false, message: 'Interner Serverfehler' });
  }
};
```

Sicherstellen, dass `module.exports` jetzt `exportForm, importForm,` enthält (siehe Task 1 Step 1).

- [ ] **Step 2: Route registrieren**

In `src/routes/api.js` direkt nach der Export-Route aus Task 1 einfügen. Das globale
`express.json()` in `app.js` hat ein 100-kB-Limit — grosse Formulare (viele Kriterien
× 12 Stufenbeschreibungen) können das überschreiten, daher ein eigenes Limit für
diese Route:

```js
router.post('/evaluation-forms/import', requireRole(['admin']), express.json({ limit: '2mb' }), evalCtrl.importForm);
```

- [ ] **Step 3: Syntax prüfen**

Run: `node --check src/controllers/evaluationController.js && node --check src/routes/api.js && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/controllers/evaluationController.js src/routes/api.js
git commit -m "Import von Bewertungsformularen aus .tbform-Datei"
```

---

### Task 3: Frontend — Export- und Import-Buttons

**Files:**
- Modify: `views/admin/evaluation-forms.ejs`

**Interfaces:**
- Consumes: `GET /api/evaluation-forms/:id/export` (Task 1), `POST /api/evaluation-forms/import` → `{ success, form }` bzw. `{ success: false, message }` (Task 2).
- Produces: —

- [ ] **Step 1: Import-Button und File-Input im Seitenkopf**

Im `page-actions`-Div (Zeilen 10–14) vor dem «Formular erstellen»-Button ergänzen:

```html
    <div class="page-actions">
        <button class="btn btn-outline-primary" onclick="document.getElementById('importFile').click()">
            <i class="bi bi-upload"></i> Formular importieren
        </button>
        <input type="file" id="importFile" accept=".tbform,application/json" hidden>
        <button class="btn btn-primary" onclick="openCreateForm()">
            <i class="bi bi-plus"></i> Formular erstellen
        </button>
    </div>
```

- [ ] **Step 2: Export-Button pro Zeile**

In `loadForms()` in der Aktionen-Spalte nach den beiden Leerformular-PDF-Links,
vor dem Lösch-Button, einfügen:

```js
                                    <a href="/api/evaluation-forms/${f.id}/export" class="btn btn-outline-secondary btn-sm" title="Formular als .tbform-Datei exportieren (z.B. für ein anderes System)">
                                        <i class="bi bi-download"></i> Export
                                    </a>
```

- [ ] **Step 3: Import-JavaScript**

Im `<script>`-Block nach dem `createForm`-Submit-Handler einfügen:

```js
document.getElementById('importFile').addEventListener('change', function() {
    const file = this.files[0];
    this.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (e) { alert('Datei konnte nicht gelesen werden: kein gültiges JSON.'); return; }
        fetch('/api/evaluation-forms/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
            .then(r => r.json())
            .then(d => {
                if (d.success) window.location.href = '/dashboard/admin/evaluation-forms/' + d.form.id;
                else alert('Fehler: ' + (d.message || 'Unbekannt'));
            })
            .catch(e => { console.error(e); alert('Fehler beim Import'); });
    };
    reader.readAsText(file);
});
```

- [ ] **Step 4: Commit**

```bash
git add views/admin/evaluation-forms.ejs
git commit -m "Export-/Import-Buttons auf der Bewertungsformular-Seite"
```

---

### Task 4: Manuelle End-to-End-Verifikation

**Files:** — (keine Änderungen; nur prüfen)

**Interfaces:**
- Consumes: alles aus Task 1–3, lokale Dev-Umgebung (`npm run dev`, Login als Admin).

- [ ] **Step 1: App starten und Seite öffnen**

Run: `npm run dev`
Als Admin einloggen, `/dashboard/admin/evaluation-forms` öffnen.
Expected: Buttons «Formular importieren» (Kopf) und «Export» (pro Zeile) sind sichtbar; Layout/Theme unverändert.

- [ ] **Step 2: Export prüfen**

Ein Formular mit Gruppen/Kriterien (inkl. FR-Texten und Stufenbeschreibungen) exportieren.
Expected: Download `<Titel_bereinigt>.tbform`; Datei enthält `format`, `version: 1`, alle Gruppen/Kriterien in korrekter Reihenfolge, keine `id`-Felder.

- [ ] **Step 3: Import prüfen (Kollision)**

Dieselbe Datei importieren.
Expected: Weiterleitung in den Editor eines neuen Formulars «<Titel> (Import)»; Gruppen, Kriterien, Gewichte, Reihenfolge und beide Sprachen identisch mit dem Original. Erneuter Import → «<Titel> (Import 2)».

- [ ] **Step 4: Fehlerfälle prüfen**

a) Textdatei mit Inhalt `kein json` als `.tbform` importieren → Meldung «… kein gültiges JSON», kein Request.
b) Datei `{"format":"x","version":1,"form":{}}` importieren → Meldung «Datei ist kein gültiges ThesisBuddy-Formular (.tbform)».
Expected: In beiden Fällen wird kein Formular angelegt (Liste unverändert).

- [ ] **Step 5: Abschliessender Commit (falls Korrekturen nötig waren)**

```bash
git status --short
```

Expected: keine unbeabsichtigten Änderungen offen.
