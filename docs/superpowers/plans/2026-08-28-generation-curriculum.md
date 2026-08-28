# Génération du curriculum depuis les documents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton « Générer depuis les documents » dans l'onglet Curriculum de CorpusActif : extraction Haiku d'une ossature (chapitres optionnels → concepts) dans une zone brouillon éditable, fusionnée par l'enseignant, sans nouvelle fonction serverless.

**Architecture:** La génération est une branche `action: 'generate'` de `api/curriculum.js` (plafond 12 fonctions Vercel Hobby atteint). Elle lit les chunks de l'espace, appelle Haiku, renvoie un objet non persisté. Le composant `Curriculum.jsx` affiche ce brouillon dans un panneau séparé ; la validation insère les nœuds en 2 passes (parents = chapitres, puis enfants = concepts avec `parent_id`). L'affichage admin devient groupé par parent. Les templates préservent la hiérarchie. `chat-init.js` exclut les nœuds chapitre du parcours élève.

**Tech Stack:** React 19, Vite 8, Vercel Serverless (Node ESM), `@anthropic-ai/sdk@0.100.1` (Haiku), `@supabase/supabase-js@2` (pgvector + RLS), Vitest (ajouté par ce plan). Projet Supabase mutualisé « Flashfwb ». Déploiement : GitHub `jfb4plai/` → Vercel, branche `main`.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `package.json` | scripts test + devDep vitest | Modify |
| `vitest.config.js` | config Vitest (node par défaut, jsdom pour `src/pages/**`) | Create |
| `src/lib/curriculumDraft.js` | fonctions pures : `draftToNodes` (brouillon → {parents, enfants}), `groupNodes` (liste plate → groupes parent/enfants/orphelins) | Create |
| `src/lib/curriculumDraft.test.js` | tests des deux fonctions | Create |
| `api/curriculum.js` | branche `action: 'generate'` : auth stricte, lecture chunks, appel Haiku, schéma sortie | Modify |
| `api/curriculum.test.js` | tests de la branche generate (fetch Anthropic mocké) + non-régression CRUD | Create |
| `api/chat-init.js` | SOURCE A : exclure les nœuds parents d'un autre nœud | Modify |
| `api/chat-init.test.js` | test de l'exclusion des chapitres | Create |
| `src/pages/admin/Curriculum.jsx` | bouton, panneau brouillon, `appliquerBrouillon`, rendu groupé, templates 2 passes | Modify |
| `src/pages/admin/Curriculum.test.jsx` | rendu groupé + panneau brouillon | Create |
| `README.md` | documenter la génération + plafond 12 fonctions | Modify |

Inchangés : schéma Supabase (`corpus_curriculum_nodes` + `parent_id` existent), `Chat.jsx`, `Dashboard.jsx`, tout le reste de `api/`.

---

## Task 1: Ajouter Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Installer les dépendances de test**

