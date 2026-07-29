import { useState } from 'react';
import { supabaseFlashfwb } from '../lib/supabaseFlashfwb';
import { supabase } from '../lib/supabase';

export default function FlashfwbLinkModal({ onLinked, onClose }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = mode === 'signin'
        ? await supabaseFlashfwb.auth.signInWithPassword({ email, password })
        : await supabaseFlashfwb.auth.signUp({ email, password });

      if (authError) throw authError;
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        // Cas signup avec confirmation email requise : pas de session immédiate.
        setError("Compte créé — vérifiez votre email pour confirmer, puis recommencez cette liaison.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: 'link_flashfwb', flashfwb_access_token: accessToken }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Échec de la liaison');

      onLinked();
    } catch (err) {
      setError(err.message || 'Erreur de connexion à FlashFWB');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-sm w-full p-6">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Lier votre compte FlashFWB</h3>
        <p className="text-xs text-gray-500 mb-4">
          Requis une seule fois : le deck de cartes généré sera créé sur <strong>votre</strong> compte FlashFWB,
          visible et modifiable directement dans FlashFWB.
        </p>

        <div className="flex gap-2 mb-4 text-xs">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`px-3 py-1 rounded border ${mode === 'signin' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'border-gray-300 text-gray-600'}`}
          >
            J'ai déjà un compte FlashFWB
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`px-3 py-1 rounded border ${mode === 'signup' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'border-gray-300 text-gray-600'}`}
          >
            Je n'en ai pas
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Email FlashFWB</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Mot de passe FlashFWB</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 text-xs bg-[#0a9370] text-white px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Connexion…' : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
