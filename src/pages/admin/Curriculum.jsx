import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const LEVELS = ['Primaire', 'Secondaire inférieur', 'Secondaire supérieur', 'Général'];

export default function Curriculum({ spaceId, session }) {
  const [nodes, setNodes] = useState([]);
  const [form, setForm] = useState({ concept: '', definition: '', level: '', parent_id: '' });
  const [editId, setEditId] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function loadNodes() {
    const { data } = await supabase
      .from('curriculum_nodes')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at');
    setNodes(data || []);
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from('curriculum_templates')
      .select('id, name, nodes')
      .order('created_at', { ascending: false });
    setTemplates(data || []);
  }

  useEffect(() => { loadNodes(); loadTemplates(); }, [spaceId]);

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

  async function saveAsTemplate(e) {
    e.preventDefault();
    if (!templateName.trim() || nodes.length === 0) return;
    setSavingTemplate(true);
    setTemplateMsg('');
    const snap = nodes.map(({ concept, definition, level }) => ({ concept, definition, level: level || null }));
    const { error } = await supabase
      .from('curriculum_templates')
      .insert({ user_id: session.user.id, name: templateName.trim(), nodes: snap });
    setSavingTemplate(false);
    if (error) {
      setTemplateMsg('Erreur lors de la sauvegarde.');
    } else {
      setTemplateMsg(`Modèle "${templateName.trim()}" sauvegardé.`);
      setTemplateName('');
      setShowSaveModal(false);
      loadTemplates();
    }
  }

  async function importTemplate(templateId) {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    if (!window.confirm(`Remplacer le curriculum actuel par "${tpl.name}" (${tpl.nodes.length} concepts) ?`)) return;

    // Supprimer les nœuds existants
    for (const n of nodes) {
      await supabase.from('curriculum_nodes').delete().eq('id', n.id);
    }
    // Insérer les nœuds du template
    for (const n of tpl.nodes) {
      await supabase.from('curriculum_nodes').insert({
        space_id: spaceId,
        concept: n.concept,
        definition: n.definition,
        level: n.level || null,
      });
    }
    setShowImport(false);
    setSelectedTemplate('');
    loadNodes();
  }

  async function deleteTemplate(id, name) {
    if (!window.confirm(`Supprimer le modèle "${name}" ?`)) return;
    await supabase.from('curriculum_templates').delete().eq('id', id);
    loadTemplates();
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

      {/* Barre modèles */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => { setShowSaveModal(s => !s); setShowImport(false); setTemplateMsg(''); }}
          disabled={nodes.length === 0}
          className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1.5 rounded hover:bg-teal-50 disabled:opacity-40"
        >
          Sauvegarder comme modèle
        </button>
        <button
          type="button"
          onClick={() => { setShowImport(s => !s); setShowSaveModal(false); }}
          disabled={templates.length === 0}
          className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-40"
        >
          Importer un modèle {templates.length > 0 && `(${templates.length})`}
        </button>
        {templateMsg && <p className="text-xs text-teal-700">{templateMsg}</p>}
      </div>

      {/* Modal sauvegarde */}
      {showSaveModal && (
        <form onSubmit={saveAsTemplate} className="bg-teal-50 border border-teal-200 rounded p-4 flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-600 block mb-1">Nom du modèle</label>
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Ex : Photosynthèse — 4e secondaire"
              className="w-full border rounded px-3 py-2 text-sm"
              required
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={savingTemplate || !templateName.trim()}
            className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 shrink-0"
          >
            {savingTemplate ? '…' : 'Sauvegarder'}
          </button>
          <button type="button" onClick={() => setShowSaveModal(false)} className="border px-4 py-2 rounded text-sm shrink-0">Annuler</button>
        </form>
      )}

      {/* Panel import */}
      {showImport && (
        <div className="bg-gray-50 border rounded p-4 space-y-3">
          <p className="text-xs text-gray-500">Sélectionner un modèle remplace le curriculum actuel de cet espace.</p>
          <div className="space-y-1">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-white border rounded px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.nodes.length} concept{t.nodes.length > 1 ? 's' : ''}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    type="button"
                    onClick={() => importTemplate(t.id)}
                    className="text-xs border border-[#0a9370] text-[#0a9370] px-2 py-1 rounded hover:bg-teal-50"
                  >
                    Importer
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id, t.name)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={save} className="bg-white border rounded p-4 space-y-3">
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
          <div key={n.id} className="bg-white border rounded px-4 py-3 flex justify-between items-start">
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
