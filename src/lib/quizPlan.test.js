import { describe, it, expect } from 'vitest'
import { planifierQuestions } from './quizPlan.js'

const n = (concept, outcome, definition = 'def ' + concept) => ({ concept, definition, outcome })

describe('planifierQuestions', () => {
  it('2 questions par notion fragile, 1 par notion maîtrisée', () => {
    const plan = planifierQuestions([
      n('A', 'failed'), n('B', 'acquired_with_hint'), n('C', 'mastered'),
    ], 10)
    expect(plan).toHaveLength(5)
    expect(plan.filter(q => q.concept === 'A')).toHaveLength(2)
    expect(plan.filter(q => q.concept === 'B')).toHaveLength(2)
    expect(plan.filter(q => q.concept === 'C')).toHaveLength(1)
    for (const q of plan) expect(q).toHaveProperty('definition')
  })

  it('respecte le plafond en servant les notions prioritaires d\'abord', () => {
    const notions = Array.from({ length: 8 }, (_, i) => n('N' + i, 'failed'))
    const plan = planifierQuestions(notions, 10)
    expect(plan).toHaveLength(10)
    expect(new Set(plan.map(q => q.concept))).toEqual(new Set(['N0', 'N1', 'N2', 'N3', 'N4']))
  })

  it('coupe proprement au milieu d\'une notion à 2 questions', () => {
    const notions = [
      n('F0', 'failed'), n('F1', 'failed'), n('F2', 'failed'), n('F3', 'failed'),
      n('M0', 'mastered'), n('M1', 'mastered'), n('M2', 'mastered'),
    ]
    const plan = planifierQuestions(notions, 9)
    expect(plan).toHaveLength(9)
    expect(plan.filter(q => q.concept.startsWith('F'))).toHaveLength(8)
    expect(plan.filter(q => q.concept.startsWith('M'))).toHaveLength(1)
  })

  it('ordre du parcours conservé à priorité égale', () => {
    const plan = planifierQuestions([n('X', 'mastered'), n('Y', 'mastered'), n('Z', 'mastered')], 10)
    expect(plan.map(q => q.concept)).toEqual(['X', 'Y', 'Z'])
  })

  it('outcome inconnu ou absent → traité comme mastered (1 question)', () => {
    const plan = planifierQuestions([n('A', undefined), n('B', 'autre')], 10)
    expect(plan).toHaveLength(2)
  })

  it('aucune notion → []', () => {
    expect(planifierQuestions([], 10)).toEqual([])
  })
})
