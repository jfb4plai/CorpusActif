# CorpusActif — Seuil configurable + Mode socratique

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à chaque espace un seuil de similarité configurable (presets + slider) et un mode pédagogique socratique (Claude guide par questions avec progression 5 relances → indice → indice → réponse valorisante).

**Architecture:** Deux nouvelles colonnes dans `spaces` (similarity_threshold, pedagogical_mode). `/api/chat.js` lit ces valeurs et choisit le prompt système. Le frontend envoie l'historique de conversation pour permettre le comptage des relances/indices. Les marqueurs `[INDICE]` et `[RÉPONSE]` sont retirés côté apprenant.

**Tech Stack:** React 18 + Supabase v2 + Vercel Serverless (Node.js) — projet existant dans `C:\Users\jfbeg\OneDrive\claude-workspace\corpusactif`

---

## Structure des fichiers modifiés

```
corpusactif/
├── supabase/
│   └── schema.sql              # +migration ALTER TABLE (à exécuter manuellement)
├── api/
│   └── chat.js                 # +analyzeHistory, +buildSocraticPrompt, handler modifié
├── src/
│   ├── pages/admin/
│   │   └── SpaceDetail.jsx     # +ThresholdConfig, +PedagogicalModeConfig
│   └── pages/learner/
│       └── Chat.jsx            # +envoi history, +strip markers, +indicateur visuel
```

---

## Task 1 : Migration Supabase

**Files:**
- Modify: `supabase/schema.sql`
- Manual: Supabase SQL Editor

- [ ] **Step 1 : Ajouter la migration dans schema.sql**

Ouvrir `supabase/schema.sql` et ajouter à la fin :

```sql
-- Migration : seuil de similarité configurable + mode pédagogique
alter table spaces
  add column if not exists similarity_threshold float not null default 0.5
    check (similarity_threshold between 0.1 and 0.9),
  add column if not exists pedagogical_mode text not null default 'direct'
    check (pedagogical_mode in ('direct', 'socratique'));
```

- [ ] **Step 2 : Exécuter dans Supabase SQL Editor**

Ouvrir dashboard.supabase.com → projet dfoaumjleqtxjeaplnna → SQL Editor → New query → coller et exécuter le SQL ci-dessus.

Attendu : "Success. No rows returned"

- [ ] **Step 3 : Vérifier dans Table Editor**

Supabase → Table Editor → spaces → vérifier que les colonnes `similarity_threshold` et `pedagogical_mode` apparaissent.

- [ ] **Step 4 : Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: migration spaces — similarity_threshold + pedagogical_mode"
```

---

## Task 2 : /api/chat.js — seuil dynamique + mode socratique

**Files:**
- Modify: `api/chat.js`

- [ ] **Step 1 : Remplacer api/chat.js par la version complète**

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

const MATCH_COUNT = 5;

// Analyse l'historique pour compter relances et indices déjà donnés
function analyzeHistory(history = []) {
  let relancesCount = 0;
  let indicesCount = 0;
  let relancesSinceLastIndice = 0;

  for (const msg of history) {
    if (msg.role === 'assistant') {
      if (msg.content.startsWith('[INDICE]')) {
        indicesCount++;
        relancesSinceLastIndice = 0;
      } else if (msg.content.startsWith('[RÉPONSE]')) {
        // conversation terminée — on ne compte plus
      } else {
        relancesCount++;
        relancesSinceLastIndice++;
      }
    }
  }
  return { relancesCount, indicesCount, relancesSinceLastIndice };
}

function buildDirectPrompt(spaceName, chunks, outOfBaseMode, documents) {
  const docMap = Object.fromEntries(documents.map(d => [d.id, d.title]));
  const contextBlocks = chunks.map(c =>
    `[Source : ${docMap[c.document_id] || 'Document'}]\n${c.content}`
  ).join('\n\n---\n\n');

  const modeInstruction = {
    strict: 'Si la question dépasse ces ressources, réponds uniquement : "Cette question dépasse le cadre des ressources de ce cours. Consulte ton enseignant."',
    partiel: 'Si la question dépasse ces ressources, réponds avec ce que tu trouves et signale explicitement les limites de ta réponse.',
    ouvert: 'Si la question dépasse ces ressources, réponds librement mais commence par : "[Hors ressources du cours]"',
  }[outOfBaseMode] || '';

  return `Tu es un assistant pédagogique pour l'espace "${spaceName}".
