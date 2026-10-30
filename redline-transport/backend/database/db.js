// SQLite (better-sqlite3) : schéma + utilitaires
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'redline.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS news(id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT DEFAULT 'annonce', image TEXT, publish_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS convoys(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, starts_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS gallery(id INTEGER PRIMARY KEY, file TEXT NOT NULL, caption TEXT, category TEXT DEFAULT 'camions', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS members(discord_id TEXT PRIMARY KEY, username TEXT, avatar_url TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS member_roles(discord_id TEXT NOT NULL REFERENCES members(discord_id) ON DELETE CASCADE, role_key TEXT NOT NULL, PRIMARY KEY(discord_id, role_key));
CREATE TABLE IF NOT EXISTS driver_links(discord_id TEXT PRIMARY KEY, steam_id TEXT, truckbooks_name TEXT);
CREATE INDEX IF NOT EXISTS idx_links_steam ON driver_links(steam_id);
CREATE TABLE IF NOT EXISTS sync_log(id INTEGER PRIMARY KEY, kind TEXT, status TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
-- Un enregistrement par job terminé. UNIQUE(source, external_id) = pas de double comptage.
CREATE TABLE IF NOT EXISTS km_events(id INTEGER PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, steam_id TEXT, truckbooks_name TEXT, driver_key TEXT, km REAL NOT NULL, completed_at TEXT NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL, UNIQUE(source, external_id));
CREATE INDEX IF NOT EXISTS idx_km_day ON km_events(source, day);
CREATE INDEX IF NOT EXISTS idx_km_month ON km_events(source, month);
-- Jobs bruts Trucky (jamais fabriqués) pour inspection / jobs non exploitables
CREATE TABLE IF NOT EXISTS trucky_raw(id INTEGER PRIMARY KEY, event TEXT, status TEXT, payload TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hall_of_fame(month TEXT PRIMARY KEY, snapshot TEXT NOT NULL, archived_at TEXT DEFAULT CURRENT_TIMESTAMP, validated_by TEXT);
CREATE TABLE IF NOT EXISTS hall_pending(month TEXT PRIMARY KEY, snapshot TEXT NOT NULL, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hall_corrections(id INTEGER PRIMARY KEY, month TEXT, admin TEXT, justification TEXT NOT NULL, before_snapshot TEXT, after_snapshot TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS invites(id INTEGER PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, label TEXT, expires_at TEXT, revoked_at TEXT, max_uses INTEGER DEFAULT 1, created_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS invite_uses(id INTEGER PRIMARY KEY, invite_id INTEGER REFERENCES invites(id) ON DELETE CASCADE, action TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY, invite_id INTEGER REFERENCES invites(id), idem_key TEXT UNIQUE, discord_name TEXT NOT NULL, truckbooks_name TEXT, age INTEGER NOT NULL, ets2_duration TEXT, ets2_mode TEXT, apps TEXT, availability TEXT, motivation TEXT NOT NULL, extra TEXT, status TEXT DEFAULT 'en_attente', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS application_events(id INTEGER PRIMARY KEY, application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE, type TEXT, note TEXT, admin TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activity_log(id INTEGER PRIMARY KEY, admin TEXT, action TEXT, detail TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS error_log(id INTEGER PRIMARY KEY, source TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
const logSync = (kind, status, message) => db.prepare('INSERT INTO sync_log(kind,status,message) VALUES(?,?,?)').run(kind, status, String(message || '').slice(0, 500));
const logError = (source, err) => { console.error(`[${source}]`, err && err.message || err); db.prepare('INSERT INTO error_log(source,message) VALUES(?,?)').run(source, String(err && err.message || err).slice(0, 500)); };
const logActivity = (admin, action, detail = '') => db.prepare('INSERT INTO activity_log(admin,action,detail) VALUES(?,?,?)').run(admin || 'système', action, String(detail).slice(0, 500));

// Jour / mois en Europe/Paris
const parisParts = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return p; };
const parisDay = (d = new Date()) => { const p = parisParts(d); return `${p.year}-${p.month}-${p.day}`; };
const parisMonth = (d = new Date()) => parisDay(d).slice(0, 7);

module.exports = { db, getSetting, setSetting, logSync, logError, logActivity, parisDay, parisMonth };
