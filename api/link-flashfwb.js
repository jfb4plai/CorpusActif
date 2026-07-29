import { createClient } from '@supabase/supabase-js';

const supabaseService = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  const { flashfwb_access_token } = req.body;
  if (!flashfwb_access_token) return res.status(400).json({ error: 'flashfwb_access_token requis' });

  // Identifier l'enseignant CorpusActif (Projet A)
  const userClient = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return res.status(401).json({ error: 'Session CorpusActif invalide' });

  // Vérifier le token FlashFWB directement auprès du projet FlashFWB —
  // on ne fait jamais confiance à un user_id fourni par le client.
  const flashfwbUrl = process.env.FLASHFWB_SUPABASE_URL;
  const verifyRes = await fetch(`${flashfwbUrl}/auth/v1/user`, {
    headers: {
      apikey: process.env.VITE_FLASHFWB_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${flashfwb_access_token}`,
    },
  });
  if (!verifyRes.ok) return res.status(401).json({ error: 'Session FlashFWB invalide ou expirée' });
  const flashfwbUser = await verifyRes.json();
  if (!flashfwbUser?.id) return res.status(401).json({ error: 'Compte FlashFWB introuvable' });

  const { error: upsertError } = await supabaseService
    .from('corpus_flashfwb_links')
    .upsert({ user_id: user.id, flashfwb_user_id: flashfwbUser.id, linked_at: new Date().toISOString() });

  if (upsertError) return res.status(500).json({ error: upsertError.message });

  return res.status(200).json({ linked: true });
}
