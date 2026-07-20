import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from '../../components/ChatMessage';

// Retire les marqueurs [INDICE] et [RÉPONSE] du texte affiché
function stripMarker(content) {
  return content.replace(/^\[(INDICE|RÉPONSE|NOTION_SUIVANTE)\]\s*/u, '');
}

// Détermine le niveau socratique d'un message assistant
function getSocraticLevel(content) {
  if (content.startsWith('[RÉPONSE]')) return 'reponse';
  if (content.startsWith('[INDICE]')) return 'indice';
  return 'relance';
}

export default function Chat() {
  const { token } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState('');
  const [learnerCode, setLearnerCode] = useState('');
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [isSocratic, setIsSocratic] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [notions, setNotions] = useState([]);
  const [notionIndex, setNotionIndex] = useState(0);
  const [notionTransitioning, setNotionTransitioning] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [flashDeckId, setFlashDeckId] = useState(null);
  const [hasCurriculum, setHasCurriculum] = useState(false);
  const [previousNotions, setPreviousNotions] = useState([]);
  const [lastSessionDate, setLastSessionDate] = useState(null);
  const [notionOutcomes, setNotionOutcomes] = useState({});
  const [hintsForCurrentNotion, setHintsForCurrentNotion] = useState(0);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [connectionPrompt, setConnectionPrompt] = useState(null);
  const [connectionInput, setConnectionInput] = useState('');
  const [connectionLoading, setConnectionLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
      const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0))));
      if (payload.learner_code) {
        setLearnerCode(payload.learner_code);
        setCodeSubmitted(true);
      }
      if (payload.space_name) setSpaceName(payload.space_name);
      if (payload.pedagogical_mode === 'socratique') setIsSocratic(true);
    } catch (err) {
      console.error('JWT decode error:', err);
      setError('Token invalide — impossible de démarrer la session.');
    }
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!codeSubmitted || !isSocratic) { setSessionReady(true); return; }

    setInitLoading(true);
    fetch('/api/chat-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, learner_code: learnerCode || null }),
    })
      .then(r => r.json())
      .then(data => {
        setInitLoading(false);
        if (data.flashcard_deck_id) setFlashDeckId(data.flashcard_deck_id);
        if (data.has_curriculum) setHasCurriculum(true);
        if (data.previous_notions?.length > 0) {
          setPreviousNotions(data.previous_notions);
          setLastSessionDate(data.last_session_date || null);
        }
        if (data.notions && data.notions.length > 0) {
          setNotions(data.notions);
          const msgs = [];
          // Injecter le rappel d'ouverture si curriculum + sessions précédentes
          if (data.has_curriculum && data.previous_notions?.length > 0) {
            msgs.push({
              role: 'assistant',
              content: '',
              rawContent: '',
              isRecap: true,
              previousNotions: data.previous_notions,
              lastSessionDate: data.last_session_date || null,
            });
          }
          msgs.push({
            role: 'assistant',
            content: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
            rawContent: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
            isIntro: true,
          });
          setMessages(msgs);
          setTimeout(() => {
            openNotion(data.notions, 0);
            setSessionReady(true);
          }, 600);
        } else {
          const reason = data.reason || 'unknown';
          const msg = reason === 'no_chunks'
            ? "Aucun document n'est indexé pour cet espace. Contacte ton enseignant."
            : reason.startsWith('mode_')
              ? `Cet espace n'est pas en mode socratique (mode actuel : ${reason.replace('mode_', '')}).`
              : reason === 'space_not_found'
                ? "Espace introuvable. Le lien est peut-être invalide."
                : `Aucune notion chargée (${reason}). Contacte ton enseignant.`;
          setMessages([{
            role: 'assistant',
            content: msg,
            rawContent: '',
            isIntro: true,
          }]);
          setSessionReady(true);
        }
      })
      .catch(() => {
        setInitLoading(false);
        setMessages([{
          role: 'assistant',
          content: 'Le chargement du parcours a échoué. Réessaie dans quelques instants.',
          rawContent: '',
          isIntro: true,
        }]);
        setSessionReady(true);
      });
  }, [codeSubmitted, isSocratic]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading || input.trim().length > 1000) return;

    const question = input.trim();
    setInput('');

    // Historique des messages à envoyer (rôles user/assistant avec contenu brut)
    // On exclut les messages d'UI (valorisation) qui n'ont pas de contenu socratique
    const history = messages
      .filter(m => !m.isCelebration)
      .map(m => ({
        role: m.role,
        content: m.rawContent || m.content,
      }));

    setMessages(prev => [...prev, { role: 'user', content: question, rawContent: question }]);
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, question, history,
          learner_code: learnerCode || null,
          notion_concept: notions[notionIndex]?.concept || null,
          notion_index: notionIndex,
          notion_total: notions.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.pedagogical_mode === 'socratique') setIsSocratic(true);

      const rawAnswer = data.answer;
      const level = getSocraticLevel(rawAnswer);
      const displayContent = stripMarker(rawAnswer);

      // Tracker les indices et outcomes de notions
      const currentConcept = notions[notionIndex]?.concept;
      let updatedOutcomes = { ...notionOutcomes };

      if (rawAnswer.startsWith('[INDICE]')) {
        setHintsForCurrentNotion(prev => prev + 1);
      }

      if (currentConcept) {
        if (rawAnswer.startsWith('[NOTION_SUIVANTE]')) {
          updatedOutcomes = {
            ...updatedOutcomes,
            [currentConcept]: hintsForCurrentNotion === 0 ? 'mastered' : 'acquired_with_hint',
          };
          setNotionOutcomes(updatedOutcomes);
          setHintsForCurrentNotion(0);
        } else if (rawAnswer.startsWith('[RÉPONSE]')) {
          updatedOutcomes = {
            ...updatedOutcomes,
            [currentConcept]: 'failed',
          };
          setNotionOutcomes(updatedOutcomes);
          setHintsForCurrentNotion(0);
        }
      }

      const isNotionAcquired = rawAnswer.startsWith('[NOTION_SUIVANTE]');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: displayContent,
        rawContent: rawAnswer,
        sources: data.sources,
        chunksCount: data.chunks_count || 0,
        messageId: data.message_id || null,
        showFeedback: data.pedagogical_mode !== 'socratique',
        isOutOfBase: data.is_out_of_base,
        socraticLevel: data.pedagogical_mode === 'socratique' ? level : null,
        isNotionAcquired,
      }]);

      // Passer à la notion suivante si acquise — valorisation puis connexion aux savoirs
      if (isNotionAcquired && notions.length > 0) {
        // Recadrage positif réservé au cas "acquis après un indice" (le modèle
        // valorise déjà la maîtrise directe) : dédramatiser le recours à l'aide.
        if (hintsForCurrentNotion > 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "Tu l'as trouvé toi-même après un coup de pouce — c'est exactement comme ça qu'on apprend.",
            rawContent: '',
            isCelebration: true,
          }]);
        }
        setConnectionPrompt({
          notionConcept: currentConcept,
          nextIndex: notionIndex + 1,
          outcomes: updatedOutcomes,
        });
        setConnectionInput('');
      }

      // Passer à la notion suivante si [RÉPONSE] sans acquisition (timeout)
      if (!isNotionAcquired && rawAnswer.startsWith('[RÉPONSE]') && notions.length > 0) {
        setNotionTransitioning(true);
        setTimeout(() => { openNotion(notions, notionIndex + 1, updatedOutcomes); setNotionTransitioning(false); }, 1800);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNotion(notionsList, index, currentOutcomes = {}) {
    setHintsForCurrentNotion(0); // reset pour la nouvelle notion
    if (index >= notionsList.length) {
      // 1. Carte de notions
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        rawContent: '',
        isNotionMap: true,
        notions: notionsList,
        notionOutcomes: currentOutcomes,
      }]);

      // 2. Message final + debrief Haiku (avec délai pour effet séquentiel)
      setTimeout(async () => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
          rawContent: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
          isOutro: true,
          flashDeckId,
        }]);

        setDebriefLoading(true);
        try {
          const notions_mastered = Object.entries(currentOutcomes)
            .filter(([, v]) => v === 'mastered').map(([k]) => k);
          const notions_with_hint = Object.entries(currentOutcomes)
            .filter(([, v]) => v === 'acquired_with_hint').map(([k]) => k);
          const notions_failed = Object.entries(currentOutcomes)
            .filter(([, v]) => v === 'failed').map(([k]) => k);

          // Échantillon des échanges de la session courante
          const sessionExchanges = messages
            .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isRecap && !m.isIntro && !m.isNotionOpener && !m.isNotionMap))
            .map(m => ({ role: m.role, content: m.rawContent || m.content }));

          const res = await fetch('/api/chat-debrief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              notions_mastered,
              notions_with_hint,
              notions_failed,
              session_exchanges: sessionExchanges,
            }),
          });
          const debriefData = await res.json();
          const debriefText = debriefData.debrief || 'Bonne consolidation avec FlashFWB.';
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: debriefText,
            rawContent: debriefText,
            isDebrief: true,
          }]);
        } catch {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Bonne consolidation.',
            rawContent: 'Bonne consolidation.',
            isDebrief: true,
          }]);
        } finally {
          setDebriefLoading(false);
        }
      }, 400);
      return;
    }
    const n = notionsList[index];

    // Sauter les notions déjà acquises en session précédente
    const prevOutcome = previousNotions.find(p => p.concept === n.concept);
    if (prevOutcome?.acquired === true) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Notion ${index + 1}/${notionsList.length} : ${n.concept} — déjà maîtrisée lors d'une session précédente. On passe.`,
        rawContent: '',
        isNotionOpener: true,
        notionConcept: n.concept,
      }]);
      setTimeout(() => openNotion(notionsList, index + 1, { ...currentOutcomes, [n.concept]: 'mastered' }), 1500);
      return;
    }

    setNotionIndex(index);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Notion ${index + 1}/${notionsList.length} : ${n.concept} — dis-moi ce que tu sais déjà sur ce sujet ?`,
      rawContent: `[NOTION_OPENER] Notion ${index + 1}/${notionsList.length} : ${n.concept}`,
      isNotionOpener: true,
      notionConcept: n.concept,
    }]);
  }

  async function sendFeedback(messageId, helpful) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message_id: messageId, helpful }),
      });
    } catch {
      // feedback silencieux — ne bloque pas le chat
    }
  }

  async function handleConnectionSubmit(e) {
    e.preventDefault();
    if (!connectionPrompt) return;
    setConnectionLoading(true);
    try {
      await fetch('/api/notion-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          notion_concept: connectionPrompt.notionConcept,
          connection_text: connectionInput,
          skipped: false,
        }),
      });
    } catch { /* silencieux */ }
    const { nextIndex, outcomes } = connectionPrompt;
    setConnectionPrompt(null);
    setConnectionInput('');
    setConnectionLoading(false);
    openNotion(notions, nextIndex, outcomes);
  }

  async function handleConnectionSkip() {
    if (!connectionPrompt) return;
    setConnectionLoading(true);
    try {
      await fetch('/api/notion-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          notion_concept: connectionPrompt.notionConcept,
          skipped: true,
        }),
      });
    } catch { /* silencieux */ }
    const { nextIndex, outcomes } = connectionPrompt;
    setConnectionPrompt(null);
    setConnectionInput('');
    setConnectionLoading(false);
    openNotion(notions, nextIndex, outcomes);
  }

  if (!codeSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
          <img src="/plai-logo.jpg" alt="PLAI" className="h-8 mb-4" />
          <h1 className="text-lg font-semibold text-gray-800 mb-4">Saisis ton code</h1>
          <form onSubmit={e => { e.preventDefault(); if (learnerCode.trim().length >= 2) setCodeSubmitted(true); }}>
            <input
              value={learnerCode}
              onChange={e => setLearnerCode(e.target.value.toUpperCase())}
              placeholder="Ex: E01"
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              required
            />
            <button type="submit" className="w-full bg-[#0a9370] text-white py-2 rounded text-sm font-semibold">
              Commencer
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0a9370] text-white px-4 py-3 flex items-center gap-3">
        <img src="/plai-logo.jpg" alt="PLAI" className="h-7" />
        <span className="font-medium text-sm">CorpusActif</span>
        {isSocratic && (
          <span className="text-xs bg-[#f97316] px-2 py-0.5 rounded-full font-medium">Socratique</span>
        )}
        {notions.length > 0 && notionIndex < notions.length && (
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {notionIndex + 1}/{notions.length}
          </span>
        )}
        <span className="ml-auto text-xs opacity-70">{learnerCode}</span>
      </header>
      {notions.length > 0 && (() => {
        // Progression hybride : les notions bouclées comptent pour 1, la notion
        // en cours pour 0,5 — la barre avance dès la première notion (jamais figée à 0).
        const total = notions.length;
        const done = Object.keys(notionOutcomes).length;
        const current = notions[notionIndex]?.concept;
        const inProgress = current && notionOutcomes[current] === undefined ? 0.5 : 0;
        const pct = Math.min(100, Math.round(((done + inProgress) / total) * 100));
        return (
          <div className="h-2 bg-teal-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progression du parcours">
            <div className="h-full bg-[#0a9370] transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
          </div>
        );
      })()}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <div className={`mt-16 mx-auto max-w-sm bg-white rounded-2xl px-6 py-5 text-center border ${isSocratic ? 'border-orange-200' : 'border-gray-100'}`}>
            <p className="text-sm text-gray-700 leading-relaxed">
              Ton enseignant a préparé des ressources sur <strong>{spaceName || 'ce sujet'}</strong>.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {isSocratic
                ? (initLoading
                    ? <span className="inline-flex flex-col items-center gap-2">
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-[#0a9370]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Préparation du parcours en cours…
                        </span>
                        <span className="text-xs text-gray-400">Cela peut prendre jusqu'à une minute.</span>
                      </span>
                    : 'Prépare-toi — la première notion arrive.')
                : 'Pose ta première question…'}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatMessage
            key={i}
            {...m}
            onFeedback={m.showFeedback && m.messageId
              ? (helpful) => sendFeedback(m.messageId, helpful)
              : null}
          />
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border rounded-2xl px-4 py-3 text-sm text-gray-400">…</div>
          </div>
        )}
        {debriefLoading && (
          <div className="flex justify-center mb-4">
            <div className="text-xs px-4 py-2" style={{color:'var(--text3)'}}>Analyse du parcours…</div>
          </div>
        )}
        {error && <p className="text-center text-red-500 text-xs mb-4">{error}</p>}
        <div ref={bottomRef} />
      </div>
      {connectionPrompt ? (
        <div className="border-t bg-white px-4 py-4 max-w-2xl mx-auto w-full">
          <p className="text-sm text-gray-700 mb-2 font-medium">
            Avant de continuer — en quelques mots, quel lien fais-tu entre <span className="text-[#0a9370]">{connectionPrompt.notionConcept}</span> et ce que tu savais déjà ?
          </p>
          <form onSubmit={handleConnectionSubmit} className="flex flex-col gap-2">
            <textarea
              value={connectionInput}
              onChange={e => setConnectionInput(e.target.value)}
              placeholder="Ex : ça me rappelle… / ça ressemble à… / avant je pensais que…"
              className="w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
              rows={3}
              maxLength={500}
              disabled={connectionLoading}
            />
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={handleConnectionSkip}
                disabled={connectionLoading}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                Passer
              </button>
              <button
                type="submit"
                disabled={connectionLoading || !connectionInput.trim()}
                className="bg-[#0a9370] text-white px-5 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                {connectionLoading ? '…' : 'Envoyer'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={sendMessage} className="border-t bg-white px-4 py-3 max-w-2xl mx-auto w-full">
          {input.length >= 800 && (
            <div className="text-right text-xs text-gray-400 mb-1">{input.length} / 1000</div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pose ta question…"
              maxLength={1000}
              className="flex-1 border rounded px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              disabled={loading || !sessionReady || notionTransitioning}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || notionTransitioning}
              className="bg-[#0a9370] text-white px-5 py-2 rounded text-sm font-semibold disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
