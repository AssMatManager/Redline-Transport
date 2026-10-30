const express = require('express');
const cfg = require('../config');
const { db, getSetting } = require('../database/db');
const stats = require('../database/stats');
const r = express.Router();

const TEXT_KEYS = ['slogan', 'home_intro', 'company_history', 'company_presentation', 'company_vision', 'company_goals', 'company_values', 'company_organization', 'company_workflow', 'objectives', 'values', 'rules', 'conduct_before', 'conduct_after', 'discord_url', 'tiktok_url'];
const DEFAULTS = {
  slogan: "Là où les autres s'arrêtent, nous continuons.",
  conduct_before: "Conduite réaliste\nRespect du Code de la route\nRespect des autres joueurs\nComportement professionnel\nRespect des consignes en convoi",
  conduct_after: "À partir du grade « Voix de la communauté », le chauffeur peut choisir son style de conduite.",
};
r.get('/site', (req, res) => { const o = {}; for (const k of TEXT_KEYS) o[k] = getSetting(k, DEFAULTS[k] || ''); res.json(o); });

r.get('/news', (req, res) => res.json(db.prepare("SELECT id,title,body,category,image,publish_at FROM news WHERE publish_at <= ? ORDER BY publish_at DESC LIMIT ?").all(new Date().toISOString(), Math.min(+req.query.limit || 30, 100))));
r.get('/convoys', (req, res) => res.json(db.prepare("SELECT id,title,description,starts_at FROM convoys WHERE starts_at >= ? ORDER BY starts_at LIMIT 20").all(new Date(Date.now() - 2 * 3600e3).toISOString())));
r.get('/gallery', (req, res) => res.json(db.prepare('SELECT id,file,caption,category FROM gallery ORDER BY id DESC').all()));

// Un membre = une seule carte, rôles en badges, tri par priorité du rôle le plus élevé
r.get('/members', (req, res) => {
  const rows = db.prepare('SELECT discord_id id, username name, avatar_url avatar FROM members').all()
    .map(m => ({ ...m, roles: stats.rolesOf(m.id).map(k => ({ key: k, label: cfg.roles[k].label })) }));
  rows.sort((a, b) => cfg.roles[a.roles[0].key].priority - cfg.roles[b.roles[0].key].priority || a.name.localeCompare(b.name));
  res.json(rows.map(({ id, ...m }) => m)); // l'ID Discord n'est pas exposé
});
const pub = (rows) => rows.map(({ discord_id, ...x }) => ({ ...x, roles: x.roles.map(k => ({ key: k, label: cfg.roles[k].label })) }));
r.get('/rankings/:period', (req, res) => {
  const p = req.params.period;
  if (p === 'day') return res.json({ period: p, date: req.query.date, rows: pub(stats.daily(/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined)) });
  if (p === 'month') return res.json({ period: p, rows: pub(stats.monthly(/^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : undefined)) });
  if (p === 'all') return res.json({ period: p, rows: pub(stats.general()) });
  res.status(404).json({ error: 'Période inconnue' });
});
r.get('/stats', (req, res) => res.json(stats.overview()));
r.get('/hall', (req, res) => {
  const rows = db.prepare('SELECT month, snapshot FROM hall_of_fame ORDER BY month DESC').all().map(x => {
    const s = JSON.parse(x.snapshot); return { month: x.month, total_km: s.total_km, podium: s.podium.map(({ discord_id, roles, ...p }) => ({ ...p, roles: roles.map(k => cfg.roles[k] ? cfg.roles[k].label : k) })) };
  });
  res.json(rows);
});
module.exports = r;
