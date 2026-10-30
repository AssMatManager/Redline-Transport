// Sauvegarde à chaud de la base (cohérente même serveur en marche) : data/backups/redline-AAAA-MM-JJ.db
const path = require('path'), fs = require('fs');
const { db } = require('../backend/database/db');
const dir = path.join(__dirname, '..', 'data', 'backups'); fs.mkdirSync(dir, { recursive: true });
const f = path.join(dir, `redline-${new Date().toISOString().slice(0, 10)}.db`);
db.backup(f).then(() => { console.log('Sauvegarde :', f); const old = fs.readdirSync(dir).sort().slice(0, -14); old.forEach(x => fs.unlinkSync(path.join(dir, x))); }).catch(e => { console.error(e); process.exit(1); });
