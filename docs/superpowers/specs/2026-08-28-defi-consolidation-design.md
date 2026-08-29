# CorpusActif — Défi de consolidation (QCM post-parcours)

Date : 2026-08-28
Statut : design validé, spec en revue
Origine : `2026-06-06-bookends-ludiques.md` § « Proposition 5 (Défi de consolidation) »,
prérequis (bookends livrés) désormais levé. Chantier prioritaire nº3 de la roadmap
« reprise sélective des mécanismes StudyRaid » (le chantier 3 initial — fiche de synthèse —
a été jugé redondant avec le chantier 2 et fusionné dans le futur chantier export).

---

## 1. Objectif

À la fin d'un parcours socratique complet, proposer à l'apprenant de se tester par un QCM
court sur les notions qu'il vient de parcourir. Auto-corrigé, feedback immédiat par
question. L'apprenant **choisit** de le lancer (opt-in depuis le message de clôture).

## 2. Fondements RISS (vérifiés dans le corpus le 2026-08-28)

| Réf | Usage |
|---|---|
| tel-02461323 — Latimier (2019, Sc. cognitives) | thèse dédiée à l'apprentissage par récupération en mémoire (effet de test) pour la rétention à long terme — « l'effet le plus étudié par la communauté » |
| tel-01684276 — Fernandez (2017, Psychologie) | effets des tests d'entraînement sur les processus cognitifs et métacognitifs ; effet de la difficulté du quiz sur la performance |
| W4389335350 — McMullin & Masson (2023, Neuroscience) | synthèse courte et accessible : récupération en mémoire + espacement (réf citée côté enseignant) |
| dumas-03052674 — Keller (2020) | récupération active chez des adolescents avec TDAH — angle inclusion PLAI |
| hal-00388563 — Tessier, Sarrazin & Trouilloud (2006) | offrir des opportunités de choix renforce la motivation autodéterminée (Deci & Ryan) → le quiz est opt-in |
| hal-05361521 — Fouchet-Isambard & Millon Faure (2025) | typologie d'erreurs pour concevoir un feedback ciblant la cause, pas un simple « faux » |
| hal-02166286 — Gernigon (1998) | effet de surjustification : une récompense extrinsèque continue déplace l'objectif → aucun point/badge/classement, bilan factuel |

Aucune référence internationale hors corpus mobilisée.

## 3. Décisions (2026-08-28)

