import { describe, it, expect } from 'vitest'
import { filtrerNoeudsParcours, trierParPriorite } from './chat-init.js'

describe('filtrerNoeudsParcours', () => {
  it('exclut les nœuds qui sont parents d\'un autre nœud du lot', () => {
    const nodes = [
      { id: 'p1', concept: 'Chapitre 1', definition: '', parent_id: null },
      { id: 'c1', concept: 'Concept 1', definition: 'd1', parent_id: 'p1' },
      { id: 'c2', concept: 'Concept 2', definition: 'd2', parent_id: 'p1' },
      { id: 'o1', concept: 'Notion seule', definition: 'd3', parent_id: null },
    ]
    const out = filtrerNoeudsParcours(nodes)
    expect(out.map(n => n.concept)).toEqual(['Concept 1', 'Concept 2', 'Notion seule'])
  })

  it('sans hiérarchie → renvoie tout', () => {
    const nodes = [
      { id: 'a', concept: 'A', definition: 'x', parent_id: null },
      { id: 'b', concept: 'B', definition: 'y', parent_id: null },
    ]
    expect(filtrerNoeudsParcours(nodes).map(n => n.concept)).toEqual(['A', 'B'])
  })
})

describe('trierParPriorite', () => {
  it('place les concepts essentiels avant les complémentaires', () => {
    const nodes = [
      { concept: 'A', priority: 'complementaire' },
      { concept: 'B', priority: 'essentiel' },
      { concept: 'C', priority: 'complementaire' },
      { concept: 'D', priority: 'essentiel' },
    ]
    expect(trierParPriorite(nodes).map(n => n.concept)).toEqual(['B', 'D', 'A', 'C'])
  })

  it('préserve l\'ordre relatif à priorité égale (tri stable)', () => {
    const nodes = [
      { concept: 'A', priority: 'essentiel' },
      { concept: 'B', priority: 'essentiel' },
      { concept: 'C', priority: 'essentiel' },
    ]
    expect(trierParPriorite(nodes).map(n => n.concept)).toEqual(['A', 'B', 'C'])
  })

  it('traite une priorité absente comme essentiel', () => {
    const nodes = [
      { concept: 'A', priority: 'complementaire' },
      { concept: 'B' },
    ]
    expect(trierParPriorite(nodes).map(n => n.concept)).toEqual(['B', 'A'])
  })
})
