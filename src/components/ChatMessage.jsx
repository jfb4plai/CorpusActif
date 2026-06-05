import { useState } from 'react';

const SOCRATIC_INDICATORS = {
  relance: { color: 'bg-[#0a9370]', label: 'Question' },
  indice: { color: 'bg-[#f97316]', label: 'Indice' },
  reponse: { color: 'bg-green-500', label: 'Réponse' },
};

export default function ChatMessage({ role, content, sources, chunksCount, isOutOfBase, socraticLevel, onFeedback, isNotionOpener, isIntro, isOutro, flashDeckId }) {
  // feedbackSent est éphémère — si les messages sont chargés depuis la DB au montage,
  // dériver l'état initial depuis m.helpful !== null
  const [feedbackSent, setFeedbackSent] = useState(false);
  const isUser = role === 'user';

  // Messages spéciaux notion — style centré distinct
  if (isNotionOpener || isIntro || isOutro) {
    return (
      <div className="flex justify-center mb-6">
        <div className={`max-w-[90%] rounded-2xl px-5 py-4 text-sm text-center border-2 ${
          isNotionOpener
            ? 'bg-orange-50 border-orange-200 text-orange-900'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <p className="leading-relaxed font-medium">{content}</p>
          {isOutro && flashDeckId && (
            <a
              href="https://flashfwb-cd2m.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 px-4 py-2 bg-[#0a9370] text-white text-xs font-medium rounded-full hover:bg-teal-700 transition"
            >
              Réviser avec FlashFWB →
            </a>
          )}
        </div>
      </div>
    );
  }
  const indicator = socraticLevel ? SOCRATIC_INDICATORS[socraticLevel] : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
        isUser ? 'bg-[#0a9370] text-white' : 'bg-white border text-gray-800'
      }`}>
        {indicator && !isUser && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`w-2 h-2 rounded-full ${indicator.color} shrink-0`} />
            <span className="text-xs text-gray-400">{indicator.label}</span>
          </div>
        )}
        {isOutOfBase && !isUser && (
          <div className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-1 mb-2">
            Réponse hors des ressources du cours
          </div>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            {sources.map((s, i) => (
              <span key={i} className="inline-block text-xs text-gray-400 mr-2">📄 {s}</span>
            ))}
          </div>
        )}
        {!isUser && chunksCount > 0 && (
          <p className="text-xs text-gray-300 mt-1">
            {chunksCount} fragment{chunksCount > 1 ? 's' : ''} consulté{chunksCount > 1 ? 's' : ''}
          </p>
        )}
        {!isUser && onFeedback && !feedbackSent && (
          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { onFeedback(true); setFeedbackSent(true); }}
              className="text-xs text-gray-400 hover:text-teal-600 transition"
              title="Cette réponse m'a aidé"
            >
              ✓ Utile
            </button>
            <button
              type="button"
              onClick={() => { onFeedback(false); setFeedbackSent(true); }}
              className="text-xs text-gray-400 hover:text-red-400 transition"
              title="Cette réponse n'était pas claire"
            >
              ✗ Pas clair
            </button>
          </div>
        )}
        {!isUser && onFeedback && feedbackSent && (
          <p className="text-xs text-gray-300 mt-2">Merci pour ton retour.</p>
        )}
      </div>
    </div>
  );
}
