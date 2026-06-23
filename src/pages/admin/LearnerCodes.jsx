import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import QRDisplay from '../../components/QRDisplay';

function generateCodeList(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

export default function LearnerCodes({ spaceId, session }) {
  const [codes, setCodes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [prefix, setPrefix] = useState('E');
  const [count, setCount] = useState(5);
  const [qrData, setQrData] = useState(null);
  const [generatingQr, setGeneratingQr] = useState(null);
  const [expiresDays, setExpiresDays] = useState(30);
  const [showSessions, setShowSessions] = useState(false);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState(null);
  const [difficultiesOpen, setDifficultiesOpen] = useState({});
  const [difficultiesValues, setDifficultiesValues] = useState({});

  async function loadCodes() {
    const { data } = await supabase
      .from('learner_codes')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at');
    setCodes(data || []);
  }

  async function loadSessions() {
    const { data } = await supabase
      .from('sessions')
      .select('id, learner_code, expires_at, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });
    setSessions(data || []);
  }

  useEffect(() => { loadCodes(); loadSessions(); }, [spaceId]);

  async function revokeSession(id) {
    await supabase.from('sessions').delete().eq('id', id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  async function addCodes() {
    const newCodes = generateCodeList(prefix, count);
    const rows = newCodes.map(code => ({ space_id: spaceId, code }));
    await supabase.from('learner_codes').upsert(rows, { onConflict: 'space_id,code' });
    loadCodes();
  }

  async function generateQR(learnerCode) {
    setGeneratingQr(learnerCode);
    const res = await fetch('/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId, learner_code: learnerCode, expires_days: expiresDays }),
    });
    const data = await res.json();
    setQrData({ url: data.url, code: learnerCode });
    setGeneratingQr(null);
  }

  async function deleteCode(id) {
    await supabase.from('learner_codes').delete().eq('id', id);
    setCodes(prev => prev.filter(c => c.id !== id));
    setConfirmDeleteCode(null);
  }

  function toggleDifficulties(id, currentValue) {
    setDifficultiesOpen(prev => ({ ...prev, [id]: !prev[id] }));
    if (!difficultiesValues.hasOwnProperty(id)) {
      setDifficultiesValues(prev => ({ ...prev, [id]: currentValue || '' }));
    }
  }

  async function saveDifficulties(id) {
    const value = difficultiesValues[id] ?? '';
    const now = new Date().toISOString();
    await supabase.from('learner_codes').update({ difficulties: value || null, difficulties_updated_at: value ? now : null }).eq('id', id);
    setCodes(prev => prev.map(c => c.id === id ? { ...c, difficulties: value || null, difficulties_updated_at: value ? now : null } : c));
  }

  async function generateSpaceQR() {
    setGeneratingQr('__space__');
    const res = await fetch('/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId, expires_days: expiresDays }),
    });
    const data = await res.json();
    setQrData({ url: data.url, code: 'QR Code commun' });
    setGeneratingQr(null);
    loadSessions();
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded p-4 text-xs text-amber-800">
        Les codes anonymes ne protègent pas l'identité si vous connaissez la correspondance. Cette app ne stocke aucun nom — la correspondance reste dans votre registre de classe.
      </div>

      <div className="bg-white border rounded p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Générer des codes</h3>
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Préfixe</label>
            <input value={prefix} onChange={e => setPrefix(e.target.value)} className="border rounded px-3 py-2 text-sm w-20" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
            <input type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} className="border rounded px-3 py-2 text-sm w-20" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Expiration QR (jours)</label>
            <input type="number" min={1} max={365} value={expiresDays} onChange={e => setExpiresDays(Number(e.target.value))} className="border rounded px-3 py-2 text-sm w-28" />
          </div>
          <button onClick={addCodes} className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium">
            Créer
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700">Codes existants ({codes.length})</h3>
          <button
            onClick={generateSpaceQR}
            disabled={generatingQr === '__space__'}
            className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1 rounded hover:bg-teal-50"
          >
            QR Code commun
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">Le QR Code commun est un code unique à afficher au tableau. Chaque apprenant scanne le même et saisit son code personnel à l'arrivée.</p>
        <div className="space-y-2">
          {codes.map(c => (
            <div key={c.id} className="bg-white border rounded hover:border-teal-400 transition">
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  onClick={() => generateQR(c.code)}
                  disabled={generatingQr === c.code}
                  className="text-sm font-medium text-gray-700 text-left"
                >
                  {generatingQr === c.code ? '…' : c.code}
                  <span className="block text-xs text-gray-400 font-normal mt-0.5">Générer QR</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDifficulties(c.id, c.difficulties)}
                    className={`text-xs px-2 py-0.5 rounded border transition ${difficultiesOpen[c.id] ? 'border-teal-400 text-teal-600 bg-teal-50' : 'border-gray-200 text-gray-400 hover:border-teal-300 hover:text-teal-500'}`}
                    title="Profil d'accès de l'apprenant"
                  >
                    {c.difficulties ? 'Profil ✓' : 'Profil'}
                  </button>
                  {confirmDeleteCode === c.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-500">Supprimer ?</span>
                      <button onClick={() => deleteCode(c.id)} className="text-xs text-red-500 font-medium hover:text-red-700">Oui</button>
                      <button onClick={() => setConfirmDeleteCode(null)} className="text-xs text-gray-400 hover:text-gray-600">Non</button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteCode(c.id); }}
                      className="text-gray-300 hover:text-red-400 transition text-xs"
                      title="Supprimer ce code"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {difficultiesOpen[c.id] && (
                <div className="px-3 pb-3 border-t border-gray-100">
                  <label className="text-xs font-medium text-gray-600 block mt-2 mb-1">
                    Obstacles observés en classe
                  </label>
                  <textarea
                    value={difficultiesValues[c.id] ?? (c.difficulties || '')}
                    onChange={e => setDifficultiesValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                    onBlur={() => saveDifficulties(c.id)}
                    placeholder="Ex : lit lentement, perd le sens sur les phrases longues — difficultés de décodage."
                    className="w-full text-xs border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-teal-400 text-gray-700"
                    rows={3}
                  />
                  <div className="flex items-start justify-between mt-1 gap-2">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Décris ce que tu <em>observes</em> en classe — pas le trouble diagnostiqué. Ex : "perd le fil après 2 phrases" plutôt que "dyslexique". L'outil ajustera ses questions pour vérifier que l'obstacle n'a pas masqué la compréhension, sans baisser le niveau.
                      {' '}<span className="text-gray-300">Claus, 2016, cité dans Reverdy, IFÉ, 2017.</span>
                    </p>
                    {c.difficulties_updated_at && (
                      <span className="text-xs text-gray-300 shrink-0 whitespace-nowrap">
                        Mis à jour le {new Date(c.difficulties_updated_at).toLocaleDateString('fr-BE')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* QR codes actifs */}
      <div>
        <button
          onClick={() => setShowSessions(s => !s)}
          className="text-sm font-semibold text-gray-700 flex items-center gap-2"
        >
          QR codes actifs ({sessions.length})
          <span className="text-xs text-gray-400">{showSessions ? '▲' : '▼'}</span>
        </button>
        {showSessions && (
          <div className="mt-3 space-y-2">
            {sessions.length === 0 && (
              <p className="text-xs text-gray-400">Aucun QR code actif.</p>
            )}
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-white border rounded px-4 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {s.learner_code || 'QR Code commun'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Expire le {new Date(s.expires_at).toLocaleDateString('fr-BE')}
                  </p>
                </div>
                <button
                  onClick={() => revokeSession(s.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Révoquer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {qrData && (
        <div className="bg-white border rounded p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold">QR — {qrData.code}</h3>
            <button onClick={() => setQrData(null)} className="text-xs text-gray-400">Fermer</button>
          </div>
          <QRDisplay url={qrData.url} label={`Code : ${qrData.code}`} />
        </div>
      )}
    </div>
  );
}
