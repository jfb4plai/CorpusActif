import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import Curriculum from './Curriculum.jsx'

// Le builder Supabase est à la fois chaînable (.select) ET thenable (await direct) —
// le mock doit refléter les deux formes pour `await insert(x)` et `await insert(x).select()`.
const nodesStore = { rows: [] }
function thenable(result) {
  return { select: () => Promise.resolve(result), then: (resolve) => resolve(result) }
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        eq: () => ({ order: async () => ({ data: table === 'corpus_curriculum_nodes' ? nodesStore.rows : [] }) }),
        order: async () => ({ data: [] }),
      }),
      insert: (rows) => {
        const arr = Array.isArray(rows) ? rows : [rows]
        const inserted = arr.map((r, i) => ({ ...r, id: 'new-' + (nodesStore.rows.length + i) }))
        nodesStore.rows.push(...inserted)
        return thenable({ data: inserted, error: null })
      },
      delete: () => ({ in: async () => ({ error: null }), eq: async () => ({ error: null }) }),
    }),
  },
}))

const session = { access_token: 'tok', user: { id: 'u1' } }

beforeEach(() => {
  nodesStore.rows = []
  vi.restoreAllMocks()
  global.fetch = vi.fn()
})
afterEach(cleanup)

describe('Curriculum — génération', () => {
  it('le bouton "Générer depuis les documents" est présent', async () => {
    render(<Curriculum spaceId="s1" session={session} />)
    expect(await screen.findByRole('button', { name: /Générer depuis les documents/i })).toBeInTheDocument()
  })

  it('affiche le panneau brouillon après génération', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: {
        chapitres: [{ titre: 'Chapitre A', concepts: [{ concept: 'A1', definition: 'def' }] }],
        concepts_sans_chapitre: [{ concept: 'X1', definition: 'defX' }],
      }}),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await waitFor(() => expect(screen.getByText(/Brouillon généré/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Chapitre A')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('X1')).toBeInTheDocument()
  })

  it('"Ajouter au curriculum" insère les concepts cochés et ferme le panneau', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: {
        chapitres: [{ titre: 'Chapitre A', concepts: [{ concept: 'A1', definition: 'def' }] }],
        concepts_sans_chapitre: [],
      }}),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await screen.findByText(/Brouillon généré/i)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter au curriculum/i }))
    await waitFor(() => expect(screen.queryByText(/Brouillon généré/i)).not.toBeInTheDocument())
    expect(nodesStore.rows).toHaveLength(2)
    expect(nodesStore.rows.find(r => r.concept === 'Chapitre A' && r.parent_id == null)).toBeTruthy()
    const enfant = nodesStore.rows.find(r => r.concept === 'A1')
    expect(enfant.parent_id).toBe(nodesStore.rows.find(r => r.concept === 'Chapitre A').id)
  })

  it('"Annuler" ferme le panneau sans rien insérer', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ resultat: { chapitres: [], concepts_sans_chapitre: [{ concept: 'X1', definition: 'd' }] } }),
    })
    render(<Curriculum spaceId="s1" session={session} />)
    fireEvent.click(await screen.findByRole('button', { name: /Générer depuis les documents/i }))
    await screen.findByText(/Brouillon généré/i)
    fireEvent.click(screen.getByRole('button', { name: /^Annuler$/i }))
    await waitFor(() => expect(screen.queryByText(/Brouillon généré/i)).not.toBeInTheDocument())
    expect(nodesStore.rows).toHaveLength(0)
  })
})

describe('Curriculum — affichage groupé', () => {
  it('rend les chapitres avec leurs enfants indentés et les orphelins à part', async () => {
    nodesStore.rows = [
      { id: 'p1', concept: 'Chapitre 1', definition: '', level: null, parent_id: null },
      { id: 'c1', concept: 'Concept 1', definition: 'd1', level: null, parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', definition: 'd2', level: null, parent_id: 'p1' },
      { id: 'o1', concept: 'Notion isolée', definition: 'd3', level: null, parent_id: null },
    ]
    render(<Curriculum spaceId="s1" session={session} />)
    expect(await screen.findByText('Chapitre 1')).toBeInTheDocument()
    expect(screen.getByText('Concept 1')).toBeInTheDocument()
    expect(screen.getByText('Notion isolée')).toBeInTheDocument()
    expect(screen.getByTestId('chapitre-p1')).toBeInTheDocument()
  })
})
