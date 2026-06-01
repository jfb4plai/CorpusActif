import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseService = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildPointsForts(messages) {
  const markers = ['bonne intuition', 'tu as bien identifié', 'tu avais raison sur', 'exactement', "c'est juste"];
  const lines = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.answer?.startsWith('[RÉPONSE]')) {
      const text = m.answer.replace(/^\[RÉPONSE\]\s*/u, '');
      const found = markers.some(marker => text.toLowerCase().includes(marker));
      if (found) lines.push(`— ${text.slice(0, 200)}`);
    }
  }
  return lines.length > 0
    ? lines.join('\n')
    : 'Participation active à la conversation socratique.';
}

function buildDifficultes(messages) {
  const lines = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && m.answer?.startsWith('[INDICE]')) {
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
          lines.push(`— ${messages[j].question}`);
          break;
        }
      }
    }
  }
  const unique = [...new Set(lines)];
  return unique.length > 0
    ? unique.join('\n')
    : 'Aucun blocage identifié dans cette session.';
}

async function buildSynthese(learnerCode, messages) {
  const excerpt = messages
    .slice(-20)
    .map(m => m.role === 'user'
      ? `Apprenant : ${m.question}`
      : `Assistant : ${(m.answer || '').slice(0, 150)}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Tu es un conseiller pédagogique. À partir de cette conversation socratique entre un assistant et l'apprenant ${learnerCode}, rédige en 3-4 phrases :
- Ce que l'apprenant a compris et bien mobilisé
- Ce qui a bloqué et nécessité un guidage
- L'étape de consolidation prioritaire

Conversation :
${excerpt}

Langue : français. Pas de preamble. Registre enseignant, pas clinique.`,
      }],
    });
    return response.content[0].text;
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  const { space_id, learner_code } = req.body;
  if (!space_id || !learner_code) {
    return res.status(400).json({ error: 'space_id et learner_code requis' });
  }

  // Vérifier propriété de l'espace via RLS
  const userClient = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: space, error: spaceError } = await userClient
    .from('spaces')
    .select('name, niveau, matiere')
    .eq('id', space_id)
    .single();

  if (spaceError || !space) return res.status(403).json({ error: 'Espace introuvable ou accès refusé' });

  // Charger les messages de cet apprenant (50 derniers)
  const { data: rawMessages } = await supabaseService
    .from('messages')
    .select('question, answer, created_at')
    .eq('space_id', space_id)
    .eq('learner_code', learner_code)
    .order('created_at', { ascending: true })
    .limit(50);

  // Reconstituer les paires user/assistant
  const messages = (rawMessages || []).flatMap(m => [
    { role: 'user', question: m.question },
    { role: 'assistant', answer: m.answer },
  ]);

  if (messages.length === 0) {
    return res.status(400).json({ error: 'Aucune conversation disponible pour cet apprenant' });
  }

  const points_forts = buildPointsForts(messages);
  const difficultes = buildDifficultes(messages);
  const infos_complementaires = await buildSynthese(learner_code, messages);

  // Récupérer l'user_id depuis le token
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Session invalide' });

  // Écrire le handoff
  const { data: handoff, error: handoffError } = await supabaseService
    .from('handoffs')
    .insert({
      user_id: user.id,
      eleve_code: learner_code,
      space_name: space.name,
      points_forts,
      difficultes,
      infos_complementaires,
      niveau: space.niveau || null,
      matiere: space.matiere || null,
    })
    .select('id')
    .single();

  if (handoffError) return res.status(500).json({ error: handoffError.message });

  const baseUrl = process.env.RETROACTIF_URL || 'https://retroactif.jfb4plai.com';
  return res.status(200).json({
    url: `${baseUrl}/module6?handoff=${handoff.id}`,
  });
}
