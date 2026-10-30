const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const { db, setSetting, getSetting, logActivity, logError } = require('../database/db');
const auth = require('../authentication/auth');
const stats = require('../database/stats');
const { syncDiscord, configured } = require('../discord/sync');
const { pollJobs } = require('../trucky/trucky');
const { importCsv } = require('../truckbooks/truckbooks');
const { sha } = require('./recruit');
const r = express.Router();

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({ storage: multer.diskStorage({ destination: path.join(__dirname, '..', '..', 'uploads'), filename: (q, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[f.mimetype]) }),
  limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (q, f, cb) => cb(EXT[f.mimetype] ? null : new Error('Format image non autorisé (jpg, png, webp)'), !!EXT[f.mimetype]) });
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const s = (v, max = 5000) => String(v == null ? '' : v).slice(0, max);
const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const isoOrNull = (v) => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

// ---- Connexion (limitée) ----
const loginLimit = rateLimit({ windowMs: 15 * 60e3, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives, réessayez dans 15 minutes' } });
r.post('/login', loginLimit, express.json(), (req, res) => {
  if (req.get('X-Requested-With') !== 'redline') return bad(res, 'Requête refusée', 403);
  const a = auth.login(req.body.username, req.body.password);
  if (!a) { logActivity(s(req.body.username, 40), 'connexion_echec'); return bad(res, 'Identifiants invalides', 401); }
  res.cookie('rl_sid', auth.createSession(a.id), { httpOnly: true, sameSite: 'strict', secure: cfg.prod, maxAge: cfg.sessionHours * 3600e3, path: '/' });
  logActivity(a.username, 'connexion'); res.json({ ok: true });
});
r.post('/logout', (req, res) => { if (req.cookies.rl_sid) db.prepare('DELETE FROM sessions WHERE id=?').run(req.cookies.rl_sid); res.clearCookie('rl_sid'); res.json({ ok: true }); });

r.use(auth.requireAdmin, express.json({ limit: '200kb' }));
r.get('/me', (req, res) => res.json(req.admin));

// ---- Contenu du site ----
const SETTING_KEYS = ['slogan', 'home_intro', 'company_history', 'company_presentation', 'company_vision', 'company_goals', 'company_values', 'company_organization', 'company_workflow', 'objectives', 'values', 'rules', 'conduct_before', 'conduct_after', 'discord_url', 'tiktok_url', 'recruit_min_age', 'recruit_conditions', 'recruit_steps'];
r.get('/settings', (req, res) => { const o = {}; for (const k of SETTING_KEYS) o[k] = getSetting(k); res.json(o); });
r.put('/settings', (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!SETTING_KEYS.includes(k)) continue;
    if (['discord_url', 'tiktok_url'].includes(k) && v && !/^https:\/\//.test(v)) return bad(res, `${k} doit commencer par https://`);
    if (k === 'recruit_conditions') { try { if (!Array.isArray(JSON.parse(v))) throw 0; } catch { return bad(res, 'Conditions : une condition par ligne'); } }
    setSetting(k, s(v, 20000));
  }
  logActivity(req.admin.username, 'settings'); res.json({ ok: true });
});

// ---- Actualités ----
r.get('/news', (req, res) => res.json(db.prepare('SELECT * FROM news ORDER BY publish_at DESC').all()));
r.post('/news', upload.single('image'), (req, res) => { // multipart: express.json ignoré
  const b = req.body; if (!s(b.title, 200).trim() || !s(b.body).trim()) return bad(res, 'Titre et contenu obligatoires');
  const when = b.publish_at ? isoOrNull(b.publish_at) : new Date().toISOString(); if (!when) return bad(res, 'Date invalide');
  const x = db.prepare('INSERT INTO news(title,body,category,image,publish_at) VALUES(?,?,?,?,?)').run(s(b.title, 200), s(b.body), s(b.category || 'annonce', 40), req.file ? req.file.filename : null, when);
  logActivity(req.admin.username, 'news_ajout', b.title); res.json({ id: x.lastInsertRowid });
});
r.put('/news/:id', upload.single('image'), (req, res) => {
  const b = req.body; const cur = db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id); if (!cur) return bad(res, 'Introuvable', 404);
  const when = b.publish_at ? isoOrNull(b.publish_at) : cur.publish_at; if (!when) return bad(res, 'Date invalide');
  db.prepare('UPDATE news SET title=?,body=?,category=?,image=?,publish_at=? WHERE id=?').run(s(b.title || cur.title, 200), s(b.body || cur.body), s(b.category || cur.category, 40), req.file ? req.file.filename : cur.image, when, cur.id);
  logActivity(req.admin.username, 'news_modif', cur.id); res.json({ ok: true });
});
r.delete('/news/:id', (req, res) => { db.prepare('DELETE FROM news WHERE id=?').run(req.params.id); logActivity(req.admin.username, 'news_suppr', req.params.id); res.json({ ok: true }); });

