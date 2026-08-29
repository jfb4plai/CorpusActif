import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import QuizPanel from './QuizPanel.jsx'

afterEach(cleanup)

const questions = [
  { notion_concept: 'A', enonce: 'Question A ?', options: ['a0', 'a1', 'a2', 'a3'], correct_index: 1, explication: 'a1 est correcte car…' },
  { notion_concept: 'B', enonce: 'Question B ?', options: ['b0', 'b1', 'b2', 'b3'], correct_index: 3, explication: 'b3 est correcte car…' },
]

describe('QuizPanel', () => {
  it('affiche la première question et ses 4 options', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    expect(screen.getByText('Question A ?')).toBeInTheDocument()
    for (const o of ['a0', 'a1', 'a2', 'a3']) expect(screen.getByRole('button', { name: o })).toBeInTheDocument()
  })

  it('cliquer une option fige le choix et montre l\'explication', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'a0' }))
    expect(screen.getByText(/a1 est correcte car/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'a2' }))
    expect(screen.getByText(/a1 est correcte car/)).toBeInTheDocument()
  })

  it('avance jusqu\'au bout et appelle onDone avec les résultats', () => {
    const onDone = vi.fn()
    render(<QuizPanel questions={questions} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'a0' }))
    fireEvent.click(screen.getByRole('button', { name: /question suivante/i }))
    fireEvent.click(screen.getByRole('button', { name: 'b3' }))
    fireEvent.click(screen.getByRole('button', { name: /voir mon bilan/i }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith([
      { notion_concept: 'A', correct: false },
      { notion_concept: 'B', correct: true },
    ])
  })

  it('affiche la progression i/N', () => {
    render(<QuizPanel questions={questions} onDone={() => {}} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })
})