Tu réponds uniquement à partir des ressources suivantes :

${contextBlocks}

${modeInstruction}

Langue : français. Pas de preamble. Réponses courtes et directes.
Si tu cites une information, indique le titre du document source entre crochets.`;
}

function buildSocraticPrompt(spaceName, chunks, outOfBaseMode, documents, history) {
  const docMap = Object.fromEntries(documents.map(d => [d.id, d.title]));
  const contextBlocks = chunks.map(c =>
    `[Source : ${docMap[c.document_id] || 'Document'}]\n${c.content}`
  ).join('\n\n---\n\n');

  const modeInstruction = {
    strict: 'Si la question dépasse ces ressources, réponds uniquement : "Cette question dépasse le cadre des ressources de ce cours. Consulte ton enseignant."',
    partiel: 'Si la question dépasse ces ressources, réponds avec ce que tu trouves et signale explicitement les limites de ta réponse.',
    ouvert: 'Si la question dépasse ces ressources, réponds librement mais commence par : "[Hors ressources du cours]"',
  }[outOfBaseMode] || '';

  const { relancesCount, indicesCount, relancesSinceLastIndice } = analyzeHistory(history);

  return `Tu es un assistant pédagogique socratique pour l'espace "${spaceName}".
Tu guides l'apprenant vers la réponse par des questions ancrées dans les ressources.

Ressources disponibles :

${contextBlocks}

${modeInstruction}

Règles de progression (OBLIGATOIRES — tu DOIS respecter ces marqueurs de début de réponse) :
- Relances effectuées : ${relancesCount} / Indices donnés : ${indicesCount} / Relances depuis dernier indice : ${relancesSinceLastIndice}

- Si indices < 1 et relances < 5 : pose une question de relance courte, ancrée dans les ressources. Commence sans marqueur.
- Si relances >= 5 et indices < 1 : commence OBLIGATOIREMENT par [INDICE] suivi d'un indice concret tiré des ressources.
- Si indices >= 1 et relancesSinceLastIndice >= 2 et indices < 2 : commence OBLIGATOIREMENT par [INDICE] suivi d'un second indice.
- Si indices >= 2 et relancesSinceLastIndice >= 2 : commence OBLIGATOIREMENT par [RÉPONSE], donne la réponse complète, identifie explicitement la dernière bonne intuition ou réponse partielle de l'apprenant dans la conversation, et explique le lien ou l'étape qu'il doit encore consolider.

Langue : français. Pas de preamble. Questions et indices courts.`;
}

async function embedQuery(text) {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: [text] }),
  });
  const data = await response.json();
  return data.data[0].embedding;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, question, history = [] } = req.body;
  if (!token || !question) return res.status(400).json({ error: 'token et question requis' });

  // Valider le JWT
  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id, learner_code } = payload;

  // Charger l'espace (avec les nouveaux champs)
  const { data: space } = await supabase
    .from('spaces')
    .select('name, out_of_base_mode, similarity_threshold, pedagogical_mode')
    .eq('id', space_id)
    .single();

  if (!space) return res.status(404).json({ error: 'Espace introuvable' });

  const threshold = space.similarity_threshold ?? 0.5;
  const pedagogicalMode = space.pedagogical_mode ?? 'direct';

  // Vectoriser la question
  const queryEmbedding = await embedQuery(question);

  // Chercher les chunks similaires
  const { data: chunks } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_space_id: space_id,
    match_threshold: threshold,
    match_count: MATCH_COUNT,
  });

  const isOutOfBase = !chunks || chunks.length === 0;

  // Charger les titres des documents
  let documents = [];
  if (chunks && chunks.length > 0) {
    const docIds = [...new Set(chunks.map(c => c.document_id))];
    const { data } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', docIds);
    documents = data || [];
  }

  // Choisir le prompt selon le mode pédagogique
  const systemPrompt = pedagogicalMode === 'socratique'
    ? buildSocraticPrompt(space.name, chunks || [], space.out_of_base_mode, documents, history)
    : buildDirectPrompt(space.name, chunks || [], space.out_of_base_mode, documents);

  // Construire les messages avec historique (mode socratique)
  const conversationMessages = pedagogicalMode === 'socratique' && history.length > 0
    ? [...history, { role: 'user', content: question }]
    : [{ role: 'user', content: question }];

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationMessages,
  });

  const answer = message.content[0].text;

  // Stocker le message
  await supabase.from('messages').insert({
    session_id: null,
    space_id,
    learner_code: learner_code || null,
    question,
    answer,
    is_out_of_base: isOutOfBase,
  });

  return res.status(200).json({
    answer,
    sources: documents.map(d => d.title),
    is_out_of_base: isOutOfBase,
    pedagogical_mode: pedagogicalMode,
  });
}
```

