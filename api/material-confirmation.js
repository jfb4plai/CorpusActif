import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, confirmed, learner_code: bodyLearnerCode } = req.body;
  if (!token || typeof confirmed !== 'boolean') {
    return res.status(400).json({ error: 'token et confirmed (booléen) requis' });
  }

  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id, learner_code: tokenLearnerCode } = payload;
  const learner_code = bodyLearnerCode || tokenLearnerCode || null;

  const { data: session } = await supabase
    .from('corpus_sessions')
    .select('id')
    .eq('token', token)
    .single();
  if (!session) return res.status(401).json({ error: 'Session expirée ou révoquée' });

  const { error } = await supabase.from('corpus_material_confirmations').insert({
    space_id,
    learner_code: learner_code || null,
    confirmed,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
