# Redline Transport — site GitHub

Site statique hébergé **gratuitement sur GitHub Pages**. **GitHub Actions** synchronise Discord, Trucky et TruckBooks toutes les ~15 minutes, calcule les classements (Europe/Paris), archive les podiums mensuels et republie le site. Un petit **Worker Cloudflare gratuit** sécurise le recrutement privé (vérification du lien côté serveur).

## 1. Mettre les fichiers sur GitHub
1. Créez un compte sur github.com, puis **New repository** : nom `redline-transport`, **Public** (obligatoire pour Pages gratuit).
2. Décompressez le zip. Dans le dépôt : **Add file → Upload files**, glissez **tout le contenu** du dossier (pas le dossier lui-même), puis **Commit changes**.
3. Si le dossier `.github` n'a pas été envoyé (fichiers cachés) : **Add file → Create new file**, nom `.github/workflows/site.yml`, collez le contenu du fichier `site.yml` du zip, commit.
4. **Settings → Pages → Source : GitHub Actions**.
5. **Settings → Actions → General → Workflow permissions : Read and write permissions** → Save.
6. **Actions → Site Redline Transport → Run workflow**. Après 1-2 minutes, le site est en ligne sur `https://VOTRE-PSEUDO.github.io/redline-transport/`.

## 2. Modifier le contenu
Éditez les fichiers directement sur GitHub (crayon ✏️ → Commit) ; le site se met à jour tout seul.
- `content/site.json` : slogan, textes (histoire, présentation, vision, objectifs, organisation), valeurs, règlement, conduite, conditions de recrutement, **liens `discord_url`, `tiktok_url`, `tiktok_pdg_url`** (un bouton n'apparaît que si son lien est rempli).
- `content/news.json` : `[{"titre":"…","date":"2026-11-12T18:00:00+01:00","categorie":"annonce","texte":"…","image":"assets/gallery/photo.jpg"}]`. Une date dans le futur = **publication programmée**.
- `content/convoys.json` : `[{"titre":"…","date":"2026-11-14T21:00:00+01:00","description":"…"}]`.
- `content/gallery.json` : `[{"fichier":"assets/gallery/photo.jpg","legende":"…","categorie":"camions"}]` (catégories libres : camions, chauffeurs, convois, evenements, entreprise). Les photos s'ajoutent dans `assets/gallery/` (Upload files).
- Images : `assets/images/logo.png` (ou `logo.svg`) et `assets/images/hero.jpg` (photo d'accueil) remplacent les images par défaut.

## 3. Discord (chauffeurs)
1. https://discord.com/developers/applications → New Application → **Bot** → copiez le token ; activez **Server Members Intent**.
2. Invitez le bot : OAuth2 → URL Generator → scope `bot`, **aucune permission**.
3. **Settings → Secrets and variables → Actions** :
   - Secret `DISCORD_BOT_TOKEN`
   - Variables : `DISCORD_GUILD_ID`, `ROLE_ID_CHAUFFEUR`, `ROLE_ID_DISPATCHEUR`, `ROLE_ID_RECRUTEUR`, `ROLE_ID_COPDG`, `ROLE_ID_PDG` (les 5 seuls rôles importés).
Un membre = une seule carte avec tous ses badges ; tri PDG > Co-PDG > Dispatcheur > Recruteur > Chauffeur ; bots exclus ; pseudos, avatars et rôles mis à jour, membres partis retirés.

## 4. Kilomètres : Trucky (prioritaire) ou TruckBooks
Variable `KM_SOURCE` = `trucky` (défaut) ou `truckbooks`. Une seule source est comptée (pas de double comptage).

**Liaison chauffeurs** : secret `DRIVER_LINKS` (JSON, reste privé) :
`{"ID_DISCORD_ALICE":{"steam":"7656119…"},"ID_DISCORD_BOB":{"tb":"PseudoTruckBooks"}}`
Secret `KEY_SALT` : une longue phrase au hasard (les clés d'identification sont stockées hachées dans le dépôt public).

### Trucky
Dans Trucky : Company Settings → API → **Claim API Company Access Token**. Puis : secret `TRUCKY_ACCESS_TOKEN`, variable `TRUCKY_COMPANY_ID`.
GitHub ne peut pas recevoir de webhooks : le site interroge l'API documentée `GET /api/v1/company/<id>/jobs` toutes les 15 min. **Étape obligatoire** : lancez le workflow une fois, ouvrez `data/trucky-sample.json` (structure d'un job, valeurs sensibles masquées) puis réglez les variables `TRUCKY_DISTANCE_FIELD` (ex. `job.driven_distance`), `TRUCKY_DISTANCE_UNIT` (km/m/mi) et `TRUCKY_COMPLETED_AT_FIELD` (date de fin de job). Facultatif : `TRUCKY_JOB_ID_FIELD`, `TRUCKY_STATUS_FIELD` + `TRUCKY_STATUS_VALUE`. Tant que ce n'est pas réglé, **rien n'est compté** (aucun chiffre inventé). Limite : seuls les jobs renvoyés par l'API à chaque appel sont vus (pas de pagination vérifiée).

### TruckBooks
Pas d'API publique documentée (selon un projet tiers, à confirmer auprès du support). Exportez le journal de l'entreprise en CSV, déposez-le dans le dossier `imports/` (Upload files) puis lancez le workflow : il est importé puis rangé dans `imports/done/`. Colonnes détectées automatiquement ; sinon variables `TB_COL_DRIVER`, `TB_COL_DISTANCE`, `TB_COL_DATE`, `TB_COL_ID`. Réimporter un fichier ne crée aucun doublon.

## 5. Classements et Hall of Fame
Jour / mois / général calculés à partir des jobs réellement enregistrés (`data/events.json`), fuseau Europe/Paris. Le mois précédent est archivé automatiquement quand les données sont fiables (km présents, pas d'erreur de synchro, au moins un chauffeur classé) ; sinon il reste « en attente » dans `data/hall-of-fame.json` et le journal (`data/log.json`, `data/status.json`). Pour valider à la main : **Actions → Run workflow → action `archive`, month `2026-10`, force `true`**.
Les archives sont immuables : une modification manuelle du fichier fait échouer la construction. Correction exceptionnelle : **Run workflow → action `correct`** (month, rank, name/km, justification obligatoire) ; l'avant/après est conservé dans `corrections`.

## 6. Recrutement privé (Worker Cloudflare gratuit)
GitHub Pages ne peut pas vérifier un jeton côté serveur ; le Worker le fait.
1. Compte gratuit sur cloudflare.com → **Workers & Pages → Create → Worker** → nom `redline-recrutement` → Deploy → **Edit code** → collez `worker/worker.js` → Deploy.
2. **KV** : Storage & Databases → KV → Create namespace `redline` ; dans le Worker : Settings → Bindings → Add → KV namespace, nom de variable **`KV`**.
3. Worker → Settings → Variables and Secrets : secret `ADMIN_KEY` (longue phrase secrète, 25+ caractères), secret `DISCORD_WEBHOOK` (webhook du salon de notification, facultatif), variables `ALLOWED_ORIGIN` = `https://VOTRE-PSEUDO.github.io`, `MIN_AGE` = `16`.
4. Copiez l'URL du Worker dans `content/site.json` → `worker_url`.
5. Administration : `https://VOTRE-PSEUDO.github.io/redline-transport/admin/` (clé = `ADMIN_KEY`) : générer / révoquer des liens (durée, nombre d'utilisations), voir les candidatures, accepter / refuser, notes, historique. Le lien généré (`…/recrutement/#t=…`) n'est affiché qu'une fois (seul son hash est stocké) : envoyez-le en MP Discord. Page absente du menu, `noindex`, formulaire inutilisable sans jeton valide côté serveur. Les textes de conditions restent publics dans le dépôt.

## 7. Limites honnêtes
Pas de comptes admin multiples ni de connexion par mot de passe : le contenu s'administre via GitHub (collaborateurs du dépôt) et le recrutement via la clé `ADMIN_KEY`. Les mises à jour ont jusqu'à ~15-20 min de délai (GitHub peut retarder les tâches planifiées). Après 60 jours sans aucune activité sur le dépôt, GitHub désactive les tâches planifiées (relancez-les depuis l'onglet Actions).
