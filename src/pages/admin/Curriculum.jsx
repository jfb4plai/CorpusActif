import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const LEVELS = ['Primaire', 'Secondaire inférieur', 'Secondaire supérieur', 'Général'];

export default function Curriculum({ spaceId, session }) {
  const [nodes, setNodes] = useState([]);
  const [form, setForm] = useState({ concept: '', definition: '', level: '', parent_id: '' });
  const [editId, setEditId] = useState(null);

  async function loadNodes() {
    const { data } = await supabase
      .from('curriculum_nodes')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at');
    setNodes(data || []);
  }

  useEffect(() => { loadNodes(); }, [spaceId]);

  async function save(e) {
    e.preventDefault();
    const token = session.access_token;
    const payload = { ...form, space_id: spaceId, parent_id: form.parent_id || null };
    const method = editId ? 'PUT' : 'POST';
    const body = editId ? { ...payload, id: editId } : payload;

    const res = await fetch(`/api/curriculum?space_id=${spaceId}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setForm({ concept: '', definition: '', level: '', parent_id: '' });
      setEditId(null);
      loadNodes();
    }
  }

  async function deleteNode(id) {
    const token = session.access_token;
    await fetch(`/api/curriculum?space_id=${spaceId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    setNodes(prev => prev.filter(n => n.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="bg-white border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{editId ? 'Modifier' : 'Ajouter'} un concept</h3>
        <input
          placeholder="Concept *"
          value={form.concept}
          onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
          className="w-full border rounded px-3 py-2 text-sm"
          required
        />
        <textarea
          placeholder="Définition *"
          value={form.definition}
          onChange={e => setForm(f => ({ ...f, definition: e.target.value }))}
          className="w-full border rounded px-3 py-2 text-sm"
          rows={3}
          required
        />
        <div className="flex gap-3">
          <select
            value={form.level}
            onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
            className="border rounded px-3 py-2 text-sm flex-1"
          >
            <option value="">Niveau (optionnel)</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={form.parent_id}
            onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
            className="border rounded px-3 py-2 text-sm flex-1"
          >
            <option value="">Concept parent (optionnel)</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.concept}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium">
            {editId ? 'Enregistrer' : 'Ajouter'}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm({ concept: '', definition: '', level: '', parent_id: '' }); }}
              className="border px-4 py-2 rounded text-sm">
              Annuler
            </button>
          )}
        </div>
      </form>
      <div className="space-y-2">
        {nodes.map(n => (
          <div key={n.id} className="bg-white border rounded-lg px-4 py-3 flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-800">{n.concept}</p>
              <p className="text-xs text-gray-500 mt-1">{n.definition}</p>
              {n.level && <span className="text-xs text-[#0a9370] bg-[#0a9370]/10 px-2 py-0.5 rounded-full mt-1 inline-block">{n.level}</span>}
            </div>
            <div className="flex gap-3 ml-4 shrink-0">
              <button onClick={() => { setEditId(n.id); setForm({ concept: n.concept, definition: n.definition, level: n.level || '', parent_id: n.parent_id || '' }); }}
                className="text-xs text-blue-500 hover:text-blue-700">Modifier</button>
              <button onClick={() => deleteNode(n.id)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
