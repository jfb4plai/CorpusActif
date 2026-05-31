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
