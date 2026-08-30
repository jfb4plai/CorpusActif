// Décide combien de questions générer pour chaque notion du parcours.
// 2 questions pour une notion fragile (échouée ou comprise seulement avec indice),
// 1 pour une notion maîtrisée. Les notions fragiles sont servies en premier ;
// à priorité égale, l'ordre du parcours est conservé. Le total ne dépasse jamais `max`.
// Renvoie un tableau d'UNE entrée par question à générer : { concept, definition }.
// (une notion à 2 questions apparaît 2 fois — c'est voulu, le générateur produit
// une question par entrée.)

const PRIORITAIRES = new Set(['failed', 'acquired_with_hint']);

export function planifierQuestions(notions, max = 10) {
  const avecPoids = notions.map((n, ordre) => ({
    concept: n.concept,
    definition: n.definition ?? '',
    poids: PRIORITAIRES.has(n.outcome) ? 2 : 1,
    prioritaire: PRIORITAIRES.has(n.outcome),
    ordre,
  }));

  avecPoids.sort((a, b) => (b.prioritaire - a.prioritaire) || (a.ordre - b.ordre));

  const plan = [];
  for (const n of avecPoids) {
    for (let i = 0; i < n.poids && plan.length < max; i++) {
      plan.push({ concept: n.concept, definition: n.definition });
    }
    if (plan.length >= max) break;
  }
  return plan;
}
