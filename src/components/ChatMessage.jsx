import { useState } from 'react';

const SOCRATIC_INDICATORS = {
  relance: { color: 'bg-[#0a9370]', label: 'Question' },
  indice: { color: 'bg-[#f97316]', label: 'Indice' },
  reponse: { color: 'bg-green-500', label: 'Réponse' },
};

function formatTimeSince(isoDate) {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'aujourd\'hui';
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 14) return 'la semaine dernière';
  return `il y a ${Math.floor(days / 7)} semaines`;
}

export default function ChatMessage({
  role, content, sources, chunksCount, isOutOfBase, socraticLevel, onFeedback,
  isNotionOpener, isIntro, isOutro, flashDeckId,
  isRecap, previousNotions, lastSessionDate,
  isNotionMap, notions, notionOutcomes,
  isDebrief, isCelebration,
}) {
  // feedbackSent est éphémère — si les messages sont chargés depuis la DB au montage,
  // dériver l'état initial depuis m.helpful !== null
  const [feedbackSent, setFeedbackSent] = useState(false);
  const isUser = role === 'user';

  // Recap: retour de session avec notions acquises/non acquises
  if (isRecap && previousNotions && previousNotions.length > 0) {
    const acquired = previousNotions.filter(n => n.acquired);
    const notAcquired = previousNotions.filter(n => !n.acquired);
    const since = formatTimeSince(lastSessionDate);
    return (
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-md bg-white px-5 py-4 text-sm" style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
          <p className="font-bold tracking-tight mb-3" style={{color:'var(--teal)'}}>
            {since ? `Bon retour — ${since}.` : 'Bon retour.'}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {acquired.map(n => (
              <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#dcfce7', color:'#166534', borderRadius:'4px'}}>
                ✓ {n.concept}
              </span>
            ))}
            {notAcquired.map(n => (
              <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'var(--surface2)', color:'var(--text3)', borderRadius:'4px'}}>
                ○ {n.concept}
              </span>
            ))}
          </div>
          {notAcquired.length > 0 && (
            <p className="text-xs" style={{color:'var(--text2)'}}>
              Il t'en reste {notAcquired.length}. Reprends où tu t'étais arrêté.
            </p>
          )}
          {notAcquired.length === 0 && (
            <p className="text-xs" style={{color:'var(--text2)'}}>
              Tu avais tout parcouru. Une nouvelle session pour consolider ?
            </p>
          )}
        </div>
      </div>
    );
  }

  // Notion Map: vue d'ensemble du parcours (mastered / acquired_with_hint / failed)
  if (isNotionMap && notions && notionOutcomes) {
    const mastered = notions.filter(n => notionOutcomes[n.concept] === 'mastered');
    const withHint = notions.filter(n => notionOutcomes[n.concept] === 'acquired_with_hint');
    const failed = notions.filter(n => notionOutcomes[n.concept] === 'failed');
    return (
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-md px-5 py-4 text-sm" style={{background:'#f0fdf4', border:'1px solid #bbf7d0', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
          <p className="label-upper mb-3">Ton parcours</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {mastered.map(n => (
              <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#0a9370', color:'white', borderRadius:'4px'}}>
                ✓ {n.concept}
              </span>
            ))}
            {withHint.map(n => (
              <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#d1fae5', color:'#065f46', borderRadius:'4px'}}>
                ~ {n.concept}
              </span>
            ))}
            {failed.map(n => (
              <span key={n.concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 font-medium" style={{background:'#f1f5f9', color:'#475569', borderRadius:'4px'}}>
                ○ {n.concept}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{color:'var(--text2)'}}>
            {mastered.length > 0 && `${mastered.length} maîtrisée${mastered.length > 1 ? 's' : ''}`}
            {withHint.length > 0 && ` · ${withHint.length} comprise${withHint.length > 1 ? 's' : ''} avec indice`}
            {failed.length > 0 && ` · ${failed.length} à revoir ensemble`}
          </p>
        </div>
      </div>
    );
  }

  // Valorisation immédiate à la maîtrise d'une notion
  if (isCelebration) {
    return (
      <div className="flex justify-center mb-4">
        <div className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>
          <span aria-hidden="true">✓</span>
          <span className="font-medium">{content}</span>
        </div>
      </div>
    );
  }

  // Debrief: message de fin de session, centré
  if (isDebrief) {
    return (
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-md px-5 py-4 text-sm" style={{background:'#fff7ed', border:'1px solid #fed7aa', borderLeft:'3px solid var(--orange)', borderRadius:'4px'}}>
          <p className="leading-relaxed" style={{color:'var(--text)'}}>{content}</p>
        </div>
      </div>
    );
  }

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
