// Usage : npm run create-admin -- <utilisateur> <mot_de_passe>
require('../backend/config');
const { db } = require('../backend/database/db');
const { hash } = require('../backend/authentication/auth');
const [u, p] = process.argv.slice(2);
if (!u || !p || p.length < 12) { console.error('Usage : npm run create-admin -- <utilisateur> <mot_de_passe 12+ caractères>'); process.exit(1); }
db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash').run(u, hash(p));
console.log(`Administrateur « ${u} » créé/mis à jour.`);
