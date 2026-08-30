# Défi de consolidation (QCM post-parcours) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À la fin d'un parcours socratique, proposer à l'apprenant un QCM court opt-in sur les notions parcourues (pondéré vers les notions fragiles), auto-corrigé avec feedback immédiat, résultats persistés pour le tableau de bord enseignant.

**Architecture:** La génération et l'enregistrement du quiz sont deux branches `action` de `api/chat-debrief.js` (plafond 12 fonctions Vercel Hobby — `api/` est plein). Le plan des questions est une fonction pure partagée (`src/lib/quizPlan.js`). Le quiz s'affiche dans un composant dédié `QuizPanel` monté à la place de la zone de saisie de `Chat.jsx`. Une nouvelle table `corpus_quiz_attempts` (signal distinct de l'acquisition socratique) alimente une section du Dashboard.

**Tech Stack:** React 19, Vite 8, Vercel Serverless (Node ESM), `@anthropic-ai/sdk@0.100.1` (Haiku + `output_config`), `@supabase/supabase-js@2` (RLS), `jose` (JWT), Vitest 4 (déjà en place). Projet Supabase `dfoaumjleqtxjeaplnna`. Déploiement GitHub `jfb4plai/CorpusActif` → Vercel, branche `main`.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/lib/quizPlan.js` | `planifierQuestions(notions, max)` — pure, partagée API↔client : décide combien de questions par notion | Create |
| `src/lib/quizPlan.test.js` | tests de `planifierQuestions` | Create |
| `api/chat-debrief.js` | routeur `action` : `verifierSession` factorisé + `genererDebrief` (inchangé) + `genererQuiz` + `enregistrerQuiz` | Modify |
| `api/chat-debrief.test.js` | routeur + quiz-gen + quiz-submit (Anthropic + Supabase mockés) + non-régression débrief | Create |
| `src/components/QuizPanel.jsx` | affichage des questions une par une, feedback immédiat, `onDone(resultats)` | Create |
| `src/components/QuizPanel.test.jsx` | rendu, sélection, avance, `onDone` | Create |
| `src/components/ChatMessage.jsx` | 3 nouveaux rendus : `isQuizOffer`, `isQuizDeclined`, `isQuizResult` | Modify |
| `src/pages/learner/Chat.jsx` | opt-in après débrief, appels `quiz-gen` / `quiz-submit`, montage `QuizPanel`, message bilan | Modify |
| `src/pages/admin/Dashboard.jsx` | 7ᵉ requête `corpus_quiz_attempts` + section « Défi de consolidation » | Modify |
| `supabase/migrations/2026-08-28-quiz-attempts.sql` | table + RLS | Create |
| `supabase/schema.sql` | ajouter `corpus_quiz_attempts` au schéma canonique | Modify |
| `vercel.json` | `api/chat-debrief.js` maxDuration 15 → 30 | Modify |
| `README.md` | documenter le défi + rappel plafond 12 fonctions | Modify |

Inchangés : `api/curriculum.js`, `api/chat.js`, `api/chat-init.js`, le parcours socratique, `corpus_messages`.

---

## Task 1: `src/lib/quizPlan.js` — planification des questions

**Files:**
- Create: `src/lib/quizPlan.js`
- Create: `src/lib/quizPlan.test.js`

- [ ] **Step 1: Écrire le test**

`src/lib/quizPlan.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { planifierQuestions } from './quizPlan.js'

const n = (concept, outcome, definition = 'def ' + concept) => ({ concept, definition, outcome })

describe('planifierQuestions', () => {
  it('2 questions par notion fragile, 1 par notion maîtrisée', () => {
    const plan = planifierQuestions([
      n('A', 'failed'), n('B', 'acquired_with_hint'), n('C', 'mastered'),
    ], 10)
    // A×2, B×2, C×1 = 5
    expect(plan).toHaveLength(5)
    expect(plan.filter(q => q.concept === 'A')).toHaveLength(2)
    expect(plan.filter(q => q.concept === 'B')).toHaveLength(2)
    expect(plan.filter(q => q.concept === 'C')).toHaveLength(1)
    for (const q of plan) expect(q).toHaveProperty('definition')
  })

  it('respecte le plafond en servant les notions prioritaires d\'abord', () => {
    // 8 notions toutes failed → 16 questions souhaitées, plafond 10
    const notions = Array.from({ length: 8 }, (_, i) => n('N' + i, 'failed'))
    const plan = planifierQuestions(notions, 10)
    expect(plan).toHaveLength(10)
    // 5 premières notions × 2 questions
    expect(new Set(plan.map(q => q.concept))).toEqual(new Set(['N0', 'N1', 'N2', 'N3', 'N4']))
  })

  it('coupe proprement au milieu d\'une notion à 2 questions', () => {
    // 4 notions failed (×2 = 8) + 3 mastered (×1 = 3) = 11 souhaité, plafond 9
    const notions = [
      n('F0', 'failed'), n('F1', 'failed'), n('F2', 'failed'), n('F3', 'failed'),
      n('M0', 'mastered'), n('M1', 'mastered'), n('M2', 'mastered'),
    ]
    const plan = planifierQuestions(notions, 9)
    expect(plan).toHaveLength(9)
    // 4 failed ×2 = 8, puis 1 mastered
    expect(plan.filter(q => q.concept.startsWith('F'))).toHaveLength(8)
    expect(plan.filter(q => q.concept.startsWith('M'))).toHaveLength(1)
  })

  it('ordre du parcours conservé à priorité égale', () => {
    const plan = planifierQuestions([n('X', 'mastered'), n('Y', 'mastered'), n('Z', 'mastered')], 10)
    expect(plan.map(q => q.concept)).toEqual(['X', 'Y', 'Z'])
  })

  it('outcome inconnu ou absent → traité comme mastered (1 question)', () => {
    const plan = planifierQuestions([n('A', undefined), n('B', 'autre')], 10)
    expect(plan).toHaveLength(2)
  })

  it('aucune notion → []', () => {
    expect(planifierQuestions([], 10)).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/lib/quizPlan.test.js`
Expected : FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/lib/quizPlan.js`**

```js
// Décide combien de questions générer pour chaque notion du parcours.
// 2 questions pour une notion fragile (échouée ou comprise seulement avec indice),
// 1 pour une notion maîtrisée. Les notions fragiles sont servies en premier ;
// à priorité égale, l'ordre du parcours est conservé. Le total ne dépasse jamais `max`.
// Renvoie un tableau d'UNE entrée par question à générer : { concept, definition }.
// (une notion à 2 questions apparaît 2 fois — c'est voulu, le générateur produit
// une question par entrée.)

const PRIORITAIRES = new Set(['failed', 'acquired_with_hint']);

export function planifierQuestions(notions, max = 10) {
  const avecPoids = notions.map((n, ordre) => ({
    concept: n.concept,
    definition: n.definition ?? '',
    poids: PRIORITAIRES.has(n.outcome) ? 2 : 1,
    prioritaire: PRIORITAIRES.has(n.outcome),
    ordre,
  }));

  // Prioritaires d'abord, puis ordre du parcours.
  avecPoids.sort((a, b) => (b.prioritaire - a.prioritaire) || (a.ordre - b.ordre));

  const plan = [];
  for (const n of avecPoids) {
    for (let i = 0; i < n.poids && plan.length < max; i++) {
      plan.push({ concept: n.concept, definition: n.definition });
    }
    if (plan.length >= max) break;
  }
  return plan;
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/lib/quizPlan.test.js`
Expected : PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quizPlan.js src/lib/quizPlan.test.js
git commit -m "feat: quizPlan — planifierQuestions (pondération vers les notions fragiles)"
```

---

## Task 2: Migration table + schema + vercel.json

**Files:**
- Create: `supabase/migrations/2026-08-28-quiz-attempts.sql`
- Modify: `supabase/schema.sql`
- Modify: `vercel.json`

- [ ] **Step 1: Créer la migration**

`supabase/migrations/2026-08-28-quiz-attempts.sql` :

```sql
-- Défi de consolidation : chaque réponse au QCM post-parcours = une ligne.
-- Signal DISTINCT de l'acquisition socratique (corpus_messages.notion_acquired
-- n'est jamais réécrit). Agrégé par notion au tableau de bord enseignant.
--
-- À EXÉCUTER MANUELLEMENT dans Supabase → SQL Editor, projet CorpusActif
-- (dfoaumjleqtxjeaplnna — celui pointé par SUPABASE_URL, où vivent les tables
-- corpus_*), AVANT tout déploiement de cette branche. Ce n'est PAS le projet
-- FlashFWB. Sans la table, api/chat-debrief.js action:quiz-submit renvoie 500
-- (le client affiche quand même le bilan — l'enregistrement est un bonus).

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

- [ ] **Step 2: Ajouter la table à `supabase/schema.sql`**

À la fin de `supabase/schema.sql`, ajouter le même bloc `create table corpus_quiz_attempts (…)` + les 3 lignes RLS (copie exacte du bloc ci-dessus, sans l'en-tête de commentaire de migration — un commentaire court `-- Défi de consolidation` suffit).

- [ ] **Step 3: Bumper le maxDuration dans `vercel.json`**

Dans `vercel.json`, changer la ligne :
```json
    "api/chat-debrief.js": { "maxDuration": 15 },
```
en :
```json
    "api/chat-debrief.js": { "maxDuration": 30 },
```

- [ ] **Step 4: Vérifier le JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"`
Expected : `vercel.json OK`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-08-28-quiz-attempts.sql supabase/schema.sql vercel.json
git commit -m "feat: table corpus_quiz_attempts + maxDuration chat-debrief 30s"
```

- [ ] **Step 6: (manuel) Exécuter la migration**

Coller le contenu de `supabase/migrations/2026-08-28-quiz-attempts.sql` dans Supabase → SQL Editor du projet `dfoaumjleqtxjeaplnna` et exécuter. `Success. No rows returned` = OK.

---

## Task 3: `api/chat-debrief.js` — routeur `action`

**Files:**
- Modify: `api/chat-debrief.js`
- Create: `api/chat-debrief.test.js`

- [ ] **Step 1: Écrire le test**

`api/chat-debrief.test.js` :

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './chat-debrief.js'

const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  ANTHROPIC_API_KEY: 'k',
  JWT_SECRET: 'test-secret-at-least-32-chars-long-xx',
}

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { this.ended = true; return this },
  }
}

// jose : jwtVerify renvoie toujours un payload { space_id: 's1' }
vi.mock('jose', () => ({
  jwtVerify: async () => ({ payload: { space_id: 's1' } }),
}))

let supabaseScenario
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t) => supabaseScenario.from(t) }),
}))

let anthropicScenario
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: async (a) => anthropicScenario(a) } },
}))

beforeEach(() => {
  Object.assign(process.env, ENV)
  vi.clearAllMocks()
  supabaseScenario = {
    from: (t) => {
      if (t === 'corpus_sessions') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'sess1' } }) }) }) }
      }
      if (t === 'corpus_quiz_attempts') {
        return { insert: async (rows) => { supabaseScenario.inserted = rows; return { error: null }; } }
      }
      throw new Error('table inattendue ' + t)
    },
  }
  anthropicScenario = async () => ({ content: [{ text: JSON.stringify({ questions: [
    { notion_concept: 'A', enonce: 'Q1 ?', options: ['a', 'b', 'c', 'd'], correct_index: 1, explication: 'parce que b.' },
  ] }) }] })
})

const jwt = 'header.payload.sig'

describe('chat-debrief — routeur', () => {
  it('méthode GET → 405', async () => {
    const res = mockRes()
    await handler({ method: 'GET', body: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('session introuvable → 401', async () => {
    supabaseScenario.from = (t) => {
      if (t === 'corpus_sessions') return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
      throw new Error('x')
    }
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [] } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('débrief par défaut (sans action) répond { debrief }', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'Tu as bien expliqué X.' }] })
    const res = mockRes()
    await handler({ method: 'POST', body: {
      token: jwt, notions_mastered: ['A'], session_exchanges: [{ role: 'user', content: 'pourquoi la photosynthèse ?' }],
    } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('debrief')
    expect(res.body.debrief).toContain('Tu as bien expliqué')
  })

  it('quiz-gen : réponse Haiku valide → 200 { questions } filtrées', async () => {
    anthropicScenario = async () => ({ content: [{ text: JSON.stringify({ questions: [
      { notion_concept: 'A', enonce: 'Q1', options: ['a', 'b', 'c', 'd'], correct_index: 2, explication: 'x' },
      { notion_concept: 'B', enonce: 'Q2', options: ['a', 'b', 'c'], correct_index: 0, explication: 'y' }, // 3 options → écartée
      { notion_concept: 'C', enonce: 'Q3', options: ['a', 'b', 'c', 'd'], correct_index: 9, explication: 'z' }, // index invalide → écartée
    ] }) }] })
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [
      { concept: 'A', definition: 'da', outcome: 'failed' },
    ] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.questions).toHaveLength(1)
    expect(res.body.questions[0].notion_concept).toBe('A')
  })

  it('quiz-gen : Haiku non-JSON → 200 { questions: [] } (ne bloque pas)', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'je ne peux pas' }] })
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [{ concept: 'A', definition: 'd', outcome: 'mastered' }] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.questions).toEqual([])
  })

  it('quiz-submit : insère N lignes → 200 { ok: true }', async () => {
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-submit', learner_code: 'E01', resultats: [
      { notion_concept: 'A', correct: true },
      { notion_concept: 'A', correct: false },
      { notion_concept: 'B', correct: true },
    ] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(supabaseScenario.inserted).toHaveLength(3)
    expect(supabaseScenario.inserted[0]).toMatchObject({ space_id: 's1', learner_code: 'E01', notion_concept: 'A', correct: true })
  })

  it('quiz-submit : resultats vide → 200 { ok: true } sans insert', async () => {
    supabaseScenario.inserted = undefined
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-submit', learner_code: 'E01', resultats: [] } }, res)
    expect(res.statusCode).toBe(200)
    expect(supabaseScenario.inserted).toBeUndefined()
  })
})
```

Note : supprimer la ligne `const sent = JSON.parse(...)` placeholder du test `quiz-gen` (elle n'assert rien) — laissée ici pour rappel que si on veut vérifier le prompt, il faut espionner `anthropicScenario`. Ne pas garder de code mort.

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run api/chat-debrief.test.js`
Expected : FAIL — le handler ne connaît pas `action`, `import` peut aussi échouer si `createClient` est au scope module (voir Step 3).

- [ ] **Step 3: Réécrire `api/chat-debrief.js`**

```js
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import { planifierQuestions } from '../src/lib/quizPlan.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['notion_concept', 'enonce', 'options', 'correct_index', 'explication'],
        properties: {
          notion_concept: { type: 'string' },
          enonce: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correct_index: { type: 'integer' },
          explication: { type: 'string' },
        },
      },
    },
  },
};

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Vérifie le JWT + l'existence de la session. Renvoie { space_id } ou null (après avoir répondu).
async function verifierSession(req, res) {
  const { token } = req.body || {};
  if (!token) { res.status(400).json({ error: 'token requis' }); return null; }
  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);
  let space_id;
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    space_id = payload.space_id;
    const { data: session } = await serviceClient()
      .from('corpus_sessions').select('id').eq('token', token).single();
    if (!session) { res.status(401).json({ error: 'Session expirée ou révoquée' }); return null; }
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
    return null;
  }
  return { space_id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await verifierSession(req, res);
  if (!auth) return;

  const action = req.body?.action;
  if (action === 'quiz-gen') return genererQuiz(req, res);
  if (action === 'quiz-submit') return enregistrerQuiz(req, res, auth);
  return genererDebrief(req, res);
}

// ---- Débrief (comportement historique, inchangé) --------------------------
async function genererDebrief(req, res) {
  const { notions_mastered = [], notions_with_hint = [], notions_failed = [], session_exchanges = [] } = req.body;

  const masteredList = notions_mastered.length > 0 ? `Notions maîtrisées sans aide : ${notions_mastered.join(', ')}` : '';
  const hintList = notions_with_hint.length > 0 ? `Notions comprises avec indice : ${notions_with_hint.join(', ')}` : '';
  const failedList = notions_failed.length > 0 ? `Notions non acquises : ${notions_failed.join(', ')}` : '';

  const excerpts = session_exchanges
    .filter(e => e.role === 'user' && e.content.length > 15)
    .slice(0, 4)
    .map(e => `Apprenant : "${e.content.slice(0, 120)}"`)
    .join('\n');

  const prompt = [masteredList, hintList, failedList, excerpts ? `\nExtraits de session :\n${excerpts}` : '']
    .filter(Boolean).join('\n');

  if (!prompt.trim()) return res.status(200).json({ debrief: null });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `${prompt}

Écris un message court (3 phrases maximum) à l'apprenant à la fin de sa session :
- Si possible, cite entre guillemets une formulation ou question qui a montré une vraie compréhension
- Nomme ce qui reste à consolider sans dramatiser
- Ne commence jamais par "Bravo", "Bien joué", "Super", "Excellent" ou un adverbe approbateur
- Langue : français direct. Pas de preamble.`,
      }],
    });
    return res.status(200).json({ debrief: response.content[0].text.trim() });
  } catch (err) {
    console.error('[chat-debrief] Haiku error:', err.message);
    return res.status(200).json({ debrief: null });
  }
}

