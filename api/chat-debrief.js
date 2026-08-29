import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import { planifierQuestions } from '../src/lib/quizPlan.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['notion_concept', 'enonce', 'options', 'correct_index', 'explication'],
        properties: {
          notion_concept: { type: 'string' },
          enonce: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correct_index: { type: 'integer', minimum: 0, maximum: 3 },
          explication: { type: 'string' },
        },
      },
    },
  },
};

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Vérifie le JWT + l'existence de la session. Renvoie { space_id } ou null (après avoir répondu).
async function verifierSession(req, res) {
  const { token } = req.body || {};
  if (!token) { res.status(400).json({ error: 'token requis' }); return null; }
  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET);
  let space_id;
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    space_id = payload.space_id;
    const { data: session } = await serviceClient()
      .from('corpus_sessions').select('id').eq('token', token).single();
    if (!session) { res.status(401).json({ error: 'Session expirée ou révoquée' }); return null; }
  } catch (err) {
    console.error('[chat-debrief] verifierSession:', err.message);
    res.status(401).json({ error: 'Token invalide ou expiré' });
    return null;
  }
  return { space_id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const auth = await verifierSession(req, res);
  if (!auth) return;

  const action = req.body?.action;
  if (action === 'quiz-gen') return genererQuiz(req, res);
  if (action === 'quiz-submit') return enregistrerQuiz(req, res, auth);
  return genererDebrief(req, res);
}

// ---- Débrief (comportement historique, inchangé) --------------------------
async function genererDebrief(req, res) {
  const { notions_mastered = [], notions_with_hint = [], notions_failed = [], session_exchanges = [] } = req.body;

  const masteredList = notions_mastered.length > 0 ? `Notions maîtrisées sans aide : ${notions_mastered.join(', ')}` : '';
  const hintList = notions_with_hint.length > 0 ? `Notions comprises avec indice : ${notions_with_hint.join(', ')}` : '';
  const failedList = notions_failed.length > 0 ? `Notions non acquises : ${notions_failed.join(', ')}` : '';

  const excerpts = session_exchanges
    .filter(e => e.role === 'user' && e.content.length > 15)
    .slice(0, 4)
    .map(e => `Apprenant : "${e.content.slice(0, 120)}"`)
    .join('\n');

  const prompt = [masteredList, hintList, failedList, excerpts ? `\nExtraits de session :\n${excerpts}` : '']
    .filter(Boolean).join('\n');

  if (!prompt.trim()) return res.status(200).json({ debrief: null });

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
    return res.status(200).json({ debrief: response.content[0].text.trim() });
  } catch (err) {
    console.error('[chat-debrief] Haiku error:', err.message);
    return res.status(200).json({ debrief: null });
  }
}

// ---- Génération du QCM ---------------------------------------------------
// space_id non requis : les notions à quizzer viennent du client (session de l'apprenant).
async function genererQuiz(req, res) {
  const notions = (Array.isArray(req.body?.notions) ? req.body.notions : [])
    .slice(0, 40)
    .map(n => ({
      concept: typeof n.concept === 'string' ? n.concept.slice(0, 200) : '',
      definition: typeof n.definition === 'string' ? n.definition.slice(0, 300) : '',
      outcome: n.outcome,
    }));
  const plan = planifierQuestions(notions, 10);
  if (plan.length === 0) return res.status(200).json({ questions: [] });

  const liste = plan
    .map((q, i) => `${i + 1}. Notion « ${q.concept} » — ${q.definition || '(pas de définition)'}`)
    .join('\n');

  const prompt = `Tu conçois un court QCM de consolidation pour un apprenant qui vient de parcourir ces notions. Génère EXACTEMENT une question par ligne ci-dessous (${plan.length} questions), dans le même ordre.

${liste}

Contraintes par question :
- 4 options plausibles, une seule correcte
- place la bonne réponse à une position VARIABLE (pas toujours la même)
- aucune formulation de l'énoncé ou des options ne doit trahir la bonne réponse (pas d'indice de surface, pas de reprise littérale de la définition dans la seule bonne option)
- "explication" : une phrase disant quelle confusion les mauvaises réponses ciblent, ou pourquoi la bonne est correcte
- français direct, pas de preamble

Réponds en JSON strict : {"questions":[{"notion_concept":"...","enonce":"...","options":["...","...","...","..."],"correct_index":0,"explication":"..."}]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      output_config: { format: { type: 'json_schema', schema: QUIZ_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'max_tokens') {
      console.error('[chat-debrief] quiz-gen tronqué à max_tokens');
    }
    const raw = (response.content?.[0]?.text ?? '').trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .filter(q =>
        q &&
        typeof q.enonce === 'string' && q.enonce.trim() &&
        Array.isArray(q.options) && q.options.length === 4 &&
        q.options.every(o => typeof o === 'string' && o.trim()) &&
        new Set(q.options.map(o => o.trim())).size === 4 &&
        Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3 &&
        typeof q.notion_concept === 'string' && q.notion_concept.trim()
      )
      .map(q => ({
        notion_concept: q.notion_concept,
        enonce: q.enonce,
        options: q.options,
        correct_index: q.correct_index,
        explication: typeof q.explication === 'string' ? q.explication : '',
      }))
      .slice(0, plan.length);
    return res.status(200).json({ questions });
  } catch (err) {
    console.error('[chat-debrief] quiz-gen error:', err.message);
    return res.status(200).json({ questions: [] });
  }
}

// ---- Enregistrement des résultats -------------------------------------
async function enregistrerQuiz(req, res, { space_id }) {
  const { learner_code = null, resultats = [] } = req.body || {};
  const rows = (Array.isArray(resultats) ? resultats : [])
    .slice(0, 50)
    .filter(r => r && typeof r.notion_concept === 'string' && r.notion_concept.length > 0 && r.notion_concept.length <= 200)
    .map(r => ({ space_id, learner_code, notion_concept: r.notion_concept, correct: !!r.correct }));
  if (rows.length === 0) return res.status(200).json({ ok: true });

  const { error } = await serviceClient().from('corpus_quiz_attempts').insert(rows);
  if (error) {
    console.error('[chat-debrief] quiz-submit insert:', error.message);
    return res.status(500).json({ error: 'Enregistrement impossible' });
  }
  return res.status(200).json({ ok: true });
}
