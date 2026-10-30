const cron = require('node-cron');
const cfg = require('../config');
const { syncDiscord, configured } = require('../discord/sync');
const { pollJobs } = require('../trucky/trucky');
const { runMonthlyArchive } = require('../database/stats');
const { logError } = require('../database/db');

function start() {
  const tz = { timezone: cfg.tz };
  if (configured()) { syncDiscord(); cron.schedule(cfg.discord.cron, () => syncDiscord().catch(e => logError('cron-discord', e)), tz); }
  if (cfg.kmSource === 'trucky' && cfg.trucky.pollEnabled) cron.schedule(cfg.trucky.pollCron, () => pollJobs().catch(e => logError('cron-trucky', e)), tz);
  // 1er du mois à 00:10 puis toutes les heures les jours 1 à 3 tant que le mois précédent n'est pas archivé (nouvelle tentative)
  cron.schedule('10 0 1 * *', runMonthlyArchive, tz);
  cron.schedule('20 * 2-3 * *', runMonthlyArchive, tz);
  runMonthlyArchive();
}
module.exports = { start };
