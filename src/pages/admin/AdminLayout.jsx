import { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';

export default function AdminLayout() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login');
      else setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s) navigate('/login');
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{color:'var(--text3)'}}>Chargement…</div>;

  return (
    <div className="min-h-screen" style={{backgroundColor:'var(--bg)'}}>
      <nav style={{backgroundColor:'var(--teal)'}} className="text-white px-6 py-4 flex items-center justify-between shadow-sm">
        <Link to="/admin" className="flex items-center gap-3">
          <img src="/plai-logo.jpg" alt="PLAI" className="h-7" />
          <span className="text-base font-semibold tracking-tight">CorpusActif</span>
        </Link>
        <button onClick={() => signOut().then(() => navigate('/login'))} className="text-sm opacity-75 hover:opacity-100 transition">
          Déconnexion
        </button>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}
