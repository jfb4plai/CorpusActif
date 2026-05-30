import { SignJWT } from 'jose';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { space_id, learner_code, expires_days = 30 } = req.body;
  if (!space_id) return res.status(400).json({ error: 'space_id requis' });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expires_days);

  const token = await new SignJWT({ space_id, learner_code: learner_code || null })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${expires_days}d`)
    .setIssuedAt()
    .sign(jwtSecret);

  // Persister la session dans Supabase
  const { error } = await supabase.from('sessions').insert({
    space_id,
    learner_code: learner_code || null,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (error) return res.status(500).json({ error: error.message });

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  return res.status(200).json({
    token,
    url: `${baseUrl}/chat/${token}`,
    expires_at: expiresAt.toISOString(),
  });
}