// ---- Génération du QCM ---------------------------------------------------
// space_id non requis : les notions à quizzer viennent du client (session de l'apprenant).
async function genererQuiz(req, res) {
  const notions = Array.isArray(req.body?.notions) ? req.body.notions : [];
  const plan = planifierQuestions(notions, 10);
  if (plan.length === 0) return res.status(200).json({ questions: [] });

  const liste = plan
    .map((q, i) => `${i + 1}. Notion « ${q.concept} » — ${q.definition || '(pas de définition)'}`)
    .join('\n');

  const prompt = `Tu conçois un court QCM de consolidation pour un apprenant qui vient de parcourir ces notions. Génère EXACTEMENT une question par ligne ci-dessous (${plan.length} questions), dans le même ordre.

${liste}

Contraintes par question :
- 4 options plausibles, une seule correcte
- place la bonne réponse à une position VARIABLE (pas toujours la même)
- aucune formulation de l'énoncé ou des options ne doit trahir la bonne réponse (pas d'indice de surface, pas de reprise littérale de la définition dans la seule bonne option)
- "explication" : une phrase disant quelle confusion les mauvaises réponses ciblent, ou pourquoi la bonne est correcte
- français direct, pas de preamble

Réponds en JSON strict : {"questions":[{"notion_concept":"...","enonce":"...","options":["...","...","...","..."],"correct_index":0,"explication":"..."}]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      output_config: { format: { type: 'json_schema', schema: QUIZ_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (response.content?.[0]?.text ?? '').trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter(q =>
        q && typeof q.enonce === 'string' &&
        Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o.trim()) &&
        Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3
      )
      .map(q => ({
        notion_concept: q.notion_concept || '',
        enonce: q.enonce,
        options: q.options,
        correct_index: q.correct_index,
        explication: q.explication || '',
      }));
    return res.status(200).json({ questions });
  } catch (err) {
    console.error('[chat-debrief] quiz-gen error:', err.message);
    return res.status(200).json({ questions: [] });
  }
}

// ---- Enregistrement des résultats -------------------------------------
async function enregistrerQuiz(req, res, { space_id }) {
  const { learner_code = null, resultats = [] } = req.body || {};
  if (!Array.isArray(resultats) || resultats.length === 0) {
    return res.status(200).json({ ok: true });
  }
  const rows = resultats
    .filter(r => r && typeof r.notion_concept === 'string')
    .map(r => ({ space_id, learner_code, notion_concept: r.notion_concept, correct: !!r.correct }));

  const { error } = await serviceClient().from('corpus_quiz_attempts').insert(rows);
  if (error) {
    console.error('[chat-debrief] quiz-submit insert:', error.message);
    return res.status(500).json({ error: 'Enregistrement impossible' });
  }
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run api/chat-debrief.test.js`
Expected : PASS (7 tests).

- [ ] **Step 5: Suite complète**

Run: `npm test`
Expected : tous verts (quizPlan 6 + chat-debrief 7 + les tests des chantiers précédents).

- [ ] **Step 6: Commit**

```bash
git add api/chat-debrief.js api/chat-debrief.test.js
git commit -m "feat: chat-debrief — routeur action (quiz-gen / quiz-submit) + débrief inchangé"
```

---

## Task 4: `src/components/QuizPanel.jsx`

**Files:**
- Create: `src/components/QuizPanel.jsx`
- Create: `src/components/QuizPanel.test.jsx`

- [ ] **Step 1: Écrire le test**

`src/components/QuizPanel.test.jsx` :

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import QuizPanel from './QuizPanel.jsx'

afterEach(cleanup)

const questions = [
  { notion_concept: 'A', enonce: 'Question A ?', options: ['a0', 'a1', 'a2', 'a3'], correct_index: 1, explication: 'a1 est correcte car…' },
  { notion_concept: 'B', enonce: 'Question B ?', options: ['b0', 'b1', 'b2', 'b3'], correct_index: 3, explication: 'b3 est correcte car…' },
]

describe('QuizPanel', () => {
  it('affiche la première question et ses 4 options', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    expect(screen.getByText('Question A ?')).toBeInTheDocument()
    for (const o of ['a0', 'a1', 'a2', 'a3']) expect(screen.getByRole('button', { name: o })).toBeInTheDocument()
  })

  it('cliquer une option fige le choix et montre l\'explication', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'a0' }))
    expect(screen.getByText(/a1 est correcte car/)).toBeInTheDocument()
    // recliquer une autre option ne change rien
    fireEvent.click(screen.getByRole('button', { name: 'a2' }))
    expect(screen.getByText(/a1 est correcte car/)).toBeInTheDocument()
  })

  it('avance jusqu\'au bout et appelle onDone avec les résultats', () => {
    const onDone = vi.fn()
    render(<QuizPanel questions={questions} onDone={onDone} />)
    // Q1 : mauvaise réponse (a0, correct=1)
    fireEvent.click(screen.getByRole('button', { name: 'a0' }))
    fireEvent.click(screen.getByRole('button', { name: /question suivante/i }))
    // Q2 : bonne réponse (b3, correct=3)
    fireEvent.click(screen.getByRole('button', { name: 'b3' }))
    fireEvent.click(screen.getByRole('button', { name: /voir mon bilan/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith([
      { notion_concept: 'A', correct: false },
      { notion_concept: 'B', correct: true },
    ])
  })

  it('affiche la progression i/N', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/components/QuizPanel.test.jsx`
Expected : FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/components/QuizPanel.jsx`**

```jsx
import { useState } from 'react';

export default function QuizPanel({ questions, onDone }) {
  const [i, setI] = useState(0);
  const [choisi, setChoisi] = useState(null); // index option cliquée pour la question courante
  const [resultats, setResultats] = useState([]);

  const q = questions[i];
  const derniere = i === questions.length - 1;
  const repondu = choisi !== null;

  function choisir(idx) {
    if (repondu) return;
    setChoisi(idx);
    setResultats(prev => [...prev, { notion_concept: q.notion_concept, correct: idx === q.correct_index }]);
  }

  function suivant() {
    if (derniere) {
      onDone(resultats);
      return;
    }
    setI(i + 1);
    setChoisi(null);
  }

  return (
    <div className="border-t bg-white px-4 py-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Défi de consolidation</p>
        <p className="text-xs text-gray-400">{i + 1} / {questions.length}</p>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-[#0a9370] transition-all" style={{ width: `${((i + 1) / questions.length) * 100}%` }} />
      </div>

      <p className="text-sm font-medium text-gray-800 mb-3">{q.enonce}</p>

      <div className="flex flex-col gap-2">
        {q.options.map((opt, idx) => {
          let cls = 'border-gray-300 hover:border-teal-400';
          if (repondu) {
            if (idx === q.correct_index) cls = 'border-[#0a9370] bg-teal-50';
            else if (idx === choisi) cls = 'border-red-400 bg-red-50';
            else cls = 'border-gray-200 opacity-60';
          }
          return (
            <button
              key={idx}
              type="button"
              onClick={() => choisir(idx)}
              disabled={repondu}
              aria-pressed={choisi === idx}
              className={`text-left text-sm border rounded px-3 py-2 transition ${cls} disabled:cursor-default`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {repondu && (
        <div className="mt-3" role="status">
          <p className={`text-xs font-medium ${choisi === q.correct_index ? 'text-[#0a9370]' : 'text-red-500'}`}>
            {choisi === q.correct_index ? 'Correct.' : 'Pas tout à fait.'}
          </p>
          <p className="text-xs text-gray-600 mt-1">{q.explication}</p>
          <button
            type="button"
            onClick={suivant}
            className="mt-3 bg-[#0a9370] text-white px-5 py-2 rounded text-sm font-semibold"
          >
            {derniere ? 'Voir mon bilan' : 'Question suivante'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/components/QuizPanel.test.jsx`
Expected : PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/QuizPanel.jsx src/components/QuizPanel.test.jsx
git commit -m "feat: QuizPanel — QCM une question par écran, feedback immédiat"
```

---

## Task 5: `src/components/ChatMessage.jsx` — 3 nouveaux rendus

**Files:**
- Modify: `src/components/ChatMessage.jsx`
- Create: `src/components/ChatMessage.test.jsx`

- [ ] **Step 1: Écrire le test**

`src/components/ChatMessage.test.jsx` :

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ChatMessage from './ChatMessage.jsx'

afterEach(cleanup)

describe('ChatMessage — rendus quiz', () => {
  it('isQuizOffer : texte + boutons Oui / Non merci', () => {
    const onAccept = vi.fn(), onDecline = vi.fn()
    render(<ChatMessage isQuizOffer onQuizAccept={onAccept} onQuizDecline={onDecline} />)
    expect(screen.getByText(/renforce ta mémoire/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /oui/i }))
    expect(onAccept).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /non merci/i }))
    expect(onDecline).toHaveBeenCalled()
  })

  it('isQuizDeclined : message discret', () => {
    render(<ChatMessage isQuizDeclined content="Pas de souci." />)
    expect(screen.getByText('Pas de souci.')).toBeInTheDocument()
  })

  it('isQuizResult : bilan factuel avec notions à revoir', () => {
    render(<ChatMessage isQuizResult quizScore={3} quizTotal={5} quizToReview={['Photosynthèse', 'ATP']} />)
    expect(screen.getByText(/3 questions sur 5/i)).toBeInTheDocument()
    expect(screen.getByText(/Photosynthèse/)).toBeInTheDocument()
    expect(screen.getByText(/ATP/)).toBeInTheDocument()
  })

  it('isQuizResult : sans notion à revoir, pas de section « à revoir »', () => {
    render(<ChatMessage isQuizResult quizScore={5} quizTotal={5} quizToReview={[]} />)
    expect(screen.queryByText(/à revoir/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/components/ChatMessage.test.jsx`
Expected : FAIL — les rendus n'existent pas.

- [ ] **Step 3: Modifier `src/components/ChatMessage.jsx`**

Étendre la destructuration des props (bloc `export default function ChatMessage({ … })`) en ajoutant :

```js
  isQuizOffer, onQuizAccept, onQuizDecline,
  isQuizDeclined,
  isQuizResult, quizScore, quizTotal, quizToReview,
```

Puis ajouter ces 3 blocs juste avant `// Debrief: message de fin de session, centré` :

```jsx
  // Proposition du défi de consolidation
  if (isQuizOffer) {
    return (
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-md bg-white px-5 py-4 text-sm" style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
          <p className="leading-relaxed mb-3" style={{color:'var(--text)'}}>
            Te tester sur ce que tu viens de voir renforce ta mémoire. Veux-tu essayer ?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onQuizAccept}
              className="bg-[#0a9370] text-white px-4 py-2 rounded-full text-xs font-semibold">
              Oui
            </button>
            <button type="button" onClick={onQuizDecline}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-full text-xs font-medium">
              Non merci
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Refus du défi
  if (isQuizDeclined) {
    return (
      <div className="flex justify-center mb-4">
        <div className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-full" style={{ background: '#f1f5f9', color: '#475569' }}>
          <span>{content}</span>
        </div>
      </div>
    );
  }

  // Bilan du défi de consolidation — factuel, pas de score triomphal
  if (isQuizResult) {
    return (
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-md px-5 py-4 text-sm" style={{background:'#f0fdf4', border:'1px solid #bbf7d0', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
          <p style={{color:'var(--text)'}}>
            Tu as répondu juste à {quizScore} question{quizScore > 1 ? 's' : ''} sur {quizTotal}.
          </p>
          {quizToReview && quizToReview.length > 0 && (
            <p className="text-xs mt-2" style={{color:'var(--text2)'}}>
              À revoir : {quizToReview.join(', ')}.
            </p>
          )}
          {flashDeckId && (
            <a href="https://flashfwb-cd2m.vercel.app" target="_blank" rel="noopener noreferrer"
              className="inline-block mt-3 text-xs text-[#0a9370] hover:underline">
              Réviser dans FlashFWB →
            </a>
          )}
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/components/ChatMessage.test.jsx`
Expected : PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatMessage.jsx src/components/ChatMessage.test.jsx
git commit -m "feat: ChatMessage — rendus isQuizOffer / isQuizDeclined / isQuizResult"
```

---

## Task 6: `src/pages/learner/Chat.jsx` — opt-in + quiz

**Files:**
- Modify: `src/pages/learner/Chat.jsx`

- [ ] **Step 1: Ajouter l'état et les handlers**

Dans le composant `Chat`, ajouter aux `useState` :

```js
  const [quizQuestions, setQuizQuestions] = useState(null); // null = pas de quiz en cours
  const [quizLoading, setQuizLoading] = useState(false);
```

Importer `QuizPanel` en tête :

```js
import QuizPanel from '../../components/QuizPanel';
```

- [ ] **Step 2: Injecter l'offre de quiz après le débrief**

Dans `openNotion`, à la fin du bloc `index >= notionsList.length` : après l'injection du message `isDebrief` (dans le `try`/`catch` qui appelle `/api/chat-debrief`), et **uniquement si `hasCurriculum` et `Object.keys(currentOutcomes).length > 0`**, ajouter après `setDebriefLoading(false)` (dans le `finally` ou juste après le `setMessages` du debrief) :

```js
      // Proposer le défi de consolidation
      if (hasCurriculum && Object.keys(currentOutcomes).length > 0) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: '', rawContent: '',
          isQuizOffer: true,
          quizOutcomes: currentOutcomes,   // figé pour le quiz-gen
        }]);
      }