- **Persistance** : nouvelle table `corpus_quiz_attempts`. L'échec au quiz est un **signal
  distinct** de l'acquisition socratique — on ne rétrograde **pas** `corpus_messages.
  notion_acquired`. Le Dashboard croise les deux.
- **Contenu** : toutes les notions du parcours, **pondéré vers les difficultés** (2
  questions pour une notion `failed` ou `acquired_with_hint`, 1 pour `mastered`), **plafond
  total 10 questions** (Fernandez : un quiz trop long fatigue).
- **Format** : QCM à 4 options, ordre des options mélangé, pas d'indice de surface (pas de
  corrélation texte↔bonne réponse — cf mémoire `feedback_quiz_surface_cue`).
- **Feedback** : immédiat après chaque question (l'effet de test est plus fort avec un
  feedback rapproché), explication d'1 phrase ciblant la cause probable de l'erreur.
- **Rendu** : composant dédié `QuizPanel` (remplace la zone de saisie pendant le quiz,
  comme le fait déjà `connectionPrompt`), pas de nouveaux types de message dans `Chat.jsx`.
- **API** : replié dans `api/chat-debrief.js` (plafond 12 fonctions Vercel Hobby, `api/`
  plein). Pas de 13ᵉ fonction.
- **RISS visible** : côté enseignant seulement (une ligne + réf W4389335350). Côté élève,
  une demi-phrase dans l'opt-in (charge cognitive minimale — principe bookends).
- **Anti-cheat** : `correct_index` est renvoyé au client et la correction se fait côté
  client. Enjeu faible (consolidation, pas examen ; codes anonymes ; cohérent avec « la
  carte de notions est privée, locale à la session »). Assumé et documenté.

Hors périmètre : question ouverte corrigée par IA ; quiz espacé/différé (spacing) ; export.

## 4. Architecture

### 4.1 API — `api/chat-debrief.js`, routeur `action`

`chat-debrief.js` vérifie déjà le JWT + l'existence de la session dans `corpus_sessions`.
On factorise cette vérification et on branche 3 chemins :

```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const auth = await verifierSession(req, res);   // { space_id } ou null (a déjà répondu)
  if (!auth) return;
  const action = req.body?.action;
  if (action === 'quiz-gen')    return genererQuiz(req, res, auth);
  if (action === 'quiz-submit') return enregistrerQuiz(req, res, auth);
  return genererDebrief(req, res, auth);          // comportement actuel, inchangé
}
```

`verifierSession` = extraction du bloc JWT + lookup `corpus_sessions` déjà présent
(lignes 18-31 actuelles), renvoie `{ space_id, learner_code? }` ou répond 401 et renvoie
`null`.

**`genererQuiz(req, res, { space_id })`**

- Entrée : `{ notions: [{ concept, definition, outcome }] }` où `outcome ∈ {mastered,
  acquired_with_hint, failed}`.
- Sélection : trier les notions par priorité (`failed` > `acquired_with_hint` > `mastered`),
  en conservant l'ordre du parcours à priorité égale. Allouer 2 questions aux notions
  `failed`/`acquired_with_hint`, 1 aux `mastered`, jusqu'au plafond de 10 (les notions
  prioritaires sont servies en premier ; si le plafond coupe au milieu d'une notion à 2
  questions, elle n'en reçoit qu'1). Fonction pure `planifierQuestions(notions, max=10)`
  → tableau d'**une entrée par question à générer** : `[{ concept, definition }]` (une
  notion à poids 2 apparaît 2 fois). Dans `src/lib/quizPlan.js`, importée par l'API en
  relatif avec extension `.js` (même schéma que `api/curriculum.js` → `../src/lib/...`).
- Appel Haiku (`claude-haiku-4-5-20251001`, `max_tokens` ~2500), `output_config` schéma :
  ```
  { questions: [ {
      notion_concept: string,
      enonce: string,
      options: [string, string, string, string],
      correct_index: integer (0-3),
      explication: string
  } ] }
  ```
  Consigne : une question par entrée du plan (donc N questions), QCM 4 options
  plausibles, la bonne réponse à une position **aléatoire** (varier `correct_index`), pas
  de formulation qui trahisse la réponse, `explication` = pourquoi les distracteurs sont
  faux / quelle confusion ils ciblent (1 phrase), français direct, pas de preamble.
- Filtrage : ne garder que les questions avec exactement 4 `options` non vides et
  `correct_index` ∈ 0..3. Si 0 question valide → `200 { questions: [] }` (le client
  n'affiche pas l'opt-in / affiche un fallback).
- Sortie : `200 { questions }`.
- Erreur Haiku/parse → `200 { questions: [] }` (ne jamais bloquer la fin de parcours).

**`enregistrerQuiz(req, res, { space_id })`**

- Entrée : `{ learner_code, resultats: [{ notion_concept, correct }] }` (une entrée par
  question répondue).
- Insert groupé dans `corpus_quiz_attempts` via le client service :
  `resultats.map(r => ({ space_id, learner_code, notion_concept: r.notion_concept, correct: !!r.correct }))`.
- Sortie : `200 { ok: true }`. Erreur insert → `500 { error: '...' }` + log (le client
  affiche quand même le bilan, l'enregistrement est un bonus).

### 4.2 Table `corpus_quiz_attempts`

Migration `supabase/migrations/2026-08-28-quiz-attempts.sql`, à exécuter **manuellement**
sur le projet CorpusActif `dfoaumjleqtxjeaplnna` (celui pointé par `SUPABASE_URL`, où
vivent les tables `corpus_*` — **pas** le projet FlashFWB) avant déploiement.

```sql
create table corpus_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  learner_code text,
  notion_concept text not null,
  correct boolean not null,
  created_at timestamptz default now()
);
alter table corpus_quiz_attempts enable row level security;
create policy "corpus_quiz_attempts_owner" on corpus_quiz_attempts
  for select using (space_id in (select id from corpus_spaces where user_id = auth.uid()));
create policy "corpus_quiz_attempts_service" on corpus_quiz_attempts
  for insert with check (true);
