import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Dashboard({ spaceId }) {
  const [stats, setStats] = useState(null);
  const [byCode, setByCode] = useState([]);
  const [notionAcquisition, setNotionAcquisition] = useState({});
  const [handoffLoading, setHandoffLoading] = useState(null);
  const [handoffError, setHandoffError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: messages } = await supabase
        .from('messages')
        .select('learner_code, question, answer, is_out_of_base, helpful, notion_concept, notion_acquired, created_at')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!messages) return;

      const total = messages.length;
      const outOfBase = messages.filter(m => m.is_out_of_base).length;

      // Agrégation par code
      const codeMap = {};
      messages.forEach(m => {
        const code = m.learner_code || '(sans code)';
        if (!codeMap[code]) codeMap[code] = { total: 0, out: 0, questions: [], blocages: 0, helpful: 0, notHelpful: 0, feedbackCount: 0 };
        codeMap[code].total++;
        if (m.is_out_of_base) codeMap[code].out++;
        codeMap[code].questions.push(m.question);
        if (m.answer && (m.answer.startsWith('[INDICE]') || m.answer.startsWith('[RÉPONSE]'))) {
          codeMap[code].blocages++;
        }
        if (m.helpful === true) codeMap[code].helpful++;
        if (m.helpful === false) codeMap[code].notHelpful++;
        if (m.helpful !== null && m.helpful !== undefined) codeMap[code].feedbackCount++;
      });

      setStats({ total, outOfBase, truncated: messages.length === 500 });
      setByCode(Object.entries(codeMap).sort((a, b) => b[1].total - a[1].total));

      // Agrégation par notion (dernière valeur par apprenant × notion)
      const notionMap = {};
      messages.forEach(m => {
        if (m.notion_concept && m.notion_acquired !== null && m.notion_acquired !== undefined) {
          if (!notionMap[m.notion_concept]) notionMap[m.notion_concept] = {};
          const code = m.learner_code || '(sans code)';
          // Ne pas écraser : premier = plus récent (requête DESC)
          if (notionMap[m.notion_concept][code] === undefined) {
            notionMap[m.notion_concept][code] = m.notion_acquired;
          }
        }
      });
      setNotionAcquisition(notionMap);
    }
    load();
  }, [spaceId]);

  async function sendToRetroactif(code) {
    setHandoffLoading(code);
    setHandoffError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ space_id: spaceId, learner_code: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.url, '_blank');
    } catch (err) {
      setHandoffError(`${code} : ${err.message}`);
    } finally {
      setHandoffLoading(null);
    }
  }

  if (!stats) return <p className="text-sm text-gray-400">Chargement…</p>;

  return (
    <div className="space-y-6">
      {stats.truncated && (
        <p className="text-xs text-amber-600">Affichage limité aux 500 derniers messages.</p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Questions totales" value={stats.total} />
        <StatCard label="Hors-base" value={stats.outOfBase} sub={`${stats.total ? Math.round(stats.outOfBase / stats.total * 100) : 0}%`} />
        <StatCard label="Apprenants actifs" value={byCode.length} />
      </div>

      <div>
        {handoffError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
            {handoffError}
          </p>
        )}
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Par code apprenant</h3>
        <div className="space-y-2">
          {byCode.map(([code, data]) => (
            <details key={code} className="bg-white border rounded-lg">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm">
                <span className="font-medium text-gray-800">{code}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {data.total} question{data.total > 1 ? 's' : ''}
                    {data.out > 0 && <span className="ml-2 text-orange-500">{data.out} hors-base</span>}
                  </span>
                  {data.blocages > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                      {data.blocages} blocage{data.blocages > 1 ? 's' : ''}
                    </span>
                  )}
                  {data.feedbackCount > 0 && (
                    <span className="text-xs text-gray-400">
                      {Math.round(data.helpful / data.feedbackCount * 100)}% utile
                    </span>
                  )}
                  <button
                    onClick={e => { e.preventDefault(); sendToRetroactif(code); }}
                    disabled={handoffLoading === code}
                    className="text-xs border border-[#0a9370] text-[#0a9370] px-2 py-0.5 rounded hover:bg-teal-50 disabled:opacity-50 shrink-0"
                  >
                    {handoffLoading === code ? '…' : '→ RetroActif'}
                  </button>
                </div>
              </summary>
              <div className="px-4 pb-3 space-y-1 border-t">
                {data.questions.slice(0, 10).map((q, i) => (
                  <p key={i} className="text-xs text-gray-600">— {q}</p>
                ))}
                {data.questions.length > 10 && (
                  <p className="text-xs text-gray-400">+ {data.questions.length - 10} autres…</p>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      {Object.keys(notionAcquisition).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Acquisition par notion</h3>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 border border-gray-200 bg-gray-50 font-medium text-gray-600">Notion</th>
                  {byCode.map(([code]) => (
                    <th key={code} className="px-3 py-2 border border-gray-200 bg-gray-50 font-medium text-gray-600 text-center">{code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(notionAcquisition).map(([concept, byCode_]) => (
                  <tr key={concept}>
                    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700 max-w-xs truncate">{concept}</td>
                    {byCode.map(([code]) => {
                      const v = byCode_[code];
                      return (
                        <td key={code} className="px-3 py-2 border border-gray-200 text-center">
                          {v === true
                            ? <span className="text-green-600 font-bold">✓</span>
                            : v === false
                              ? <span className="text-red-500 font-bold">✗</span>
                              : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border rounded-lg px-4 py-4">
      <p className="text-2xl font-bold text-[#0a9370]">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
