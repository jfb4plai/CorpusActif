import { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Documents from './Documents';
import Curriculum from './Curriculum';
import LearnerCodes from './LearnerCodes';
import Dashboard from './Dashboard';

const TABS = ['Documents', 'Curriculum', 'Codes & QR', 'Tableau de bord'];

const THRESHOLD_PRESETS = [
  {
    label: 'Vocabulaire',
    value: 0.80,
    tooltip: "Correspondance quasi-exacte — idéal pour les définitions, l'orthographe, les langues",
  },
  {
    label: 'Compréhension',
    value: 0.55,
    tooltip: "Reformulations acceptées — idéal pour les sciences, l'histoire, la géographie",
  },
  {
    label: 'Exploration',
    value: 0.35,
    tooltip: 'Associations larges — idéal pour la créativité, les projets ouverts',
  },
];

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <span className="absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-gray-800 text-white text-xs rounded px-2 py-1 text-center shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

export default function SpaceDetail() {
  const { spaceId } = useParams();
  const { session } = useOutletContext();
  const [space, setSpace] = useState(null);
  const [tab, setTab] = useState(0);
  const [outOfBaseMode, setOutOfBaseMode] = useState('partiel');
  const [threshold, setThreshold] = useState(0.5);
  const [pedagogicalMode, setPedagogicalMode] = useState('direct');

  useEffect(() => {
    supabase.from('spaces').select('*').eq('id', spaceId).single()
      .then(({ data }) => {
        if (data) {
          setSpace(data);
          setOutOfBaseMode(data.out_of_base_mode);
          setThreshold(data.similarity_threshold ?? 0.5);
          setPedagogicalMode(data.pedagogical_mode ?? 'direct');
        }
      });
  }, [spaceId]);

  async function saveField(field, value) {
    await supabase.from('spaces').update({ [field]: value }).eq('id', spaceId);
  }

  function handleOutOfBaseMode(newMode) {
    setOutOfBaseMode(newMode);
    saveField('out_of_base_mode', newMode);
  }

  function handlePreset(value) {
    setThreshold(value);
    saveField('similarity_threshold', value);
  }

  function handleSlider(e) {
    const value = parseFloat(e.target.value);
    setThreshold(value);
  }

  function handleSliderCommit(e) {
    const value = parseFloat(e.target.value);
    saveField('similarity_threshold', value);
  }

  function handlePedagogicalMode(newMode) {
    setPedagogicalMode(newMode);
    saveField('pedagogical_mode', newMode);
  }

  if (!space) return null;

  const activePreset = THRESHOLD_PRESETS.find(p => Math.abs(p.value - threshold) < 0.01);

  return (
    <div>
      {/* En-tête espace */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">{space.name}</h1>
        {pedagogicalMode === 'socratique' && (
          <p className="text-xs text-orange-500 mb-3">
            En mode socratique, ce nom est affiché à vos apprenants. Utilisez le sujet pédagogique plutôt qu'un identifiant de classe — ex : "La photosynthèse" plutôt que "Classe 3B".
          </p>
        )}

        {/* Hors-base */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="text-gray-500 w-32 shrink-0">Hors-base :</span>
          {['strict', 'partiel', 'ouvert'].map(m => (
            <button
              key={m}
              onClick={() => handleOutOfBaseMode(m)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition ${outOfBaseMode === m ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Seuil de similarité */}
        <div className="bg-white border rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Seuil de similarité</p>
          <div className="flex gap-2 mb-3">
            {THRESHOLD_PRESETS.map(p => (
              <Tooltip key={p.label} text={p.tooltip}>
                <button
                  onClick={() => handlePreset(p.value)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition ${activePreset?.label === p.label ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
                >
                  {p.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={handleSlider}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="flex-1 accent-[#0a9370]"
            />
            <span className="text-xs text-gray-500 w-8 text-right">{threshold.toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Les presets couvrent la majorité des usages. Le curseur est réservé aux enseignants qui souhaitent affiner — une valeur trop basse produit des réponses hors-sujet, une valeur trop haute peut bloquer des reformulations légitimes.
          </p>
        </div>

        {/* Mode pédagogique */}
        <div className="bg-white border rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Mode pédagogique</p>
          <div className="flex gap-2">
            <button
              onClick={() => handlePedagogicalMode('direct')}
              className={`px-4 py-1.5 rounded-full border text-xs font-medium transition ${pedagogicalMode === 'direct' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-600 border-gray-300 hover:border-teal-400'}`}
            >
              Direct
            </button>
            <Tooltip text="Claude guide l'apprenant par des questions plutôt que de donner la réponse directement. Après 5 relances sans progression, un indice est fourni. Après 2 nouveaux blocages, la réponse est donnée en valorisant ce que l'apprenant a déjà compris.">
              <button
                onClick={() => handlePedagogicalMode('socratique')}
                className={`px-4 py-1.5 rounded-full border text-xs font-medium transition ${pedagogicalMode === 'socratique' ? 'bg-[#f97316] text-white border-[#f97316]' : 'text-gray-600 border-gray-300 hover:border-orange-400'}`}
              >
                Socratique ⓘ
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Onglets */}
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
