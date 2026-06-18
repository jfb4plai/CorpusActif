import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseService = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function buildHandoffData(learnerCode, messages) {
  const excerpt = messages
    .slice(-30)
    .map(m => m.role === 'user'
      ? `Apprenant : ${m.question}`
      : `Assistant : ${(m.answer || '').replace(/^\[(INDICE|RÉPONSE)\]\s*/u, '').slice(0, 200)}`)
    .join('\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analyse cette conversation socratique. Apprenant : ${learnerCode}.

Réponds en JSON strict, sans texte avant ou après :
{
  "points_forts": "2-3 phrases sur ce que l'apprenant a compris ou bien formulé. Si rien de notable : Aucun acquis clairement identifiable dans cette session.",
  "difficultes": "2-3 phrases sur les concepts qui ont bloqué et nécessité un guidage. Si aucun blocage : Aucun blocage identifié dans cette session.",
  "synthese": "3-4 phrases narratives : ce qui est acquis, ce qui a bloqué, l'étape de consolidation prioritaire."
}

Conversation :
${excerpt}

Langue : français. Registre enseignant concis. JSON uniquement.`,
      }],
    });

    const raw = response.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    return {
      points_forts: parsed.points_forts || 'Participation à la conversation socratique.',
      difficultes: parsed.difficultes || 'Données insuffisantes pour identifier les blocages.',
      infos_complementaires: parsed.synthese || '',
    };
  } catch (err) {
    console.error('[handoff] buildHandoffData failed:', err.message);
    return {
      points_forts: 'Participation à la conversation socratique.',
      difficultes: 'Données insuffisantes pour identifier les blocages.',
      infos_complementaires: '',
    };
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

  const { points_forts, difficultes, infos_complementaires } = await buildHandoffData(learner_code, messages);

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
    url: `${baseUrl}/constructeur?handoff=${handoff.id}`,
  });
}
