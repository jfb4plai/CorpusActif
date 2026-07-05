import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setSuccess('Mot de passe mis à jour. Redirection...');
      setTimeout(() => navigate('/admin'), 2000);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:'var(--bg)'}}>
      <div className="p-10 w-full max-w-sm" style={{backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', boxShadow:'0 2px 16px rgba(0,0,0,0.06)'}}>
        <img src="/plai-logo.jpg" alt="PLAI" className="h-10 mb-6" />
        <h1 className="mb-8 text-2xl font-bold tracking-tight" style={{color:'var(--text)'}}>Nouveau mot de passe</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            style={{border:'1px solid var(--border)', backgroundColor:'var(--surface2)', color:'var(--text)'}}
            required
            minLength={6}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-sm" style={{color:'var(--teal)'}}>{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded text-sm font-semibold transition disabled:opacity-50"
            style={{backgroundColor:'var(--teal)', color:'white'}}
          >
            {loading ? 'Mise à jour...' : 'Enregistrer'}
          </button>
        </form>
      </div>
    </div>
  );
}
