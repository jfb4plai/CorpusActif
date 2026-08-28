// Fonctions pures pour la génération/édition du curriculum.
// draftToNodes : transforme un brouillon généré (+ les choix de l'enseignant) en nœuds
//   prêts à insérer, en 2 groupes (parents d'abord, enfants ensuite avec parentTempId).
// groupNodes  : transforme la liste plate corpus_curriculum_nodes en groupes affichables
//   (un parent + ses enfants) + orphelins.

// --- draftToNodes -----------------------------------------------------------

// draft : { chapitres: [{ titre, concepts: [{ concept, definition }] }], concepts_sans_chapitre: [{ concept, definition }] }
// kept  : objet { [key]: { keep, parentKey, concept?, definition? } }
//   key       = `${chapIdx}:${conceptIdx}` pour un concept de chapitre, `orphan:${idx}` pour un concept sans chapitre
//   parentKey = `chap:${chapIdx}` (rattaché à un chapitre) ou null (sans chapitre)
//   concept / definition : valeurs éditées par l'enseignant (sinon on prend celles du draft)
export function draftToNodes(draft, kept) {
  const enfants = []
  const parentKeysUtilises = new Set()

  const pousser = (key, srcConcept, srcDefinition) => {
    const choix = kept[key]
    if (!choix || !choix.keep) return
    const parentTempId = choix.parentKey ?? null
    if (parentTempId) parentKeysUtilises.add(parentTempId)
    enfants.push({
      tempId: key,
      parentTempId,
      concept: (choix.concept ?? srcConcept ?? '').trim(),
      definition: (choix.definition ?? srcDefinition ?? '').trim(),
    })
  }

  ;(draft.chapitres ?? []).forEach((chap, ci) => {
    ;(chap.concepts ?? []).forEach((c, coi) => pousser(`${ci}:${coi}`, c.concept, c.definition))
  })
  ;(draft.concepts_sans_chapitre ?? []).forEach((c, i) => pousser(`orphan:${i}`, c.concept, c.definition))

  // Un parent n'est créé que s'il a au moins un enfant retenu.
  const parents = []
  parentKeysUtilises.forEach((pk) => {
    const ci = Number(pk.split(':')[1])
    const titre = draft.chapitres?.[ci]?.titre ?? `Chapitre ${ci + 1}`
    parents.push({ tempId: pk, concept: titre.trim(), definition: '', level: null })
  })
  // Ordre stable : par index de chapitre
  parents.sort((a, b) => Number(a.tempId.split(':')[1]) - Number(b.tempId.split(':')[1]))

  return { parents, enfants }
}

// --- groupNodes -----------------------------------------------------------

// nodes : lignes corpus_curriculum_nodes ({ id, concept, definition, level, parent_id })
// retour : { groupes: [{ parent, enfants: [] }], orphelins: [] }
export function groupNodes(nodes) {
  const parIdMap = new Map(nodes.map(n => [n.id, n]))
  const enfantsParParent = new Map()
  for (const n of nodes) {
    if (n.parent_id && parIdMap.has(n.parent_id)) {
      if (!enfantsParParent.has(n.parent_id)) enfantsParParent.set(n.parent_id, [])
      enfantsParParent.get(n.parent_id).push(n)
    }
  }

  const groupes = []
  const orphelins = []
  const dejaEnfant = new Set()
  for (const arr of enfantsParParent.values()) for (const c of arr) dejaEnfant.add(c.id)

  for (const n of nodes) {
    if (dejaEnfant.has(n.id)) continue
    const enfants = enfantsParParent.get(n.id)
    if (enfants && enfants.length > 0) {
      groupes.push({ parent: n, enfants })
    } else {
      orphelins.push(n)
    }
  }
  // Filet : aucun nœud ne doit disparaître de l'affichage, quelle que soit la profondeur.
  const rendus = new Set()
  for (const g of groupes) { rendus.add(g.parent.id); for (const e of g.enfants) rendus.add(e.id) }
  for (const n of orphelins) rendus.add(n.id)
  for (const n of nodes) if (!rendus.has(n.id)) orphelins.push(n)

  return { groupes, orphelins }
}
