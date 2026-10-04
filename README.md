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

## Défi de consolidation

À la fin d'un parcours socratique (mode socratique + curriculum défini), l'apprenant peut
lancer un QCM court sur les notions parcourues — pondéré vers les notions fragiles,
auto-corrigé, feedback immédiat par question. Opt-in (autonomie). Aucun point ni classement.

Les résultats vont dans `corpus_quiz_attempts` (signal **distinct** de l'acquisition
socratique — `corpus_messages.notion_acquired` n'est jamais réécrit) et alimentent la
section « Défi de consolidation » du tableau de bord enseignant.

Fondements RISS : effet de test / récupération en mémoire (Latimier 2019 tel-02461323 ;
Fernandez 2017 tel-01684276 ; McMullin & Masson 2023 W4389335350), autonomie perçue
(Tessier 2006 hal-00388563), feedback ciblant la cause (Fouchet-Isambard 2025 hal-05361521),
anti-surjustification (Gernigon 1998 hal-02166286).

**Contrainte** : plafond 12 fonctions Vercel Hobby. La génération et l'enregistrement du
quiz sont des branches `action` de `api/chat-debrief.js`, pas une nouvelle fonction.

**Migration** : `supabase/migrations/2026-08-28-quiz-attempts.sql` à exécuter manuellement
sur `dfoaumjleqtxjeaplnna` avant déploiement.

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

## Licences

- **Code** : [PolyForm Noncommercial 1.0.0](LICENSE). Usage non commercial uniquement.
- **Contenus pédagogiques** : [CC BY-NC-SA 4.0](LICENSE-CONTENT.md). Réutilisation et adaptation non commerciales, avec attribution et partage dans les mêmes conditions.
- **Logo et identité visuelle PLAI** : tous droits réservés (voir `LICENSE-CONTENT.md`).

Auteur : Jean-François Beguin, Référent numérique, https://jfb4plai.com
