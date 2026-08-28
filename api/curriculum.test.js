import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './curriculum.js'

const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  VITE_SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
  VITE_SUPABASE_ANON_KEY: 'anon',
  ANTHROPIC_API_KEY: 'k',
}

function mockRes() {
  return {
    statusCode: 0, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { this.ended = true; return this },
  }
}

let supabaseScenario
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => supabaseScenario.getUser() },
    from: (table) => supabaseScenario.from(table),
  }),
}))

let anthropicScenario
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: async (args) => anthropicScenario(args) }
  },
}))

beforeEach(() => {
  Object.assign(process.env, ENV)
  vi.clearAllMocks()
  supabaseScenario = {
    getUser: async () => ({ data: { user: { id: 'u1' } } }),
    from: (table) => {
      if (table === 'corpus_spaces') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 's1', name: 'La photosynthèse', matiere: 'Sciences', niveau: '4e' } }) }) }) }
      }
      if (table === 'corpus_chunks') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [
          { content: 'La photosynthèse transforme la lumière en énergie chimique.' },
          { content: 'Le chloroplaste contient la chlorophylle.' },
        ] }) }) }) }
      }
      throw new Error('table inattendue ' + table)
    },
  }
  anthropicScenario = async () => ({
    content: [{ text: JSON.stringify({
      chapitres: [{ titre: 'Mécanisme', concepts: [{ concept: 'Photosynthèse', definition: 'Conversion lumière → énergie.' }] }],
      concepts_sans_chapitre: [{ concept: 'Chloroplaste', definition: 'Organite de la photosynthèse.' }],
    }) }],
  })
})

describe('api/curriculum — branche generate', () => {
  it('sans Authorization → 401', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('espace introuvable / non possédé → 403', async () => {
    supabaseScenario.from = (table) => {
      if (table === 'corpus_spaces') return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }
      throw new Error('inattendu')
    }
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(403)
  })

  it('aucun chunk → 400', async () => {
    const base = supabaseScenario.from
    supabaseScenario.from = (table) => {
      if (table === 'corpus_chunks') return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
      return base(table)
    }
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(400)
  })

  it('réponse Haiku valide → 200 { resultat: { chapitres, concepts_sans_chapitre } }', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.resultat.chapitres[0].titre).toBe('Mécanisme')
    expect(res.body.resultat.concepts_sans_chapitre[0].concept).toBe('Chloroplaste')
  })

  it('Haiku renvoie du JSON entouré de ```json → parsé quand même', async () => {
    anthropicScenario = async () => ({ content: [{ text: '```json\n{"chapitres":[],"concepts_sans_chapitre":[{"concept":"C","definition":"d"}]}\n```' }] })
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.resultat.concepts_sans_chapitre[0].concept).toBe('C')
  })

  it('Haiku renvoie du non-JSON → 500', async () => {
    anthropicScenario = async () => ({ content: [{ text: 'désolé je ne peux pas' }] })
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: {}, body: { action: 'generate', space_id: 's1' } }, res)
    expect(res.statusCode).toBe(500)
  })

  it('POST sans action (CRUD existant) n\'est pas intercepté par la branche generate', async () => {
    const res = mockRes()
    let threw = false
    try {
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, query: { space_id: 's1' }, body: { concept: 'x', definition: 'y' } }, res)
    } catch { threw = true }
    expect(res.body?.resultat).toBeUndefined()
    expect(threw || res.statusCode !== 200).toBe(true)
  })
})