```

Le rendu du message `isQuizOffer` passe les callbacks : dans le `.map` des messages (`{messages.map((m, i) => <ChatMessage key={i} {...m} … />)}`), ajouter au spread les props de callback quand `m.isQuizOffer` :

```jsx
        {messages.map((m, i) => (
          <ChatMessage
            key={i}
            {...m}
            onFeedback={m.showFeedback && m.messageId ? (helpful) => sendFeedback(m.messageId, helpful) : null}
            onQuizAccept={m.isQuizOffer ? () => lancerQuiz(m.quizOutcomes) : undefined}
            onQuizDecline={m.isQuizOffer ? refuserQuiz : undefined}
          />
        ))}
```

- [ ] **Step 3: Ajouter `lancerQuiz`, `refuserQuiz`, `terminerQuiz`**

```js
  async function lancerQuiz(outcomes) {
    setQuizLoading(true);
    try {
      const payloadNotions = notions.map(n => ({
        concept: n.concept,
        definition: n.definition || '',
        outcome: outcomes[n.concept] ?? 'mastered',
      }));
      const res = await fetch('/api/chat-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'quiz-gen', notions: payloadNotions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: "Le test n'a pas pu être préparé cette fois.", rawContent: '', isQuizDeclined: true,
        }]);
        return;
      }
      setQuizQuestions(data.questions);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', content: "Le test n'a pas pu être préparé cette fois.", rawContent: '', isQuizDeclined: true,
      }]);
    } finally {
      setQuizLoading(false);
    }
  }

  function refuserQuiz() {
    setMessages(prev => [...prev, {
      role: 'assistant', content: 'Pas de souci.', rawContent: '', isQuizDeclined: true,
    }]);
  }

  async function terminerQuiz(resultats) {
    setQuizQuestions(null);
    // Enregistrement silencieux
    fetch('/api/chat-debrief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'quiz-submit', learner_code: learnerCode || null, resultats }),
    }).catch(() => { /* l'enregistrement est un bonus */ });

    const score = resultats.filter(r => r.correct).length;
    const aRevoir = [...new Set(
      resultats.filter(r => !r.correct).map(r => r.notion_concept).filter(Boolean)
    )];
    setMessages(prev => [...prev, {
      role: 'assistant', content: '', rawContent: '',
      isQuizResult: true,
      quizScore: score, quizTotal: resultats.length, quizToReview: aRevoir,
      flashDeckId,
    }]);
  }
