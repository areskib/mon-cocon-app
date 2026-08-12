# Mon Cocon — mémoire de projet

PWA de bilan santé/nutrition/cycle pour femmes, développée pour **Lindsay** (conseillère,
marque "L'Instant Cocon · Mon Bilan Santé") par **Areski** (dev, agence Scalyo).

- **Repo** : ce repo, branche `main`, déploiement continu automatique vers Netlify
- **Hébergement** : Netlify (site id `6567c848-c770-4729-865b-b6797e746543`), domaine
  `ma-prevention-sante.com`
- **Backend** : Supabase (`https://gugioqxuwdktruibzisk.supabase.co`, org Scalyo)
- **Structure** : `index.html` unique (HTML/CSS/JS vanilla, ~5500 lignes), PWA installable,
  `netlify/functions/*.js` pour toute la logique serveur, `landingpage/index.html` = landing
  page marketing statique servie sur `/landingpage`

## Design system

Néomorphisme sur fond ivoire (`--neu-base: #F0E6DD`), palette ivoire/brun/or, polices Lora
(titres) + Poppins (UI). Logo : silhouette de femme dorée sur fond brun dans un croissant de
lune (`images/logo.png`). **Attention** : l'ombre néomorphe épaisse rend mal sur les carrousels
swipe — on l'a allégée spécifiquement là (contour fin + ombre discrète) plutôt que de tout
repenser.

## Règles de travail — à respecter à chaque intervention

1. **Toujours vérifier la syntaxe avant de pousser.**
   - JS inline dans `index.html` : extraire chaque bloc `<script>` et le passer dans `new
     Function(...)` pour détecter les erreurs de syntaxe.
   - Fonctions Netlify : `node --check netlify/functions/le-fichier.js`
2. **Ne jamais pousser/déployer sans qu'Areski le demande explicitement à chaque fois** — un
   push validé ne vaut pas autorisation pour le suivant.
3. **Toujours attendre confirmation du déploiement Netlify** (`state: "ready"`) après un push
   avant de dire que c'est en ligne.
4. **Minimiser la consommation d'outils/tokens** — travailler efficacement, pas d'exploration
   inutile du code déjà connu.
5. **Ne pas expliquer étape par étape** ce qu'on fait quand Areski demande une tâche — juste la
   faire, expliquer seulement le résultat/la cause si pertinent.
6. Areski a un style direct, informel, en français — pas de sur-explication.
7. **Toutes les données en base sont du test tant qu'Areski n'a pas dit le contraire** —
   aucune vraie cliente payante à ce jour (vérifier avant toute suppression en masse quand même :
   croiser avec les emails admin whitelistés avant de supprimer des `advisor_notes`/etc.).

## Pièges déjà rencontrés (ne pas refaire les mêmes erreurs)

- **`auth.getUser()` vs `auth.getSession()`** : `getUser()` fait un appel réseau live qui peut
  échouer/être incohérent juste après une connexion/reconnexion (race condition). Préférer
  systématiquement `getSession()` pour lire l'utilisateur courant dans les fonctions
  critiques déclenchées juste après un login. Ça a causé le bug du bouton "Fin de règles" qui
  disparaissait après déconnexion/reconnexion.
