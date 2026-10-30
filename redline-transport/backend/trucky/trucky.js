// Intégration Trucky (VTC Hub API). Endpoints documentés : GET /api/v1/company/<id>/jobs (header x-access-token + User-Agent)
// et webhooks (job_completed, signature HMAC SHA256 dans X-Signature-SHA256).
// Le schéma exact d'un job n'étant pas lisible automatiquement, les champs sont configurables dans .env.
const crypto = require('crypto');
const cfg = require('../config');
const { db, logSync, logError, parisDay, parisMonth } = require('../database/db');
const T = cfg.trucky;

const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function findKey(o, key, depth = 0) { // recherche récursive (ex. steam_id)
  if (!o || typeof o !== 'object' || depth > 6) return undefined;
  if (o[key] != null && typeof o[key] !== 'object') return o[key];
  for (const v of Object.values(o)) { const r = findKey(v, key, depth + 1); if (r != null) return r; }
}
function verifySignature(rawBody, header) {
  if (!T.secret) return true; // secret optionnel côté Trucky ; recommandé
  if (!header) return false;
  const h = crypto.createHmac('sha256', T.secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(header))); } catch { return false; }
}
function toKm(v) {
  const n = Number(v); if (!isFinite(n) || n < 0) return null;
  return T.unit === 'm' ? n / 1000 : T.unit === 'mi' ? n * 1.609344 : n;
}
// Enregistre un job terminé. Retourne un statut texte ; ne fabrique JAMAIS de distance.
function ingestJob(job, fallbackDate) {
  const raw = (status) => db.prepare('INSERT INTO trucky_raw(event,status,payload) VALUES(?,?,?)').run('job', status, JSON.stringify(job).slice(0, 20000));
  if (!T.distanceField) { raw('config: TRUCKY_DISTANCE_FIELD manquant'); return 'non_configure'; }
  const id = getPath(job, T.idField) ?? findKey(job, T.idField);
  const km = toKm(getPath(job, T.distanceField));
  const steam = findKey(job, 'steam_id');
  if (id == null || km == null || !steam) { raw('champs introuvables (id/distance/steam_id)'); return 'inexploitable'; }
  const when = new Date((T.completedField && getPath(job, T.completedField)) || fallbackDate || Date.now());
  if (isNaN(when)) { raw('date invalide'); return 'inexploitable'; }
  const r = db.prepare('INSERT OR IGNORE INTO km_events(source,external_id,steam_id,driver_key,km,completed_at,day,month) VALUES(?,?,?,?,?,?,?,?)')
    .run('trucky', String(id), String(steam), String(steam), km, when.toISOString(), parisDay(when), parisMonth(when));
  return r.changes ? 'ajoute' : 'doublon';
}
async function tget(path) {
  const r = await fetch(`https://e.truckyapp.com/api/v1${path}`, { headers: { 'x-access-token': T.token, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'RedlineTransport' } });
  if (!r.ok) throw new Error(`Trucky HTTP ${r.status}`);
  return r.json();
}
// Rattrapage optionnel par l'API (à activer une fois les champs configurés)
async function pollJobs() {
  if (!T.companyId || !T.token) return { ok: false, error: 'TRUCKY_COMPANY_ID / TRUCKY_ACCESS_TOKEN manquants' };
  try {
    const data = await tget(`/company/${T.companyId}/jobs`);
    const jobs = Array.isArray(data) ? data : (data.data || data.jobs || []);
    let n = 0, dup = 0, bad = 0;
    for (const j of jobs) {
      if (T.statusField && String(getPath(j, T.statusField)) !== String(T.statusValue)) continue;
      const s = ingestJob(j); s === 'ajoute' ? n++ : s === 'doublon' ? dup++ : bad++;
    }
    const msg = `${jobs.length} jobs lus : ${n} ajoutés, ${dup} déjà connus, ${bad} inexploitables`;
    logSync('trucky', bad && !n ? 'erreur' : 'ok', msg); return { ok: true, message: msg };
  } catch (e) { logError('trucky', e); logSync('trucky', 'erreur', e.message); return { ok: false, error: e.message }; }
}
function handleWebhook(body) {
  const { event, data } = body || {};
  if (event !== 'job_completed' || !data) { db.prepare('INSERT INTO trucky_raw(event,status,payload) VALUES(?,?,?)').run(String(event), 'ignoré', JSON.stringify(body).slice(0, 5000)); return 'ignoré'; }
  const s = ingestJob(data, Date.now()); logSync('trucky', s === 'ajoute' || s === 'doublon' ? 'ok' : 'erreur', `webhook job_completed : ${s}`); return s;
}
module.exports = { verifySignature, handleWebhook, pollJobs };
