// TruckBooks : pas d'API officielle publique. Import de l'export CSV du journal de l'entreprise.
// Le format exact du CSV n'a pas pu être vérifié : les colonnes sont détectées par nom et modifiables à l'import.
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { db, logSync, logError, parisDay, parisMonth } = require('../database/db');

const find = (headers, hints) => headers.find(h => hints.some(x => h.toLowerCase().includes(x)));
function importCsv(buffer, opts = {}) {
  try {
    let text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0] || ''; const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = parse(text, { columns: true, skip_empty_lines: true, delimiter, relax_column_count: true, trim: true });
    if (!rows.length) throw new Error('CSV vide');
    const h = Object.keys(rows[0]);
    const cDriver = opts.driver || find(h, ['driver', 'user', 'chauffeur', 'player', 'name']);
    const cKm = opts.distance || find(h, ['distance', 'km']);
    const cDate = opts.date || find(h, ['date', 'delivered', 'finish', 'end']);
    const cId = opts.id || find(h, ['job id', 'jobid', 'id']);
    if (!cDriver || !cKm || !cDate) throw new Error(`Colonnes introuvables (trouvées : ${h.join(', ')}). Précisez-les dans le formulaire.`);
    let added = 0, dup = 0, bad = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        const km = parseFloat(String(r[cKm]).replace(',', '.').replace(/[^\d.]/g, ''));
        const d = new Date(String(r[cDate]).replace(' ', 'T')); const drv = String(r[cDriver] || '').trim().toLowerCase();
        if (!isFinite(km) || km < 0 || isNaN(d) || !drv) { bad++; continue; }
        const ext = (cId && r[cId]) ? String(r[cId]) : crypto.createHash('sha1').update([drv, r[cDate], km].join('|')).digest('hex');
        const x = db.prepare('INSERT OR IGNORE INTO km_events(source,external_id,truckbooks_name,driver_key,km,completed_at,day,month) VALUES(?,?,?,?,?,?,?,?)')
          .run('truckbooks', ext, String(r[cDriver]).trim(), drv, km, d.toISOString(), parisDay(d), parisMonth(d));
        x.changes ? added++ : dup++;
      }
    });
    tx();
    const msg = `CSV TruckBooks : ${added} ajoutés, ${dup} déjà connus, ${bad} lignes ignorées`;
    logSync('truckbooks', 'ok', msg); return { ok: true, message: msg };
  } catch (e) { logError('truckbooks', e); logSync('truckbooks', 'erreur', e.message); return { ok: false, error: e.message }; }
}
module.exports = { importCsv };