- **Écritures qui écrasent au lieu de fusionner** : `admin-add-tracking.js` écrasait
  silencieusement mensurations/ressenti existants quand seul un "Retours globaux" était
  soumis sans retaper les champs. Toute écriture partielle sur une ressource existante doit
  fusionner (déchiffrer/lire l'existant, merger, puis réécrire) — jamais un remplacement
  aveugle.
- **Un webhook Make.com legacy** créait autrefois le compte Supabase (API admin) EN PARALLÈLE
  du `signUp()` natif côté client → course entre les deux systèmes → bug "compte déjà
  existant" aléatoire. Le webhook a été retiré (`sendResponsesToWebhook` n'est plus appelée).
  Si un comportement de double-création de compte réapparaît, vérifier qu'aucun scénario Make
  n'est reconnecté quelque part.
- **RLS Supabase** : ne jamais supposer qu'une policy INSERT existe parce qu'une policy
  SELECT/UPDATE existe — `quiz_results` n'avait qu'un SELECT + UPDATE (Make écrivait avant via
  `service_role`, qui bypass RLS). Vérifier `pg_policies` avant tout nouvel insert côté client.
- **Duplication silencieuse** : un formulaire qui peut être soumis deux fois (double-clic,
  reload pendant une requête en cours) doit avoir une garde anti-double-soumission ET une
  logique serveur idempotente (vérifier l'existant avant d'insérer). Deux bugs distincts (règles
  `period_logs`, compte `signUp`) sont venus de l'absence de cette garde.
- **Service worker** : le mécanisme de mise à jour forcée (`reloadWhenSafe()`) ne doit jamais
  recharger la page pendant une opération critique en cours (`window.__criticalOpInProgress`).
- **Service worker et cache des API** ⚠️ **le piège le plus coûteux à ce jour** : le handler
  `fetch` n'excluait du cache que `/.netlify/functions/`. Les appels à l'API **Supabase**
  (`rest/v1`, `auth/v1`) n'étant ni du HTML ni une fonction Netlify, ils tombaient dans la
  branche cache-first et étaient mémorisés **définitivement**. Une cure validée restait
  affichée "en attente" pour toujours (la 1re réponse `pending` était resservie depuis le
  cache), et surtout — le cache étant lié à l'**appareil et non au compte** — la réponse d'une
  utilisatrice pouvait être resservie à une autre sur le même téléphone. Désormais toute
  requête **cross-origin** est laissée au navigateur sans passer par le cache
  (`url.origin !== self.location.origin`). Deux réflexes à garder : ne jamais mettre en cache
  autre chose que ses propres assets statiques, et **penser au cache SW avant de conclure
  qu'un correctif de logique est inefficace** — trois correctifs corrects ont paru sans effet
  parce que la donnée lue ne venait pas du réseau. Toute correction du SW doit s'accompagner
  d'un bump de `CACHE_NAME` (`activate` purge les caches au nom différent), sinon les
  appareils déjà pollués le restent.
- **Emojis dans les images générées côté serveur** (Pillow/PDF) : les polices DejaVu n'ont pas
  de glyphes emoji → tofu boxes. Dessiner des icônes vectorielles simples à la place.

## Fonctions serveur (`netlify/functions/`)

| Fichier | Rôle |
|---|---|
| `cures-data.js` | Lit en direct le Google Sheet publié en CSV (prix, liens panier, feedbacks) |
| `cure-start.js` / `cure-status.js` | Démarrage et statut de la cure en cours |
| `submit-cure-validation.js` | Crée la demande de validation (idempotent) + notif push admin (prénom cliente dans le message) |
| `admin-pending-validations.js` | Liste des cures en attente pour l'onglet admin "À valider" |
| `admin-validate-cure.js` | Lindsay valide (et peut changer) la cure |
| `admin-clients-list.js` | Liste complète des clientes pour l'onglet admin "Clientes" (avec recherche prénom/email côté front) |
| `admin-add-note.js` | "Retours globaux" de Lindsay → `advisor_notes` (avec `week_number`) |
| `admin-add-tracking.js` | Mensurations hebdo saisies par Lindsay → `body_tracking` (fusion, pas d'écrasement) + notif push cliente |
| `admin-client-tracking-history.js` | Historique complet du suivi (mensurations + notes) sur la fiche client admin |
| `admin-reset-password.js` | Reset mdp direct par Lindsay (API admin Supabase) |
| `submit-password-reset-request.js` | Demande de reset traitée manuellement par Lindsay |
| `tracking-save.js` / `tracking-list.js` | Mensurations chiffrées AES-256-GCM de la cliente (Mon Évolution) |
| `send-welcome-email.js` | Mail de bienvenue via Resend, envoyé juste après la création du mot de passe |
| `send-hydration-reminder.js` / `send-weekly-tracking-reminder.js` | Rappels push (crons horaires) |

## Variables d'environnement Netlify

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TRACKING_ENCRYPTION_KEY`, `RESEND_API_KEY` (mail de
bienvenue — même clé que le SMTP Supabase), `RESEND_FROM` (optionnelle, défaut
`contact@ma-prevention-sante.com`).

**Important** : une variable d'env ajoutée/modifiée dans Netlify n'est prise en compte par les
fonctions qu'au **prochain déploiement** — pas en live. Redéployer (ou pousser un commit) après
tout changement d'env var avant de dire que c'est actif.

## Emails admin whitelistés (accès mode admin)

`lindsay.ag@hotmail.fr` et `projet@scalyo-ai.com`

## Config Supabase notable

- SMTP custom branché sur Resend (le SMTP par défaut Supabase est trop limité)
- **"Confirm email" doit rester désactivé** dans Authentication → Providers → Email (sinon
  `signUp()` ne connecte pas immédiatement le nouveau compte)

## Accès

- **GitHub** : push direct via un token fourni en session par Areski (PAT scope `repo`, non
  persisté — à redemander à chaque nouvelle session tant que Claude Code n'a pas son propre
  accès configuré)
- **Supabase** : connecteur MCP disponible (org Scalyo) — accès direct lecture/écriture en base,
  pas besoin de repasser par le SQL Editor manuel
- **Netlify** : connecteur MCP disponible mais peu fiable pour déclencher un déploiement manuel
  ou lire les logs — le déploiement automatique post-push suffit dans la quasi-totalité des cas
