// Test-Feature: Ein globaler "Tages-Override" für die Systemzeit. Wird primär
// vom Reminder-Job verwendet, damit Admins Erinnerungen mit einem simulierten
// Datum testen können, ohne die tatsächliche Systemzeit anzupassen.
//
// Persistiert wird der Wert in einer kleinen JSON-Datei (`data/simulated-today.json`),
// damit er Server-Neustarts übersteht. In-Memory-Cache verhindert unnötige
// Filesystem-Reads bei jedem Job-Lauf.
//
// Semantik: der Override ist ein KALENDERTAG (YYYY-MM-DD), keine Uhrzeit.
// Wenn gesetzt, wird `getNow()` auf Mitternacht des angegebenen Tags gemappt.
// Ist nichts gesetzt → `new Date()` (Systemzeit).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'simulated-today.json');

let _cache = undefined; // undefined = noch nie gelesen, null = kein Override, string = 'YYYY-MM-DD'

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) return null;
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)) return obj.date;
    return null;
  } catch (e) {
    console.warn('[simulatedToday] Lesefehler:', e.message);
    return null;
  }
}

function writeToDisk(dateStr) {
  ensureDir();
  if (dateStr) fs.writeFileSync(STORE_PATH, JSON.stringify({ date: dateStr }), 'utf8');
  else if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
}

// Liefert das aktuell gesetzte Override-Datum als 'YYYY-MM-DD' oder null.
function getOverride() {
  if (_cache === undefined) _cache = readFromDisk();
  return _cache;
}

// Setzt das Override-Datum. `null` oder leerer String → Override entfernen.
function setOverride(dateStr) {
  if (!dateStr) {
    _cache = null;
    writeToDisk(null);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Ungültiges Datumsformat. Erwartet: YYYY-MM-DD.');
  }
  _cache = dateStr;
  writeToDisk(dateStr);
  return _cache;
}

// Aktuelles Datum als JS-Date. Bei Override: Mitternacht (lokal) des simulierten Tages.
function getNow() {
  const ov = getOverride();
  if (!ov) return new Date();
  const [y, m, d] = ov.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

// Nur für Tests / Reset: interne Cache leeren.
function _resetCache() { _cache = undefined; }

module.exports = { getOverride, setOverride, getNow, _resetCache };
