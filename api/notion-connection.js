import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, notion_concept, connection_text, skipped = false } = req.body;
  if (!token || !notion_concept) return res.status(400).json({ error: 'token et notion_concept requis' });

  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id, learner_code } = payload;

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('token', token)
    .single();
  if (!session) return res.status(401).json({ error: 'Session expirée ou révoquée' });

  const { error } = await supabase.from('corpus_notion_connections').insert({
    space_id,
    learner_code: learner_code || null,
    notion_concept,
    connection_text: skipped ? null : (connection_text?.trim() || null),
    skipped,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
