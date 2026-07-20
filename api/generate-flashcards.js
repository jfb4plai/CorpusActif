import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseService = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  const { space_id } = req.body;
  if (!space_id) return res.status(400).json({ error: 'space_id requis' });

  // Vérifier propriété via RLS
  const userClient = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: space, error: spaceError } = await userClient
    .from('corpus_spaces')
    .select('name, flashcard_deck_id')
    .eq('id', space_id)
    .single();

  if (spaceError || !space) return res.status(403).json({ error: 'Espace introuvable ou accès refusé' });

  // Récupérer user_id
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Session invalide' });

  // === SOURCE A : Curriculum ===
  const { data: curriculumNodes } = await supabaseService
    .from('corpus_curriculum_nodes')
    .select('concept, definition, level')
    .eq('space_id', space_id)
    .order('created_at');

  // === SOURCE B : Questions bloquées (précédant un [INDICE]) ===
  const { data: allMessages } = await supabaseService
    .from('corpus_messages')
    .select('question, answer')
    .eq('space_id', space_id)
    .order('created_at', { ascending: false })
    .limit(100);

  const blocked = (allMessages || []).filter(m => m.answer?.startsWith('[INDICE]'));
  const blockedQuestions = [...new Set(blocked.map(m => m.question))].slice(0, 20);

  // === SOURCE C : Échantillon de chunks ===
  const { data: chunks } = await supabaseService
    .from('corpus_chunks')
    .select('content')
    .eq('space_id', space_id)
    .limit(15);

  // === Génération Claude ===
  const curriculumText = (curriculumNodes || []).length > 0
    ? `CURRICULUM (concepts définis par l'enseignant) :\n${
        curriculumNodes.map(n =>
          `- ${n.concept}${n.definition ? ` : ${n.definition}` : ''}${n.level ? ` (${n.level})` : ''}`
        ).join('\n')
      }`
    : '';

  const blockedText = blockedQuestions.length > 0
    ? `QUESTIONS BLOQUÉES (questions que les apprenants n'ont pas su répondre) :\n${
        blockedQuestions.map(q => `- ${q}`).join('\n')
      }`
    : '';

  const corpusText = (chunks || []).length > 0
    ? `EXTRAITS DU CORPUS :\n${
        chunks.map(c => c.content.slice(0, 300)).join('\n---\n')
      }`
    : '';

  if (!curriculumText && !blockedText && !corpusText) {
    return res.status(400).json({ error: 'Espace sans contenu — ajoutez des documents ou un curriculum avant de générer des cartes' });
  }

  let cards = [];
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Tu es un expert en mémorisation espacée. Génère des cartes mémoire pour l'espace pédagogique "${space.name}".

${curriculumText}

${blockedText}

${corpusText}

Génère maximum 30 cartes mémoire. Priorité : curriculum d'abord, questions bloquées ensuite, termes-clés du corpus en dernier.
Chaque carte : question courte (recto) + réponse concise (verso).
Pas de doublon. Pas de carte trop générale.

Réponds en JSON strict, sans texte avant ou après :
[
  {"question": "...", "answer": "..."}
]

Langue : français. JSON uniquement.`,
      }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    cards = Array.isArray(parsed)
      ? parsed.filter(c => c.question && c.answer).slice(0, 30)
      : [];
  } catch (err) {
    console.error('[generate-flashcards] Claude error:', err.message);
    return res.status(500).json({ error: 'Erreur lors de la génération des cartes' });
  }

  if (cards.length === 0) {
    return res.status(500).json({ error: 'Aucune carte générée — réessayez ou enrichissez le corpus' });
  }

  // === Créer ou récupérer le deck ===
  let deckId = space.flashcard_deck_id;

  if (!deckId) {
    const { data: deck, error: deckError } = await supabaseService
      .from('decks')
      .insert({
        user_id: user.id,
        name: space.name,
        lang_q: 'fr-BE',
        lang_a: 'fr-BE',
        tts: 'a',
        shuffle: 'leitner',
      })
      .select('id')
      .single();

    if (deckError) return res.status(500).json({ error: deckError.message });
    deckId = deck.id;

    // Persister le lien dans l'espace
    const { error: linkError } = await supabaseService
      .from('corpus_spaces')
      .update({ flashcard_deck_id: deckId })
      .eq('id', space_id);
    if (linkError) return res.status(500).json({ error: linkError.message });
  }

  // === Fusion : charger questions existantes ===
  const { data: existingCards } = await supabaseService
    .from('cards')
    .select('question')
    .eq('deck_id', deckId);

  const existingQuestions = new Set(
    (existingCards || []).map(c => c.question.trim().toLowerCase())
  );

  const newCards = cards.filter(
    c => !existingQuestions.has(c.question.trim().toLowerCase())
  );

  // === Insérer les nouvelles cartes ===
  if (newCards.length > 0) {
    const rows = newCards.map((c, i) => ({
      deck_id: deckId,
      question: c.question,
      answer: c.answer,
      box: 1,
      position: (existingCards?.length || 0) + i,
    }));

    const { error: cardsError } = await supabaseService
      .from('cards')
      .insert(rows);

    if (cardsError) return res.status(500).json({ error: cardsError.message });
  }

  return res.status(200).json({
    deck_id: deckId,
    cards_created: newCards.length,
    cards_existing: existingCards?.length || 0,
  });
}
