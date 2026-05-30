import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

const SIMILARITY_THRESHOLD = 0.65;
const MATCH_COUNT = 5;

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

function buildSystemPrompt(spaceName, chunks, mode, documents) {
  const docMap = Object.fromEntries(documents.map(d => [d.id, d.title]));

  const contextBlocks = chunks.map(c =>
    `[Source : ${docMap[c.document_id] || 'Document'}]\n${c.content}`
  ).join('\n\n---\n\n');

  const modeInstruction = {
    strict: 'Si la question dépasse ces ressources, réponds uniquement : "Cette question dépasse le cadre des ressources de ce cours. Consulte ton enseignant."',
    partiel: 'Si la question dépasse ces ressources, réponds avec ce que tu trouves et signale explicitement les limites de ta réponse.',
    ouvert: 'Si la question dépasse ces ressources, réponds librement mais commence par : "[Hors ressources du cours]"',
  }[mode] || '';

  return `Tu es un assistant pédagogique pour l'espace "${spaceName}".
Tu réponds uniquement à partir des ressources suivantes :

${contextBlocks}

${modeInstruction}

Langue : français. Pas de preamble. Réponses courtes et directes.
Si tu cites une information, indique le titre du document source entre crochets.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, question, session_id } = req.body;
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

  // Charger l'espace
  const { data: space } = await supabase
    .from('spaces')
    .select('name, out_of_base_mode')
    .eq('id', space_id)
    .single();

  if (!space) return res.status(404).json({ error: 'Espace introuvable' });

  // Vectoriser la question
  const queryEmbedding = await embedQuery(question);

  // Chercher les chunks similaires via RPC Supabase
  const { data: chunks } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_space_id: space_id,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  const isOutOfBase = !chunks || chunks.length === 0;

  // Charger les titres des documents pour les sources
  let documents = [];
  if (chunks && chunks.length > 0) {
    const docIds = [...new Set(chunks.map(c => c.document_id))];
    const { data } = await supabase
      .from('documents')
      .select('id, title')
      .in('id', docIds);
    documents = data || [];
  }

  // Construire le prompt et appeler Claude Haiku
  const systemPrompt = buildSystemPrompt(
    space.name,
    chunks || [],
    space.out_of_base_mode,
    documents
  );

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  });

  const answer = message.content[0].text;

  // Stocker le message (pour analytics tableau de bord enseignant)
  await supabase.from('messages').insert({
    session_id: session_id || null,
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
  });
}
