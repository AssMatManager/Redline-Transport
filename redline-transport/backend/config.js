// Configuration centralisée (lecture du .env)
require('dotenv').config();
const e = process.env;
const ROLES = {
  pdg:        { label: 'PDG',        priority: 1, id: e.ROLE_ID_PDG },
  copdg:      { label: 'Co-PDG',     priority: 2, id: e.ROLE_ID_COPDG },
  dispatcheur:{ label: 'Dispatcheur',priority: 3, id: e.ROLE_ID_DISPATCHEUR },
  recruteur:  { label: 'Recruteur',  priority: 4, id: e.ROLE_ID_RECRUTEUR },
  chauffeur:  { label: 'Chauffeur',  priority: 5, id: e.ROLE_ID_CHAUFFEUR },
};
module.exports = {
  port: +e.PORT || 3000,
  siteUrl: (e.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  prod: e.NODE_ENV === 'production',
  trustProxy: +e.TRUST_PROXY || 0,
  sessionHours: +e.SESSION_HOURS || 12,
  tz: 'Europe/Paris',
  roles: ROLES,
  discord: { token: e.DISCORD_BOT_TOKEN, guildId: e.DISCORD_GUILD_ID, notifyWebhook: e.DISCORD_NOTIFY_WEBHOOK, cron: e.DISCORD_SYNC_CRON || '*/15 * * * *' },
  kmSource: (e.KM_SOURCE || 'trucky').toLowerCase(),
  trucky: {
    companyId: e.TRUCKY_COMPANY_ID, token: e.TRUCKY_ACCESS_TOKEN, secret: e.TRUCKY_WEBHOOK_SECRET,
    distanceField: e.TRUCKY_DISTANCE_FIELD, unit: e.TRUCKY_DISTANCE_UNIT || 'km',
    idField: e.TRUCKY_JOB_ID_FIELD || 'id', completedField: e.TRUCKY_COMPLETED_AT_FIELD,
    pollEnabled: e.TRUCKY_POLL_ENABLED === 'true', pollCron: e.TRUCKY_POLL_CRON || '*/10 * * * *',
    statusField: e.TRUCKY_POLL_STATUS_FIELD, statusValue: e.TRUCKY_POLL_STATUS_VALUE,
  },
};
