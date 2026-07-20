import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Spaces() {
  const { session } = useOutletContext();
  const [spaces, setSpaces] = useState([]);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from('corpus_spaces').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setSpaces(data || []));
  }, []);

  async function createSpace(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data, error } = await supabase
      .from('corpus_spaces')
      .insert({ name: newName.trim(), user_id: session.user.id })
      .select()
      .single();
    if (!error) {
      setSpaces(prev => [data, ...prev]);
      setNewName('');
    }
  }

  async function deleteSpace(id) {
    await supabase.from('corpus_spaces').delete().eq('id', id);
    setSpaces(prev => prev.filter(s => s.id !== id));
    setConfirmDelete(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{color:'var(--text)'}}>Mes espaces</h1>
      <p className="text-sm font-bold text-gray-600 mb-2">Utilisez le sujet pédagogique comme nom — ex : "La photosynthèse" plutôt que "Classe 3B". Ce nom est affiché à vos apprenants.</p>
      <form onSubmit={createSpace} className="flex gap-3 mb-8">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Ex : La photosynthèse, Les fractions…"
          className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button type="submit" className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-semibold hover:bg-teal-700">
          Créer
        </button>
      </form>
      <div className="grid gap-3">
        {spaces.map(s => (
          <div
            key={s.id}
            className="bg-white p-4 flex items-center justify-between hover:shadow-sm transition"
            style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}
          >
            <button
              onClick={() => navigate(`/admin/spaces/${s.id}`)}
              className="text-left flex-1"
            >
              <p className="font-medium text-gray-800">{s.name}</p>
              <p className="text-xs text-gray-400 mt-1">
                Mode : {s.out_of_base_mode}
                {s.pedagogical_mode === 'socratique' && (
                  <span className="inline-block text-xs bg-orange-100 text-orange-700 rounded px-2 py-0.5 ml-2 font-medium">Socratique</span>
                )}
              </p>
            </button>
            {confirmDelete === s.id ? (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-red-500">Supprimer ?</span>
                <button onClick={() => deleteSpace(s.id)} className="text-xs text-red-500 font-medium hover:text-red-700">Oui</button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600">Non</button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(s.id); }}
                className="text-gray-300 hover:text-red-400 transition text-xs ml-4"
                title="Supprimer cet espace"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
