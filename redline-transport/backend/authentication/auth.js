// Authentification admin : bcrypt + sessions SQLite (cookie httpOnly, SameSite=Strict)
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { db } = require('../database/db');

const hash = (pw) => bcrypt.hashSync(pw, 12);
function createSession(adminId) {
  const id = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(id,admin_id,expires_at) VALUES(?,?,?)').run(id, adminId, new Date(Date.now() + cfg.sessionHours * 3600e3).toISOString());
  return id;
}
function login(username, password) {
  const a = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username || ''));
  const ok = bcrypt.compareSync(String(password || ''), a ? a.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  return a && ok ? a : null;
}
function requireAdmin(req, res, next) {
  const sid = req.cookies && req.cookies.rl_sid;
  const s = sid && db.prepare('SELECT s.*, a.username FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.id=?').get(sid);
  if (!s || s.expires_at < new Date().toISOString()) return res.status(401).json({ error: 'Non authentifié' });
  // Anti-CSRF : écritures uniquement avec l'en-tête personnalisé (impossible en formulaire cross-site)
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Requested-With') !== 'redline') return res.status(403).json({ error: 'Requête refusée' });
  req.admin = { id: s.admin_id, username: s.username }; next();
}
module.exports = { hash, createSession, login, requireAdmin };