```

Ajouter aussi la table à `supabase/schema.sql` (schéma canonique).

### 4.3 Client — `src/pages/learner/Chat.jsx`

Après l'injection du message `isDebrief` (fin de parcours, dans `openNotion` quand
`index >= notionsList.length`), si `hasCurriculum` et qu'au moins une notion a un
`notionOutcomes` défini :

- Injecter un message `isQuizOffer` (rendu par `ChatMessage`) : texte court « Te tester
  sur ce que tu viens de voir renforce ta mémoire. Veux-tu essayer ? » + boutons
  **Oui** / **Non merci**.
- **Non merci** → message `isQuizDeclined` discret (« Pas de souci. »), fin.
- **Oui** →
  1. Construire `notions` = `notions.map(n => ({ concept: n.concept, definition: n.definition, outcome: notionOutcomes[n.concept] ?? 'mastered' }))`.
  2. `POST /api/chat-debrief` `{ token, action: 'quiz-gen', notions }`.
  3. `questions.length === 0` → message fallback (« Le test n'a pas pu être préparé cette
     fois. »), fin.
  4. Sinon → monter `<QuizPanel questions={questions} onDone={…} />` **à la place de la
     zone de saisie** (même emplacement que `connectionPrompt`).

### 4.4 Composant `src/components/QuizPanel.jsx`

Props : `questions` (`[{ notion_concept, enonce, options, correct_index, explication }]`),
`onDone(resultats)`.

- État : `i` (index question courante), `choisi` (index option cliquée, ou null),
  `resultats` (accumulés).
- Rendu question `i` : `enonce` + 4 boutons option. Au clic → fige `choisi`, affiche
  correct/incorrect sur l'option choisie et la bonne, affiche `explication`, bouton
  « Question suivante » (ou « Voir mon bilan » sur la dernière).
- Barre de progression discrète `i+1 / N` (pas de score en direct — charge cognitive +
  anti-surjustification).
- À la fin : `onDone(resultats)` où `resultats = [{ notion_concept, correct }]`.
- Accessibilité : options = vrais `<button>`, `aria-pressed`, feedback annoncé
  (`role="status"`), navigation clavier. Police ≥ 16px, contraste.

Après `onDone` : `Chat.jsx` `POST /api/chat-debrief` `{ token, action: 'quiz-submit',
learner_code, resultats }` (silencieux), puis injecte un message `isQuizResult` :

- Factuel : « Tu as répondu juste à X questions sur N. »
- Si des notions ont ≥1 erreur : « À revoir : {liste} » (repris du registre existant
  « ○ à revoir ensemble », pas « ✗ échec »).
- Si `flashDeckId` : lien « Réviser dans FlashFWB → ».
- Aucun « Bravo », aucun pourcentage mis en avant, aucune comparaison.

### 4.5 `src/components/ChatMessage.jsx`

Nouveaux rendus : `isQuizOffer` (carte + 2 boutons, callbacks passés par `Chat.jsx`),
`isQuizDeclined`, `isQuizResult`. Style aligné sur les cartes bookends existantes
(pleine largeur, border-left, pas de bulle).

### 4.6 Dashboard enseignant — `src/pages/admin/Dashboard.jsx`

Nouvelle section « Défi de consolidation » (visible si l'espace a des lignes
`corpus_quiz_attempts`) :

- Requête : `corpus_quiz_attempts` filtré par `space_id`, agrégé par `notion_concept` :
  `taux = count(correct) / count(*)`, `n = count(*)`.
- Affichage : par notion, un indicateur de taux de réussite + le nombre de tentatives.
  Signaler (couleur/marqueur) les notions sous un seuil (réutiliser
  `corpus_spaces.class_acquisition_threshold` ou un seuil fixe 0.5 — à trancher au plan).
- Texte d'aide : « Une notion acquise au parcours mais souvent ratée ici n'est pas
  encore consolidée. » + réf : *« S'appuie sur l'effet de test — récupération en mémoire
  (McMullin & Masson, 2023). »*
- Aucune donnée nominative (codes anonymes, agrégat classe uniquement).

### 4.7 `vercel.json`

`api/chat-debrief.js` : `maxDuration` 15 → 30 (un `quiz-gen` de ~10 questions dépasse 15s).

## 5. Fichiers touchés

| Fichier | Nature |
|---|---|
| `api/chat-debrief.js` | routeur `action`, `verifierSession` factorisé, `genererQuiz`, `enregistrerQuiz` |
| `src/lib/quizPlan.js` | **créer** : `planifierQuestions(notions, max)` (pure, partagée API↔client) |
| `src/lib/quizPlan.test.js` | **créer** |
| `api/chat-debrief.test.js` | **créer** : routeur + quiz-gen mocké + quiz-submit mocké |
| `src/components/QuizPanel.jsx` | **créer** |
| `src/components/QuizPanel.test.jsx` | **créer** |
| `src/components/ChatMessage.jsx` | 3 nouveaux rendus |
| `src/pages/learner/Chat.jsx` | opt-in, appels quiz-gen/submit, montage `QuizPanel`, messages bilan |
| `src/pages/admin/Dashboard.jsx` | section « Défi de consolidation » |
| `supabase/migrations/2026-08-28-quiz-attempts.sql` | **créer** — table + RLS |
| `supabase/schema.sql` | ajouter `corpus_quiz_attempts` |
| `vercel.json` | `chat-debrief` maxDuration 30 |
| `README.md` | documenter le défi + plafond 12 fonctions |

Inchangés : `api/curriculum.js`, `api/chat.js`, `api/chat-init.js`, le parcours socratique
lui-même, `corpus_messages`.

## 6. Tests

- **`planifierQuestions`** : 3 notions (1 failed, 1 hint, 1 mastered) → 2+2+1 = 5
  questions ; 8 notions toutes failed, max 10 → 10 questions (5 notions × 2, dans l'ordre) ;
  0 notion → [] ; le plafond n'est jamais dépassé ; l'ordre du parcours est respecté à
  priorité égale.
- **`api/chat-debrief.js`** (Anthropic + Supabase mockés) : `action: 'quiz-gen'` sans
  session valide → 401 ; réponse Haiku valide → `200 { questions }` filtrées (une question
  à 3 options est écartée) ; Haiku non-JSON → `200 { questions: [] }` ; `action:
  'quiz-submit'` → insert appelé avec N lignes, `200 { ok: true }` ; **le débrief par
  défaut (sans `action`) répond toujours `{ debrief }` comme avant**.
- **`QuizPanel`** : affiche la 1re question ; cliquer une option fige le choix + montre
  l'explication ; « suivante » avance ; à la dernière, `onDone` reçoit un `resultats` de
  la bonne longueur avec les bons `correct`.
- **Non testé automatiquement** : qualité réelle des QCM Haiku — vérification manuelle en
  prod sur 1-2 espaces.

## 7. Risques et limites

| Risque | Traitement |
|---|---|
| `correct_index` visible côté client | assumé — enjeu faible, codes anonymes, consolidation ≠ examen ; documenté |
| QCM Haiku de mauvaise qualité (distracteurs absurdes, indice de surface) | consigne explicite + vérif manuelle prod ; si insuffisant, ajouter du contexte chunk au prompt (suivi) |
| Quiz trop long / fatigue | plafond 10 questions (Fernandez) |
| Dérive gamification | bilan factuel, zéro point/badge/classement, registre « à revoir » (Gernigon) |
| `chat-debrief.js` devient un routeur 3-voies | `verifierSession` factorisé, chaque branche isolée dans sa fonction ; le chemin débrief par défaut testé pour non-régression |
| Migration oubliée avant déploiement | note en tête du fichier SQL + README ; sans la table, `quiz-submit` renvoie 500 (le client affiche quand même le bilan) |

## 8. Décisions ouvertes pour le plan

- Seuil d'alerte Dashboard : `class_acquisition_threshold` de l'espace vs seuil fixe 0.5.
- `src/lib/quizPlan.js` importé par `api/chat-debrief.js` : vérifier que l'import relatif
  `../src/lib/quizPlan.js` fonctionne côté Vercel (précédent : `api/curriculum.js` importe
  `../src/lib/...` sans souci — même schéma).
- `output_config` sur `chat-debrief.js` : confirmé supporté par le SDK 0.100.1 (établi au
  chantier 2).