- [ ] **Step 2 : Vérifier le build**

```bash
npm run build
```
Attendu : build sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add api/chat.js
git commit -m "feat: chat — seuil dynamique + mode socratique + analyse historique"
```

---

## Task 3 : SpaceDetail.jsx — UI seuil + mode pédagogique

**Files:**
- Modify: `src/pages/admin/SpaceDetail.jsx`

- [ ] **Step 1 : Remplacer SpaceDetail.jsx par la version complète**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Documents from './Documents';
import Curriculum from './Curriculum';
import LearnerCodes from './LearnerCodes';
import Dashboard from './Dashboard';

const TABS = ['Documents', 'Curriculum', 'Codes & QR', 'Tableau de bord'];

const THRESHOLD_PRESETS = [
  {
    label: 'Vocabulaire',
    value: 0.80,
    tooltip: 'Correspondance quasi-exacte — idéal pour les définitions, l\'orthographe, les langues',
  },
  {
    label: 'Compréhension',
    value: 0.55,
    tooltip: 'Reformulations acceptées — idéal pour les sciences, l\'histoire, la géographie',
  },
  {
    label: 'Exploration',
    value: 0.35,
    tooltip: 'Associations larges — idéal pour la créativité, les projets ouverts',
  },
];

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span className="absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-gray-800 text-white text-xs rounded px-2 py-1 text-center shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

export default function SpaceDetail() {
  const { spaceId } = useParams();
  const { session } = useOutletContext();
  const [space, setSpace] = useState(null);
  const [tab, setTab] = useState(0);
  const [outOfBaseMode, setOutOfBaseMode] = useState('partiel');
  const [threshold, setThreshold] = useState(0.5);
  const [pedagogicalMode, setPedagogicalMode] = useState('direct');

  useEffect(() => {
    supabase.from('spaces').select('*').eq('id', spaceId).single()
      .then(({ data }) => {
        if (data) {
          setSpace(data);
          setOutOfBaseMode(data.out_of_base_mode);
          setThreshold(data.similarity_threshold ?? 0.5);
          setPedagogicalMode(data.pedagogical_mode ?? 'direct');
        }
      });
  }, [spaceId]);

  async function saveField(field, value) {
    await supabase.from('spaces').update({ [field]: value }).eq('id', spaceId);
  }

  function handleOutOfBaseMode(newMode) {
    setOutOfBaseMode(newMode);
    saveField('out_of_base_mode', newMode);
  }

  function handlePreset(value) {
    setThreshold(value);
    saveField('similarity_threshold', value);
  }

  function handleSlider(e) {
    const value = parseFloat(e.target.value);
    setThreshold(value);
  }

  function handleSliderCommit(e) {
    const value = parseFloat(e.target.value);
    saveField('similarity_threshold', value);
  }

  function handlePedagogicalMode(newMode) {
    setPedagogicalMode(newMode);
    saveField('pedagogical_mode', newMode);
  }

  if (!space) return null;

  const activePreset = THRESHOLD_PRESETS.find(p => Math.abs(p.value - threshold) < 0.01);

  return (
    <div>
      {/* En-tête espace */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">{space.name}</h1>

        {/* Hors-base */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="text-gray-500 w-32 shrink-0">Hors-base :</span>
          {['strict', 'partiel', 'ouvert'].map(m => (
            <button
              key={m}
              onClick={() => handleOutOfBaseMode(m)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition ${outOfBaseMode === m ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Seuil de similarité */}
        <div className="bg-white border rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Seuil de similarité</p>
          <div className="flex gap-2 mb-3">
            {THRESHOLD_PRESETS.map(p => (
              <Tooltip key={p.label} text={p.tooltip}>
                <button
                  onClick={() => handlePreset(p.value)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition ${activePreset?.label === p.label ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
                >
                  {p.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={handleSlider}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="flex-1 accent-[#0a9370]"
            />
            <span className="text-xs text-gray-500 w-8 text-right">{threshold.toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Les presets couvrent la majorité des usages. Le curseur est réservé aux enseignants qui souhaitent affiner — une valeur trop basse produit des réponses hors-sujet, une valeur trop haute peut bloquer des reformulations légitimes.
          </p>
        </div>

        {/* Mode pédagogique */}
        <div className="bg-white border rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Mode pédagogique</p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePedagogicalMode('direct')}
              className={`px-4 py-1.5 rounded-full border text-xs font-medium transition ${pedagogicalMode === 'direct' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
            >
              Direct
            </button>
            <Tooltip text="Claude guide l'apprenant par des questions plutôt que de donner la réponse directement. Après 5 relances sans progression, un indice est fourni. Après 2 nouveaux blocages, la réponse est donnée en valorisant ce que l'apprenant a déjà compris.">
              <button
                onClick={() => handlePedagogicalMode('socratique')}
                className={`px-4 py-1.5 rounded-full border text-xs font-medium transition ${pedagogicalMode === 'socratique' ? 'bg-[#f97316] text-white border-[#f97316]' : 'text-gray-600 border-gray-300 hover:border-orange-400'}`}
              >
                Socratique ⓘ
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b mb-6">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === i ? 'border-[#0a9370] text-[#0a9370]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && <Documents spaceId={spaceId} session={session} />}
      {tab === 1 && <Curriculum spaceId={spaceId} session={session} />}
      {tab === 2 && <LearnerCodes spaceId={spaceId} session={session} />}
      {tab === 3 && <Dashboard spaceId={spaceId} />}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier le build**

```bash
npm run build
```
Attendu : build sans erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/pages/admin/SpaceDetail.jsx
git commit -m "feat: SpaceDetail — seuil presets+slider + mode pédagogique"
```

---

## Task 4 : Chat.jsx — historique + marqueurs + indicateur visuel

**Files:**
- Modify: `src/pages/learner/Chat.jsx`

- [ ] **Step 1 : Remplacer Chat.jsx par la version complète**

```jsx
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from '../../components/ChatMessage';

// Retire les marqueurs [INDICE] et [RÉPONSE] du texte affiché
function stripMarker(content) {
  return content.replace(/^\[(INDICE|RÉPONSE)\]\s*/u, '');
}

// Détermine le niveau socratique d'un message assistant
function getSocraticLevel(content) {
  if (content.startsWith('[RÉPONSE]')) return 'reponse';
  if (content.startsWith('[INDICE]')) return 'indice';
  return 'relance';
}

export default function Chat() {
  const { token } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [learnerCode, setLearnerCode] = useState('');
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [isSocratic, setIsSocratic] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.learner_code) {
        setLearnerCode(payload.learner_code);
        setCodeSubmitted(true);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');

    // Historique des messages à envoyer (rôles user/assistant avec contenu brut)
    const history = messages.map(m => ({
      role: m.role,
      content: m.rawContent || m.content,
    }));

    setMessages(prev => [...prev, { role: 'user', content: question, rawContent: question }]);
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, question, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.pedagogical_mode === 'socratique') setIsSocratic(true);

      const rawAnswer = data.answer;
      const level = getSocraticLevel(rawAnswer);
      const displayContent = stripMarker(rawAnswer);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: displayContent,
        rawContent: rawAnswer,
        sources: data.sources,
        isOutOfBase: data.is_out_of_base,
        socraticLevel: data.pedagogical_mode === 'socratique' ? level : null,
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!codeSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
          <img src="/plai-logo.jpg" alt="PLAI" className="h-8 mb-4" />
          <h1 className="text-lg font-semibold text-gray-800 mb-4">Saisis ton code</h1>
          <form onSubmit={e => { e.preventDefault(); if (learnerCode.trim()) setCodeSubmitted(true); }}>
            <input
              value={learnerCode}
              onChange={e => setLearnerCode(e.target.value.toUpperCase())}
              placeholder="Ex: E01"
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              required
            />
            <button type="submit" className="w-full bg-[#0a9370] text-white py-2 rounded text-sm font-medium">
              Commencer
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0a9370] text-white px-4 py-3 flex items-center gap-3">
        <img src="/plai-logo.jpg" alt="PLAI" className="h-7" />
        <span className="font-medium text-sm">CorpusActif</span>
        {isSocratic && (
          <span className="text-xs bg-[#f97316] px-2 py-0.5 rounded-full font-medium">Socratique</span>
        )}
        <span className="ml-auto text-xs opacity-70">{learnerCode}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-16">Pose ta première question…</p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} {...m} />
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border rounded-2xl px-4 py-3 text-sm text-gray-400">…</div>
          </div>
        )}
        {error && <p className="text-center text-red-500 text-xs mb-4">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendMessage} className="border-t bg-white px-4 py-3 flex gap-2 max-w-2xl mx-auto w-full">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pose ta question…"
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#0a9370] text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2 : Mettre à jour ChatMessage.jsx pour afficher l'indicateur socratique**

