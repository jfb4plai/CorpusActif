import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ChatMessage from '../../components/ChatMessage';

export default function Chat() {
  const { token } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [learnerCode, setLearnerCode] = useState('');
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const bottomRef = useRef();

  // Vérifier si le token contient déjà un learner_code
  useEffect(() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.learner_code) {
        setLearnerCode(payload.learner_code);
        setCodeSubmitted(true);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        isOutOfBase: data.is_out_of_base,
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Demander le code si absent du token
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
        <span className="ml-auto text-xs opacity-70">{learnerCode}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-16">Pose ta première question…</p>
        )}
        {messages.map((m, i) => (
          <ChatMessage key={i} {...m} />
        ))}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white border rounded-2xl px-4 py-3 text-sm text-gray-400">…</div>
          </div>
        )}
        {error && <p className="text-center text-red-500 text-xs mb-4">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendMessage} className="border-t bg-white px-4 py-3 flex gap-2 max-w-2xl mx-auto w-full">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pose ta question…"
          className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#0a9370] text-white px-5 py-2 rounded-full text-sm font-medium disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
