# Export/Import von Bewertungsformularen (.tbform)

Datum: 2026-08-03
Status: vom Auftraggeber genehmigt

## Ziel

Bewertungsformulare (Vorlagen) sollen auf der Seite `/dashboard/admin/evaluation-forms`
in eine Datei exportiert und aus einer solchen Datei wieder importiert werden
können — primär, um Formulare zwischen Systemen (z.B. Test → Produktion) zu
übertragen.

## Anforderungen

- Pro Formular eine Export-Funktion; Dateiname = Formulartitel, Endung `.tbform`.
- Eine Import-Funktion auf derselben Seite: Datei auswählen, hochladen, importieren.
- Format: JSON (UTF-8).
- Import legt **immer ein neues Formular an**. Existiert der DE-Titel bereits,
  wird « (Import)» angehängt, bei erneuter Kollision « (Import 2)» usw.
  (Entscheid Auftraggeber.)

## Dateiformat `.tbform`

```json
{
  "format": "thesisbuddy-evaluation-form",
  "version": 1,
  "exported_at": "2026-08-03T10:00:00.000Z",
  "form": {
    "title_de": "…", "title_fr": "…",
    "groups": [{
      "name_de": "…", "name_fr": "…", "weight": 1, "position": 0,
      "criteria": [{
        "label_de": "…", "label_fr": "…", "weight": 1, "position": 0,
        "level_descriptions_de": ["", "", "", "", "", ""],
        "level_descriptions_fr": ["", "", "", "", "", ""]
      }]
    }]
  }
}
```

- Keine Datenbank-IDs in der Datei; der Import erzeugt alle Datensätze neu.
- `format` + `version` erlauben dem Import, fremde oder künftige Dateien mit
  klarer Meldung abzulehnen bzw. das Format später erweiterbar zu halten.
- Abgedeckte Felder entsprechen exakt den Modellen `EvaluationForm`
  (`title_de/fr`), `EvaluationGroup` (`name_de/fr`, `weight`, `position`) und
  `EvaluationCriterion` (`label_de/fr`, `weight`, `position`,
  `level_descriptions_de/fr` mit je 6 Einträgen).

## Architektur

Gewählter Ansatz: **Export serverseitig, Import per FileReader** (kein Multer).

Verworfene Alternativen: Import als multipart/form-data mit Multer (unnötige
Infrastruktur für Dateien von wenigen KB); Export clientseitig aus `getForm`
zusammenbauen (Formatdefinition würde im View-JS statt im Controller liegen,
Export und Import wären nicht am selben Ort definiert).

### Backend (`src/controllers/evaluationController.js`, Routen in `src/routes/api.js`, beide admin-only)

- `GET /api/evaluation-forms/:id/export`
  - Lädt das Formular inkl. Gruppen/Kriterien (gleiche Query wie `getForm`,
    sortiert nach `position`).
  - Mappt auf das Dateiformat oben (ohne IDs).
  - Antwort: `Content-Type: application/json`,
    `Content-Disposition: attachment; filename="<safeName>.tbform"`.
    `safeName` = DE-Titel mit derselben Bereinigung wie beim Blank-PDF
    (`replace(/[^a-zA-Z0-9_-]+/g, '_')`).
  - 404, wenn das Formular nicht existiert.

- `POST /api/evaluation-forms/import` (JSON-Body = Dateiinhalt)
  - Validierung: `format === 'thesisbuddy-evaluation-form'`, `version === 1`,
    `form.title_de`/`form.title_fr` nicht leer, `groups`/`criteria` Arrays
    (dürfen leer sein), Pflichtfelder je Gruppe/Kriterium vorhanden.
    `level_descriptions_*` werden wie im bestehenden Helper auf genau
    6 String-Einträge normalisiert; `weight`/`position` werden numerisch
    übernommen, fehlende Werte erhalten die Modell-Defaults.
  - Titelkollision (DE-Titel): « (Import)», « (Import 2)», … anhängen.
  - Anlage von Formular + Gruppen + Kriterien in **einer Transaktion**.
  - Antwort wie `createForm`: `{ success: true, form }` (Formular mit neuer ID).

### Frontend (`views/admin/evaluation-forms.ejs`)

- Pro Tabellenzeile ein Button «Export» (Icon `bi-download`,
  `btn btn-outline-secondary btn-sm`) als Link auf die Export-Route — der
  Browser lädt `<Titel>.tbform` herunter.
- Im Seitenkopf neben «Formular erstellen» ein Button «Formular importieren»
  (Icon `bi-upload`): öffnet ein verstecktes
  `<input type="file" accept=".tbform,application/json">`, liest die Datei per
  `FileReader`, `JSON.parse`, POST an die Import-Route. Bei Erfolg Weiterleitung
  in den Editor des neuen Formulars (wie beim Erstellen); Fehler als `alert`
  mit der Servermeldung (bestehender Stil der Seite).

## Fehlerbehandlung

- Ungültiges JSON (clientseitig abgefangen) → verständliche Meldung, kein Request.
- Falsche `format`-Kennung, unbekannte `version`, fehlende Pflichtfelder →
  HTTP 400 mit deutscher Meldung («Datei ist kein gültiges
  ThesisBuddy-Formular» bzw. konkreter Feldfehler).
- Transaktion stellt sicher, dass kein halb importiertes Formular zurückbleibt.

## Verifikation

Das Projekt hat keine automatisierte Test-Infrastruktur (`npm test` ist ein
Platzhalter). Manuelle Prüfung:

1. Formular mit Gruppen/Kriterien (inkl. FR-Texten und Stufenbeschreibungen)
   exportieren; Dateiname und Inhalt prüfen.
2. Datei reimportieren; neues Formular « (Import)» im Editor mit dem Original
   vergleichen (Gruppen, Kriterien, Gewichte, Reihenfolge, beide Sprachen).
3. Erneut importieren → « (Import 2)».
4. Defekte Datei (kein JSON / falsche Kennung) importieren → klare Fehlermeldung,
   kein Formular angelegt.
