import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '../../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const { error } = await signIn(email, password);
    if (error) return setError(error.message);
    navigate('/admin');
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:'var(--bg)'}}>
      <div className="p-10 w-full max-w-sm" style={{backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', boxShadow:'0 2px 16px rgba(0,0,0,0.06)'}}>
        <img src="/plai-logo.jpg" alt="PLAI" className="h-10 mb-6" />
        <h1 className="mb-1 text-2xl font-bold tracking-tight" style={{color:'var(--text)'}}>CorpusActif</h1>
        <p className="mb-8 text-sm" style={{color:'var(--text3)'}}>Espace enseignant</p>
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
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{border:'1px solid var(--border)', backgroundColor:'var(--surface2)', color:'var(--text)'}}
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2.5 rounded text-sm font-semibold transition"
            style={{backgroundColor:'var(--teal)', color:'white'}}
          >
            Connexion
          </button>
        </form>
      </div>
    </div>
  );
}