// ---- Convois ----
r.get('/convoys', (req, res) => res.json(db.prepare('SELECT * FROM convoys ORDER BY starts_at DESC').all()));
r.post('/convoys', (req, res) => { const b = req.body, d = isoOrNull(b.starts_at); if (!s(b.title, 200).trim() || !d) return bad(res, 'Titre et date/heure valides obligatoires');
  db.prepare('INSERT INTO convoys(title,description,starts_at) VALUES(?,?,?)').run(s(b.title, 200), s(b.description, 3000), d); logActivity(req.admin.username, 'convoi_ajout', b.title); res.json({ ok: true }); });
r.put('/convoys/:id', (req, res) => { const b = req.body, d = isoOrNull(b.starts_at); if (!d) return bad(res, 'Date invalide');
  db.prepare('UPDATE convoys SET title=?,description=?,starts_at=? WHERE id=?').run(s(b.title, 200), s(b.description, 3000), d, req.params.id); res.json({ ok: true }); });
r.delete('/convoys/:id', (req, res) => { db.prepare('DELETE FROM convoys WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- Galerie ----
r.get('/gallery', (req, res) => res.json(db.prepare('SELECT * FROM gallery ORDER BY id DESC').all()));
r.post('/gallery', upload.single('image'), (req, res) => { if (!req.file) return bad(res, 'Image obligatoire');
  db.prepare('INSERT INTO gallery(file,caption,category) VALUES(?,?,?)').run(req.file.filename, s(req.body.caption, 300), ['camions', 'chauffeurs', 'convois', 'evenements', 'entreprise'].includes(req.body.category) ? req.body.category : 'entreprise'); res.json({ ok: true }); });
r.delete('/gallery/:id', (req, res) => { db.prepare('DELETE FROM gallery WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---- Chauffeurs / Discord ----
r.get('/members', (req, res) => {
  const rows = db.prepare('SELECT m.discord_id, m.username, m.avatar_url, l.steam_id, l.truckbooks_name FROM members m LEFT JOIN driver_links l ON l.discord_id=m.discord_id ORDER BY m.username COLLATE NOCASE').all().map(m => ({ ...m, roles: stats.rolesOf(m.discord_id) }));
  const dups = db.prepare('SELECT discord_id FROM members GROUP BY discord_id HAVING COUNT(*)>1').all().length; // impossible (clé primaire) : contrôle affiché
  res.json({ members: rows, duplicates: dups, discord_configured: configured() });
});
r.post('/sync/discord', async (req, res) => { logActivity(req.admin.username, 'sync_discord'); res.json(await syncDiscord()); });
r.put('/links/:discord_id', (req, res) => {
  const steam = s(req.body.steam_id, 30).trim() || null, tb = s(req.body.truckbooks_name, 64).trim() || null;
  if (steam && !/^\d{5,25}$/.test(steam)) return bad(res, 'Steam ID : chiffres uniquement (SteamID64)');
  if (!db.prepare('SELECT 1 FROM members WHERE discord_id=?').get(req.params.discord_id)) return bad(res, 'Membre inconnu', 404);
  db.prepare('INSERT INTO driver_links(discord_id,steam_id,truckbooks_name) VALUES(?,?,?) ON CONFLICT(discord_id) DO UPDATE SET steam_id=excluded.steam_id, truckbooks_name=excluded.truckbooks_name').run(req.params.discord_id, steam, tb);
  logActivity(req.admin.username, 'liaison', req.params.discord_id); res.json({ ok: true });
});

// ---- Statistiques / Trucky / TruckBooks ----
r.get('/stats', (req, res) => res.json({ overview: stats.overview(), day: stats.daily(), month: stats.monthly(), all: stats.general(), source: cfg.kmSource,
  sync: db.prepare("SELECT * FROM sync_log WHERE kind IN ('trucky','truckbooks') ORDER BY id DESC LIMIT 15").all(),
  unmatched: db.prepare("SELECT driver_key, source, ROUND(SUM(km),1) km FROM km_events WHERE source=? AND driver_key NOT IN (SELECT CASE ? WHEN 'trucky' THEN steam_id ELSE lower(truckbooks_name) END FROM driver_links WHERE steam_id IS NOT NULL OR truckbooks_name IS NOT NULL) GROUP BY driver_key ORDER BY km DESC LIMIT 30").all(cfg.kmSource, cfg.kmSource),
  trucky_configured: !!(cfg.trucky.distanceField), raw: db.prepare('SELECT * FROM trucky_raw ORDER BY id DESC LIMIT 5').all() }));
r.post('/sync/trucky', async (req, res) => { logActivity(req.admin.username, 'sync_trucky'); res.json(await pollJobs()); });
r.post('/import/truckbooks', csvUpload.single('csv'), (req, res) => { if (!req.file) return bad(res, 'Fichier CSV obligatoire');
  logActivity(req.admin.username, 'import_truckbooks'); res.json(importCsv(req.file.buffer, { driver: s(req.body.driver, 60) || undefined, distance: s(req.body.distance, 60) || undefined, date: s(req.body.date, 60) || undefined, id: s(req.body.id, 60) || undefined })); });

// ---- Podiums / archives ----
r.get('/hall', (req, res) => res.json({
  pending: db.prepare('SELECT * FROM hall_pending ORDER BY month DESC').all().map(x => ({ ...x, snapshot: JSON.parse(x.snapshot) })),
  archives: db.prepare('SELECT month, snapshot, archived_at, validated_by FROM hall_of_fame ORDER BY month DESC').all().map(x => ({ ...x, snapshot: JSON.parse(x.snapshot) })),
  corrections: db.prepare('SELECT id,month,admin,justification,created_at FROM hall_corrections ORDER BY id DESC LIMIT 50').all(), preview: stats.buildSnapshot(stats.prevMonth()) }));
r.post('/hall/archive', (req, res) => { const m = s(req.body.month, 7); if (!/^\d{4}-\d{2}$/.test(m)) return bad(res, 'Mois invalide');
  const out = stats.archiveMonth(m, { force: !!req.body.force, admin: req.admin.username }); logActivity(req.admin.username, 'archive_tentative', m); res.json(out); });
r.post('/hall/correct', (req, res) => { try { const pod = req.body.podium; if (!Array.isArray(pod) || pod.length > 3) throw new Error('Podium invalide');
  stats.correctArchive(s(req.body.month, 7), req.admin.username, s(req.body.justification, 1000), pod.map((p, i) => ({ rank: i + 1, name: s(p.name, 64), avatar: s(p.avatar, 300), roles: Array.isArray(p.roles) ? p.roles.map(x => s(x, 20)) : [], km: +p.km || 0, discord_id: s(p.discord_id, 30) }))); res.json({ ok: true }); } catch (e) { bad(res, e.message); } });

// ---- Recrutement ----
r.get('/invites', (req, res) => res.json(db.prepare(`SELECT i.id,i.label,i.expires_at,i.revoked_at,i.max_uses,i.created_by,i.created_at,
  (SELECT COUNT(*) FROM invite_uses u WHERE u.invite_id=i.id AND u.action='vue') vues, (SELECT COUNT(*) FROM applications a WHERE a.invite_id=i.id) candidatures FROM invites i ORDER BY i.id DESC`).all()));
r.post('/invites', (req, res) => {
  const token = crypto.randomBytes(32).toString('base64url'); const days = Math.max(0, Math.min(+req.body.days || 0, 365));
  const x = db.prepare('INSERT INTO invites(token_hash,label,expires_at,max_uses,created_by) VALUES(?,?,?,?,?)').run(sha(token), s(req.body.label, 80), days ? new Date(Date.now() + days * 864e5).toISOString() : null, Math.max(1, Math.min(+req.body.max_uses || 1, 50)), req.admin.username);
  logActivity(req.admin.username, 'lien_cree', s(req.body.label, 80)); // le jeton n'est affiché qu'une fois (seul son hash est stocké)
  res.json({ id: x.lastInsertRowid, url: `${cfg.siteUrl}/recrutement?t=${token}` });
});
r.post('/invites/:id/revoke', (req, res) => { db.prepare("UPDATE invites SET revoked_at=datetime('now') WHERE id=? AND revoked_at IS NULL").run(req.params.id); logActivity(req.admin.username, 'lien_revoque', req.params.id); res.json({ ok: true }); });
r.get('/invites/:id/uses', (req, res) => res.json(db.prepare('SELECT action, created_at FROM invite_uses WHERE invite_id=? ORDER BY id DESC LIMIT 100').all(req.params.id)));
r.get('/applications', (req, res) => res.json(db.prepare('SELECT a.id,a.discord_name,a.age,a.status,a.created_at,i.label invite FROM applications a LEFT JOIN invites i ON i.id=a.invite_id ORDER BY a.id DESC').all()));
r.get('/applications/:id', (req, res) => { const a = db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id); if (!a) return bad(res, 'Introuvable', 404);
  a.apps = JSON.parse(a.apps || '[]'); a.availability = JSON.parse(a.availability || '{}'); a.events = db.prepare('SELECT * FROM application_events WHERE application_id=? ORDER BY id DESC').all(a.id); res.json(a); });
r.post('/applications/:id/decision', (req, res) => { const d = req.body.decision; if (!['acceptee', 'refusee'].includes(d)) return bad(res, 'Décision invalide');
  db.prepare('UPDATE applications SET status=? WHERE id=?').run(d, req.params.id);
  db.prepare('INSERT INTO application_events(application_id,type,note,admin) VALUES(?,?,?,?)').run(req.params.id, d, s(req.body.note, 1000), req.admin.username); logActivity(req.admin.username, 'candidature_' + d, req.params.id); res.json({ ok: true }); });
r.post('/applications/:id/note', (req, res) => { if (!s(req.body.note, 1000).trim()) return bad(res, 'Note vide');
  db.prepare('INSERT INTO application_events(application_id,type,note,admin) VALUES(?,?,?,?)').run(req.params.id, 'note', s(req.body.note, 1000), req.admin.username); res.json({ ok: true }); });

// ---- Administration ----
r.get('/admins', (req, res) => res.json(db.prepare('SELECT id,username,created_at FROM admins ORDER BY id').all()));
r.post('/admins', (req, res) => { const u = s(req.body.username, 40).trim(), p = s(req.body.password, 200);
  if (!/^[\w.-]{3,40}$/.test(u)) return bad(res, "Nom d'utilisateur : 3-40 caractères (lettres, chiffres, . _ -)"); if (p.length < 12) return bad(res, 'Mot de passe : 12 caractères minimum');
  try { db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)').run(u, auth.hash(p)); logActivity(req.admin.username, 'admin_ajout', u); res.json({ ok: true }); } catch { bad(res, 'Nom déjà utilisé'); } });
r.delete('/admins/:id', (req, res) => { if (+req.params.id === req.admin.id) return bad(res, 'Impossible de supprimer votre propre compte'); db.prepare('DELETE FROM admins WHERE id=?').run(req.params.id); logActivity(req.admin.username, 'admin_suppr', req.params.id); res.json({ ok: true }); });
r.get('/logs', (req, res) => res.json({ activity: db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 100').all(), errors: db.prepare('SELECT * FROM error_log ORDER BY id DESC LIMIT 50').all(), sync: db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 50').all() }));
r.get('/status', (req, res) => { const last = (k) => db.prepare('SELECT status,message,created_at FROM sync_log WHERE kind=? ORDER BY id DESC LIMIT 1').get(k) || null;
  res.json({ discord: { configured: configured(), last: last('discord') }, km_source: cfg.kmSource, trucky: { configured: !!(cfg.trucky.companyId && cfg.trucky.token), fields_configured: !!cfg.trucky.distanceField, webhook_secret: !!cfg.trucky.secret, last: last('trucky') }, truckbooks: { mode: 'import CSV (pas d\'API publique)', last: last('truckbooks') } }); });
module.exports = r;
