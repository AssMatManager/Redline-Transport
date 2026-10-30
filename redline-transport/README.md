# Redline Transport — site officiel

Node.js + Express + SQLite. Frontend en HTML/CSS/JS pur (aucun service payant requis).

## 1. Installation
```bash
npm install
cp .env.example .env      # puis remplir .env
npm run create-admin -- monpseudo "mot-de-passe-12-caracteres-min"
npm start                 # http://localhost:3000
```
Node 18+ requis. Le site public est servi depuis `public/`, la page de recrutement depuis `private/` (jamais accessible sans jeton).

## 2. Images à remplacer
Dans `public/assets/images/` : `logo.png` (sinon `logo.svg`), `hero.jpg` (sinon `hero.svg`, photo d'accueil). Les autres photos (galerie, actualités) s'ajoutent depuis l'administration.

## 3. Discord
1. https://discord.com/developers/applications → New Application → Bot → copier le **token** dans `DISCORD_BOT_TOKEN`.
2. Bot → Privileged Gateway Intents : activer **Server Members Intent**.
3. Inviter le bot sur le serveur (OAuth2 → scope `bot`, aucune autre permission nécessaire).
4. `DISCORD_GUILD_ID` = ID du serveur (mode développeur → clic droit → Copier l'identifiant).
5. Renseigner les **5 ID de rôles** : `ROLE_ID_CHAUFFEUR`, `ROLE_ID_DISPATCHEUR`, `ROLE_ID_RECRUTEUR`, `ROLE_ID_COPDG`, `ROLE_ID_PDG`. Aucun autre rôle n'est importé (« Voix de la communauté » n'est qu'une règle interne). Les bots sont exclus.
Un membre = une seule carte (clé = ID Discord) avec tous ses badges ; tri PDG > Co-PDG > Dispatcheur > Recruteur > Chauffeur. La synchro tourne toutes les 15 min et à la demande (Admin → Chauffeurs).
Notifications de candidature : `DISCORD_NOTIFY_WEBHOOK` (webhook d'un salon, optionnel).

## 4. Kilomètres : Trucky (prioritaire) et TruckBooks (option)
**Une seule source est comptée** (`KM_SOURCE=trucky` ou `truckbooks`) pour éviter tout double comptage. Aucune statistique n'est inventée : sans données, le site l'indique.

### Trucky (VTC Hub API) — vérifié dans la documentation Trucky
- Dans Trucky : Company Settings → onglet API → « Claim API Company Access Token » → `TRUCKY_ACCESS_TOKEN`; `TRUCKY_COMPANY_ID` = ID de l'entreprise.
- **Webhook** (recommandé, temps réel) : dans l'onglet API, URL = `https://votre-site/api/trucky/webhook`, cocher l'événement `job_completed`, générer un secret → `TRUCKY_WEBHOOK_SECRET` (signature HMAC-SHA256 vérifiée).
- **Étape obligatoire** : la structure exacte d'un job n'a pas pu être lue automatiquement (documentation non accessible aux robots). Après le premier job, ouvrez Admin → Statistiques : le payload brut y est affiché. Renseignez `TRUCKY_DISTANCE_FIELD` (chemin, ex. `job.driven_distance`), `TRUCKY_DISTANCE_UNIT` (km/m/mi), et si besoin `TRUCKY_COMPLETED_AT_FIELD`, puis redémarrez. Tant que ce n'est pas fait, les jobs sont gardés bruts et **aucun kilomètre n'est compté**.
- Rattrapage optionnel par l'API (`TRUCKY_POLL_ENABLED=true`) : endpoint documenté `GET /api/v1/company/<id>/jobs`.
- **Liaison chauffeur** : Admin → Chauffeurs → saisir le **SteamID64** de chaque membre (Trucky identifie les chauffeurs par Steam ID).

### TruckBooks (import CSV)
TruckBooks n'a pas d'API publique documentée (selon un projet tiers ; à confirmer auprès du support). Solution : exporter le journal de l'entreprise en CSV depuis TruckBooks, puis Admin → Statistiques → « Importer le CSV ». Colonnes détectées automatiquement (chauffeur, distance, date, id) ou à préciser. Liaison : pseudo TruckBooks du chauffeur dans Admin → Chauffeurs. Réimporter le même fichier ne crée aucun doublon. Les données TruckBooks d'origine ne sont jamais modifiées.

## 5. Classements
Chaque job terminé est stocké une fois (`km_events`, unique par source + identifiant). Jour / mois = sommes par date **Europe/Paris** ; général = cumul de tout ce qui a été enregistré depuis la mise en service (pas d'historique antérieur à l'installation, sauf import CSV / rattrapage API).

## 6. Hall of Fame
Le 1er du mois à 00:10 (et chaque heure les jours 2-3 en cas de nouvel essai), le mois précédent est archivé si les données sont fiables (km présents, aucune erreur de synchro dans les 24 h, au moins un chauffeur classé). Sinon il passe « en attente » (Admin → Podiums) : vérifier, puis archiver manuellement (option de validation forcée). Les archives sont des snapshots JSON immuables (un seul par mois) ; seule une correction manuelle avec justification est possible, avec avant/après conservés.

## 7. Recrutement privé
Admin → Recrutement → « Générer un lien » (validité, nombre d'utilisations). Le lien (`/recrutement?t=…`) n'est affiché **qu'une fois** (seul son hash SHA-256 est stocké) : copiez-le et envoyez-le en MP Discord. Page absente du menu/pied de page ; sans jeton valide, le serveur répond 404. Révocable à tout moment. Candidatures : consulter, accepter/refuser, notes internes, historique. `noindex` est présent mais la protection réelle est la vérification serveur.

## 8. Contenu du site
Admin → Site (textes, règlement, conduite, liens Discord/TikTok ; un bouton n'apparaît que si son lien est renseigné), Actualités (publication programmable), Convois, Galerie.

## 9. Sécurité
bcrypt, sessions SQLite en cookie httpOnly/SameSite=Strict, en-tête anti-CSRF, limitation des connexions (8 / 15 min), requêtes préparées, CSP (helmet), aucun innerHTML sur des données, uploads limités à jpg/png/webp. Secrets uniquement dans `.env`.

## 10. Hébergement
```bash
NODE_ENV=production TRUST_PROXY=1 SITE_URL=https://votre-domaine   # dans .env
npm install --omit=dev && npm start
```
Mettre un reverse proxy HTTPS (Caddy / nginx) devant le port 3000 et lancer avec **pm2** (`pm2 start backend/server.js --name redline`) ou systemd. Le cookie admin est `secure` en production : HTTPS obligatoire.

## 11. Sauvegardes
`npm run backup` crée `data/backups/redline-AAAA-MM-JJ.db` (14 derniers conservés). Cron conseillé : `0 4 * * * cd /chemin && npm run backup`. Sauvegardez aussi `uploads/` et `.env`.

## Structure
`backend/` (server.js, config.js, routes/, discord/, trucky/, truckbooks/, database/, scheduler/, authentication/), `public/` (pages + assets + admin), `private/recrutement.html`, `scripts/`, `data/` (SQLite), `uploads/`.
