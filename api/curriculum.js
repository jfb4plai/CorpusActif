import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  // Utiliser le token Supabase de l'enseignant (pas le service role)
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
    const { concept, definition, level, parent_id } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .insert({ space_id, concept, definition, level, parent_id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, concept, definition, level, parent_id } = req.body;
    const { data, error } = await supabase
      .from('corpus_curriculum_nodes')
      .update({ concept, definition, level, parent_id })
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