```

- [ ] **Step 4: Monter `QuizPanel` à la place de la zone de saisie**

Dans le JSX, le bas de page a une condition `{connectionPrompt ? (…) : (<form onSubmit={sendMessage} …>)}`. L'étendre :

```jsx
      {quizQuestions ? (
        <QuizPanel questions={quizQuestions} onDone={terminerQuiz} />
      ) : connectionPrompt ? (
        /* … bloc connectionPrompt existant … */
      ) : (
        /* … form sendMessage existant … */
      )}
```

(Garder les blocs `connectionPrompt` et `form` tels quels — seul le `quizQuestions ?` est ajouté devant.)

Ajouter aussi, dans la zone des messages, un indicateur pendant `quizLoading` (à côté de `debriefLoading`) :

```jsx
        {quizLoading && (
          <div className="flex justify-center mb-4">
            <div className="text-xs px-4 py-2" style={{color:'var(--text3)'}}>Préparation du test…</div>
          </div>
        )}
```

- [ ] **Step 5: Build check**

Run: `npx vite build`
Expected : build OK.

- [ ] **Step 6: Suite complète**

Run: `npm test`
Expected : tous verts (aucun test Chat.jsx ajouté ici — le flux est couvert par QuizPanel + ChatMessage + chat-debrief ; un test d'intégration Chat.jsx serait fragile vu la taille du composant).

- [ ] **Step 7: Commit**

```bash
git add src/pages/learner/Chat.jsx
git commit -m "feat: Chat — offre + lancement du défi de consolidation après le débrief"
```

---

## Task 7: `src/pages/admin/Dashboard.jsx` — section défi de consolidation

**Files:**
- Modify: `src/pages/admin/Dashboard.jsx`

- [ ] **Step 1: Ajouter la 7ᵉ requête**

Dans `load()`, le `Promise.all([...])` a 6 entrées. Ajouter une 7ᵉ :

```js
        supabase.from('corpus_quiz_attempts')
          .select('learner_code, notion_concept, correct, created_at')
          .eq('space_id', spaceId).order('created_at', { ascending: false }),
