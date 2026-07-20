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

function buildSocraticPrompt(spaceName, chunks, outOfBaseMode, documents, history, curriculumNodes = [], previousSessionMessages = [], relancesThreshold = 5, notionConcept = null, notionTotal = 0, notionIndex = 0, learnerDifficulties = null) {
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

  const curriculumSection = curriculumNodes.length > 0
    ? `\nConceptes du curriculum de cet espace :\n${
        curriculumNodes.map(n =>
          `- ${n.concept}${n.definition ? ` : ${n.definition}` : ''}${n.level ? ` (${n.level})` : ''}`
        ).join('\n')
      }\n\nOriente tes questions vers ces concepts lorsqu'ils sont pertinents à ce que l'apprenant explore.\n`
    : '';

  const notionSection = notionConcept
    ? `\nNotion en cours d'exploration (${notionIndex + 1}/${notionTotal}) : "${notionConcept}".
Tu guides l'apprenant UNIQUEMENT sur cette notion.
Si sa question porte sur une autre notion, réponds très brièvement et ramène-le à "${notionConcept}".
Quand tu estimes que l'apprenant a compris cette notion, commence OBLIGATOIREMENT ta réponse par [NOTION_SUIVANTE] suivi d'une seule phrase de valorisation courte. Ne pose PAS de nouvelle question — la notion suivante sera présentée automatiquement.\n`
    : '';

  const historySection = previousSessionMessages.length > 0
    ? `\nContexte des sessions précédentes de cet apprenant (pour information uniquement — la progression relances/indices repart de zéro pour cette session) :\n${
        previousSessionMessages
          .map(m => m.role === 'user'
            ? `Apprenant : ${m.content}`
            : `Assistant : ${m.content.replace(/^\[(INDICE|RÉPONSE)\]\s*/u, '').slice(0, 150)}`)
          .join('\n')
      }\n`
    : '';

  const difficultiesSection = learnerDifficulties
    ? `\nObstacles fonctionnels observés par l'enseignant pour cet apprenant :\n${learnerDifficulties}\n\nAdapte la formulation de tes questions pour éviter que ces obstacles interfèrent avec l'accès à la notion visée. Ne réduis pas le niveau de questionnement — vérifie que l'obstacle ne masque pas la compréhension. Si une réponse est lacunaire, envisage d'abord que l'obstacle décrit en est la cause avant de conclure à une non-compréhension.\n`
    : '';

  return `Tu es un assistant pédagogique socratique pour l'espace "${spaceName}".
Tu guides l'apprenant vers la réponse par des questions et indices TIRÉS UNIQUEMENT des ressources ci-dessous.
Tu ne peux pas introduire de notions, exemples ou explications absents des ressources — même si tu les connais.
${curriculumSection}${historySection}${difficultiesSection}${notionSection}
Ressources disponibles :

${contextBlocks}

${modeInstruction}

Règles de progression (OBLIGATOIRES — tu DOIS respecter ces marqueurs de début de réponse) :
- Relances effectuées : ${relancesCount} / Indices donnés : ${indicesCount} / Relances depuis dernier indice : ${relancesSinceLastIndice}

- Si indices < 1 et relances < ${relancesThreshold} : pose une question de relance courte, ancrée dans les ressources. Commence sans marqueur.
- Si relances >= ${relancesThreshold} et indices < 1 : commence OBLIGATOIREMENT par [INDICE] suivi d'un indice concret tiré des ressources.
- Si indices >= 1 et relancesSinceLastIndice >= 2 et indices < 2 : commence OBLIGATOIREMENT par [INDICE] suivi d'un second indice.
- Si indices >= 2 et relancesSinceLastIndice >= 2 : commence OBLIGATOIREMENT par [RÉPONSE], donne la réponse complète, identifie explicitement la dernière bonne intuition ou réponse partielle de l'apprenant dans la conversation, et explique le lien ou l'étape qu'il doit encore consolider.

Langue : français. Pas de preamble. Une seule question par réponse, jamais deux. Pas de markdown (pas de **, *, #). Phrases courtes et directes.`;
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
  if (!response.ok) {
    throw new Error(`Voyage ${response.status}`);
  }
  const data = await response.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!embedding) throw new Error('Embedding vide');
  return embedding;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
  token, question, history = [],
  learner_code: bodyLearnerCode,
  notion_concept = null,
  notion_index = 0,
  notion_total = 0,
} = req.body;
  if (!token || !question) return res.status(400).json({ error: 'token et question requis' });

  // Valider le JWT
  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id, learner_code: tokenLearnerCode } = payload;
  const learner_code = bodyLearnerCode || tokenLearnerCode || null;

  // Récupérer la session par son token (vérifie existence et non-révocation)
  const { data: session } = await supabase
    .from('corpus_sessions')
    .select('id')
    .eq('token', token)
    .single();

  if (!session) return res.status(401).json({ error: 'Session expirée ou révoquée' });

  // Charger l'espace (avec les nouveaux champs)
  const { data: space } = await supabase
    .from('corpus_spaces')
    .select('name, out_of_base_mode, similarity_threshold, pedagogical_mode, socratic_relances_threshold')
    .eq('id', space_id)
    .single();

  if (!space) return res.status(404).json({ error: 'Espace introuvable' });

  const threshold = space.similarity_threshold ?? 0.5;
  const pedagogicalMode = space.pedagogical_mode ?? 'direct';
  const relancesThreshold = space.socratic_relances_threshold ?? 5;

  // Charger le curriculum si mode socratique et nœuds définis
  let curriculumNodes = [];
  if (pedagogicalMode === 'socratique') {
    const { data: nodes } = await supabase
      .from('corpus_curriculum_nodes')
      .select('concept, definition, level')
      .eq('space_id', space_id)
      .order('created_at');
    curriculumNodes = nodes || [];
  }

  // Charger les obstacles fonctionnels (mode socratique uniquement)
  let learnerDifficulties = null;
  if (pedagogicalMode === 'socratique' && learner_code) {
    const { data: learnerData } = await supabase
      .from('corpus_learner_codes')
      .select('difficulties')
      .eq('space_id', space_id)
      .eq('code', learner_code)
      .single();
    learnerDifficulties = learnerData?.difficulties || null;
  }

  // Charger l'historique inter-sessions (mode socratique uniquement)
  let previousSessionMessages = [];
  if (pedagogicalMode === 'socratique' && learner_code) {
    const { data: prevMsgs } = await supabase
      .from('corpus_messages')
      .select('question, answer')
      .eq('space_id', space_id)
      .eq('learner_code', learner_code)
      .order('created_at', { ascending: false })
      .limit(20);

    previousSessionMessages = (prevMsgs || [])
      .reverse()
      .flatMap(m => [
        { role: 'user', content: m.question },
        { role: 'assistant', content: m.answer },
      ]);
  }

  // Vectoriser la question
  let queryEmbedding;
  try {
    queryEmbedding = await embedQuery(question);
  } catch (err) {
    console.error('[chat] embedding failed:', err.message);
    return res.status(503).json({ error: "Le service de recherche est momentanément indisponible. Réessaie dans quelques instants." });
  }

  // Chercher les chunks similaires
  const { data: chunks } = await supabase.rpc('corpus_match_chunks', {
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
      .from('corpus_documents')
      .select('id, title')
      .in('id', docIds);
    documents = data || [];
  }

  // Choisir le prompt selon le mode pédagogique
  const systemPrompt = pedagogicalMode === 'socratique'
    ? buildSocraticPrompt(space.name, chunks || [], space.out_of_base_mode, documents, history, curriculumNodes, previousSessionMessages, relancesThreshold, notion_concept, notion_total, notion_index, learnerDifficulties)
    : buildDirectPrompt(space.name, chunks || [], space.out_of_base_mode, documents);

  // Construire les messages avec historique (mode socratique)
  const conversationMessages = pedagogicalMode === 'socratique'
    ? [
        ...previousSessionMessages,
        ...(history.length > 0 ? history : []),
        { role: 'user', content: question },
      ]
    : [{ role: 'user', content: question }];

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    });
  } catch (err) {
    console.error('[chat] anthropic call failed:', err.message);
    return res.status(503).json({ error: "L'assistant est momentanément indisponible. Réessaie dans quelques instants." });
  }

  const rawText = message?.content?.[0]?.text;
  if (!rawText) {
    console.error('[chat] empty model response');
    return res.status(502).json({ error: "Réponse vide de l'assistant. Reformule ta question." });
  }

  let answer = rawText
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\?\s+([A-ZÀ-Ÿ«"'])/g, '?\n\n$1');

  // Si le modèle oublie le marqueur [NOTION_SUIVANTE] mais signale clairement la transition
  const NOTION_SUIVANTE_PATTERNS = [
    /notion suivante/i, /passons à la suite/i, /on peut passer à/i,
    /tu as bien compris/i, /c'est acquis/i, /c'est maîtrisé/i,
  ];
  if (notion_concept && !answer.startsWith('[NOTION_SUIVANTE]') && !answer.startsWith('[RÉPONSE]') && !answer.startsWith('[INDICE]')) {
    if (NOTION_SUIVANTE_PATTERNS.some(p => p.test(answer))) {
      answer = '[NOTION_SUIVANTE] ' + answer;
    }
  }

  // Stocker le message et récupérer son id pour le feedback
  const { data: savedMessage, error: insertError } = await supabase.from('corpus_messages').insert({
    session_id: session.id,
    space_id,
    learner_code: learner_code || null,
    question,
    answer,
    is_out_of_base: isOutOfBase,
    notion_concept: notion_concept || null,
    notion_acquired: notion_concept
      ? answer.startsWith('[NOTION_SUIVANTE]')
      : null,
  }).select('id').single();

  if (insertError) console.error('[chat] message insert failed:', insertError.message);

  return res.status(200).json({
    answer,
    sources: documents.map(d => d.title),
    chunks_count: chunks?.length || 0,
    message_id: savedMessage?.id || null,
    is_out_of_base: isOutOfBase,
    pedagogical_mode: pedagogicalMode,
  });
}
