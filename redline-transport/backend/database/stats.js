// Classements, podiums, archives mensuelles (snapshots immuables)
const cfg = require('../config');
const { db, parisDay, parisMonth, logSync, logError, logActivity } = require('./db');

const JOIN = `FROM km_events e
  JOIN driver_links l ON e.driver_key = (CASE e.source WHEN 'trucky' THEN l.steam_id ELSE lower(l.truckbooks_name) END)
  JOIN members m ON m.discord_id = l.discord_id`;
const rolesOf = (id) => db.prepare('SELECT role_key FROM member_roles WHERE discord_id=?').all(id).map(r => r.role_key)
  .sort((a, b) => cfg.roles[a].priority - cfg.roles[b].priority);

function ranking(period, value) {
  const col = period === 'day' ? 'e.day=?' : period === 'month' ? 'e.month=?' : '1=1';
  const args = [cfg.kmSource]; if (period !== 'all') args.push(value);
  const rows = db.prepare(`SELECT m.discord_id, m.username, m.avatar_url, ROUND(SUM(e.km),1) km ${JOIN} WHERE e.source=? AND ${col} GROUP BY m.discord_id ORDER BY km DESC, m.username COLLATE NOCASE`).all(...args);
  return rows.map((r, i) => ({ rank: i + 1, discord_id: r.discord_id, name: r.username, avatar: r.avatar_url, km: r.km, roles: rolesOf(r.discord_id) }));
}
const daily = (d = parisDay()) => ranking('day', d);
const monthly = (m = parisMonth()) => ranking('month', m);
const general = () => ranking('all');

function overview() {
  const s = cfg.kmSource;
  const tot = db.prepare('SELECT ROUND(COALESCE(SUM(km),0),1) km, COUNT(*) jobs FROM km_events WHERE source=?').get(s);
  const matched = db.prepare(`SELECT ROUND(COALESCE(SUM(e.km),0),1) km ${JOIN} WHERE e.source=?`).get(s).km;
  const today = db.prepare('SELECT ROUND(COALESCE(SUM(km),0),1) km FROM km_events WHERE source=? AND day=?').get(s, parisDay()).km;
  const month = db.prepare('SELECT ROUND(COALESCE(SUM(km),0),1) km FROM km_events WHERE source=? AND month=?').get(s, parisMonth()).km;
  return { source: s, total_km: tot.km, jobs: tot.jobs, matched_km: matched, today_km: today, month_km: month,
    drivers: db.prepare('SELECT COUNT(*) n FROM members').get().n, has_data: tot.jobs > 0 };
}

function buildSnapshot(month) {
  const top = monthly(month).slice(0, 3).map(r => ({ rank: r.rank, discord_id: r.discord_id, name: r.name, avatar: r.avatar, roles: r.roles, km: r.km }));
  const total = db.prepare('SELECT ROUND(COALESCE(SUM(km),0),1) km FROM km_events WHERE source=? AND month=?').get(cfg.kmSource, month).km;
  return { month, source: cfg.kmSource, total_km: total, podium: top, generated_at: new Date().toISOString() };
}
function prevMonth(d = new Date()) { const p = parisMonth(d).split('-').map(Number); const y = p[1] === 1 ? p[0] - 1 : p[0]; const m = p[1] === 1 ? 12 : p[1] - 1; return `${y}-${String(m).padStart(2, '0')}`; }

// Contrôle de fiabilité avant archivage automatique
function reliability(month) {
  const reasons = [];
  const n = db.prepare('SELECT COUNT(*) n FROM km_events WHERE source=? AND month=?').get(cfg.kmSource, month).n;
  if (!n) reasons.push('Aucune donnée kilométrique pour ce mois');
  const err = db.prepare("SELECT COUNT(*) n FROM sync_log WHERE kind IN ('trucky','truckbooks','discord') AND status='erreur' AND created_at >= datetime('now','-24 hours')").get().n;
  if (err) reasons.push(`${err} erreur(s) de synchronisation dans les dernières 24 h`);
  const snap = buildSnapshot(month); if (snap.podium.length < 1) reasons.push('Aucun chauffeur classé (liaisons Discord ↔ Trucky/TruckBooks manquantes ?)');
  return reasons;
}
// Archive automatique du mois précédent si les données sont fiables, sinon mise en attente de validation admin.
function archiveMonth(month, { force = false, admin = null } = {}) {
  if (db.prepare('SELECT 1 FROM hall_of_fame WHERE month=?').get(month)) return { ok: false, error: 'Mois déjà archivé (immuable)' };
  const reasons = force ? [] : reliability(month);
  const snap = buildSnapshot(month);
  if (reasons.length) {
    db.prepare('INSERT INTO hall_pending(month,snapshot,reason) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET snapshot=excluded.snapshot, reason=excluded.reason').run(month, JSON.stringify(snap), reasons.join(' ; '));
    logSync('archive', 'erreur', `${month} en attente de vérification : ${reasons.join(' ; ')}`); return { ok: false, pending: true, reasons };
  }
  db.prepare('INSERT OR IGNORE INTO hall_of_fame(month,snapshot,validated_by) VALUES(?,?,?)').run(month, JSON.stringify(snap), admin || 'automatique');
  db.prepare('DELETE FROM hall_pending WHERE month=?').run(month);
  logSync('archive', 'ok', `Podium ${month} archivé`); if (admin) logActivity(admin, 'archive_validee', month);
  return { ok: true };
}
function runMonthlyArchive() { try { const m = prevMonth(); if (!db.prepare('SELECT 1 FROM hall_of_fame WHERE month=?').get(m)) archiveMonth(m); } catch (e) { logError('archive', e); } }
function correctArchive(month, admin, justification, podium) {
  const row = db.prepare('SELECT snapshot FROM hall_of_fame WHERE month=?').get(month); if (!row) throw new Error('Archive introuvable');
  if (!justification || justification.trim().length < 10) throw new Error('Justification obligatoire (10 caractères min.)');
  const before = JSON.parse(row.snapshot); const after = { ...before, podium, corrected: true };
  db.prepare('UPDATE hall_of_fame SET snapshot=? WHERE month=?').run(JSON.stringify(after), month);
  db.prepare('INSERT INTO hall_corrections(month,admin,justification,before_snapshot,after_snapshot) VALUES(?,?,?,?,?)').run(month, admin, justification, JSON.stringify(before), JSON.stringify(after));
  logActivity(admin, 'archive_corrigee', month);
}
module.exports = { daily, monthly, general, overview, archiveMonth, runMonthlyArchive, reliability, correctArchive, buildSnapshot, prevMonth, rolesOf };
