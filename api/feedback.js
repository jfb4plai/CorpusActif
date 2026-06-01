import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { token, message_id, helpful } = req.body;
  if (!token || !message_id || typeof helpful !== 'boolean') {
    return res.status(400).json({ error: 'token, message_id et helpful (boolean) requis' });
  }

  // Valider le JWT apprenant
  let payload;
  try {
    const result = await jwtVerify(token, jwtSecret);
    payload = result.payload;
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  const { space_id, learner_code } = payload;

  // Update avec triple garde : id + space_id + learner_code
  const { data, error } = await supabase
    .from('messages')
    .update({ helpful })
    .eq('id', message_id)
    .eq('space_id', space_id)
    .eq('learner_code', learner_code)
    .select('id');

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Message introuvable' });

  return res.status(200).json({ ok: true });
}