```

et l'ajouter à la destructuration : `const [{ data: messages }, { data: nodes }, { data: codes }, { data: space }, { data: connData }, { data: confirmations }, { data: quizRows }] = await Promise.all([...])`.

- [ ] **Step 2: Agréger par notion**

Après `setConnections(connData || []);`, ajouter :

```js
      // ---- Défi de consolidation ----
      const quiz = quizRows || [];
      const quizByNotion = {};
      quiz.forEach(r => {
        const k = r.notion_concept || '(sans notion)';
        (quizByNotion[k] ??= { total: 0, correct: 0 });
        quizByNotion[k].total++;
        if (r.correct) quizByNotion[k].correct++;
      });
      const quizStats = Object.entries(quizByNotion)
        .map(([concept, s]) => ({ concept, total: s.total, correct: s.correct, pct: s.total ? s.correct / s.total : 0 }))
        .sort((a, b) => a.pct - b.pct);
      setQuizStats(quizStats);
```

Ajouter le state en tête du composant : `const [quizStats, setQuizStats] = useState([]);`

- [ ] **Step 3: Ajouter la section au rendu**

Juste avant le bloc `{blockedQuestions.length > 0 && (…)}`, ajouter :

```jsx
      {quizStats.length > 0 && (
        <div className="dashboard-print">
          <h3 className="label-upper mb-1">Défi de consolidation</h3>
          <p className="text-xs text-gray-400 mb-3">
            Taux de réussite au QCM post-parcours, par notion (agrégat classe, codes anonymes).
            Une notion acquise au parcours mais souvent ratée ici n'est pas encore consolidée.
            S'appuie sur l'effet de test — récupération en mémoire (McMullin &amp; Masson, 2023).
          </p>
          <div className="space-y-1.5">
            {quizStats.map(q => {
              const alerte = q.pct < 0.5;
              return (
                <div key={q.concept}
                  className="flex items-center gap-3 border rounded px-4 py-2.5"
                  style={{ background: alerte ? '#fff7ed' : 'white', borderColor: alerte ? '#fed7aa' : 'var(--border)' }}>
                  <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: alerte ? '#f97316' : '#0a9370', color: 'white' }}>
                    {Math.round(q.pct * 100)} %
                  </span>
                  <span className="text-sm text-gray-800 flex-1">{q.concept}</span>
                  <span className="text-xs text-gray-500 shrink-0">{q.correct}/{q.total} réponses justes</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Build check**

Run: `npx vite build`
Expected : build OK.

- [ ] **Step 5: Suite complète**

Run: `npm test`
Expected : tous verts (pas de test Dashboard ajouté — cohérent avec l'absence de test Dashboard existant ; la section est de l'agrégation simple).

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/Dashboard.jsx
git commit -m "feat: Dashboard — section défi de consolidation (taux de réussite par notion)"
```

---

## Task 8: Documentation + vérification finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Documenter dans `README.md`**

Ajouter après la section « Génération du curriculum » :

```markdown
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
```

- [ ] **Step 2: Suite complète + build**

Run: `npm test && npx vite build`
Expected : tous les tests verts, build OK.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: défi de consolidation, RISS, plafond 12 fonctions"
```

- [ ] **Step 4: (manuel, après déploiement) Vérification prod**

Sur un espace CorpusActif en mode socratique avec curriculum et documents :
1. Parcourir toutes les notions jusqu'au bout.
2. Après le débrief, l'offre « Veux-tu essayer ? » apparaît. Cliquer Oui.
3. Le QCM se charge, une question par écran, feedback + explication après chaque réponse.
4. Le bilan factuel s'affiche (« X sur N », notions à revoir).
5. Côté enseignant : la section « Défi de consolidation » du Dashboard montre le taux par notion.
6. Vérifier qu'une notion « acquise » au parcours mais ratée au quiz apparaît bien dans les
   deux vues avec des signaux différents.

---

## Notes de mise en œuvre

- **Pas de push sur `master`** — branche Vercel = `main`.
- **Build check obligatoire** (`npx vite build`) avant tout push.
- **Projet Supabase `dfoaumjleqtxjeaplnna`** (pas FlashFWB) — migration manuelle, aucune
  migration automatique.
- **RISS** : les 7 références sont vérifiées dans le corpus (spec §2). Ne pas en ajouter
  d'autres sans `mcp__RISS__search_articles`.
- **`output_config`** : supporté par `@anthropic-ai/sdk@0.100.1` (établi au chantier 2).
- **Modèle** `claude-haiku-4-5-20251001` — cohérent avec le reste de `api/`.
- **Anti-cheat** : `correct_index` est dans le payload client. Assumé (spec §3).
