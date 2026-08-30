import { useState } from 'react';

export default function QuizPanel({ questions, onDone }) {
  const [i, setI] = useState(0);
  const [choisi, setChoisi] = useState(null);
  const [resultats, setResultats] = useState([]);
  const [fini, setFini] = useState(false);

  const q = questions[i];
  const derniere = i === questions.length - 1;
  const repondu = choisi !== null;

  function choisir(idx) {
    if (repondu) return;
    setChoisi(idx);
    setResultats(prev => [...prev, { notion_concept: q.notion_concept, correct: idx === q.correct_index }]);
  }

  function suivant() {
    if (derniere) {
      if (fini) return;
      setFini(true);
      onDone(resultats);
      return;
    }
    setI(i + 1);
    setChoisi(null);
  }

  return (
    <div className="border-t bg-white px-4 py-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Défi de consolidation</p>
        <p className="text-xs text-gray-400">{i + 1} / {questions.length}</p>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-[#0a9370] transition-all" style={{ width: `${((i + 1) / questions.length) * 100}%` }} />
      </div>

      <p className="text-base font-medium text-gray-800 mb-3">{q.enonce}</p>

      <div className="flex flex-col gap-2">
        {q.options.map((opt, idx) => {
          let cls = 'border-gray-300 hover:border-teal-400';
          if (repondu) {
            if (idx === q.correct_index) cls = 'border-[#0a9370] bg-teal-50';
            else if (idx === choisi) cls = 'border-red-400 bg-red-50';
            else cls = 'border-gray-200 opacity-60';
          }
          return (
            <button
              key={idx}
              type="button"
              onClick={() => choisir(idx)}
              disabled={repondu}
              aria-pressed={choisi === idx}
              className={`text-left text-base border rounded px-3 py-2 transition ${cls} disabled:cursor-default`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="mt-3" role="status" aria-live="polite">
        {repondu && (
          <>
            <p className={`text-xs font-medium ${choisi === q.correct_index ? 'text-[#0a9370]' : 'text-red-500'}`}>
              {choisi === q.correct_index ? 'Correct.' : 'Pas tout à fait.'}
            </p>
            <p className="text-base text-gray-700 mt-1">{q.explication}</p>
            <button
              type="button"
              onClick={suivant}
              className="mt-3 bg-[#0a9370] text-white px-5 py-2 rounded text-sm font-semibold"
            >
              {derniere ? 'Voir mon bilan' : 'Question suivante'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
