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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#0a9370] text-white px-6 py-3 flex items-center justify-between">
        <Link to="/admin" className="font-semibold text-lg">CorpusActif</Link>
        <button onClick={() => signOut().then(() => navigate('/login'))} className="text-sm opacity-80 hover:opacity-100">
          Déconnexion
        </button>
      </nav>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
}
