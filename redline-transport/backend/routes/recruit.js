// Recrutement privé : accès uniquement via jeton aléatoire vérifié côté serveur
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const cfg = require('../config');
const { db, getSetting, logError } = require('../database/db');
const r = express.Router();

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
function checkInvite(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const inv = db.prepare('SELECT * FROM invites WHERE token_hash=?').get(sha(token));
  if (!inv || inv.revoked_at) return null;
  if (inv.expires_at && inv.expires_at < new Date().toISOString()) return null;
  const used = db.prepare('SELECT COUNT(*) n FROM applications WHERE invite_id=?').get(inv.id).n;
  if (inv.max_uses && used >= inv.max_uses) return null;
  return inv;
}
const noIndex = (res) => res.set('X-Robots-Tag', 'noindex, nofollow, noarchive').set('Cache-Control', 'no-store');

// Page : servie seulement si le jeton est valide (sinon 404 identique à une page inexistante)
r.get('/recrutement', (req, res) => {
  noIndex(res); const inv = checkInvite(req.query.t);
  if (!inv) return res.status(404).send('Page introuvable');
  db.prepare('INSERT INTO invite_uses(invite_id,action) VALUES(?,?)').run(inv.id, 'vue');
  res.sendFile(path.join(__dirname, '..', '..', 'private', 'recrutement.html'));
});
r.get('/api/recruit/info', (req, res) => {
  noIndex(res); const inv = checkInvite(req.get('X-Invite-Token'));
  if (!inv) return res.status(404).json({ error: 'Lien invalide ou expiré' });
  const g = (k, d = '') => getSetting(k, d);
  let conditions = []; try { conditions = JSON.parse(g('recruit_conditions', '[]')); } catch {}
  res.json({ slogan: g('slogan'), presentation: g('company_presentation'), workflow: g('company_workflow'), rules: g('rules'),
    min_age: +g('recruit_min_age', '16'), conditions, steps: g('recruit_steps'), discord_url: g('discord_url') });
});
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const APPS = ['Trucky', 'TruckBooks', 'TruckersMP', 'Aucune de ces applications'];
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

r.post('/api/recruit/apply', express.json({ limit: '50kb' }), async (req, res) => {
  noIndex(res); const inv = checkInvite(req.get('X-Invite-Token'));
  if (!inv) return res.status(404).json({ error: 'Lien invalide, expiré ou déjà utilisé' });
  const b = req.body || {}; const minAge = +getSetting('recruit_min_age', '16');
  const f = { discord: clean(b.discord_name, 64), tb: clean(b.truckbooks_name, 64), age: parseInt(b.age, 10),
    dur: clean(b.ets2_duration, 120), mode: ['solo', 'multijoueur', 'les deux'].includes(b.ets2_mode) ? b.ets2_mode : '',
    mot: clean(b.motivation, 3000), extra: clean(b.extra, 3000), idem: clean(b.idem_key, 64) };
  const err = [];
  if (f.discord.length < 2) err.push('Pseudo Discord obligatoire');
  if (!(f.age >= 8 && f.age <= 99)) err.push('Âge invalide'); else if (f.age < minAge) err.push(`Âge minimum requis : ${minAge} ans`);
  if (!f.dur || !f.mode) err.push("Expérience ETS2 : durée et mode de jeu obligatoires");
  if (f.mot.length < 20) err.push('Motivation obligatoire (20 caractères minimum)');
  if (!f.idem) err.push('Requête invalide');
  const apps = (Array.isArray(b.apps) ? b.apps : []).filter(a => APPS.includes(a));
  const avail = {}; for (const d of DAYS) { const v = b.availability && b.availability[d]; avail[d] = clean(v, 100); }
  if (err.length) return res.status(400).json({ error: err.join(' · ') });
  try {
    const dup = db.prepare('SELECT id FROM applications WHERE idem_key=?').get(f.idem);
    if (dup) return res.json({ ok: true, duplicate: true });
    const ins = db.transaction(() => { // revérifie l'usage dans la transaction (anti double envoi simultané)
      if (!checkInvite(req.get('X-Invite-Token'))) throw new Error('used');
      const x = db.prepare('INSERT INTO applications(invite_id,idem_key,discord_name,truckbooks_name,age,ets2_duration,ets2_mode,apps,availability,motivation,extra) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(inv.id, f.idem, f.discord, f.tb || null, f.age, f.dur, f.mode, JSON.stringify(apps), JSON.stringify(avail), f.mot, f.extra || null);
      db.prepare('INSERT INTO invite_uses(invite_id,action) VALUES(?,?)').run(inv.id, 'candidature');
      return x.lastInsertRowid;
    });
    const id = ins(); res.json({ ok: true });
    if (cfg.discord.notifyWebhook) fetch(cfg.discord.notifyWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `📥 Nouvelle candidature #${id} — ${f.discord} (${f.age} ans). À consulter dans l'administration.`, allowed_mentions: { parse: [] } }) }).catch(e => logError('notif-discord', e));
  } catch (e) { if (e.message === 'used') return res.status(409).json({ error: 'Ce lien a déjà été utilisé' }); logError('candidature', e); res.status(500).json({ error: 'Erreur serveur' }); }
});
module.exports = { router: r, sha };
