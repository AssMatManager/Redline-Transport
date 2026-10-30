const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const cfg = require('./config');
const { logError } = require('./database/db');
const { verifySignature, handleWebhook } = require('./trucky/trucky');

const app = express();
if (cfg.trustProxy) app.set('trust proxy', cfg.trustProxy);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], // styles inline limités (animations)
  imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] } },
  crossOriginEmbedderPolicy: false }));
app.use(cookieParser());

// Webhook Trucky : corps brut nécessaire à la vérification HMAC
app.post('/api/trucky/webhook', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), (req, res) => {
  if (!verifySignature(req.rawBody, req.get('X-Signature-SHA256'))) return res.status(401).json({ error: 'Signature invalide' });
  try { res.json({ ok: true, result: handleWebhook(req.body) }); } catch (e) { logError('webhook-trucky', e); res.status(500).json({ error: 'Erreur' }); }
});

app.use(require('./routes/recruit').router);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', express.json(), require('./routes/public'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff'), index: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], index: 'index.html' }));
app.use((req, res) => res.status(404).send('Page introuvable'));
app.use((err, req, res, next) => { logError('http', err); res.status(err.status || 400).json({ error: err.message || 'Erreur' }); });

app.listen(cfg.port, () => { console.log(`Redline Transport sur ${cfg.siteUrl} (port ${cfg.port})`); require('./scheduler/scheduler').start(); });
