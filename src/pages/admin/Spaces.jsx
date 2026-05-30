import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function Spaces() {
  const { session } = useOutletContext();
  const [spaces, setSpaces] = useState([]);
  const [newName, setNewName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from('spaces').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setSpaces(data || []));
  }, []);

  async function createSpace(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data, error } = await supabase
      .from('spaces')
      .insert({ name: newName.trim(), user_id: session.user.id })
      .select()
      .single();
    if (!error) {
      setSpaces(prev => [data, ...prev]);
      setNewName('');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Mes espaces</h1>
      <form onSubmit={createSpace} className="flex gap-3 mb-8">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Nom du nouvel espace…"
          className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button type="submit" className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium hover:bg-teal-700">
          Créer
        </button>
      </form>
      <div className="grid gap-3">
        {spaces.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(`/admin/spaces/${s.id}`)}
            className="text-left bg-white border rounded-lg p-4 hover:border-teal-400 transition"
          >
            <p className="font-medium text-gray-800">{s.name}</p>
            <p className="text-xs text-gray-400 mt-1">Mode : {s.out_of_base_mode}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
