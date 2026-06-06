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
