import { describe, it, expect } from 'vitest'
import { draftToNodes, groupNodes } from './curriculumDraft.js'

describe('draftToNodes', () => {
  const draft = {
    chapitres: [
      { titre: 'Chapitre A', concepts: [
        { concept: 'A1', definition: 'def A1' },
        { concept: 'A2', definition: 'def A2' },
      ]},
      { titre: 'Chapitre B', concepts: [
        { concept: 'B1', definition: 'def B1' },
      ]},
    ],
    concepts_sans_chapitre: [
      { concept: 'X1', definition: 'def X1' },
    ],
  }

  it('un chapitre avec 2 concepts cochés → 1 parent + 2 enfants', () => {
    const kept = {
      '0:0': { keep: true, parentKey: 'chap:0' },
      '0:1': { keep: true, parentKey: 'chap:0' },
      '1:0': { keep: false, parentKey: 'chap:1' },
      'orphan:0': { keep: true, parentKey: null },
    }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([{ tempId: 'chap:0', concept: 'Chapitre A', definition: '', level: null }])
    expect(enfants).toEqual([
      { tempId: '0:0', parentTempId: 'chap:0', concept: 'A1', definition: 'def A1' },
      { tempId: '0:1', parentTempId: 'chap:0', concept: 'A2', definition: 'def A2' },
      { tempId: 'orphan:0', parentTempId: null, concept: 'X1', definition: 'def X1' },
    ])
  })

  it('chapitre sans concept coché → aucun nœud pour ce chapitre', () => {
    const kept = { '1:0': { keep: false, parentKey: 'chap:1' } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([])
    expect(enfants).toEqual([])
  })

  it('concept déplacé vers "sans chapitre" → parentTempId null', () => {
    const kept = { '0:0': { keep: true, parentKey: null } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([])
    expect(enfants).toEqual([
      { tempId: '0:0', parentTempId: null, concept: 'A1', definition: 'def A1' },
    ])
  })

  it('concept orphelin déplacé vers un chapitre → crée le parent', () => {
    const kept = { 'orphan:0': { keep: true, parentKey: 'chap:1' } }
    const { parents, enfants } = draftToNodes(draft, kept)
    expect(parents).toEqual([{ tempId: 'chap:1', concept: 'Chapitre B', definition: '', level: null }])
    expect(enfants).toEqual([
      { tempId: 'orphan:0', parentTempId: 'chap:1', concept: 'X1', definition: 'def X1' },
    ])
  })

  it('rien de coché → vide', () => {
    expect(draftToNodes(draft, {})).toEqual({ parents: [], enfants: [] })
  })

  it('utilise les valeurs éditées quand fournies dans overrides', () => {
    const kept = { '0:0': { keep: true, parentKey: 'chap:0', concept: 'A1 modifié', definition: 'nouvelle def' } }
    const { enfants } = draftToNodes(draft, kept)
    expect(enfants[0]).toMatchObject({ concept: 'A1 modifié', definition: 'nouvelle def' })
  })
})

describe('groupNodes', () => {
  it('parent + 2 enfants → 1 groupe ; nœud seul → orphelin', () => {
    const nodes = [
      { id: 'p1', concept: 'Chap 1', parent_id: null },
      { id: 'c1', concept: 'Concept 1', parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', parent_id: 'p1' },
      { id: 'o1', concept: 'Orphelin', parent_id: null },
    ]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes).toHaveLength(1)
    expect(groupes[0].parent.id).toBe('p1')
    expect(groupes[0].enfants.map(n => n.id)).toEqual(['c1', 'c2'])
    expect(orphelins.map(n => n.id)).toEqual(['o1'])
  })

  it('enfant dont le parent est absent → orphelin', () => {
    const nodes = [{ id: 'c1', concept: 'C', parent_id: 'disparu' }]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes).toEqual([])
    expect(orphelins.map(n => n.id)).toEqual(['c1'])
  })

  it('un nœud de profondeur 3 n\'est jamais masqué', () => {
    const nodes = [
      { id: 'a', concept: 'A', parent_id: null },
      { id: 'b', concept: 'B', parent_id: 'a' },
      { id: 'c', concept: 'C', parent_id: 'b' },
    ]
    const { groupes, orphelins } = groupNodes(nodes)
    const rendus = [...groupes.flatMap(g => [g.parent.id, ...g.enfants.map(e => e.id)]), ...orphelins.map(n => n.id)]
    expect(new Set(rendus)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('préserve l\'ordre d\'entrée des groupes et des orphelins', () => {
    const nodes = [
      { id: 'o1', concept: 'O1', parent_id: null },
      { id: 'p1', concept: 'P1', parent_id: null },
      { id: 'c1', concept: 'C1', parent_id: 'p1' },
    ]
    const { groupes, orphelins } = groupNodes(nodes)
    expect(groupes.map(g => g.parent.id)).toEqual(['p1'])
    expect(orphelins.map(n => n.id)).toEqual(['o1'])
  })
})
