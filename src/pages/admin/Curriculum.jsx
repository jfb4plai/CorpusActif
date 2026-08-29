import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { draftToNodes, groupNodes } from '../../lib/curriculumDraft';

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

  const [draft, setDraft] = useState(null);        // { chapitres, concepts_sans_chapitre }
  const [kept, setKept] = useState({});            // { key: { keep, parentKey, concept?, definition? } }
  const [chapTitres, setChapTitres] = useState({});// { [chapIdx]: titre édité }
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [applying, setApplying] = useState(false);

  async function loadNodes() {
    const { data } = await supabase
      .from('corpus_curriculum_nodes')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at');
    setNodes(data || []);
  }

  async function loadTemplates() {
    const { data } = await supabase
      .from('corpus_curriculum_templates')
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
    const snap = nodes.map((n) => ({
      concept: n.concept,
      definition: n.definition,
      level: n.level || null,
      parentIndex: n.parent_id ? nodes.findIndex(x => x.id === n.parent_id) : null,
    }));
    const { error } = await supabase
      .from('corpus_curriculum_templates')
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

    // Supprimer les nœuds existants (une seule requête)
    const ids = nodes.map(n => n.id);
    if (ids.length > 0) {
      await supabase.from('corpus_curriculum_nodes').delete().in('id', ids);
    }
    // Insérer en 2 passes : racines d'abord (pour récupérer leurs ids), puis enfants.
    // Un template pré-hiérarchie n'a pas de parentIndex → tous traités comme racines.
    if (tpl.nodes.length > 0) {
      const withIdx = tpl.nodes.map((n, i) => ({ ...n, _i: i }));
      const parents = withIdx.filter(n => n.parentIndex == null);
      const enfants = withIdx.filter(n => n.parentIndex != null);

      // Ids parents générés côté client → les enfants les référencent directement,
      // sans dépendre de l'ordre de retour de Supabase.
      const idParIndex = {};
      if (parents.length > 0) {
        const rows = parents.map(n => {
          const id = crypto.randomUUID();
          idParIndex[n._i] = id;
          return { id, space_id: spaceId, concept: n.concept, definition: n.definition, level: n.level || null, parent_id: null };
        });
        const { error: pErr } = await supabase.from('corpus_curriculum_nodes').insert(rows);
        if (pErr) { console.error(pErr); return; }
      }

      if (enfants.length > 0) {
        // Insert groupé pour les enfants d'un template : l'ordre importe peu sur un
        // modèle réimporté, et le flux est déjà un delete-puis-insert en masse.
        await supabase.from('corpus_curriculum_nodes').insert(
          enfants.map(n => ({
            space_id: spaceId,
            concept: n.concept,
            definition: n.definition,
            level: n.level || null,
            parent_id: idParIndex[n.parentIndex] ?? null,
          }))
        );
      }
    }
    setShowImport(false);
    loadNodes();
  }

  async function deleteTemplate(id, name) {
    if (!window.confirm(`Supprimer le modèle "${name}" ?`)) return;
    await supabase.from('corpus_curriculum_templates').delete().eq('id', id);
    loadTemplates();
  }

  async function deleteNode(id) {
    const token = session.access_token;
    setGenError('');
    let res;
    try {
      res = await fetch(`/api/curriculum?space_id=${spaceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
    } catch {
      setGenError('La suppression a échoué (réseau).');
      return;
    }
    if (!res.ok) {
      setGenError('La suppression a échoué. Réessayez ou supprimez d’abord les concepts enfants.');
      return;
    }
    setNodes(prev => prev.filter(n => n.id !== id));
  }

  function initKept(resultat) {
    const k = {};
    (resultat.chapitres || []).forEach((ch, ci) => {
      (ch.concepts || []).forEach((c, coi) => {
        k[`${ci}:${coi}`] = { keep: true, parentKey: `chap:${ci}`, concept: c.concept, definition: c.definition || '' };
      });
    });
    (resultat.concepts_sans_chapitre || []).forEach((c, i) => {
      k[`orphan:${i}`] = { keep: true, parentKey: null, concept: c.concept, definition: c.definition || '' };
    });
    return k;
  }

  async function generer() {
    setGenError('');
    setGenerating(true);
    try {
      const res = await fetch(`/api/curriculum?space_id=${spaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'generate', space_id: spaceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'La génération a échoué.');
      setDraft(data.resultat);
      setKept(initKept(data.resultat));
      setChapTitres({});
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function updateKept(key, patch) {
    setKept(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function chapTitre(ci) {
    return chapTitres[ci] ?? draft?.chapitres?.[ci]?.titre ?? `Chapitre ${ci + 1}`;
  }

  async function appliquerBrouillon() {
    if (!draft) return;
    setApplying(true);
    setGenError('');
    try {
      const draftEff = {
        chapitres: (draft.chapitres || []).map((ch, ci) => ({ ...ch, titre: chapTitre(ci) })),
        concepts_sans_chapitre: draft.concepts_sans_chapitre || [],
      };
      const { parents, enfants } = draftToNodes(draftEff, kept);
      if (parents.length === 0 && enfants.length === 0) { setApplying(false); return; }

      // Ids générés côté client : pas de dépendance à l'ordre de retour de Supabase.
      const idParTempId = {};
      const insertedIds = [];
      const insererNoeud = async (row) => {
        const id = crypto.randomUUID();
        const { error } = await supabase.from('corpus_curriculum_nodes').insert({ id, ...row });
        if (error) throw new Error(error.message);
        insertedIds.push(id);
        return id;
      };

      // Regrouper les enfants par chapitre pour insérer parent puis ses enfants, en ordre.
      const enfantsParParent = new Map();
      const sansChapitre = [];
      for (const e of enfants) {
        if (e.parentTempId) {
          if (!enfantsParParent.has(e.parentTempId)) enfantsParParent.set(e.parentTempId, []);
          enfantsParParent.get(e.parentTempId).push(e);
        } else {
          sansChapitre.push(e);
        }
      }

      try {
        // Inserts séquentiels : chaque nœud reçoit un created_at distinct → l'ordre
        // chapitre/concept est préservé dans le parcours apprenant (~10-30 nœuds, action ponctuelle).
        for (const p of parents) {
          const pid = await insererNoeud({ space_id: spaceId, concept: p.concept, definition: p.definition, level: p.level, parent_id: null });
          idParTempId[p.tempId] = pid;
          for (const e of (enfantsParParent.get(p.tempId) || [])) {
            await insererNoeud({ space_id: spaceId, concept: e.concept, definition: e.definition, level: null, parent_id: pid });
          }
        }
        for (const e of sansChapitre) {
          await insererNoeud({ space_id: spaceId, concept: e.concept, definition: e.definition, level: null, parent_id: null });
        }
      } catch (errInsert) {
        // Nettoyage best-effort : ne pas laisser de nœuds à moitié insérés polluer le parcours.
        try {
          if (insertedIds.length > 0) {
            await supabase.from('corpus_curriculum_nodes').delete().in('id', insertedIds);
          }
        } catch { /* ne pas masquer l'erreur d'origine */ }
        throw errInsert;
      }

      setDraft(null);
      setKept({});
      setChapTitres({});
      loadNodes();
    } catch (e) {
      setGenError(e.message);
    } finally {
      setApplying(false);
    }
  }

  function NodeRow({ n }) {
    return (
      <div className="bg-white border rounded px-4 py-3 flex justify-between items-start">
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
    );
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
        <button
          type="button"
          onClick={generer}
          disabled={generating}
          className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1.5 rounded hover:bg-teal-50 disabled:opacity-40"
        >
          {generating ? 'Génération en cours…' : 'Générer depuis les documents'}
        </button>
        {genError && <p className="text-xs text-red-500">{genError}</p>}
      </div>

      {/* Modal sauvegarde */}
      {showSaveModal && (
        <form onSubmit={saveAsTemplate} className="bg-teal-50 border border-teal-200 rounded p-4 flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor="template-name" className="text-xs text-gray-600 block mb-1">Nom du modèle</label>
            <input
              id="template-name"
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

      {draft && (
        <div className="bg-teal-50 border border-teal-200 rounded p-4 space-y-4">
          <p className="text-xs text-teal-800">
            <strong>Brouillon généré</strong> — cochez et ajustez ce que vous gardez, puis
            ajoutez au curriculum. Rien n'est enregistré tant que vous n'avez pas cliqué sur
            « Ajouter au curriculum ». Votre curriculum actuel n'est pas modifié.
          </p>

          {(draft.chapitres || []).map((ch, ci) => (
            <div key={ci} className="bg-white border rounded p-3 space-y-2">
              <input
                value={chapTitre(ci)}
                onChange={e => setChapTitres(prev => ({ ...prev, [ci]: e.target.value }))}
                aria-label={`Titre du chapitre ${ci + 1}`}
                className="w-full border-b border-gray-200 pb-1 text-sm font-semibold text-gray-800 focus:outline-none"
              />
              {(ch.concepts || []).map((c, coi) => {
                const key = `${ci}:${coi}`;
                const k = kept[key] || {};
                return (
                  <div key={coi} className="flex gap-2 items-start pl-1">
                    <input
                      type="checkbox"
                      checked={!!k.keep}
                      onChange={e => updateKept(key, { keep: e.target.checked })}
                      aria-label={`Garder ${c.concept}`}
                      className="mt-2 accent-[#0a9370]"
                    />
                    <div className="flex-1 space-y-1">
                      <input
                        value={k.concept ?? c.concept}
                        onChange={e => updateKept(key, { concept: e.target.value })}
                        aria-label={`Concept ${c.concept}`}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <textarea
                        value={k.definition ?? c.definition ?? ''}
                        onChange={e => updateKept(key, { definition: e.target.value })}
                        aria-label={`Définition de ${c.concept}`}
                        rows={2}
                        className="w-full border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <select
                      value={k.parentKey ?? ''}
                      onChange={e => updateKept(key, { parentKey: e.target.value || null })}
                      aria-label={`Chapitre de ${c.concept}`}
                      className="border rounded px-1 py-1 text-xs shrink-0 max-w-[8rem]"
                    >
                      <option value="">Sans chapitre</option>
                      {(draft.chapitres || []).map((_, i) => (
                        <option key={i} value={`chap:${i}`}>↳ {chapTitre(i)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ))}

          {(draft.concepts_sans_chapitre || []).length > 0 && (
            <div className="bg-white border rounded p-3 space-y-2">
              <p className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-1">Concepts sans chapitre</p>
              {draft.concepts_sans_chapitre.map((c, i) => {
                const key = `orphan:${i}`;
                const k = kept[key] || {};
                return (
                  <div key={i} className="flex gap-2 items-start pl-1">
                    <input
                      type="checkbox"
                      checked={!!k.keep}
                      onChange={e => updateKept(key, { keep: e.target.checked })}
                      aria-label={`Garder ${c.concept}`}
                      className="mt-2 accent-[#0a9370]"
                    />
                    <div className="flex-1 space-y-1">
                      <input
                        value={k.concept ?? c.concept}
                        onChange={e => updateKept(key, { concept: e.target.value })}
                        aria-label={`Concept ${c.concept}`}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                      <textarea
                        value={k.definition ?? c.definition ?? ''}
                        onChange={e => updateKept(key, { definition: e.target.value })}
                        aria-label={`Définition de ${c.concept}`}
                        rows={2}
                        className="w-full border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <select
                      value={k.parentKey ?? ''}
                      onChange={e => updateKept(key, { parentKey: e.target.value || null })}
                      aria-label={`Chapitre de ${c.concept}`}
                      className="border rounded px-1 py-1 text-xs shrink-0 max-w-[8rem]"
                    >
                      <option value="">Sans chapitre</option>
                      {(draft.chapitres || []).map((_, ci) => (
                        <option key={ci} value={`chap:${ci}`}>↳ {chapTitre(ci)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={appliquerBrouillon}
              disabled={applying || !Object.values(kept).some(k => k.keep)}
              className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {applying ? '…' : 'Ajouter au curriculum'}
            </button>
            <button type="button" onClick={() => { setDraft(null); setKept({}); setChapTitres({}); }} className="border px-4 py-2 rounded text-sm">
              Annuler
            </button>
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
            {nodes.map(n => <option key={n.id} value={n.id}>↳ {n.concept}</option>)}
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
      {(() => {
        const { groupes, orphelins } = groupNodes(nodes);
        return (
          <div className="space-y-4">
            {groupes.map(g => (
              <div key={g.parent.id} data-testid={`chapitre-${g.parent.id}`} className="border-l-2 border-[#0a9370] pl-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-800">{g.parent.concept}</p>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => { setEditId(g.parent.id); setForm({ concept: g.parent.concept, definition: g.parent.definition, level: g.parent.level || '', parent_id: g.parent.parent_id || '' }); }}
                      className="text-xs text-blue-500 hover:text-blue-700">Modifier</button>
                    <button onClick={() => deleteNode(g.parent.id)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                  </div>
                </div>
                <div className="space-y-2 ml-2">
                  {g.enfants.map(c => <NodeRow key={c.id} n={c} />)}
                </div>
              </div>
            ))}
            {orphelins.map(n => <NodeRow key={n.id} n={n} />)}
          </div>
        );
      })()}
    </div>
  );
}
