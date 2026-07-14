// Kleine Key-Value-Ablage für App-weite Einstellungen, die nicht via .env
// laufen sollen (weil sie im UI editierbar sein müssen). Persistiert als
// JSON-Datei unter `data/app-settings.json`. In-Memory-Cache verhindert
// unnötige Filesystem-Reads.
//
// Aktuell genutzt für:
//   - secretariat_email  (Empfänger für Sekretariats-Sonderaufgaben)

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'app-settings.json');

let _cache = undefined;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readFromDisk() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    console.warn('[appSettings] Lesefehler:', e.message);
    return {};
  }
}

function writeToDisk(obj) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function getAll() {
  if (_cache === undefined) _cache = readFromDisk();
  return { ..._cache };
}

function get(key) {
  const all = getAll();
  return all[key];
}

function set(key, value) {
  const all = getAll();
  if (value === null || value === undefined || value === '') delete all[key];
  else all[key] = value;
  _cache = all;
  writeToDisk(all);
  return all[key] === undefined ? null : all[key];
}

// Nur für Tests: Cache leeren.
function _resetCache() { _cache = undefined; }

module.exports = { get, set, getAll, _resetCache };
