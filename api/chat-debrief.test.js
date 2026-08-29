import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './chat-debrief.js'

const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  ANTHROPIC_API_KEY: 'k',
  JWT_SECRET: 'test-secret-at-least-32-chars-long-xx',
}

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { this.ended = true; return this },
  }
}

vi.mock('jose', () => ({
  jwtVerify: async () => ({ payload: { space_id: 's1' } }),
}))

let supabaseScenario
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t) => supabaseScenario.from(t) }),
}))

let anthropicScenario
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: async (a) => anthropicScenario(a) } },
}))

beforeEach(() => {
  Object.assign(process.env, ENV)
  vi.clearAllMocks()
  supabaseScenario = {
    from: (t) => {
      if (t === 'corpus_sessions') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'sess1' } }) }) }) }
      }
      if (t === 'corpus_quiz_attempts') {
        return { insert: async (rows) => { supabaseScenario.inserted = rows; return { error: null }; } }
      }
      throw new Error('table inattendue ' + t)
    },
  }
  anthropicScenario = async () => ({ content: [{ text: JSON.stringify({ questions: [
    { notion_concept: 'A', enonce: 'Q1 ?', options: ['a', 'b', 'c', 'd'], correct_index: 1, explication: 'parce que b.' },
  ] }) }] })
})

const jwt = 'header.payload.sig'

describe('chat-debrief — routeur', () => {
  it('méthode GET → 405', async () => {
    const res = mockRes()
    await handler({ method: 'GET', body: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('session introuvable → 401', async () => {
    supabaseScenario.from = (t) => {
      if (t === 'corpus_sessions') return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
      throw new Error('x')
    }
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [] } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('débrief par défaut (sans action) répond { debrief }', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'Tu as bien expliqué X.' }] })
    const res = mockRes()
    await handler({ method: 'POST', body: {
      token: jwt, notions_mastered: ['A'], session_exchanges: [{ role: 'user', content: 'pourquoi la photosynthèse ?' }],
    } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toHaveProperty('debrief')
    expect(res.body.debrief).toContain('Tu as bien expliqué')
  })

  it('quiz-gen : réponse Haiku valide → 200 { questions } filtrées', async () => {
    anthropicScenario = async () => ({ content: [{ text: JSON.stringify({ questions: [
      { notion_concept: 'A', enonce: 'Q1', options: ['a', 'b', 'c', 'd'], correct_index: 2, explication: 'x' },
      { notion_concept: 'B', enonce: 'Q2', options: ['a', 'b', 'c'], correct_index: 0, explication: 'y' },
      { notion_concept: 'C', enonce: 'Q3', options: ['a', 'b', 'c', 'd'], correct_index: 9, explication: 'z' },
    ] }) }] })
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [
      { concept: 'A', definition: 'da', outcome: 'failed' },
    ] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.questions).toHaveLength(1)
    expect(res.body.questions[0].notion_concept).toBe('A')
  })

  it('quiz-gen : Haiku non-JSON → 200 { questions: [] } (ne bloque pas)', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'je ne peux pas' }] })
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-gen', notions: [{ concept: 'A', definition: 'd', outcome: 'mastered' }] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.questions).toEqual([])
  })

  it('quiz-submit : insère N lignes → 200 { ok: true }', async () => {
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-submit', learner_code: 'E01', resultats: [
      { notion_concept: 'A', correct: true },
      { notion_concept: 'A', correct: false },
      { notion_concept: 'B', correct: true },
    ] } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(supabaseScenario.inserted).toHaveLength(3)
    expect(supabaseScenario.inserted[0]).toMatchObject({ space_id: 's1', learner_code: 'E01', notion_concept: 'A', correct: true })
  })

  it('quiz-submit : resultats vide → 200 { ok: true } sans insert', async () => {
    supabaseScenario.inserted = undefined
    const res = mockRes()
    await handler({ method: 'POST', body: { token: jwt, action: 'quiz-submit', learner_code: 'E01', resultats: [] } }, res)
    expect(res.statusCode).toBe(200)
    expect(supabaseScenario.inserted).toBeUndefined()
  })
})
