# Bookends Ludiques — CorpusActif

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter trois composants de progression aux sessions socratiques — rappel d'ouverture (sessions précédentes), carte de notions (fin de parcours), message de clôture personnalisé Haiku — conditionnés à l'existence d'un curriculum enseignant.

**Architecture:** Aucune nouvelle table Supabase. `chat-init.js` enrichit sa réponse avec `has_curriculum`, `previous_notions`, `last_session_date`. Un nouvel endpoint `chat-debrief.js` génère le message Haiku personnalisé. `Chat.jsx` orchestre l'injection des trois cartes dans le fil de chat. `ChatMessage.jsx` gère leurs rendus distincts.

**Tech Stack:** React 18, Vite, Tailwind CSS, Supabase (PostgreSQL), Claude Haiku (`claude-haiku-4-5-20251001`), Vercel Serverless

---

## Fichiers modifiés / créés

| Fichier | Rôle |
|---------|------|
| `api/chat-init.js` | Accepte `learner_code` dans le body ; ajoute `has_curriculum`, `previous_notions`, `last_session_date` à la réponse |
| `api/chat-debrief.js` | Nouveau endpoint — génère le message de clôture Haiku |
| `src/pages/admin/SpaceDetail.jsx` | Charge `hasCurriculum` ; affiche un avertissement si socratique sans curriculum |
| `src/components/ChatMessage.jsx` | Trois nouveaux rendus : `isRecap`, `isNotionMap`, `isDebrief` |
| `src/pages/learner/Chat.jsx` | Envoie `learner_code` à chat-init ; stocke les nouveaux champs ; gère `notionOutcomes`, `hintsForCurrentNotion` ; injecte les trois cartes |

---

## Task 1 — api/chat-init.js : has_curriculum + previous_notions + last_session_date

**Files:**
- Modify: `api/chat-init.js`

**Contexte :** Actuellement `chat-init` reçoit `{ token }` dans le body et renvoie `{ notions, total, space_name, flashcard_deck_id }`. Il faut ajouter `learner_code` dans le body, et enrichir la réponse pour alimenter le rappel d'ouverture.

Règle bookends : `has_curriculum = true` seulement si `curriculum_nodes` existent (Source A). Source B (extraction IA) renvoie `has_curriculum: false` — les bookends ne s'activent pas.

- [ ] **Lire le fichier actuel**

```bash
cat api/chat-init.js
```

- [ ] **Remplacer le contenu intégral par :**

