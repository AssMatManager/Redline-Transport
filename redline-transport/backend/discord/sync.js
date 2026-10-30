// Synchronisation Discord : membres + 5 rôles autorisés uniquement
const cfg = require('../config');
const { db, logSync, logError } = require('../database/db');
const API = 'https://discord.com/api/v10';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function dget(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + path, { headers: { Authorization: `Bot ${cfg.discord.token}`, 'User-Agent': 'RedlineTransportSite (1.0)' } });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await sleep(((j.retry_after || 1) + 0.2) * 1000); continue; }
    if (!r.ok) throw new Error(`Discord HTTP ${r.status} sur ${path.split('?')[0]}`);
    return r.json();
  }
  throw new Error('Discord : trop de tentatives (rate limit)');
}
function avatarUrl(user, memberAvatar, guildId) {
  if (memberAvatar) return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${memberAvatar}.png?size=128`;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
function configured() {
  const ids = Object.values(cfg.roles).map(r => r.id);
  return !!(cfg.discord.token && cfg.discord.guildId && ids.every(Boolean));
}
async function syncDiscord() {
  if (!configured()) { logSync('discord', 'erreur', 'Configuration Discord incomplète (.env)'); return { ok: false, error: 'Configuration Discord incomplète' }; }
  try {
    // whitelist stricte : id de rôle -> clé interne
    const whitelist = {}; for (const [k, r] of Object.entries(cfg.roles)) whitelist[r.id] = k;
    const all = []; let after = '0';
    for (;;) {
      const page = await dget(`/guilds/${cfg.discord.guildId}/members?limit=1000&after=${after}`);
      all.push(...page); if (page.length < 1000) break; after = page[page.length - 1].user.id;
    }
    const seen = new Set(); let added = 0, updated = 0;
    const tx = db.transaction(() => {
      for (const m of all) {
        if (!m.user || m.user.bot) continue; // jamais de bots
        const keys = [...new Set(m.roles.map(r => whitelist[r]).filter(Boolean))];
        if (!keys.length) continue; // aucun rôle autorisé => non importé
        const id = m.user.id; seen.add(id);
        const name = m.nick || m.user.global_name || m.user.username;
        const exists = db.prepare('SELECT 1 FROM members WHERE discord_id=?').get(id);
        db.prepare(`INSERT INTO members(discord_id,username,avatar_url,updated_at) VALUES(?,?,?,datetime('now'))
          ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at`)
          .run(id, name, avatarUrl(m.user, m.avatar, cfg.discord.guildId));
        exists ? updated++ : added++;
        db.prepare('DELETE FROM member_roles WHERE discord_id=?').run(id); // retire les rôles perdus
        for (const k of keys) db.prepare('INSERT OR IGNORE INTO member_roles(discord_id,role_key) VALUES(?,?)').run(id, k);
      }
      // membres partis ou sans rôle autorisé
      let removed = 0;
      for (const r of db.prepare('SELECT discord_id FROM members').all()) if (!seen.has(r.discord_id)) { db.prepare('DELETE FROM members WHERE discord_id=?').run(r.discord_id); removed++; }
      return removed;
    });
    const removed = tx();
    const msg = `${seen.size} membres (+${added} nouveaux, ${updated} mis à jour, ${removed} retirés)`;
    logSync('discord', 'ok', msg); return { ok: true, message: msg };
  } catch (e) { logError('discord', e); logSync('discord', 'erreur', e.message); return { ok: false, error: e.message }; }
}
module.exports = { syncDiscord, configured };
