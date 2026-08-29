import { describe, it, expect } from 'vitest'
import { filtrerNoeudsParcours } from './chat-init.js'

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