Remplacer `src/components/ChatMessage.jsx` :

```jsx
// Indicateur de niveau socratique
const SOCRATIC_INDICATORS = {
  relance: { color: 'bg-[#0a9370]', label: 'Question' },
  indice: { color: 'bg-[#f97316]', label: 'Indice' },
  reponse: { color: 'bg-green-500', label: 'Réponse' },
};

export default function ChatMessage({ role, content, sources, isOutOfBase, socraticLevel }) {
  const isUser = role === 'user';
  const indicator = socraticLevel ? SOCRATIC_INDICATORS[socraticLevel] : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
        isUser ? 'bg-[#0a9370] text-white' : 'bg-white border text-gray-800'
      }`}>
        {indicator && !isUser && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`w-2 h-2 rounded-full ${indicator.color} shrink-0`} />
            <span className="text-xs text-gray-400">{indicator.label}</span>
          </div>
        )}
        {isOutOfBase && !isUser && (
          <div className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-1 mb-2">
            Réponse hors des ressources du cours
          </div>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            {sources.map((s, i) => (
              <span key={i} className="inline-block text-xs text-gray-400 mr-2">📄 {s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier le build**

```bash
npm run build
```
Attendu : build sans erreur.

- [ ] **Step 4 : Commit et push**

```bash
git add src/pages/learner/Chat.jsx src/components/ChatMessage.jsx
git commit -m "feat: chat apprenant — historique + mode socratique + indicateurs visuels"
git push
```

---

## Checklist self-review

- [x] Task 1 : migration SQL avec `if not exists` (idempotente)
- [x] Task 2 : `chat.js` lit `similarity_threshold` et `pedagogical_mode` depuis l'espace ; constante `SIMILARITY_THRESHOLD` supprimée ; `analyzeHistory` compte relances/indices/relancesSinceLastIndice ; deux fonctions de prompt séparées ; historique envoyé à Claude en mode socratique ; `pedagogical_mode` retourné dans la réponse
- [x] Task 3 : `SpaceDetail.jsx` — 3 presets avec tooltips ; slider avec sauvegarde onMouseUp/onTouchEnd ; message d'avertissement ; boutons Direct/Socratique ; sauvegarde automatique via `saveField` ; initialisation depuis les données Supabase
- [x] Task 4 : `Chat.jsx` — `rawContent` stocké pour l'historique ; `history` envoyé à chaque requête ; `stripMarker` retire [INDICE]/[RÉPONSE] de l'affichage ; `socraticLevel` déterminé depuis `rawContent` ; badge "Socratique" dans le header ; `ChatMessage.jsx` affiche l'indicateur coloré
- [x] Compatibilité : espaces existants utilisent les valeurs par défaut (0.5, direct) sans migration de données
