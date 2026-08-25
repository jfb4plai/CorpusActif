import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, resetPasswordForEmail } from '../../lib/auth';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else navigate('/admin');
    } else if (mode === 'signup') {
      const { data, error } = await signUp(email, password);
      if (error) {
        setError(error.message);
      } else if (data.session) {
        navigate('/admin');
      } else {
        setSuccess('Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.');
        setMode('login');
      }
    } else {
      const { error } = await resetPasswordForEmail(email);
      if (error) setError(error.message);
      else setSuccess('Email envoyé. Vérifiez votre boîte mail.');
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:'var(--bg)'}}>
      <div className="p-10 w-full max-w-sm" style={{backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', boxShadow:'0 2px 16px rgba(0,0,0,0.06)'}}>
        <img src="/plai-logo.jpg" alt="PLAI" className="h-10 mb-6" />
        <h1 className="mb-1 text-2xl font-bold tracking-tight" style={{color:'var(--text)'}}>CorpusActif</h1>
        <p className="mb-8 text-sm" style={{color:'var(--text3)'}}>
          {mode === 'login' ? 'Espace enseignant' : mode === 'signup' ? 'Créer un compte enseignant' : 'Mot de passe oublié'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{border:'1px solid var(--border)', backgroundColor:'var(--surface2)', color:'var(--text)'}}
            required
          />
          {mode !== 'reset' && (
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              style={{border:'1px solid var(--border)', backgroundColor:'var(--surface2)', color:'var(--text)'}}
              required
              minLength={mode === 'signup' ? 6 : undefined}
            />
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-sm" style={{color:'var(--teal)'}}>{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-sm font-semibold transition disabled:opacity-50"
            style={{backgroundColor:'var(--teal)', color:'white'}}
          >
            {loading ? '…' : mode === 'login' ? 'Connexion' : mode === 'signup' ? 'Créer le compte' : 'Envoyer le lien'}
          </button>
        </form>
        <div className="mt-4 text-center space-y-2">
          {mode !== 'reset' && (
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
              className="block w-full text-xs transition-colors"
              style={{color:'var(--teal)'}}
            >
              {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
            </button>
          )}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('reset'); setError(''); setSuccess(''); }}
              className="block w-full text-xs transition-colors"
              style={{color:'var(--text3)'}}
            >
              Mot de passe oublié ?
            </button>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              className="block w-full text-xs transition-colors"
              style={{color:'var(--text3)'}}
            >
              ← Retour à la connexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
