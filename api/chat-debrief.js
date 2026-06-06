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

  const { token, notions_mastered = [], notions_with_hint = [], notions_failed = [], session_exchanges = [] } = req.body;
  if (!token) return res.status(400).json({ error: 'token requis' });

  try {
    const result = await jwtVerify(token, jwtSecret);
    const { space_id } = result.payload;

    // Vérifier que la session existe
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('token', token)
      .single();
    if (!session) return res.status(401).json({ error: 'Session expirée ou révoquée' });
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  // Construire le contexte pour Haiku
  const masteredList = notions_mastered.length > 0
    ? `Notions maîtrisées sans aide : ${notions_mastered.join(', ')}`
    : '';
  const hintList = notions_with_hint.length > 0
    ? `Notions comprises avec indice : ${notions_with_hint.join(', ')}`
    : '';
  const failedList = notions_failed.length > 0
    ? `Notions non acquises : ${notions_failed.join(', ')}`
    : '';

  // Sélectionner 4 échanges significatifs (questions de l'apprenant non triviales)
  const excerpts = session_exchanges
    .filter(e => e.role === 'user' && e.content.length > 15)
    .slice(0, 4)
    .map(e => `Apprenant : "${e.content.slice(0, 120)}"`)
    .join('\n');

  const prompt = [masteredList, hintList, failedList, excerpts ? `\nExtraits de session :\n${excerpts}` : '']
    .filter(Boolean)
    .join('\n');

  if (!prompt.trim()) {
    return res.status(200).json({ debrief: null });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `${prompt}

Écris un message court (3 phrases maximum) à l'apprenant à la fin de sa session :
- Si possible, cite entre guillemets une formulation ou question qui a montré une vraie compréhension
- Nomme ce qui reste à consolider sans dramatiser
- Ne commence jamais par "Bravo", "Bien joué", "Super", "Excellent" ou un adverbe approbateur
- Langue : français direct. Pas de preamble.`,
      }],
    });

    const debrief = response.content[0].text.trim();
    return res.status(200).json({ debrief });
  } catch (err) {
    console.error('[chat-debrief] Haiku error:', err.message);
    return res.status(200).json({ debrief: null });
  }
}
