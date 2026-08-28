# CorpusActif — PLAI

App pédagogique permettant aux enseignants de créer des espaces IA bridés par leurs ressources documentaires. Les apprenants accèdent via QR code.

## Stack
React 18 + Vite 5 + Tailwind CSS v3 / Supabase (pgvector + Auth) / Vercel / Claude Haiku / Voyage AI

## Génération du curriculum

Onglet Curriculum → « Générer depuis les documents » : Haiku dégage une ossature
(chapitres optionnels → concepts) des documents indexés de l'espace, affichée dans un
panneau brouillon. L'enseignant coche / édite / regroupe, puis « Ajouter au curriculum »
insère les nœuds retenus (chapitres = nœuds parents, concepts = enfants via `parent_id`).
Rien n'est écrasé : le curriculum existant est préservé.

Une fois le curriculum non vide, les bilans de session socratiques s'activent
automatiquement (`chat-init.js` SOURCE A). Les nœuds « chapitre » sont exclus du parcours
élève (ils n'ont pas de contenu propre).

**Contrainte** : Vercel Hobby plafonne à 12 fonctions serverless. `api/` est plein — la
génération est une branche `action: 'generate'` de `api/curriculum.js`, pas une nouvelle
fonction. Ne pas ajouter de fichier dans `api/` sans en fusionner un autre.

## Tests

`npm test` — unitaires Vitest : `curriculumDraft` (draftToNodes / groupNodes), branche
generate de `api/curriculum.js`, filtre chapitres de `api/chat-init.js`, panneau brouillon
+ affichage groupé + templates de `Curriculum.jsx`.

La qualité réelle de l'extraction Haiku se vérifie manuellement en prod sur un vrai espace
avec documents indexés.

## Variables d'environnement
Copier `.env.example` vers `.env.local` et remplir :
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Dashboard Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — côté serveur uniquement
- `ANTHROPIC_API_KEY` — console.anthropic.com
- `VOYAGE_API_KEY` — voyage.ai
- `JWT_SECRET` — clé aléatoire longue (`openssl rand -base64 32`)

## Dev local
```bash
npm install
vercel dev   # pour tester les /api/* avec les env vars
```
