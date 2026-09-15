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

  const { data: space, error: spaceErr } = await userClient
    .from('corpus_spaces')
    .select('id, name, matiere, niveau')
    .eq('id', space_id)
    .single();
  if (spaceErr && spaceErr.code !== 'PGRST116') {
    console.error('[curriculum.generate] lecture espace:', spaceErr.message);
    return res.status(500).json({ error: 'La génération du curriculum a échoué. Réessayez.' });
  }
  if (!space) return res.status(403).json({ error: 'Espace introuvable ou accès refusé' });

  // Client service : lecture des chunks (l'appartenance a été vérifiée ci-dessus).
  const service = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: chunks, error: chunksErr } = await service
    .from('corpus_chunks')
    .select('content')
    .eq('space_id', space_id)
    .order('created_at');
  if (chunksErr) {
    console.error('[curriculum.generate] lecture chunks:', chunksErr.message);
    return res.status(500).json({ error: 'La génération du curriculum a échoué. Réessayez.' });
  }
  if (!chunks || chunks.length === 0) {
    return res.status(400).json({ error: 'Aucun document indexé — ajoutez des documents avant de générer le curriculum.' });
  }

  const MAX_CHUNKS = 120;
  const n = chunks.length;
  const echantillon = n <= MAX_CHUNKS
    ? chunks
    : Array.from({ length: MAX_CHUNKS }, (_, k) => chunks[Math.round(k * (n - 1) / (MAX_CHUNKS - 1))]);
  const extraits = echantillon.map(c => (c.content || '').slice(0, 500)).join('\n---\n');

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
    // Sortie contrainte par CURRICULUM_SCHEMA (output_config) — supporté par @anthropic-ai/sdk 0.100.1. Parsing tolérant conservé en filet.
    params.output_config = { format: { type: 'json_schema', schema: CURRICULUM_SCHEMA } };
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
    const { concept, definition, level, parent_id, priority } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .insert({ space_id, concept, definition, level, parent_id, priority: priority || 'essentiel' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, concept, definition, level, parent_id, priority } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .update({ concept, definition, level, parent_id, priority: priority || 'essentiel' })
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
