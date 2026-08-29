import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import ChatMessage from './ChatMessage.jsx'

afterEach(cleanup)

describe('ChatMessage — rendus quiz', () => {
  it('isQuizOffer : texte + boutons Oui / Non merci', () => {
    const onAccept = vi.fn(), onDecline = vi.fn()
    render(<ChatMessage isQuizOffer onQuizAccept={onAccept} onQuizDecline={onDecline} />)
    expect(screen.getByText(/renforce ta mémoire/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /oui/i }))
    expect(onAccept).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /non merci/i }))
    expect(onDecline).toHaveBeenCalled()
  })

  it('isQuizOffer sans callbacks : texte présent, pas de bouton Oui', () => {
    render(<ChatMessage isQuizOffer />)
    expect(screen.getByText(/renforce ta mémoire/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /oui/i })).toBeNull()
  })

  it('isQuizDeclined : message discret', () => {
    render(<ChatMessage isQuizDeclined content="Pas de souci." />)
    expect(screen.getByText('Pas de souci.')).toBeInTheDocument()
  })

  it('isQuizResult : bilan factuel avec notions à revoir', () => {
    render(<ChatMessage isQuizResult quizScore={3} quizTotal={5} quizToReview={['Photosynthèse', 'ATP']} />)
    expect(screen.getByText(/3 questions sur 5/i)).toBeInTheDocument()
    expect(screen.getByText(/Photosynthèse/)).toBeInTheDocument()
    expect(screen.getByText(/ATP/)).toBeInTheDocument()
  })

  it('isQuizResult : sans notion à revoir, pas de section « à revoir »', () => {
    render(<ChatMessage isQuizResult quizScore={5} quizTotal={5} quizToReview={[]} />)
    expect(screen.queryByText(/à revoir/i)).not.toBeInTheDocument()
  })
})
