import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Dashboard({ spaceId }) {
  const [stats, setStats] = useState(null);
  const [byCode, setByCode] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: messages } = await supabase
        .from('messages')
        .select('learner_code, question, is_out_of_base, created_at')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });

      if (!messages) return;

      const total = messages.length;
      const outOfBase = messages.filter(m => m.is_out_of_base).length;

      // Agrégation par code
      const codeMap = {};
      messages.forEach(m => {
        const code = m.learner_code || '(sans code)';
        if (!codeMap[code]) codeMap[code] = { total: 0, out: 0, questions: [] };
        codeMap[code].total++;
        if (m.is_out_of_base) codeMap[code].out++;
        codeMap[code].questions.push(m.question);
      });

      setStats({ total, outOfBase });
      setByCode(Object.entries(codeMap).sort((a, b) => b[1].total - a[1].total));
    }
    load();
  }, [spaceId]);

  if (!stats) return <p className="text-sm text-gray-400">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Questions totales" value={stats.total} />
        <StatCard label="Hors-base" value={stats.outOfBase} sub={`${stats.total ? Math.round(stats.outOfBase / stats.total * 100) : 0}%`} />
        <StatCard label="Apprenants actifs" value={byCode.length} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Par code apprenant</h3>
        <div className="space-y-2">
          {byCode.map(([code, data]) => (
            <details key={code} className="bg-white border rounded-lg">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm">
                <span className="font-medium text-gray-800">{code}</span>
                <span className="text-xs text-gray-400">
                  {data.total} question{data.total > 1 ? 's' : ''}
                  {data.out > 0 && <span className="ml-2 text-orange-500">{data.out} hors-base</span>}
                </span>
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
