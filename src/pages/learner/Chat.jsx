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
  const [error, setError] = useState('');
  const [learnerCode, setLearnerCode] = useState('');
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [isSocratic, setIsSocratic] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [notions, setNotions] = useState([]);
  const [notionIndex, setNotionIndex] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
      const payload = JSON.parse(atob(padded));
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

    fetch('/api/chat-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.notions && data.notions.length > 0) {
          setNotions(data.notions);
          setMessages([{
            role: 'assistant',
            content: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
            rawContent: `Ce parcours comporte ${data.total} notion${data.total > 1 ? 's' : ''}. Commençons.`,
            isIntro: true,
          }]);
          setTimeout(() => {
            openNotion(data.notions, 0);
            setSessionReady(true);
          }, 600);
        } else {
          setSessionReady(true);
        }
      })
      .catch(() => setSessionReady(true));
  }, [codeSubmitted, isSocratic]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading || input.trim().length > 1000) return;

    const question = input.trim();
    setInput('');

    // Historique des messages à envoyer (rôles user/assistant avec contenu brut)
    const history = messages.map(m => ({
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

      // Passer à la notion suivante si acquise
      if (isNotionAcquired && notions.length > 0) {
        setTimeout(() => openNotion(notions, notionIndex + 1), 1200);
      }

      // Passer à la notion suivante si [RÉPONSE] sans acquisition (timeout)
      if (!isNotionAcquired && rawAnswer.startsWith('[RÉPONSE]') && notions.length > 0) {
        setTimeout(() => openNotion(notions, notionIndex + 1), 1800);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNotion(notionsList, index) {
    if (index >= notionsList.length) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
        rawContent: 'Tu as parcouru toutes les notions de cet espace. Bien joué.',
        isOutro: true,
      }]);
      return;
    }
    const n = notionsList[index];
    setNotionIndex(index);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Notion ${index + 1}/${notionsList.length} : **${n.concept}** — dis-moi ce que tu sais déjà sur ce sujet ?`,
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

  if (!codeSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
          <img src="/plai-logo.jpg" alt="PLAI" className="h-8 mb-4" />
          <h1 className="text-lg font-semibold text-gray-800 mb-4">Saisis ton code</h1>
          <form onSubmit={e => { e.preventDefault(); if (learnerCode.trim()) setCodeSubmitted(true); }}>
            <input
              value={learnerCode}
              onChange={e => setLearnerCode(e.target.value.toUpperCase())}
              placeholder="Ex: E01"
              className="w-full border rounded px-3 py-2 text-sm mb-3"
              required
            />
            <button type="submit" className="w-full bg-[#0a9370] text-white py-2 rounded text-sm font-medium">
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
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <div className={`mt-16 mx-auto max-w-sm bg-white rounded-2xl px-6 py-5 text-center border ${isSocratic ? 'border-orange-200' : 'border-gray-100'}`}>
            <p className="text-sm text-gray-700 leading-relaxed">
              Ton enseignant a préparé des ressources sur <strong>{spaceName || 'ce sujet'}</strong>.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {isSocratic
                ? (sessionReady ? 'Prépare-toi — la première notion arrive.' : 'Chargement du parcours…')
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
        {error && <p className="text-center text-red-500 text-xs mb-4">{error}</p>}
        <div ref={bottomRef} />
      </div>
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
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={loading || !sessionReady}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#0a9370] text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-50"
        >
          Envoyer
        </button>
        </div>
      </form>
    </div>
  );
}
