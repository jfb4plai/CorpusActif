import { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Documents from './Documents';
import Curriculum from './Curriculum';
import LearnerCodes from './LearnerCodes';
import Dashboard from './Dashboard';

const TABS = ['Documents', 'Curriculum', 'Codes & QR', 'Tableau de bord'];

export default function SpaceDetail() {
  const { spaceId } = useParams();
  const { session } = useOutletContext();
  const [space, setSpace] = useState(null);
  const [tab, setTab] = useState(0);
  const [mode, setMode] = useState('partiel');

  useEffect(() => {
    supabase.from('spaces').select('*').eq('id', spaceId).single()
      .then(({ data }) => { if (data) { setSpace(data); setMode(data.out_of_base_mode); } });
  }, [spaceId]);

  async function saveMode(newMode) {
    setMode(newMode);
    await supabase.from('spaces').update({ out_of_base_mode: newMode }).eq('id', spaceId);
  }

  if (!space) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">{space.name}</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Hors-base :</span>
          {['strict', 'partiel', 'ouvert'].map(m => (
            <button
              key={m}
              onClick={() => saveMode(m)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition ${mode === m ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex border-b mb-6">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === i ? 'border-[#0a9370] text-[#0a9370]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && <Documents spaceId={spaceId} session={session} />}
      {tab === 1 && <Curriculum spaceId={spaceId} session={session} />}
      {tab === 2 && <LearnerCodes spaceId={spaceId} session={session} />}
      {tab === 3 && <Dashboard spaceId={spaceId} />}
    </div>
  );
}
