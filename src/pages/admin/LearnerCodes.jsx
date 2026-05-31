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
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800">
        Les codes anonymes ne protègent pas l'identité si vous connaissez la correspondance. Cette app ne stocke aucun nom — la correspondance reste dans votre registre de classe.
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-3">
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {codes.map(c => (
            <div key={c.id} className="bg-white border rounded-lg px-3 py-2 flex items-center justify-between hover:border-teal-400 transition">
              <button
                onClick={() => generateQR(c.code)}
                disabled={generatingQr === c.code}
                className="text-sm font-medium text-gray-700 text-left"
              >
                {c.code}
                <span className="block text-xs text-gray-400 font-normal mt-0.5">Générer QR</span>
              </button>
              <button
                onClick={() => deleteCode(c.id)}
                className="text-gray-300 hover:text-red-400 transition text-xs ml-2"
                title="Supprimer ce code"
              >
                ✕
              </button>
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
              <div key={s.id} className="flex items-center justify-between bg-white border rounded-lg px-4 py-2">
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
        <div className="bg-white border rounded-lg p-6">
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