```js
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, learner_code } = req.body;
  if (!token) return res.status(400).json({ error: 'token requis' });

  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id } = payload;
  // learner_code peut venir du body (saisie manuelle) ou du JWT
  const code = learner_code || payload.learner_code || null;

  const { data: space } = await supabase
    .from('spaces')
    .select('name, pedagogical_mode, flashcard_deck_id')
    .eq('id', space_id)
    .single();

  if (!space || space.pedagogical_mode !== 'socratique') {
    return res.status(200).json({
      notions: [], total: 0, space_name: space?.name || '',
      has_curriculum: false, previous_notions: [], last_session_date: null,
      flashcard_deck_id: null,
    });
  }

  // SOURCE A : curriculum_nodes (seule source qui active les bookends)
  const { data: nodes } = await supabase
    .from('curriculum_nodes')
    .select('concept, definition')
    .eq('space_id', space_id)
    .order('created_at');

  if (nodes && nodes.length > 0) {
    // Récupérer les sessions précédentes si learner_code connu
    let previousNotions = [];
    let lastSessionDate = null;

    if (code) {
      // Dernière valeur notion_acquired par concept pour ce code × espace
      const { data: prevMsgs } = await supabase
        .from('messages')
        .select('notion_concept, notion_acquired, created_at')
        .eq('space_id', space_id)
        .eq('learner_code', code)
        .not('notion_concept', 'is', null)
        .order('created_at', { ascending: false });

      if (prevMsgs && prevMsgs.length > 0) {
        // Date de la dernière session
        lastSessionDate = prevMsgs[0].created_at;

        // Dernière valeur notion_acquired par concept (first = most recent)
        const seen = new Set();
        for (const m of prevMsgs) {
          if (!seen.has(m.notion_concept) && m.notion_acquired !== null) {
            seen.add(m.notion_concept);
            previousNotions.push({
              concept: m.notion_concept,
              acquired: m.notion_acquired,
            });
          }
        }
      }
    }

    return res.status(200).json({
      notions: nodes.map(n => ({ concept: n.concept, definition: n.definition || '' })),
      total: nodes.length,
      space_name: space.name,
      flashcard_deck_id: space.flashcard_deck_id || null,
      has_curriculum: true,
      previous_notions: previousNotions,
      last_session_date: lastSessionDate,
    });
  }

  // SOURCE B : extraction Claude — bookends désactivés (has_curriculum: false)
  const { data: chunks } = await supabase
    .from('chunks')
    .select('content')
    .eq('space_id', space_id)
    .limit(20);

  if (!chunks || chunks.length === 0) {
    return res.status(200).json({
      notions: [], total: 0, space_name: space.name,
      has_curriculum: false, previous_notions: [], last_session_date: null,
      flashcard_deck_id: null,
    });
  }

  const excerpt = chunks.map(c => c.content.slice(0, 400)).join('\n---\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Analyse ces extraits de cours et identifie TOUTES les notions-clés que l'apprenant doit comprendre. Il peut y en avoir 1 comme 20 — adapte-toi au contenu, sans limite artificielle.\n\n${excerpt}\n\nRéponds en JSON strict uniquement, sans texte avant ou après :\n[{"concept": "...", "definition": "..."}]`,
      }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    const notions = Array.isArray(parsed)
      ? parsed.filter(n => n.concept).map(n => ({ concept: n.concept, definition: n.definition || '' }))
      : [];

    return res.status(200).json({
      notions, total: notions.length, space_name: space.name,
      flashcard_deck_id: space.flashcard_deck_id || null,
      has_curriculum: false, previous_notions: [], last_session_date: null,
    });
  } catch (err) {
    console.error('[chat-init] notion extraction failed:', err.message);
    return res.status(200).json({
      notions: [], total: 0, space_name: space.name,
      has_curriculum: false, previous_notions: [], last_session_date: null,
      flashcard_deck_id: null,
    });
  }
}
```

- [ ] **Vérifier le build**

```bash
npm run build
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add api/chat-init.js
git commit -m "feat: chat-init — has_curriculum, previous_notions, last_session_date"
```

---

## Task 2 — api/chat-debrief.js : endpoint message de clôture Haiku

**Files:**
- Create: `api/chat-debrief.js`

**Contexte :** Nouvel endpoint appelé par `Chat.jsx` quand toutes les notions sont parcourues. Reçoit les notions triées par état + un échantillon des échanges de session. Génère un message court personnalisé (3-5 phrases). Retourne `{ debrief: "..." }`. En cas d'erreur Haiku, retourne `{ debrief: null }` — le client affiche un message de secours.

- [ ] **Créer `api/chat-debrief.js`**

```js
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, notions_mastered = [], notions_with_hint = [], notions_failed = [], session_exchanges = [] } = req.body;
  if (!token) return res.status(400).json({ error: 'token requis' });

  try {
    const result = await jwtVerify(token, jwtSecret);
    const { space_id } = result.payload;

    // Vérifier que la session existe
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('token', token)
      .single();
    if (!session) return res.status(401).json({ error: 'Session expirée ou révoquée' });
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  // Construire le contexte pour Haiku
  const masteredList = notions_mastered.length > 0
    ? `Notions maîtrisées sans aide : ${notions_mastered.join(', ')}`
    : '';
  const hintList = notions_with_hint.length > 0
    ? `Notions comprises avec indice : ${notions_with_hint.join(', ')}`
    : '';
  const failedList = notions_failed.length > 0
    ? `Notions non acquises : ${notions_failed.join(', ')}`
    : '';

  // Sélectionner 4 échanges significatifs (questions de l'apprenant non triviales)
  const excerpts = session_exchanges
    .filter(e => e.role === 'user' && e.content.length > 15)
    .slice(0, 4)
    .map(e => `Apprenant : "${e.content.slice(0, 120)}"`)
    .join('\n');

  const prompt = [masteredList, hintList, failedList, excerpts ? `\nExtraits de session :\n${excerpts}` : '']
    .filter(Boolean)
    .join('\n');

  if (!prompt.trim()) {
    return res.status(200).json({ debrief: null });
  }

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

    const debrief = response.content[0].text.trim();
    return res.status(200).json({ debrief });
  } catch (err) {
    console.error('[chat-debrief] Haiku error:', err.message);
    return res.status(200).json({ debrief: null });
  }
}
```

- [ ] **Ajouter la fonction dans vercel.json** (maxDuration)

Lire `vercel.json` puis ajouter `"api/chat-debrief.js": { "maxDuration": 15 }` dans la section `functions` :

```json
{
  "functions": {
    "api/embed.js": { "maxDuration": 60 },
    "api/chat.js": { "maxDuration": 30 },
    "api/chat-debrief.js": { "maxDuration": 15 }
  },
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

- [ ] **Vérifier le build**

```bash
npm run build
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add api/chat-debrief.js vercel.json
git commit -m "feat: chat-debrief — message de clôture personnalisé Haiku"
```

---

## Task 3 — SpaceDetail.jsx : hasCurriculum + avertissement enseignant

**Files:**
- Modify: `src/pages/admin/SpaceDetail.jsx`

**Contexte :** Ajouter `hasCurriculum` en state, chargé au montage par une requête `curriculum_nodes`. Si `pedagogicalMode === 'socratique'` et `hasCurriculum === false`, afficher un avertissement sous le panel Mode pédagogique.

- [ ] **Ajouter le state `hasCurriculum` après les states existants (ligne ~58)**

```jsx
const [hasCurriculum, setHasCurriculum] = useState(false);
```

- [ ] **Ajouter la requête curriculum_nodes dans le useEffect existant** (après le `.then(({ data }) => { ... })` de la requête spaces, ajouter un second appel)

Modifier le `useEffect` existant (ligne ~60) pour chaîner la vérification curriculum :

```jsx
useEffect(() => {
  supabase.from('spaces').select('*').eq('id', spaceId).single()
    .then(({ data }) => {
      if (data) {
        setSpace(data);
        setOutOfBaseMode(data.out_of_base_mode);
        setThreshold(data.similarity_threshold ?? 0.5);
        setPedagogicalMode(data.pedagogical_mode ?? 'direct');
        setRelancesThreshold(data.socratic_relances_threshold ?? 5);
        setNiveau(data.niveau ?? '');
        setMatiere(data.matiere ?? '');
        setFlashDeckId(data.flashcard_deck_id ?? null);
      }
    });
  // Vérifier présence curriculum pour avertissement bookends
  supabase.from('curriculum_nodes').select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)
    .then(({ count }) => setHasCurriculum((count ?? 0) > 0));
}, [spaceId]);
```

- [ ] **Ajouter l'avertissement dans le JSX**, juste après la fermeture du panel Mode pédagogique (le `</div>` qui ferme le panel mode pédagogique, chercher `{pedagogicalMode === 'socratique' && (` — ajouter après le bloc entier) :

```jsx
{pedagogicalMode === 'socratique' && !hasCurriculum && (
  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700" style={{borderLeft:'3px solid #f97316'}}>
    <strong>Bilans de session désactivés.</strong> Les rappels de progression, la carte de notions et le message personnalisé nécessitent un curriculum défini dans l'onglet Curriculum.
  </div>
)}
```

Placer ce bloc juste après la fermeture du `<div className="bg-white border rounded p-4"` du panel Mode pédagogique (avant le panel Contexte pédagogique).

- [ ] **Mettre à jour `hasCurriculum` quand le mode socratique est activé** — dans `handlePedagogicalMode`, si le mode devient 'socratique', relancer la vérification :

```jsx
function handlePedagogicalMode(newMode) {
  setPedagogicalMode(newMode);
  saveField('pedagogical_mode', newMode);
  if (newMode === 'socratique') {
    supabase.from('curriculum_nodes').select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .then(({ count }) => setHasCurriculum((count ?? 0) > 0));
  }
}
```

- [ ] **Vérifier le build**

```bash
npm run build
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add src/pages/admin/SpaceDetail.jsx
git commit -m "feat: SpaceDetail — avertissement bookends si socratique sans curriculum"
```

---

## Task 4 — ChatMessage.jsx : rendus isRecap, isNotionMap, isDebrief

**Files:**
- Modify: `src/components/ChatMessage.jsx`

**Contexte :** Trois nouveaux types de cartes pleine-largeur qui rompent avec l'esthétique bulle. Ajoutés AVANT le bloc `isNotionOpener || isIntro || isOutro` existant. Chacun reçoit des props spécifiques.

**Props nouvelles :**
- `isRecap` + `previousNotions` (array `{ concept, acquired }`) + `lastSessionDate` (ISO string)
- `isNotionMap` + `notions` (array `{ concept }`) + `notionOutcomes` (object `{ [concept]: 'mastered'|'acquired_with_hint'|'failed' }`)
- `isDebrief` + `content` (string)

- [ ] **Ajouter le helper `formatTimeSince` en haut du fichier, après les imports**

```jsx
function formatTimeSince(isoDate) {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'aujourd\'hui';
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 14) return 'la semaine dernière';
  return `il y a ${Math.floor(days / 7)} semaines`;
}
```

- [ ] **Mettre à jour la signature de la fonction** pour inclure les nouvelles props :

```jsx
export default function ChatMessage({
  role, content, sources, chunksCount, isOutOfBase, socraticLevel, onFeedback,
  isNotionOpener, isIntro, isOutro, flashDeckId,
  isRecap, previousNotions, lastSessionDate,
  isNotionMap, notions, notionOutcomes,
  isDebrief,
}) {
```

- [ ] **Ajouter le rendu `isRecap` juste avant le bloc `isNotionOpener || isIntro || isOutro`**

```jsx
if (isRecap && previousNotions && previousNotions.length > 0) {
  const acquired = previousNotions.filter(n => n.acquired);
  const notAcquired = previousNotions.filter(n => !n.acquired);
  const since = formatTimeSince(lastSessionDate);
  return (
    <div className="flex justify-center mb-6">
      <div className="w-full max-w-md bg-white px-5 py-4 text-sm" style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
        <p className="font-bold tracking-tight mb-3" style={{color:'var(--teal)'}}>
          {since ? `Bon retour — ${since}.` : 'Bon retour.'}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {acquired.map(n => (
            <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#dcfce7', color:'#166534', borderRadius:'4px'}}>
              ✓ {n.concept}
            </span>
          ))}
          {notAcquired.map(n => (
            <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'var(--surface2)', color:'var(--text3)', borderRadius:'4px'}}>
              ○ {n.concept}
            </span>
          ))}
        </div>
        {notAcquired.length > 0 && (
          <p className="text-xs" style={{color:'var(--text2)'}}>
            Il t'en reste {notAcquired.length}. Reprends où tu t'étais arrêté.
          </p>
        )}
        {notAcquired.length === 0 && (
          <p className="text-xs" style={{color:'var(--text2)'}}>
            Tu avais tout parcouru. Une nouvelle session pour consolider ?
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Ajouter le rendu `isNotionMap`** (juste après le bloc `isRecap`) :

```jsx
if (isNotionMap && notions && notionOutcomes) {
  const mastered = notions.filter(n => notionOutcomes[n.concept] === 'mastered');
  const withHint = notions.filter(n => notionOutcomes[n.concept] === 'acquired_with_hint');
  const failed = notions.filter(n => notionOutcomes[n.concept] === 'failed');
  return (
    <div className="flex justify-center mb-6">
      <div className="w-full max-w-md px-5 py-4 text-sm" style={{background:'#f0fdf4', border:'1px solid #bbf7d0', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
        <p className="label-upper mb-3">Ton parcours</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {mastered.map(n => (
            <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#0a9370', color:'white', borderRadius:'4px'}}>
              ✓ {n.concept}
            </span>
          ))}
          {withHint.map(n => (
            <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#d1fae5', color:'#065f46', borderRadius:'4px'}}>
              ~ {n.concept}
            </span>
          ))}
          {failed.map(n => (
            <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#fff7ed', color:'#9a3412', borderRadius:'4px'}}>
              ✗ {n.concept}
            </span>
          ))}
        </div>
        <p className="text-xs" style={{color:'var(--text2)'}}>
          {mastered.length > 0 && `${mastered.length} maîtrisée${mastered.length > 1 ? 's' : ''}`}
          {withHint.length > 0 && ` · ${withHint.length} comprise${withHint.length > 1 ? 's' : ''} avec indice`}
          {failed.length > 0 && ` · ${failed.length} à retravailler`}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Ajouter le rendu `isDebrief`** (juste après `isNotionMap`) :

```jsx
if (isDebrief) {
  return (
    <div className="flex justify-center mb-6">
      <div className="w-full max-w-md px-5 py-4 text-sm" style={{background:'#fff7ed', border:'1px solid #fed7aa', borderLeft:'3px solid var(--orange)', borderRadius:'4px'}}>
        <p className="leading-relaxed" style={{color:'var(--text)'}}>{content}</p>
      </div>
    </div>
  );
}
```

- [ ] **Vérifier le build**

```bash
npm run build
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add src/components/ChatMessage.jsx
git commit -m "feat: ChatMessage — rendus isRecap, isNotionMap, isDebrief"
```

---

## Task 5 — Chat.jsx : orchestration complète

**Files:**
- Modify: `src/pages/learner/Chat.jsx`

**Contexte :** C'est la tâche centrale. Plusieurs modifications indépendantes à apporter dans l'ordre :

### 5a — Nouveaux states

- [ ] **Ajouter après `const [flashDeckId, setFlashDeckId] = useState(null);` (ligne ~31)**

```jsx
const [hasCurriculum, setHasCurriculum] = useState(false);
const [previousNotions, setPreviousNotions] = useState([]);
const [lastSessionDate, setLastSessionDate] = useState(null);
const [notionOutcomes, setNotionOutcomes] = useState({});
const [hintsForCurrentNotion, setHintsForCurrentNotion] = useState(0);
const [debriefLoading, setDebriefLoading] = useState(false);
```

### 5b — Envoyer learner_code dans chat-init + stocker nouveaux champs

- [ ] **Modifier le fetch vers `/api/chat-init`** (dans le `useEffect` qui dépend de `[codeSubmitted, isSocratic]`) pour inclure `learner_code` dans le body et stocker les nouveaux champs :

```jsx
fetch('/api/chat-init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, learner_code: learnerCode || null }),
})
  .then(r => r.json())
  .then(data => {
    if (data.flashcard_deck_id) setFlashDeckId(data.flashcard_deck_id);
    if (data.has_curriculum) setHasCurriculum(true);
    if (data.previous_notions?.length > 0) {
      setPreviousNotions(data.previous_notions);
      setLastSessionDate(data.last_session_date || null);
    }
    if (data.notions && data.notions.length > 0) {
      setNotions(data.notions);
      // Injecter le rappel d'ouverture si sessions précédentes existent
      const msgs = [];
      if (data.has_curriculum && data.previous_notions?.length > 0) {
        msgs.push({
          role: 'assistant',
          content: '',
          rawContent: '',
          isRecap: true,
          previousNotions: data.previous_notions,
          lastSessionDate: data.last_session_date || null,
        });
      }
      msgs.push({
        role: 'assistant',
        content: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
        rawContent: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
        isIntro: true,
      });
      setMessages(msgs);
      setTimeout(() => {
        openNotion(data.notions, 0);
        setSessionReady(true);
      }, 600);
    } else {
      setSessionReady(true);
    }
  })
  .catch(() => setSessionReady(true));
```

### 5c — Tracker les hints et les outcomes de notions dans sendMessage

- [ ] **Dans `sendMessage`, après `const rawAnswer = data.answer;`**, ajouter le tracking des hints et outcomes :

```jsx
// Tracker les indices pour la notion courante
if (rawAnswer.startsWith('[INDICE]')) {
  setHintsForCurrentNotion(prev => prev + 1);
}

// Enregistrer l'outcome quand une notion se résout
const currentConcept = notions[notionIndex]?.concept;
if (currentConcept) {
  if (rawAnswer.startsWith('[NOTION_SUIVANTE]')) {
    setNotionOutcomes(prev => ({
      ...prev,
      [currentConcept]: hintsForCurrentNotion === 0 ? 'mastered' : 'acquired_with_hint',
    }));
    setHintsForCurrentNotion(0);
  } else if (rawAnswer.startsWith('[RÉPONSE]')) {
    setNotionOutcomes(prev => ({
      ...prev,
      [currentConcept]: 'failed',
    }));
    setHintsForCurrentNotion(0);
  }
}
```

Placer ce bloc AVANT le `setMessages(prev => [...prev, { role: 'assistant', ... }])`.

### 5d — Réinitialiser hintsForCurrentNotion dans openNotion

- [ ] **Dans la fonction `openNotion`, ajouter en première ligne du bloc `if (index >= notionsList.length)`** non — réinitialiser au contraire quand on OUVRE une nouvelle notion. Ajouter au début de `openNotion` :

```jsx
function openNotion(notionsList, index) {
  setHintsForCurrentNotion(0); // reset pour la nouvelle notion
  if (index >= notionsList.length) {
    // ... injecter notionMap + debrief (voir 5e)
    return;
  }
  // ... reste inchangé
```

### 5e — Injecter notionMap + appeler debrief en fin de parcours

- [ ] **Remplacer le bloc `if (index >= notionsList.length)` dans `openNotion`** par :

```jsx
if (index >= notionsList.length) {
  // 1. Carte de notions
  setMessages(prev => [...prev, {
    role: 'assistant',
    content: '',
    rawContent: '',
    isNotionMap: true,
    notions: notionsList,
    notionOutcomes: { ...notionOutcomes }, // snapshot immédiat
  }]);

  // 2. Message de clôture après la carte (léger délai pour l'effet séquentiel)
  setTimeout(async () => {
    // Message final "Tu as parcouru toutes les notions"
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
      rawContent: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
      isOutro: true,
      flashDeckId,
    }]);

    // 3. Appel debrief Haiku
    setDebriefLoading(true);
    try {
      const notionsList_mastered = Object.entries(notionOutcomes)
        .filter(([, v]) => v === 'mastered').map(([k]) => k);
      const notions_with_hint = Object.entries(notionOutcomes)
        .filter(([, v]) => v === 'acquired_with_hint').map(([k]) => k);
      const notions_failed = Object.entries(notionOutcomes)
        .filter(([, v]) => v === 'failed').map(([k]) => k);

      const sessionExchanges = messages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isRecap && !m.isIntro && !m.isNotionOpener))
        .map(m => ({ role: m.role, content: m.rawContent || m.content }));

      const res = await fetch('/api/chat-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          notions_mastered: notionsList_mastered,
          notions_with_hint,
          notions_failed,
          session_exchanges: sessionExchanges,
        }),
      });
      const data = await res.json();
      const debriefText = data.debrief || 'Parcours terminé. Bonne consolidation avec FlashFWB.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: debriefText,
        rawContent: debriefText,
        isDebrief: true,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Parcours terminé. Bonne consolidation.',
        rawContent: 'Parcours terminé. Bonne consolidation.',
        isDebrief: true,
      }]);
    } finally {
      setDebriefLoading(false);
    }
  }, 400);
  return;
}
```

**Note :** `notionOutcomes` capturé au moment de l'appel peut ne pas avoir la dernière notion si elle se résout au même render. Passer `notionOutcomes` en paramètre à `openNotion` pour garantir la valeur à jour :

Modifier la signature de `openNotion` : `function openNotion(notionsList, index, currentOutcomes = {})` et remplacer `notionOutcomes` par `currentOutcomes` dans les parties fin de parcours. Mettre à jour tous les appels :

```jsx
// Dans sendMessage — après setNotionOutcomes :
const updatedOutcomes = { ...notionOutcomes };
if (rawAnswer.startsWith('[NOTION_SUIVANTE]')) {
  updatedOutcomes[currentConcept] = hintsForCurrentNotion === 0 ? 'mastered' : 'acquired_with_hint';
}
if (rawAnswer.startsWith('[RÉPONSE]') && !isNotionAcquired) {
  updatedOutcomes[currentConcept] = 'failed';
}
setNotionOutcomes(updatedOutcomes);

// Passer updatedOutcomes aux appels openNotion dans sendMessage :
setTimeout(() => { openNotion(notions, notionIndex + 1, updatedOutcomes); setNotionTransitioning(false); }, 1200);
// et :
setTimeout(() => { openNotion(notions, notionIndex + 1, updatedOutcomes); setNotionTransitioning(false); }, 1800);
```

Et dans `openNotion(notionsList, index, currentOutcomes = {})` : utiliser `currentOutcomes` partout où `notionOutcomes` était utilisé dans le bloc fin de parcours.

### 5f — Afficher loader debrief dans le chat

- [ ] **Après le bloc `{loading && ...}` existant**, ajouter :

```jsx
{debriefLoading && (
  <div className="flex justify-center mb-4">
    <div className="text-xs px-4 py-2" style={{color:'var(--text3)'}}>Analyse du parcours…</div>
  </div>
)}
```

- [ ] **Vérifier le build**

```bash
npm run build
```
Attendu : 0 erreur.

- [ ] **Commit**

```bash
git add src/pages/learner/Chat.jsx
git commit -m "feat: Chat — rappel ouverture, carte notions, message clôture personnalisé"
```

---

## Task 6 — Build final + push

**Files:** aucun

- [ ] **Build de vérification**

```bash
npm run build
```
Attendu : 0 erreur, 0 warning JSX.

- [ ] **Push**

```bash
git push origin main
```
Attendu : push accepté, Vercel redéploie automatiquement.

- [ ] **Test manuel** (avec `vercel dev`) :

Créer un espace test avec curriculum défini, passer en mode socratique, générer un QR, accéder au chat avec un code — vérifier :
1. Première session : pas de rappel d'ouverture (normal, aucune session précédente)
2. Deuxième session avec le même code : rappel d'ouverture avec les notions de la session 1
3. Fin du parcours : carte de notions avec les 3 états, puis message de clôture Haiku
4. Espace sans curriculum + mode socratique : avertissement visible dans SpaceDetail, pas de bookends en session

- [ ] **Commit final**

```bash
git push origin main
```
