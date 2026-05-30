import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import QRDisplay from '../../components/QRDisplay';

function generateCodeList(prefix, count) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

export default function LearnerCodes({ spaceId, session }) {
  const [codes, setCodes] = useState([]);
  const [prefix, setPrefix] = useState('E');
  const [count, setCount] = useState(5);
  const [qrData, setQrData] = useState(null);
  const [generatingQr, setGeneratingQr] = useState(null);
  const [expiresDays, setExpiresDays] = useState(30);

  async function loadCodes() {
    const { data } = await supabase
      .from('learner_codes')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at');
    setCodes(data || []);
  }

  useEffect(() => { loadCodes(); }, [spaceId]);

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

  async function generateSpaceQR() {
    setGeneratingQr('__space__');
    const res = await fetch('/api/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId, expires_days: expiresDays }),
    });
    const data = await res.json();
    setQrData({ url: data.url, code: 'Espace entier' });
    setGeneratingQr(null);
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Codes existants ({codes.length})</h3>
          <button
            onClick={generateSpaceQR}
            disabled={generatingQr === '__space__'}
            className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1 rounded hover:bg-teal-50"
          >
            QR espace entier
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {codes.map(c => (
            <button
              key={c.id}
              onClick={() => generateQR(c.code)}
              disabled={generatingQr === c.code}
              className="bg-white border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:border-teal-400 transition text-left"
            >
              {c.code}
              <span className="block text-xs text-gray-400 font-normal mt-0.5">Générer QR</span>
            </button>
          ))}
        </div>
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
