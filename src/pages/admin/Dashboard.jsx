import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Statuts d'une notion pour un apprenant
const STATUS = {
  mastered:    { icon: '✓', label: 'Acquise',            color: '#0a9370', bg: '#dcfce7' },
  with_hint:   { icon: '~', label: 'Acquise avec indice', color: '#065f46', bg: '#d1fae5' },
  failed:      { icon: '✗', label: 'Réponse donnée',      color: '#9a3412', bg: '#fff7ed' },
  in_progress: { icon: '◐', label: 'En cours',            color: '#6b7280', bg: '#f3f4f6' },
  never:       { icon: '○', label: 'Jamais abordée',      color: '#9ca3af', bg: 'transparent' },
};

// Déduit le statut d'une notion à partir des messages d'un couple (notion, apprenant)
function deriveStatus(msgs) {
  if (!msgs || msgs.length === 0) return 'never';
  if (msgs.some(m => m.notion_acquired === true)) {
    const withHint = msgs.some(m => (m.answer || '').startsWith('[INDICE]'));
    return withHint ? 'with_hint' : 'mastered';
  }
  if (msgs.some(m => (m.answer || '').startsWith('[RÉPONSE]'))) return 'failed';
  return 'in_progress';
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard({ spaceId }) {
  const [stats, setStats] = useState(null);
  const [byCode, setByCode] = useState([]);
  const [blockedQuestions, setBlockedQuestions] = useState([]);
  const [handoffLoading, setHandoffLoading] = useState(null);
  const [handoffError, setHandoffError] = useState('');
  const [connections, setConnections] = useState([]);
  // Suivi d'acquisition (curriculum × apprenants)
  const [acq, setAcq] = useState(null); // { rows, cols, enrolled, statusOf, classStats, difficultiesByCode, reaborder, hasCurriculum, threshold }

  useEffect(() => {
    async function load() {
      const [{ data: messages }, { data: nodes }, { data: codes }, { data: space }, { data: connData }, { data: confirmations }] =
        await Promise.all([
          supabase.from('corpus_messages')
            .select('learner_code, question, answer, is_out_of_base, helpful, notion_concept, notion_acquired, created_at')
            .eq('space_id', spaceId).order('created_at', { ascending: false }).limit(500),
          supabase.from('corpus_curriculum_nodes').select('concept').eq('space_id', spaceId).order('created_at'),
          supabase.from('corpus_learner_codes').select('code, difficulties').eq('space_id', spaceId),
          supabase.from('corpus_spaces').select('class_acquisition_threshold').eq('id', spaceId).single(),
          supabase.from('corpus_notion_connections')
            .select('learner_code, notion_concept, connection_text, skipped, created_at')
            .eq('space_id', spaceId).order('created_at', { ascending: false }),
          supabase.from('corpus_material_confirmations')
            .select('learner_code, confirmed, created_at')
            .eq('space_id', spaceId).order('created_at', { ascending: false }),
        ]);

      if (!messages) return;
      setConnections(connData || []);

      const total = messages.length;
      const outOfBase = messages.filter(m => m.is_out_of_base).length;

      // Agrégation par code apprenant
      const codeMap = {};
      messages.forEach(m => {
        const code = m.learner_code || '(sans code)';
        if (!codeMap[code]) codeMap[code] = { total: 0, out: 0, questions: [], blocages: 0, helpful: 0, notHelpful: 0, feedbackCount: 0 };
        codeMap[code].total++;
        if (m.is_out_of_base) codeMap[code].out++;
        codeMap[code].questions.push(m.question);
        if (m.answer && (m.answer.startsWith('[INDICE]') || m.answer.startsWith('[RÉPONSE]'))) codeMap[code].blocages++;
        if (m.helpful === true) codeMap[code].helpful++;
        if (m.helpful === false) codeMap[code].notHelpful++;
        if (m.helpful !== null && m.helpful !== undefined) codeMap[code].feedbackCount++;
      });

      // Questions bloquées (précédant un [INDICE]), par fréquence
      const blockedMap = {};
      messages.forEach(m => {
        if (m.answer?.startsWith('[INDICE]') && m.question) {
          const q = m.question.trim();
          blockedMap[q] = (blockedMap[q] || 0) + 1;
        }
      });
      setBlockedQuestions(Object.entries(blockedMap).sort((a, b) => b[1] - a[1]).slice(0, 15));

      setStats({ total, outOfBase, truncated: messages.length === 500 });
      const byCodeArr = Object.entries(codeMap).sort((a, b) => b[1].total - a[1].total);
      setByCode(byCodeArr);

      // ---- Suivi d'acquisition ----
      const threshold = space?.class_acquisition_threshold ?? 0.30;
      const difficultiesByCode = Object.fromEntries((codes || []).map(c => [c.code, c.difficulties || null]));

      // Confirmation de lecture la plus récente par apprenant (ordre déjà DESC)
      const readinessByCode = {};
      (confirmations || []).forEach(c => {
        const code = c.learner_code || '(sans code)';
        if (!(code in readinessByCode)) readinessByCode[code] = c.confirmed;
      });

      // Codes : inscrits (dénominateur classe) + actifs (colonnes)
      const activeCodes = [...new Set(messages.map(m => m.learner_code).filter(Boolean))];
      const enrolled = (codes && codes.length) ? codes.map(c => c.code) : activeCodes;
      const cols = [...new Set([...enrolled, ...activeCodes])];

      // Messages regroupés par (notion, code)
      const byPair = {};
      messages.forEach(m => {
        if (!m.notion_concept) return;
        const code = m.learner_code || '(sans code)';
        (byPair[m.notion_concept] ??= {})[code] ??= [];
        byPair[m.notion_concept][code].push(m);
      });

      // Lignes : curriculum d'abord, puis notions extraites hors curriculum
      const curriculumConcepts = (nodes || []).map(n => n.concept);
      const curriculumSet = new Set(curriculumConcepts);
      const extraConcepts = [...new Set(Object.keys(byPair))].filter(c => !curriculumSet.has(c));
      const rows = [
        ...curriculumConcepts.map(c => ({ concept: c, inCurriculum: true })),
        ...extraConcepts.map(c => ({ concept: c, inCurriculum: false })),
      ];

      const statusOf = (concept, code) => deriveStatus(byPair[concept]?.[code]);

      const classStats = {};
      rows.forEach(({ concept }) => {
        const s = { mastered: 0, with_hint: 0, failed: 0, in_progress: 0, never: 0 };
        enrolled.forEach(code => { s[statusOf(concept, code)]++; });
        const acquired = s.mastered + s.with_hint;
        classStats[concept] = { ...s, acquired, total: enrolled.length, pct: enrolled.length ? acquired / enrolled.length : 0 };
      });

      // Notions à réaborder : curriculum uniquement (concepts stables)
      const reaborder = rows
        .filter(r => r.inCurriculum)
        .map(r => ({ concept: r.concept, ...classStats[r.concept] }))
        .filter(r => r.total > 0 && (r.acquired === 0 || r.pct < threshold))
        .sort((a, b) => a.pct - b.pct);

      setAcq({
        rows, cols, enrolled, statusOf, classStats, difficultiesByCode, readinessByCode,
        reaborder, hasCurriculum: curriculumConcepts.length > 0, threshold,
      });
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
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

  function exportCsv() {
    if (!acq) return;
    const header = ['Notion', 'Dans le curriculum', ...acq.cols, '% classe acquis', 'Acquis / inscrits'];
    const lines = acq.rows.map(({ concept, inCurriculum }) => {
      const cells = acq.cols.map(code => STATUS[acq.statusOf(concept, code)].label);
      const cs = acq.classStats[concept];
      return [concept, inCurriculum ? 'oui' : 'non', ...cells, `${Math.round(cs.pct * 100)}%`, `${cs.acquired}/${cs.total}`];
    });
    const csv = [header, ...lines].map(r => r.map(csvCell).join(';')).join('\r\n');
    downloadFile(`corpusactif-acquisition-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv');
  }

  if (!stats) return <p className="text-sm text-gray-400">Chargement…</p>;

  const reaborder = acq?.reaborder || [];

  return (
    <div className="space-y-6">
      <style>{`@media print {
        .no-print { display: none !important; }
        body, .dashboard-print { font-family: Arial, sans-serif !important; }
        details { display: block !important; }
      }`}</style>

      {/* Barre d'export */}
      {acq && acq.rows.length > 0 && (
        <div className="no-print flex items-center gap-2 flex-wrap">
          <button onClick={exportCsv} className="text-xs border border-[#0a9370] text-[#0a9370] px-3 py-1.5 rounded hover:bg-teal-50">
            Exporter le suivi (CSV)
          </button>
          <button onClick={() => window.print()} className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50">
            Imprimer
          </button>
          <span className="text-xs text-gray-400">Codes anonymes uniquement — exploitable en conseil de classe / PIA.</span>
        </div>
      )}

      {stats.truncated && (
        <p className="text-xs text-amber-600">Affichage limité aux 500 derniers messages.</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 dashboard-print">
        <StatCard label="Questions totales" value={stats.total} />
        <StatCard label="Hors-base" value={stats.outOfBase} sub={`${stats.total ? Math.round(stats.outOfBase / stats.total * 100) : 0}%`} />
        <StatCard label="Apprenants actifs" value={byCode.length} />
        <StatCard label="Notions à réaborder" value={reaborder.length} alert={reaborder.length > 0} />
      </div>

      {/* NOTIONS À RÉABORDER — priorité de lecture */}
      {acq?.hasCurriculum && (
        <div className="dashboard-print">
          <h3 className="label-upper mb-1">Notions à réaborder en classe</h3>
          <p className="text-xs text-gray-400 mb-3">
            Notions acquises par personne, ou par moins de {Math.round(acq.threshold * 100)} % de la classe. Ce sont les points à reprendre collectivement.
          </p>
          {reaborder.length === 0 ? (
            <p className="text-xs bg-green-50 border border-green-200 text-green-700 rounded px-4 py-3">
              Aucune notion sous le seuil d'alerte. La classe progresse.
            </p>
          ) : (
            <div className="space-y-1.5">
              {reaborder.map(r => {
                const critical = r.acquired === 0;
                return (
                  <div key={r.concept}
                    className="flex items-center gap-3 border rounded px-4 py-2.5"
                    style={{ background: critical ? '#fef2f2' : '#fff7ed', borderColor: critical ? '#fecaca' : '#fed7aa' }}>
                    <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                      style={{ background: critical ? '#dc2626' : '#f97316', color: 'white' }}>
                      {critical ? 'Acquise par personne' : `${Math.round(r.pct * 100)} %`}
                    </span>
                    <span className="text-sm text-gray-800 flex-1">{r.concept}</span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {r.acquired}/{r.total} acquis
                      {r.never > 0 && ` · ${r.never} jamais abordée`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VUE CLASSE — thermomètre par notion */}
      {acq?.hasCurriculum && (
        <div className="dashboard-print">
          <h3 className="label-upper mb-3">Acquisition par notion — vue classe</h3>
          <div className="space-y-2">
            {acq.rows.filter(r => r.inCurriculum).map(({ concept }) => {
              const cs = acq.classStats[concept];
              return (
                <div key={concept} className="bg-white border rounded px-4 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-800 truncate pr-3">{concept}</span>
                    <span className="text-xs text-gray-500 shrink-0">{Math.round(cs.pct * 100)} % · {cs.acquired}/{cs.total}</span>
                  </div>
                  <div className="flex h-2.5 rounded overflow-hidden bg-gray-100">
                    {cs.mastered > 0 && <div style={{ width: `${cs.mastered / cs.total * 100}%`, background: '#0a9370' }} title={`${cs.mastered} maîtrisée(s)`} />}
                    {cs.with_hint > 0 && <div style={{ width: `${cs.with_hint / cs.total * 100}%`, background: '#6ee7b7' }} title={`${cs.with_hint} avec indice`} />}
                    {cs.failed > 0 && <div style={{ width: `${cs.failed / cs.total * 100}%`, background: '#fdba74' }} title={`${cs.failed} réponse donnée`} />}
                    {cs.in_progress > 0 && <div style={{ width: `${cs.in_progress / cs.total * 100}%`, background: '#d1d5db' }} title={`${cs.in_progress} en cours`} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
            <Legend color="#0a9370" label="Maîtrisée" />
            <Legend color="#6ee7b7" label="Avec indice" />
            <Legend color="#fdba74" label="Réponse donnée" />
            <Legend color="#d1d5db" label="En cours" />
            <Legend color="#f3f4f6" label="Jamais abordée" border />
          </div>
        </div>
      )}

      {/* MATRICE notion × apprenant — vue individuelle (accompagnement PLAI) */}
      {acq && acq.rows.length > 0 && acq.cols.length > 0 && (
        <div className="dashboard-print">
          <h3 className="label-upper mb-1">Détail par apprenant</h3>
          <p className="text-xs text-gray-400 mb-3">
            État de chaque notion pour chaque code apprenant — pour le suivi individuel et l'accompagnement PLAI.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 border border-gray-200 bg-gray-50 font-medium text-gray-600 sticky left-0">Notion</th>
                  {acq.cols.map(code => (
                    <th key={code} className="px-3 py-2 border border-gray-200 bg-gray-50 font-medium text-gray-600 text-center">{code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acq.rows.map(({ concept, inCurriculum }) => (
                  <tr key={concept}>
                    <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700 max-w-xs truncate">
                      {concept}{!inCurriculum && <span className="text-gray-300 font-normal"> · hors curriculum</span>}
                    </td>
                    {acq.cols.map(code => {
                      const st = STATUS[acq.statusOf(concept, code)];
                      return (
                        <td key={code} className="px-3 py-2 border border-gray-200 text-center" title={st.label}>
                          <span style={{ color: st.color, fontWeight: 700 }}>{st.icon}</span>
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

      {/* PAR CODE APPRENANT — questions + acquisition individuelle + handoff */}
      <div className="dashboard-print">
        {handoffError && (
          <p className="no-print text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">{handoffError}</p>
        )}
        <h3 className="label-upper mb-3">Par code apprenant</h3>
        <div className="space-y-2">
          {byCode.map(([code, data]) => {
            const diff = acq?.difficultiesByCode?.[code];
            const readiness = acq?.readinessByCode?.[code];
            const learnerNotions = acq?.hasCurriculum
              ? acq.rows.filter(r => r.inCurriculum).map(({ concept }) => ({ concept, status: acq.statusOf(concept, code) }))
              : [];
            return (
              <details key={code} className="bg-white border rounded">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm">
                  <span className="font-medium text-gray-800 flex items-center gap-2">
                    {code}
                    {readiness === true && (
                      <span className="text-xs" title="A confirmé avoir déjà vu la matière">📖 ✓</span>
                    )}
                    {readiness === false && (
                      <span className="text-xs" title="A indiqué ne pas encore avoir vu la matière">📖 ?</span>
                    )}
                  </span>
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
                      <span className="text-xs text-gray-400">{Math.round(data.helpful / data.feedbackCount * 100)}% utile</span>
                    )}
                    <button
                      onClick={e => { e.preventDefault(); sendToRetroactif(code); }}
                      disabled={handoffLoading === code}
                      className="no-print text-xs border border-[#0a9370] text-[#0a9370] px-2 py-0.5 rounded hover:bg-teal-50 disabled:opacity-50 shrink-0">
                      {handoffLoading === code ? '…' : '→ RetroActif'}
                    </button>
                  </div>
                </summary>
                <div className="px-4 pb-3 border-t space-y-3 pt-3">
                  {diff && (
                    <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800">
                      <span className="font-semibold">Obstacles fonctionnels : </span>{diff}
                    </div>
                  )}
                  {learnerNotions.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">Acquisition ({learnerNotions.filter(n => n.status === 'mastered' || n.status === 'with_hint').length}/{learnerNotions.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {learnerNotions.map(({ concept, status }) => {
                          const st = STATUS[status];
                          return (
                            <span key={concept} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                              style={{ background: st.bg, color: st.color, border: status === 'never' ? '1px solid #e5e7eb' : 'none' }}
                              title={st.label}>
                              {st.icon} {concept}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    {data.questions.slice(0, 10).map((q, i) => (
                      <p key={i} className="text-xs text-gray-600">— {q}</p>
                    ))}
                    {data.questions.length > 10 && (
                      <p className="text-xs text-gray-400">+ {data.questions.length - 10} autres…</p>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {blockedQuestions.length > 0 && (
        <div className="dashboard-print">
          <h3 className="label-upper mb-3">Questions bloquées</h3>
          <p className="text-xs text-gray-400 mb-3">Questions ayant déclenché un indice — classées par fréquence. Ce sont les points durs de votre corpus.</p>
          <div className="space-y-1">
            {blockedQuestions.map(([q, count]) => (
              <div key={q} className="flex items-start gap-3 bg-white border rounded px-4 py-2">
                <span className="shrink-0 mt-0.5 text-xs font-bold text-orange-500 w-6 text-right">{count}×</span>
                <p className="text-xs text-gray-700">{q}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {connections.filter(c => !c.skipped).length > 0 && (() => {
        const byNotion = {};
        connections.forEach(c => {
          if (!byNotion[c.notion_concept]) byNotion[c.notion_concept] = [];
          byNotion[c.notion_concept].push(c);
        });
        return (
          <div className="dashboard-print">
            <h3 className="label-upper mb-1">Connexions aux savoirs antérieurs</h3>
            <p className="text-xs text-gray-400 mb-3">Ce que les apprenants ont associé à la notion une fois acquise.</p>
            <div className="space-y-2">
              {Object.entries(byNotion).map(([concept, items]) => {
                const answered = items.filter(i => !i.skipped);
                const skipped = items.filter(i => i.skipped);
                return (
                  <details key={concept} className="bg-white border rounded">
                    <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm">
                      <span className="font-medium text-gray-800 truncate max-w-xs">{concept}</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {answered.length} réponse{answered.length !== 1 ? 's' : ''}
                        {skipped.length > 0 && <span className="ml-2 text-gray-300">{skipped.length} passé{skipped.length !== 1 ? 's' : ''}</span>}
                      </span>
                    </summary>
                    <div className="px-4 pb-3 border-t space-y-2 pt-2">
                      {answered.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <span className="text-xs text-gray-400 shrink-0 pt-0.5 w-8">{item.learner_code || '?'}</span>
                          <p className="text-xs text-gray-700 italic">"{item.connection_text}"</p>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StatCard({ label, value, sub, alert }) {
  return (
    <div className="bg-white px-4 py-4" style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${alert ? '#f97316' : 'var(--teal)'}`, borderRadius: '4px' }}>
      <p className="text-2xl font-bold" style={{ color: alert ? '#f97316' : 'var(--teal)' }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text3)' }}>{sub}</p>}
    </div>
  );
}

function Legend({ color, label, border }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-3 h-2.5 rounded-sm inline-block" style={{ background: color, border: border ? '1px solid #e5e7eb' : 'none' }} />
      {label}
    </span>
  );
}