Le projet est sur Vite 8 → Vitest doit être compatible Vite 8 (Vitest 3.x). Installer la
dernière ligne compatible :

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```
Expected : ajout à `devDependencies`. Si npm signale un conflit de peer-deps avec `vite@8`,
épingler `vitest@latest` explicitement et relancer ; ne pas downgrader Vite.

- [ ] **Step 2: Ajouter les scripts**

Dans `package.json`, remplacer le bloc `"scripts"` par :

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Créer `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/pages/**', 'jsdom']],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 4: Vérifier**

Run: `npm test`
Expected : `No test files found, exiting with code 0`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "test: ajoute vitest + jsdom"
```

---

## Task 2: `src/lib/curriculumDraft.js` — fonctions pures

**Files:**
- Create: `src/lib/curriculumDraft.js`
- Create: `src/lib/curriculumDraft.test.js`

- [ ] **Step 1: Écrire le test**

`src/lib/curriculumDraft.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { draftToNodes, groupNodes } from './curriculumDraft.js'

describe('draftToNodes', () => {
  const draft = {
    chapitres: [
      { titre: 'Chapitre A', concepts: [
        { concept: 'A1', definition: 'def A1' },
        { concept: 'A2', definition: 'def A2' },
      ]},
      { titre: 'Chapitre B', concepts: [
        { concept: 'B1', definition: 'def B1' },
      ]},
    ],
    concepts_sans_chapitre: [
      { concept: 'X1', definition: 'def X1' },
    ],
  }

  it('un chapitre avec 2 concepts cochés → 1 parent + 2 enfants', () => {
    // kept : Map "chapIdx:conceptIdx" ou "orphan:idx" -> { keep, parentKey }
    const kept = {
      '0:0': { keep: true, parentKey: 'chap:0' },
      '0:1': { keep: true, parentKey: 'chap:0' },
      '1:0': { keep: false, parentKey: 'chap:1' },
      'orphan:0': { keep: true, parentKey: null },
    }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([{ tempId: 'chap:0', concept: 'Chapitre A', definition: '', level: null }])
    expect(enfants).toEqual([
      { tempId: '0:0', parentTempId: 'chap:0', concept: 'A1', definition: 'def A1' },
      { tempId: '0:1', parentTempId: 'chap:0', concept: 'A2', definition: 'def A2' },
      { tempId: 'orphan:0', parentTempId: null, concept: 'X1', definition: 'def X1' },
    ])
  })

  it('chapitre sans concept coché → aucun nœud pour ce chapitre', () => {
    const kept = { '1:0': { keep: false, parentKey: 'chap:1' } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([])
    expect(enfants).toEqual([])
  })

  it('concept déplacé vers "sans chapitre" → parentTempId null', () => {
    const kept = { '0:0': { keep: true, parentKey: null } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([])
    expect(enfants).toEqual([
      { tempId: '0:0', parentTempId: null, concept: 'A1', definition: 'def A1' },
    ])
  })

  it('concept orphelin déplacé vers un chapitre → crée le parent', () => {
    const kept = { 'orphan:0': { keep: true, parentKey: 'chap:1' } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([{ tempId: 'chap:1', concept: 'Chapitre B', definition: '', level: null }])
    expect(enfants).toEqual([
      { tempId: 'orphan:0', parentTempId: 'chap:1', concept: 'X1', definition: 'def X1' },
    ])
  })

  it('rien de coché → vide', () => {
    expect(draftToNodes(draft, {})).toEqual({ parents: [], enfants: [] })
  })

  it('utilise les valeurs éditées quand fournies dans overrides', () => {
    const kept = { '0:0': { keep: true, parentKey: 'chap:0', concept: 'A1 modifié', definition: 'nouvelle def' } }
    const { enfants } = draftToNodes(draft, kept)
    expect(enfants[0]).toMatchObject({ concept: 'A1 modifié', definition: 'nouvelle def' })
  })
})

describe('groupNodes', () => {
  it('parent + 2 enfants → 1 groupe ; nœud seul → orphelin', () => {
    const nodes = [
      { id: 'p1', concept: 'Chap 1', parent_id: null },
      { id: 'c1', concept: 'Concept 1', parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', parent_id: 'p1' },
      { id: 'o1', concept: 'Orphelin', parent_id: null },
    ]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes).toHaveLength(1)
    expect(groupes[0].parent.id).toBe('p1')
    expect(groupes[0].enfants.map(n => n.id)).toEqual(['c1', 'c2'])
    expect(orphelins.map(n => n.id)).toEqual(['o1'])
  })

  it('enfant dont le parent est absent → orphelin', () => {
    const nodes = [{ id: 'c1', concept: 'C', parent_id: 'disparu' }]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes).toEqual([])
    expect(orphelins.map(n => n.id)).toEqual(['c1'])
  })

  it('préserve l\'ordre d\'entrée des groupes et des orphelins', () => {
    const nodes = [
      { id: 'o1', concept: 'O1', parent_id: null },
      { id: 'p1', concept: 'P1', parent_id: null },
      { id: 'c1', concept: 'C1', parent_id: 'p1' },
    ]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes.map(g => g.parent.id)).toEqual(['p1'])
    expect(orphelins.map(n => n.id)).toEqual(['o1'])
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/lib/curriculumDraft.test.js`
Expected : FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/lib/curriculumDraft.js`**

```js
// Fonctions pures pour la génération/édition du curriculum.
// draftToNodes : transforme un brouillon généré (+ les choix de l'enseignant) en nœuds
//   prêts à insérer, en 2 groupes (parents d'abord, enfants ensuite avec parentTempId).
// groupNodes  : transforme la liste plate corpus_curriculum_nodes en groupes affichables
//   (un parent + ses enfants) + orphelins.

// --- draftToNodes -----------------------------------------------------------

// draft : { chapitres: [{ titre, concepts: [{ concept, definition }] }], concepts_sans_chapitre: [{ concept, definition }] }
// kept  : objet { [key]: { keep, parentKey, concept?, definition? } }
//   key       = `${chapIdx}:${conceptIdx}` pour un concept de chapitre, `orphan:${idx}` pour un concept sans chapitre
//   parentKey = `chap:${chapIdx}` (rattaché à un chapitre) ou null (sans chapitre)
//   concept / definition : valeurs éditées par l'enseignant (sinon on prend celles du draft)
export function draftToNodes(draft, kept) {
  const enfants = []
  const parentKeysUtilises = new Set()

  const pousser = (key, srcConcept, srcDefinition) => {
    const choix = kept[key]
    if (!choix || !choix.keep) return
    const parentTempId = choix.parentKey ?? null
    if (parentTempId) parentKeysUtilises.add(parentTempId)
    enfants.push({
      tempId: key,
      parentTempId,
      concept: (choix.concept ?? srcConcept ?? '').trim(),
      definition: (choix.definition ?? srcDefinition ?? '').trim(),
    })
  }

  ;(draft.chapitres ?? []).forEach((chap, ci) => {
    ;(chap.concepts ?? []).forEach((c, coi) => pousser(`${ci}:${coi}`, c.concept, c.definition))
  })
  ;(draft.concepts_sans_chapitre ?? []).forEach((c, i) => pousser(`orphan:${i}`, c.concept, c.definition))

  // Un parent n'est créé que s'il a au moins un enfant retenu.
  const parents = []
  parentKeysUtilises.forEach((pk) => {
    const ci = Number(pk.split(':')[1])
    const titre = draft.chapitres?.[ci]?.titre ?? `Chapitre ${ci + 1}`
    parents.push({ tempId: pk, concept: titre.trim(), definition: '', level: null })
  })
  // Ordre stable : par index de chapitre
  parents.sort((a, b) => Number(a.tempId.split(':')[1]) - Number(b.tempId.split(':')[1]))

  return { parents, enfants }
}

// --- groupNodes -----------------------------------------------------------

// nodes : lignes corpus_curriculum_nodes ({ id, concept, definition, level, parent_id })
// retour : { groupes: [{ parent, enfants: [] }], orphelins: [] }
export function groupNodes(nodes) {
  const parIdMap = new Map(nodes.map(n => [n.id, n]))
  const enfantsParParent = new Map()
  for (const n of nodes) {
    if (n.parent_id && parIdMap.has(n.parent_id)) {
      if (!enfantsParParent.has(n.parent_id)) enfantsParParent.set(n.parent_id, [])
      enfantsParParent.get(n.parent_id).push(n)
    }
  }

  const groupes = []
  const orphelins = []
  const dejaEnfant = new Set()
  for (const arr of enfantsParParent.values()) for (const c of arr) dejaEnfant.add(c.id)

  for (const n of nodes) {
    if (dejaEnfant.has(n.id)) continue
    const enfants = enfantsParParent.get(n.id)
    if (enfants && enfants.length > 0) {
      groupes.push({ parent: n, enfants })
    } else {
      orphelins.push(n)
    }
  }
  return { groupes, orphelins }
}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/lib/curriculumDraft.test.js`
Expected : PASS (tous les tests des deux describe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/curriculumDraft.js src/lib/curriculumDraft.test.js
git commit -m "feat: curriculumDraft — draftToNodes + groupNodes (fonctions pures)"
```

---

## Task 3: `api/curriculum.js` — branche `action: 'generate'`

**Files:**
- Modify: `api/curriculum.js`
- Create: `api/curriculum.test.js`

- [ ] **Step 1: Écrire le test**

`api/curriculum.test.js` :

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './curriculum.js'

const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  VITE_SUPABASE_ANON_KEY: 'anon',
  ANTHROPIC_API_KEY: 'k',
}

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { this.ended = true; return this },
  }
}

// --- Mock @supabase/supabase-js -------------------------------------------------
// On simule un client dont .from(table) renvoie un builder chaînable.
let supabaseScenario

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => supabaseScenario.getUser() },
    from: (table) => supabaseScenario.from(table),
  }),
}))

// --- Mock @anthropic-ai/sdk ---------------------------------------------------
let anthropicScenario
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async (args) => anthropicScenario(args) }
  },
}))

beforeEach(() => {
  Object.assign(process.env, ENV)
  vi.clearAllMocks()
  supabaseScenario = {
    getUser: async () => ({ data: { user: { id: 'u1' } } }),
    from: (table) => {
      if (table === 'corpus_spaces') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 's1', name: 'La photosynthèse', matiere: 'Sciences', niveau: '4e' } }) }) }) }
      }
      if (table === 'corpus_chunks') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [
          { content: 'La photosynthèse transforme la lumière en énergie chimique.' },
          { content: 'Le chloroplaste contient la chlorophylle.' },
        ] }) }) }) }
      }
      throw new Error('table inattendue ' + table)
    },
  }
  anthropicScenario = async () => ({
    content: [{ text: JSON.stringify({
      chapitres: [{ titre: 'Mécanisme', concepts: [{ concept: 'Photosynthèse', definition: 'Conversion lumière → énergie.' }] }],
      concepts_sans_chapitre: [{ concept: 'Chloroplaste', definition: 'Organite de la photosynthèse.' }],
    }) }],
  })
})

describe('api/curriculum — branche generate', () => {
  it('sans Authorization → 401', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('espace introuvable / non possédé → 403', async () => {
    supabaseScenario.from = (table) => {
      if (table === 'corpus_spaces') return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
      throw new Error('inattendu')
    }
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(403)
  })

  it('aucun chunk → 400', async () => {
    const base = supabaseScenario.from
    supabaseScenario.from = (table) => {
      if (table === 'corpus_chunks') return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
      return base(table)
    }
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(400)
  })

  it('réponse Haiku valide → 200 { resultat: { chapitres, concepts_sans_chapitre } }', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.resultat.chapitres[0].titre).toBe('Mécanisme')
    expect(res.body.resultat.concepts_sans_chapitre[0].concept).toBe('Chloroplaste')
  })

  it('Haiku renvoie du JSON entouré de ```json → parsé quand même', async () => {
    anthropicScenario = async () => ({ content: [{ text: '```json\n{"chapitres":[],"concepts_sans_chapitre":[{"concept":"C","definition":"d"}]}\n```' }] })
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.resultat.concepts_sans_chapitre[0].concept).toBe('C')
  })

  it('Haiku renvoie du non-JSON → 500', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'désolé je ne peux pas' }] })
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(500)
  })

  it('POST sans action (CRUD existant) n\'est pas intercepté par la branche generate', async () => {
    // On ne teste pas le CRUD complet ici, juste que la branche generate ne s'active pas.
    // Le mock corpus_curriculum_nodes n'est pas fourni → si la branche generate s'activait,
    // on aurait un 200/400/403 ; le CRUD tentera d'accéder à corpus_curriculum_nodes et
    // lèvera "table inattendue", donc on attend un throw ou un 500, pas un 200 resultat.
    const res = mockRes()
    let threw = false
    try {
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: { space_id: 's1' }, body: { concept: 'x', definition: 'y' } }, res)
    } catch { threw = true }
    expect(res.body?.resultat).toBeUndefined()
    expect(threw || res.statusCode !== 200).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run api/curriculum.test.js`
Expected : FAIL — la branche `action: 'generate'` n'existe pas, `body.action` est ignoré, le CRUD s'exécute et casse sur le mock.

- [ ] **Step 3: Modifier `api/curriculum.js`**

Ajouter en tête l'import Anthropic et le constructeur, puis la branche `generate` avant le CRUD. Le fichier complet devient :

```js
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CURRICULUM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chapitres', 'concepts_sans_chapitre'],
  properties: {
    chapitres: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'concepts'],
        properties: {
          titre: { type: 'string' },
          concepts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['concept', 'definition'],
              properties: { concept: { type: 'string' }, definition: { type: 'string' } },
            },
          },
        },
      },
    },
    concepts_sans_chapitre: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['concept', 'definition'],
        properties: { concept: { type: 'string' }, definition: { type: 'string' } },
      },
    },
  },
};

async function genererCurriculum(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  const { space_id } = req.body;
  if (!space_id) return res.status(400).json({ error: 'space_id requis' });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

  // Client user (ANON) : vérifie la propriété de l'espace via RLS.
  const userClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Session invalide' });

  const { data: space } = await userClient
    .from('corpus_spaces')
    .select('id, name, matiere, niveau')
    .eq('id', space_id)
    .single();
  if (!space) return res.status(403).json({ error: 'Espace introuvable ou accès refusé' });

  // Client service : lecture des chunks.
  const service = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: chunks } = await service
    .from('corpus_chunks')
    .select('content')
    .eq('space_id', space_id)
    .order('created_at');

  if (!chunks || chunks.length === 0) {
    return res.status(400).json({ error: 'Aucun document indexé — ajoutez des documents avant de générer le curriculum.' });
  }

  const MAX_CHUNKS = 120;
  const pas = chunks.length > MAX_CHUNKS ? Math.ceil(chunks.length / MAX_CHUNKS) : 1;
  const extraits = chunks
    .filter((_, i) => i % pas === 0)
    .map(c => (c.content || '').slice(0, 500))
    .join('\n---\n');

  const contexte = [
    space.matiere && `Matière : ${space.matiere}`,
    space.niveau && `Niveau : ${space.niveau}`,
  ].filter(Boolean).join(' — ');

  const prompt = `Tu analyses des extraits de cours pour en dégager l'ossature pédagogique que l'apprenant doit maîtriser.
${contexte ? contexte + '\n' : ''}
Identifie les notions-clés (concept + définition courte, 1-2 phrases, tirée du contenu).
Regroupe-les en chapitres UNIQUEMENT si les extraits révèlent une structure claire (parties, thèmes distincts). Si le contenu est court ou homogène, ne crée pas de chapitres : mets tout dans "concepts_sans_chapitre".
Pas de notion inventée hors du contenu. Pas de doublon.

Réponds en JSON strict, sans texte avant ni après, avec la forme :
{"chapitres":[{"titre":"...","concepts":[{"concept":"...","definition":"..."}]}],"concepts_sans_chapitre":[{"concept":"...","definition":"..."}]}

EXTRAITS :
${extraits}`;

  let resultat;
  try {
    const params = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    };
    // Sortie structurée si supportée par le SDK ; sinon on retombe sur le parsing tolérant.
    // À l'implémentation : vérifier si params.output_config est accepté par @anthropic-ai/sdk@0.100.1.
    // Si oui : params.output_config = { format: { type: 'json_schema', schema: CURRICULUM_SCHEMA } }
    const response = await anthropic.messages.create(params);
    const raw = (response.content?.[0]?.text ?? '').trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    resultat = {
      chapitres: Array.isArray(parsed.chapitres)
        ? parsed.chapitres
            .filter(ch => ch && ch.titre)
            .map(ch => ({
              titre: ch.titre,
              concepts: (Array.isArray(ch.concepts) ? ch.concepts : [])
                .filter(c => c && c.concept)
                .map(c => ({ concept: c.concept, definition: c.definition || '' })),
            }))
            .filter(ch => ch.concepts.length > 0)
        : [],
      concepts_sans_chapitre: Array.isArray(parsed.concepts_sans_chapitre)
        ? parsed.concepts_sans_chapitre
            .filter(c => c && c.concept)
            .map(c => ({ concept: c.concept, definition: c.definition || '' }))
        : [],
    };
  } catch (err) {
    console.error('[curriculum.generate] échec:', err.message);
    return res.status(500).json({ error: 'La génération du curriculum a échoué. Réessayez.' });
  }

  if (resultat.chapitres.length === 0 && resultat.concepts_sans_chapitre.length === 0) {
    return res.status(500).json({ error: 'Aucune notion dégagée du contenu — enrichissez les documents.' });
  }

  return res.status(200).json({ resultat });
}

export default async function handler(req, res) {
  if (req.method === 'POST' && req.body?.action === 'generate') {
    return genererCurriculum(req, res);
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { space_id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .select('*')
      .eq('space_id', space_id)
      .order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { concept, definition, level, parent_id } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .insert({ space_id, concept, definition, level, parent_id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, concept, definition, level, parent_id } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .update({ concept, definition, level, parent_id })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const { error } = await supabase
      .from('corpus_curriculum_nodes')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).end();
  }

  return res.status(405).end();
}
```

- [ ] **Step 4: Vérifier `output_config`**

Run:
```bash
node -e "import('@anthropic-ai/sdk').then(async m => { const c = new m.default({apiKey: process.env.ANTHROPIC_API_KEY}); try { const r = await c.messages.create({ model:'claude-haiku-4-5-20251001', max_tokens: 50, output_config: { format: { type: 'json_schema', schema: { type:'object', properties:{ ok:{type:'boolean'} }, required:['ok'], additionalProperties:false } } }, messages:[{role:'user',content:'{\"ok\":true}'}] }); console.log('OUTPUT_CONFIG OK', r.content[0].text); } catch(e) { console.log('OUTPUT_CONFIG NON SUPPORTÉ:', e.message); } })"
```
(Nécessite `ANTHROPIC_API_KEY` dans l'env. Si pas de clé : sauter cette étape et rester sur le parsing tolérant.)

- Si `OUTPUT_CONFIG OK` → dans `genererCurriculum`, ajouter `params.output_config = { format: { type: 'json_schema', schema: CURRICULUM_SCHEMA } }` avant l'appel, garder le parsing tolérant en filet.
- Si `NON SUPPORTÉ` ou pas de clé → laisser tel quel (parsing tolérant seul).
- Documenter le choix dans un commentaire au-dessus de `const params`.

- [ ] **Step 5: Lancer — passe**

Run: `npx vitest run api/curriculum.test.js`
Expected : PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add api/curriculum.js api/curriculum.test.js
git commit -m "feat: api/curriculum — branche action:generate (Haiku, ossature depuis les chunks)"
```

---

## Task 4: `api/chat-init.js` — exclure les nœuds chapitre du parcours élève

**Files:**
- Modify: `api/chat-init.js`
- Create: `api/chat-init.test.js`

- [ ] **Step 1: Écrire le test**

`api/chat-init.test.js` :

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { filtrerNoeudsParcours } from './chat-init.js'

describe('filtrerNoeudsParcours', () => {
  it('exclut les nœuds qui sont parents d\'un autre nœud du lot', () => {
    const nodes = [
      { id: 'p1', concept: 'Chapitre 1', definition: '', parent_id: null },
      { id: 'c1', concept: 'Concept 1', definition: 'd1', parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', definition: 'd2', parent_id: 'p1' },
      { id: 'o1', concept: 'Notion seule', definition: 'd3', parent_id: null },
    ]
    const out = filtrerNoeudsParcours(nodes)
    expect(out.map(n => n.concept)).toEqual(['Concept 1', 'Concept 2', 'Notion seule'])
  })

  it('sans hiérarchie → renvoie tout', () => {
    const nodes = [
      { id: 'a', concept: 'A', definition: 'x', parent_id: null },
      { id: 'b', concept: 'B', definition: 'y', parent_id: null },
    ]
    expect(filtrerNoeudsParcours(nodes).map(n => n.concept)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run api/chat-init.test.js`
Expected : FAIL — `filtrerNoeudsParcours` n'est pas exporté.

- [ ] **Step 3: Modifier `api/chat-init.js`**

Ajouter la fonction pure exportée (près du haut du fichier, après les imports) :

```js
// Un nœud "chapitre" (parent d'un autre nœud) n'a pas de contenu propre à faire
// travailler à l'élève — on le retire du parcours socratique. La hiérarchie reste
// visible côté enseignant uniquement (chantier séparé pour la navigation élève).
export function filtrerNoeudsParcours(nodes) {
  const parentIds = new Set(nodes.filter(n => n.parent_id).map(n => n.parent_id));
  return nodes.filter(n => !parentIds.has(n.id));
}
```

Dans le handler, SOURCE A : après avoir chargé `nodes`, remplacer l'usage direct par la version filtrée. La requête charge déjà `concept, definition` — il faut aussi `id` et `parent_id` pour filtrer. Modifier la ligne :

```js
  // AVANT
  const { data: nodes } = await supabase
    .from('corpus_curriculum_nodes')
    .select('concept, definition')
    .eq('space_id', space_id)
    .order('created_at');

  if (nodes && nodes.length > 0) {
```

en :

```js
  const { data: nodesRaw } = await supabase
    .from('corpus_curriculum_nodes')
    .select('id, concept, definition, parent_id')
    .eq('space_id', space_id)
    .order('created_at');

  const nodes = filtrerNoeudsParcours(nodesRaw || []);

  if (nodes.length > 0) {
```

Le reste de SOURCE A (`nodes.map(n => ({ concept: n.concept, definition: n.definition || '' }))`, `total: nodes.length`) fonctionne inchangé sur la liste filtrée.

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run api/chat-init.test.js`
Expected : PASS (2 tests).

- [ ] **Step 5: Vérifier l'import ESM**

Run: `node --check api/chat-init.js`
Expected : pas d'erreur de syntaxe.

- [ ] **Step 6: Commit**

```bash
git add api/chat-init.js api/chat-init.test.js
git commit -m "feat: chat-init — exclure les nœuds chapitre du parcours élève"
```

---

## Task 5: `Curriculum.jsx` — bouton + panneau brouillon + application

**Files:**
- Modify: `src/pages/admin/Curriculum.jsx`
- Create: `src/pages/admin/Curriculum.test.jsx`

- [ ] **Step 1: Écrire le test**

`src/pages/admin/Curriculum.test.jsx` :

```jsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import Curriculum from './Curriculum.jsx'

// Mock du client supabase du module.
// Le builder Supabase est à la fois chaînable (.select) ET thenable (await direct) —
// le mock doit refléter les deux formes pour `await insert(x)` et `await insert(x).select()`.
const nodesStore = { rows: [] }
function thenable(result) {
  return { select: () => Promise.resolve(result), then: (resolve) => resolve(result) }
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: table === 'corpus_curriculum_nodes' ? nodesStore.rows : [] }) }),
        order: async () => ({ data: [] }),
      }),
      insert: (rows) => {
        const arr = Array.isArray(rows) ? rows : [rows]
        const inserted = arr.map((r, i) => ({ ...r, id: 'new-' + (nodesStore.rows.length + i) }))
        nodesStore.rows.push(...inserted)
        return thenable({ data: inserted, error: null })
      },
      delete: () => ({ in: async () => ({ error: null }), eq: async () => ({ error: null }) }),
    }),
  },
}))

const session = { access_token: 'tok', user: { id: 'u1' } }

beforeEach(() => {
  nodesStore.rows = []
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})
afterEach(cleanup)

describe('Curriculum — génération', () => {
  it('le bouton "Générer depuis les documents" est présent', async () => {
    render(<Curriculum spaceId="s1" session={session} />)
    expect(await screen.findByRole('button', { name: /Générer depuis les documents/i })).toBeInTheDocument()
  })

  it('affiche le panneau brouillon après génération', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: {
        chapitres: [{ titre: 'Chapitre A', concepts: [{ concept: 'A1', definition: 'def' }] }],
        concepts_sans_chapitre: [{ concept: 'X1', definition: 'defX' }],
      }}),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await waitFor(() => expect(screen.getByText(/Brouillon généré/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Chapitre A')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('X1')).toBeInTheDocument()
  })

  it('"Ajouter au curriculum" insère les concepts cochés et ferme le panneau', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: {
        chapitres: [{ titre: 'Chapitre A', concepts: [{ concept: 'A1', definition: 'def' }] }],
        concepts_sans_chapitre: [],
      }}),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await screen.findByText(/Brouillon généré/i)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au curriculum/i }))
    await waitFor(() => expect(screen.queryByText(/Brouillon généré/i)).not.toBeInTheDocument())
    // 1 parent + 1 enfant insérés
    expect(nodesStore.rows).toHaveLength(2)
    expect(nodesStore.rows.find(r => r.concept === 'Chapitre A' && r.parent_id == null)).toBeTruthy()
    const enfant = nodesStore.rows.find(r => r.concept === 'A1')
    expect(enfant.parent_id).toBe(nodesStore.rows.find(r => r.concept === 'Chapitre A').id)
  })

  it('"Annuler" ferme le panneau sans rien insérer', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: { chapitres: [], concepts_sans_chapitre: [{ concept: 'X1', definition: 'd' }] } }),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await screen.findByText(/Brouillon généré/i)
    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/i }))
    await waitFor(() => expect(screen.queryByText(/Brouillon généré/i)).not.toBeInTheDocument())
    expect(nodesStore.rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : FAIL — pas de bouton « Générer depuis les documents ».

- [ ] **Step 3: Modifier `src/pages/admin/Curriculum.jsx`**

Ajouter l'import des helpers en tête :

```js
import { draftToNodes, groupNodes } from '../../lib/curriculumDraft';
```

Ajouter le state (près des autres `useState`) :

```js
  const [draft, setDraft] = useState(null);        // { chapitres, concepts_sans_chapitre }
  const [kept, setKept] = useState({});            // { key: { keep, parentKey, concept?, definition? } }
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [applying, setApplying] = useState(false);
```

Ajouter les fonctions dans le composant :

```js
  function initKept(resultat) {
    const k = {};
    (resultat.chapitres || []).forEach((ch, ci) => {
      (ch.concepts || []).forEach((c, coi) => {
        k[`${ci}:${coi}`] = { keep: true, parentKey: `chap:${ci}`, concept: c.concept, definition: c.definition || '' };
      });
    });
    (resultat.concepts_sans_chapitre || []).forEach((c, i) => {
      k[`orphan:${i}`] = { keep: true, parentKey: null, concept: c.concept, definition: c.definition || '' };
    });
    return k;
  }

  async function generer() {
    setGenError('');
    setGenerating(true);
    try {
      const res = await fetch(`/api/curriculum?space_id=${spaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'generate', space_id: spaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'La génération a échoué.');
      setDraft(data.resultat);
      setKept(initKept(data.resultat));
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function updateKept(key, patch) {
    setKept(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  // Titres de chapitres éditables : stockés à part car indexés par ci
  const [chapTitres, setChapTitres] = useState({});
  function chapTitre(ci) {
    return chapTitres[ci] ?? draft?.chapitres?.[ci]?.titre ?? `Chapitre ${ci + 1}`;
  }

  async function appliquerBrouillon() {
    if (!draft) return;
    setApplying(true);
    try {
      // Reconstituer un draft "effectif" avec les titres de chapitres édités
      const draftEff = {
        chapitres: (draft.chapitres || []).map((ch, ci) => ({ ...ch, titre: chapTitre(ci) })),
        concepts_sans_chapitre: draft.concepts_sans_chapitre || [],
      };
      const { parents, enfants } = draftToNodes(draftEff, kept);
      if (parents.length === 0 && enfants.length === 0) { setApplying(false); return; }

      // Passe 1 : parents
      const idParTempId = {};
      if (parents.length > 0) {
        const { data: pInserted, error: pErr } = await supabase
          .from('corpus_curriculum_nodes')
          .insert(parents.map(p => ({ space_id: spaceId, concept: p.concept, definition: p.definition, level: p.level, parent_id: null })))
          .select('id, concept');
        if (pErr) throw new Error(pErr.message);
        parents.forEach((p, i) => { idParTempId[p.tempId] = pInserted[i].id; });
      }

      // Passe 2 : enfants
      if (enfants.length > 0) {
        const { error: cErr } = await supabase
          .from('corpus_curriculum_nodes')
          .insert(enfants.map(e => ({
            space_id: spaceId,
            concept: e.concept,
            definition: e.definition,
            level: null,
            parent_id: e.parentTempId ? idParTempId[e.parentTempId] : null,
          })));
        if (cErr) throw new Error(cErr.message);
      }

      setDraft(null);
      setKept({});
      setChapTitres({});
      loadNodes();
    } catch (e) {
      setGenError(e.message);
    } finally {
      setApplying(false);
    }
  }
```

Ajouter le bouton dans la barre d'actions (dans le `<div className="flex items-center gap-2 flex-wrap">`, après le bouton « Importer un modèle ») :

```jsx
        <button
          type="button"
          onClick={generer}
          disabled={generating}
          className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1.5 rounded hover:bg-teal-50 disabled:opacity-40"
        >
          {generating ? 'Génération en cours…' : 'Générer depuis les documents'}
        </button>
        {genError && <p className="text-xs text-red-500">{genError}</p>}
```

Ajouter le panneau brouillon juste avant le `<form onSubmit={save} …>` (le formulaire d'ajout manuel) :

```jsx
      {draft && (
        <div className="bg-teal-50 border border-teal-200 rounded p-4 space-y-4">
          <p className="text-xs text-teal-800">
            <strong>Brouillon généré</strong> — cochez et ajustez ce que vous gardez, puis
            ajoutez au curriculum. Rien n'est enregistré tant que vous n'avez pas cliqué sur
            « Ajouter au curriculum ». Votre curriculum actuel n'est pas modifié.
          </p>

          {(draft.chapitres || []).map((ch, ci) => (
            <div key={ci} className="bg-white border rounded p-3 space-y-2">
              <input
                value={chapTitre(ci)}
                onChange={e => setChapTitres(prev => ({ ...prev, [ci]: e.target.value }))}
                aria-label={`Titre du chapitre ${ci + 1}`}
                className="w-full border-b border-gray-200 pb-1 text-sm font-semibold text-gray-800 focus:outline-none"
              />
              {(ch.concepts || []).map((c, coi) => {
                const key = `${ci}:${coi}`;
                const k = kept[key] || {};
                return (
                  <div key={coi} className="flex gap-2 items-start pl-1">
                    <input
                      type="checkbox"
                      checked={!!k.keep}
                      onChange={e => updateKept(key, { keep: e.target.checked })}
                      aria-label={`Garder ${c.concept}`}
                      className="mt-2 accent-[#0a9370]"
                    />
                    <div className="flex-1 space-y-1">
                      <input
                        value={k.concept ?? c.concept}
                        onChange={e => updateKept(key, { concept: e.target.value })}
                        aria-label={`Concept ${c.concept}`}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <textarea
                        value={k.definition ?? c.definition ?? ''}
                        onChange={e => updateKept(key, { definition: e.target.value })}
                        aria-label={`Définition de ${c.concept}`}
                        rows={2}
                        className="w-full border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <select
                      value={k.parentKey ?? ''}
                      onChange={e => updateKept(key, { parentKey: e.target.value || null })}
                      aria-label={`Chapitre de ${c.concept}`}
                      className="border rounded px-1 py-1 text-xs shrink-0 max-w-[8rem]"
                    >
                      <option value="">Sans chapitre</option>
                      {(draft.chapitres || []).map((_, i) => (
                        <option key={i} value={`chap:${i}`}>{chapTitre(i)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ))}

          {(draft.concepts_sans_chapitre || []).length > 0 && (
            <div className="bg-white border rounded p-3 space-y-2">
              <p className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-1">Concepts sans chapitre</p>
              {draft.concepts_sans_chapitre.map((c, i) => {
                const key = `orphan:${i}`;
                const k = kept[key] || {};
                return (
                  <div key={i} className="flex gap-2 items-start pl-1">
                    <input
                      type="checkbox"
                      checked={!!k.keep}
                      onChange={e => updateKept(key, { keep: e.target.checked })}
                      aria-label={`Garder ${c.concept}`}
                      className="mt-2 accent-[#0a9370]"
                    />
                    <div className="flex-1 space-y-1">
                      <input
                        value={k.concept ?? c.concept}
                        onChange={e => updateKept(key, { concept: e.target.value })}
                        aria-label={`Concept ${c.concept}`}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <textarea
                        value={k.definition ?? c.definition ?? ''}
                        onChange={e => updateKept(key, { definition: e.target.value })}
                        aria-label={`Définition de ${c.concept}`}
                        rows={2}
                        className="w-full border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <select
                      value={k.parentKey ?? ''}
                      onChange={e => updateKept(key, { parentKey: e.target.value || null })}
                      aria-label={`Chapitre de ${c.concept}`}
                      className="border rounded px-1 py-1 text-xs shrink-0 max-w-[8rem]"
                    >
                      <option value="">Sans chapitre</option>
                      {(draft.chapitres || []).map((_, ci) => (
                        <option key={ci} value={`chap:${ci}`}>{chapTitre(ci)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={appliquerBrouillon}
              disabled={applying || !Object.values(kept).some(k => k.keep)}
              className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {applying ? '…' : 'Ajouter au curriculum'}
            </button>
            <button type="button" onClick={() => { setDraft(null); setKept({}); setChapTitres({}); }} className="border px-4 py-2 rounded text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : PASS (4 tests).

- [ ] **Step 5: Build check**

Run: `npx vite build`
Expected : build OK.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/Curriculum.jsx src/pages/admin/Curriculum.test.jsx
git commit -m "feat: Curriculum — bouton Générer + panneau brouillon éditable (80/20)"
```

---

## Task 6: `Curriculum.jsx` — affichage groupé par parent

**Files:**
- Modify: `src/pages/admin/Curriculum.jsx`
- Modify: `src/pages/admin/Curriculum.test.jsx`

- [ ] **Step 1: Ajouter le test**

Ajouter dans `Curriculum.test.jsx`, dans un nouveau `describe` :

```jsx
describe('Curriculum — affichage groupé', () => {
  it('rend les chapitres avec leurs enfants indentés et les orphelins à part', async () => {
    nodesStore.rows = [
      { id: 'p1', concept: 'Chapitre 1', definition: '', level: null, parent_id: null },
      { id: 'c1', concept: 'Concept 1', definition: 'd1', level: null, parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', definition: 'd2', level: null, parent_id: 'p1' },
      { id: 'o1', concept: 'Notion isolée', definition: 'd3', level: null, parent_id: null },
    ]
    render(<Curriculum spaceId="s1" session={session} />)
    // le titre de chapitre apparaît comme en-tête de groupe
    expect(await screen.findByText('Chapitre 1')).toBeInTheDocument()
    expect(screen.getByText('Concept 1')).toBeInTheDocument()
    expect(screen.getByText('Notion isolée')).toBeInTheDocument()
    // marqueur d'en-tête de groupe (data-testid ou classe) — voir implémentation
    expect(screen.getByTestId('chapitre-p1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : FAIL sur le nouveau test (`getByTestId('chapitre-p1')`).

- [ ] **Step 3: Modifier le rendu de la liste dans `Curriculum.jsx`**

Remplacer le bloc `<div className="space-y-2">{nodes.map(n => ( … ))}</div>` (rendu plat actuel) par un rendu groupé. Extraire d'abord une ligne réutilisable :

```jsx
  function NodeRow({ n }) {
    return (
      <div className="bg-white border rounded px-4 py-3 flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-800">{n.concept}</p>
          {n.definition && <p className="text-xs text-gray-500 mt-1">{n.definition}</p>}
          {n.level && <span className="text-xs text-[#0a9370] bg-[#0a9370]/10 px-2 py-0.5 rounded-full mt-1 inline-block">{n.level}</span>}
        </div>
        <div className="flex gap-3 ml-4 shrink-0">
          <button onClick={() => { setEditId(n.id); setForm({ concept: n.concept, definition: n.definition, level: n.level || '', parent_id: n.parent_id || '' }); }}
            className="text-xs text-blue-500 hover:text-blue-700">Modifier</button>
          <button onClick={() => deleteNode(n.id)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
        </div>
      </div>
    );
  }
```

Puis le rendu de la liste :

```jsx
      {(() => {
        const { groupes, orphelins } = groupNodes(nodes);
        return (
          <div className="space-y-4">
            {groupes.map(g => (
              <div key={g.parent.id} data-testid={`chapitre-${g.parent.id}`} className="border-l-2 border-[#0a9370] pl-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-800">{g.parent.concept}</p>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => { setEditId(g.parent.id); setForm({ concept: g.parent.concept, definition: g.parent.definition, level: g.parent.level || '', parent_id: '' }); }}
                      className="text-xs text-blue-500 hover:text-blue-700">Modifier</button>
                    <button onClick={() => deleteNode(g.parent.id)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                  </div>
                </div>
                <div className="space-y-2 ml-2">
                  {g.enfants.map(c => <NodeRow key={c.id} n={c} />)}
                </div>
              </div>
            ))}
            {orphelins.map(n => <NodeRow key={n.id} n={n} />)}
          </div>
        );
      })()}
```

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : PASS (5 tests au total).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/Curriculum.jsx src/pages/admin/Curriculum.test.jsx
git commit -m "feat: Curriculum — affichage groupé par chapitre (parent_id enfin visible)"
```

---

## Task 7: Templates — préserver `parent_id`

**Files:**
- Modify: `src/pages/admin/Curriculum.jsx`
- Modify: `src/pages/admin/Curriculum.test.jsx`

- [ ] **Step 1: Ajouter le test**

Ajouter dans `Curriculum.test.jsx` :

```jsx
describe('Curriculum — templates hiérarchie', () => {
  it('sauvegarde un template avec parentIndex et le réimporte en 2 passes', async () => {
    nodesStore.rows = [
      { id: 'p1', concept: 'Chap', definition: '', level: null, parent_id: null },
      { id: 'c1', concept: 'Sous-concept', definition: 'd', level: null, parent_id: 'p1' },
    ]
    // capter l'insert du template
    const inserts = []
    const tplStore = { rows: [] }
    const { supabase } = await import('../../lib/supabase')
    vi.spyOn(supabase, 'from').mockImplementation((table) => {
      if (table === 'corpus_curriculum_templates') {
        return {
          select: () => ({ order: async () => ({ data: tplStore.rows }) }),
          insert: async (row) => { tplStore.rows.push({ ...row, id: 't1' }); return { error: null }; },
          delete: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      // corpus_curriculum_nodes — builder chaînable + thenable (cf. helper thenable() en tête de fichier)
      return {
        select: () => ({ eq: () => ({ order: async () => ({ data: nodesStore.rows }) }) }),
        insert: (rows) => { const arr = Array.isArray(rows) ? rows : [rows]; inserts.push(arr); const ins = arr.map((r, i) => ({ ...r, id: 'ni-' + inserts.flat().length + '-' + i })); return thenable({ data: ins, error: null }); },
        delete: () => ({ in: async () => ({ error: null }) }),
      }
    })

    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Sauvegarder comme modèle/i }))
    fireEvent.change(screen.getByLabelText(/Nom du modèle/i), { target: { value: 'T1' } })
    fireEvent.click(screen.getByRole('button', { name: /^Sauvegarder$/i }))
    await waitFor(() => expect(tplStore.rows).toHaveLength(1))
    const snap = tplStore.rows[0].nodes
    expect(snap.find(n => n.concept === 'Sous-concept').parentIndex).toBe(0)
    expect(snap.find(n => n.concept === 'Chap').parentIndex).toBe(null)
  })
})
```

- [ ] **Step 2: Lancer — échoue**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : FAIL — `parentIndex` absent du snapshot.

- [ ] **Step 3: Modifier `saveAsTemplate` et `importTemplate` dans `Curriculum.jsx`**

`saveAsTemplate` — remplacer la ligne `const snap = nodes.map(...)` par :

```js
    const snap = nodes.map((n) => ({
      concept: n.concept,
      definition: n.definition,
      level: n.level || null,
      parentIndex: n.parent_id ? nodes.findIndex(x => x.id === n.parent_id) : null,
    }));
```

`importTemplate` — remplacer le bloc d'insertion (`if (tpl.nodes.length > 0) { await supabase.from('corpus_curriculum_nodes').insert(...) }`) par une insertion en 2 passes :

```js
    if (tpl.nodes.length > 0) {
      const withIdx = tpl.nodes.map((n, i) => ({ ...n, _i: i }));
      const parents = withIdx.filter(n => n.parentIndex == null);
      const enfants = withIdx.filter(n => n.parentIndex != null);

      // Passe 1 : nœuds racines (dont les anciens templates plats — parentIndex absent → null)
      const idParIndex = {};
      if (parents.length > 0) {
        const { data: pIns, error: pErr } = await supabase
          .from('corpus_curriculum_nodes')
          .insert(parents.map(n => ({ space_id: spaceId, concept: n.concept, definition: n.definition, level: n.level || null, parent_id: null })))
          .select('id');
        if (pErr) { console.error(pErr); return; }
        parents.forEach((n, i) => { idParIndex[n._i] = pIns[i].id; });
      }

      // Passe 2 : enfants, parent_id résolu
      if (enfants.length > 0) {
        await supabase.from('corpus_curriculum_nodes').insert(
          enfants.map(n => ({
            space_id: spaceId,
            concept: n.concept,
            definition: n.definition,
            level: n.level || null,
            parent_id: idParIndex[n.parentIndex] ?? null,
          }))
        );
      }
    }
```

Note : un template pré-chantier n'a pas de `parentIndex` → `n.parentIndex == null` vrai → tous traités comme racines (comportement plat inchangé, zéro régression).

- [ ] **Step 4: Lancer — passe**

Run: `npx vitest run src/pages/admin/Curriculum.test.jsx`
Expected : PASS (6 tests au total).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/Curriculum.jsx src/pages/admin/Curriculum.test.jsx
git commit -m "feat: Curriculum — templates préservent parent_id (snapshot + import 2 passes)"
```

---

## Task 8: Documentation + vérification finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Documenter dans `README.md`**

Ajouter après la section Stack :

```markdown
## Génération du curriculum

Onglet Curriculum → « Générer depuis les documents » : Haiku dégage une ossature
(chapitres optionnels → concepts) des documents indexés de l'espace, affichée dans un
panneau brouillon. L'enseignant coche / édite / regroupe, puis « Ajouter au curriculum »
insère les nœuds retenus (chapitres = nœuds parents, concepts = enfants via `parent_id`).
Rien n'est écrasé : le curriculum existant est préservé.

Une fois le curriculum non vide, les bilans de session socratiques s'activent
automatiquement (`chat-init.js` SOURCE A).

**Contrainte** : Vercel Hobby plafonne à 12 fonctions serverless. `api/` est plein — la
génération est une branche `action: 'generate'` de `api/curriculum.js`, pas une nouvelle
fonction. Ne pas ajouter de fichier dans `api/` sans en fusionner un autre.

## Tests

`npm test` — unitaires Vitest (`curriculumDraft`, branche generate de `curriculum.js`,
filtre chapitres de `chat-init.js`, panneau brouillon + affichage groupé de `Curriculum.jsx`).
La qualité réelle de l'extraction Haiku se vérifie manuellement en prod sur un vrai espace.
```

- [ ] **Step 2: Suite complète + build**

Run: `npm test && npx vite build`
Expected : tous les tests PASS, build OK.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: génération du curriculum, plafond 12 fonctions, tests"
```

- [ ] **Step 4: (manuel, après déploiement) Vérification prod**

Sur un espace CorpusActif réel avec des documents indexés :
1. Onglet Curriculum → « Générer depuis les documents » → le panneau brouillon s'affiche.
2. Vérifier que les concepts correspondent au contenu des documents (pas d'invention).
3. Décocher un concept, éditer une définition, déplacer un concept entre chapitres.
4. « Ajouter au curriculum » → les nœuds apparaissent groupés par chapitre dans la liste.
5. Ouvrir un lien apprenant en mode socratique → le parcours démarre, les titres de
   chapitre n'apparaissent pas comme notions, les bilans de fin de session sont actifs.

---

## Notes de mise en œuvre

- **Pas de push sur `master`** — branche Vercel = `main`.
- **Build check obligatoire** (`npx vite build`) avant tout push.
- **Projet Supabase mutualisé** — ne pas créer ni modifier de table ; `corpus_curriculum_nodes`
  et `parent_id` existent déjà. Aucune migration dans ce chantier.
- **RISS** : aucune référence scientifique introduite (extraction structurelle des documents
  de l'enseignant).
- **`output_config`** : Task 3 Step 4 tranche entre sortie structurée et parsing tolérant
  selon le support réel de `@anthropic-ai/sdk@0.100.1`.
- **Modèle** `claude-haiku-4-5-20251001` — vérifié dans CLAUDE.md (2026-06-07), cohérent
  avec `chat-init.js` et `generate-flashcards.js`.
