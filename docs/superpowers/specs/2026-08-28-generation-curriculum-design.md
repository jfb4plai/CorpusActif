# CorpusActif — Génération du curriculum depuis les documents

Date : 2026-08-28
Statut : design validé, spec en revue
Origine : analyse du mécanisme StudyRaid (ossature générée depuis la source, éditable).
Chantier prioritaire nº2 de la roadmap « reprise sélective des mécanismes StudyRaid ».
Approche retenue : **A — génération + édition du curriculum** (la hiérarchie visible côté
élève reste un chantier séparé).

---

## 1. Problème

Le curriculum d'un espace CorpusActif (`corpus_curriculum_nodes`) est la structure qui
pilote le parcours socratique de l'élève (Notion 1/N → 2/N…), la carte des notions finale,
les rappels de progression et le débrief Haiku — les « bilans de session ».

Aujourd'hui l'enseignant n'a que deux voies pour le remplir :

1. **Saisie 100 % manuelle** dans l'onglet Curriculum — un concept + une définition à la
   fois, à la main.
2. **Extraction cachée au rabais** : quand l'espace est en mode socratique *sans*
   curriculum, `chat-init.js` (SOURCE B) fait extraire les notions par Haiku à l'ouverture
   de session apprenant — mais cette extraction est éphémère (par session), jamais
   persistée, jamais montrée à l'enseignant, et surtout elle **désactive les bilans**
   (`has_curriculum: false`).

Le mécanisme StudyRaid « génère l'ossature depuis la source, l'enseignant l'édite avant de
valider » manque exactement ici. Résultat : soit l'enseignant tape tout à la main, soit il
se prive des bilans.

`corpus_curriculum_nodes` a déjà une colonne `parent_id` (arbre auto-référencé), mais rien
ne la consomme : l'admin affiche la liste à plat, le parcours élève est linéaire.

## 2. Objectif

Donner à l'enseignant un bouton **« Générer depuis les documents »** dans l'onglet
Curriculum, qui produit une ossature (chapitres optionnels → concepts) à partir des
documents indexés de l'espace, **dans une zone brouillon éditable**, que l'enseignant
fusionne avec son curriculum avant de valider. La validation peuple
`corpus_curriculum_nodes` et débloque les bilans automatiquement. `chat-init.js` ne change
que sur un point : exclure les nœuds « chapitre » du parcours élève (§4.6).

Décidé le 2026-08-28 :

- **Hiérarchie à 2 niveaux, chapitres optionnels** — l'IA regroupe en chapitres seulement
  si le contenu s'y prête, sinon liste plate.
- **Zone d'édition séparée, l'enseignant fusionne** — rien n'est écrasé automatiquement
  (split 80/20 strict). Distinct de l'import de template actuel qui remplace tout.
- **Modèle Haiku** — cohérent avec `chat-init.js` / `generate-flashcards.js`, coût minime.
- **Templates de curriculum corrigés** dans ce chantier — préservation de `parent_id`.
- **Pas de RISS** — extraction structurelle des documents de l'enseignant, aucune
  affirmation scientifique introduite.

Hors périmètre :

- Hiérarchie visible côté élève (parcours par chapitre) — chantier séparé.
- Colonne `position int` pour l'ordre des notions — suivi propre.
- Catalogue de modèles partagés entre enseignants du Pôle — chantier 7.

## 3. Contrainte dure : 12 fonctions serverless

Vercel Hobby plafonne à 12 fonctions. `api/` en compte déjà 12 (`chat`, `chat-init`,
`chat-debrief`, `curriculum`, `embed`, `embed-from-url`, `feedback`, `generate-flashcards`,
`handoff`, `material-confirmation`, `notion-connection`, `qr`). Commit `d903f5e` a fusionné
la liaison FlashFWB dans `generate-flashcards.js` pour cette raison.

**Conséquence : pas de nouveau fichier `api/`.** La génération est repliée dans
`api/curriculum.js` comme une branche `action`.

## 4. Architecture

### 4.1 API — `api/curriculum.js`, branche `action: 'generate'`

`curriculum.js` gère aujourd'hui le CRUD des nœuds (GET / POST / PUT / DELETE) via un
client `SERVICE_ROLE_KEY` + `Authorization` header (RLS). On ajoute, en tête du handler
`POST`, une détection :

```js
if (req.method === 'POST' && req.body?.action === 'generate') {
  return genererCurriculum(req, res)
}
```

`genererCurriculum(req, res)` :

1. **Auth stricte** (pattern `generate-flashcards.js`, plus rigoureux que le CRUD actuel) :
   client user `ANON_KEY` + header → `auth.getUser()` → 401 si pas de user → lire
   `corpus_spaces (name, matiere, niveau)` filtré par `id = space_id` via ce client user
   (RLS `auth.uid() = user_id`) → 403 si absent.
2. **Lire les chunks** via le client service :
   `corpus_chunks.select('content').eq('space_id', space_id).order('created_at')`.
   - 0 chunk → `400 { error: 'Aucun document indexé — ajoutez des documents avant de générer le curriculum.' }`.
   - Tronquer chaque `content` à 500 caractères.
   - Plafond : 120 chunks. Au-delà, échantillonnage régulier (`chunks.filter((_, i) => i % Math.ceil(n/120) === 0)`).
   - Joindre par `\n---\n`.
3. **Appel Haiku** (`claude-haiku-4-5-20251001`, `max_tokens: 3000`) :

   Prompt système / message :
   ```
   Tu analyses des extraits de cours pour en dégager l'ossature pédagogique que l'apprenant
   doit maîtriser.
   [contexte : matière {matiere}, niveau {niveau} s'ils existent]

   Identifie les notions-clés (concept + définition courte, 1-2 phrases, tirée du contenu).
   Regroupe-les en chapitres UNIQUEMENT si les extraits révèlent une structure claire
   (parties, thèmes distincts). Si le contenu est court ou homogène, ne crée pas de
   chapitres : mets tout dans "concepts_sans_chapitre".
   Pas de notion inventée hors du contenu. Pas de doublon.

   [extraits]
   ```

   Sortie contrainte par schéma :
   ```
   {
     chapitres: [
       { titre: string, concepts: [ { concept: string, definition: string } ] }
     ],
     concepts_sans_chapitre: [ { concept: string, definition: string } ]
   }
   ```

   **Format JSON** : utiliser `output_config: { format: { type: 'json_schema', schema } }`
   si `@anthropic-ai/sdk@0.100.1` le supporte (à vérifier à l'implémentation via un appel
   test). Sinon, reprendre le pattern existant du repo : consigne « Réponds en JSON strict,
   sans texte avant ni après » + `raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '')` +
   `JSON.parse` dans un try/catch (comme `chat-init.js:129` et
   `generate-flashcards.js:175`).
4. **Filtrer** : `concept` non vide requis ; `definition` par défaut `''`. Écarter les
   chapitres vides.
5. **Réponse** : `200 { resultat: { chapitres, concepts_sans_chapitre } }`. **Rien n'est
   écrit en base.**
6. Erreur Haiku / parse → `500 { error: 'La génération du curriculum a échoué. Réessayez.' }`
   (log `console.error` côté serveur, sans données sensibles).

### 4.2 Client — `src/pages/admin/Curriculum.jsx`

**Nouveau bouton** dans la barre d'actions (à côté de « Sauvegarder comme modèle » /
« Importer un modèle ») :

```
Générer depuis les documents
```

- Désactivé si une génération est en cours.
- Au clic : `POST /api/curriculum?space_id=…` avec
  `{ action: 'generate', space_id }` + `Authorization: Bearer {session.access_token}`.
- Pendant : bouton « Génération en cours… », spinner.
- Erreur : message sous la barre (`text-xs text-red-500`).

**Panneau brouillon** (`draft`, state local, rendu sous la barre, au-dessus du formulaire
d'ajout manuel) — n'apparaît que si `draft !== null` :

- En-tête : « Brouillon généré — cochez et ajustez ce que vous gardez, puis ajoutez au
  curriculum. Rien n'est enregistré tant que vous n'avez pas cliqué. »
- Pour chaque **chapitre** (`draft.chapitres[]`) : bloc avec
  - titre éditable (`input`, `value = chapitre.titre`)
  - liste de concepts : chacun = ligne avec `checkbox` (state `keep`, défaut `true`) +
    `input` concept + `textarea` définition (2 lignes) + un `select` « Chapitre : … /
    Sans chapitre » pour déplacer le concept.
- Bloc **« Concepts sans chapitre »** : mêmes lignes, `select` permet de rattacher à un
  chapitre.
- Boutons :
  - **« Ajouter au curriculum »** → `appliquerBrouillon()` (voir 4.3). Désactivé si aucun
    concept coché.
  - **« Annuler »** → `setDraft(null)`.
- Le brouillon vit en state React uniquement (cohérent avec l'absence de persistance
  ailleurs dans l'app pour ce type d'étape).

Guidage contextuel (règle PLAI) : chaque champ du brouillon a un `aria-label` explicite ;
le texte d'en-tête explique la portée de l'action.

### 4.3 Transformation brouillon → nœuds — `appliquerBrouillon()`

Fonction pure extractible dans `src/lib/curriculumDraft.js` pour la testabilité :

```js
// draftToNodes(draft, kept) -> { parents: [{tempId, concept, definition}], enfants: [{tempId, parentTempId|null, concept, definition}] }
```

Règle :

- Pour chaque chapitre dont **au moins un concept est coché** : créer un nœud parent
  (`concept = chapitre.titre`, `definition = ''`, `level = null`, `parent_id = null`).
- Chaque concept coché : nœud enfant. `parent_id` = l'id du nœud chapitre auquel il est
  rattaché *après déplacements de l'enseignant* (peut différer du chapitre d'origine), ou
  `null` s'il est « sans chapitre ».
- Insertion en **2 passes** (les ids parents doivent exister avant les enfants) :
  1. `insert` des parents → récupérer les ids (`.select('id, concept')`).
  2. mapper `parentTempId` → `id` réel, puis `insert` des enfants.
- Ordre d'insertion : parents puis, pour chaque parent, ses enfants dans l'ordre du
  brouillon ; puis les concepts sans chapitre. `created_at` reflète ainsi la séquence
  voulue (le parcours élève lit `order('created_at')`).
- Via l'endpoint `POST /api/curriculum` existant (une requête par nœud) **ou** un `insert`
  groupé Supabase direct (le composant a déjà `supabase` importé et l'utilise pour les
  templates). Choisir l'insert groupé Supabase (2 requêtes au lieu de N) — le RLS
  `corpus_curriculum_nodes` couvre déjà l'écriture par le propriétaire de l'espace.
- Après succès : `setDraft(null)`, `loadNodes()`.

### 4.4 Affichage admin groupé par parent

Aujourd'hui `nodes.map(n => …)` rend une liste plate ([Curriculum.jsx:246](../../src/pages/admin/Curriculum.jsx)).

Nouveau rendu (fonction pure `groupNodes(nodes)` extractible et testable) :

- `parents` = nœuds sans `parent_id` **ayant au moins un enfant**.
- Pour chaque parent : en-tête (titre en gras, style « chapitre »), puis ses enfants
  indentés (`ml-4` / bordure gauche).
- `orphelins` = nœuds sans `parent_id` et sans enfant → rendus comme aujourd'hui, après
  les chapitres.
- Un enfant dont le parent n'existe plus (parent supprimé) → traité comme orphelin (ne
  jamais masquer un nœud).
- Les actions Modifier / Supprimer restent par nœud. Supprimer un parent ne cascade pas
  (les enfants deviennent orphelins) — comportement acceptable, l'enseignant nettoie.

### 4.5 Templates — préservation de `parent_id`

`saveAsTemplate` ([Curriculum.jsx:60](../../src/pages/admin/Curriculum.jsx)) :

```js
const snap = nodes.map((n, i) => ({
  concept: n.concept,
  definition: n.definition,
  level: n.level || null,
  parentIndex: n.parent_id ? nodes.findIndex(x => x.id === n.parent_id) : null,
}))
```

`importTemplate` : insertion en 2 passes —

1. insérer les nœuds `parentIndex === null` → récupérer `id` par index.
2. insérer les nœuds `parentIndex !== null` avec `parent_id` résolu depuis la passe 1.

Rétrocompat : un template sauvegardé avant ce chantier n'a pas de `parentIndex` → traité
comme `null` partout (comportement plat actuel, sans régression).

### 4.6 `chat-init.js` — aucun changement

Dès que `corpus_curriculum_nodes` contient des lignes, SOURCE A s'active
([chat-init.js:58](../../api/chat-init.js)) → `has_curriculum: true` → bilans débloqués.
Les nœuds parents (chapitres) sont renvoyés comme des « notions » au même titre que les
autres (`concept, definition`) — l'élève verra donc le titre de chapitre comme une étape
du parcours. **Point de vigilance** : soit on exclut les nœuds parents de la requête
SOURCE A (`.is('parent_id', 'not null')` ne marche pas — il faut filtrer les nœuds qui
sont parents d'un autre), soit on assume que le titre de chapitre devient une courte étape
de transition. **Décision : filtrer les nœuds parents dans SOURCE A** — ajouter au
`chat-init.js` SOURCE A une exclusion des `id` présents comme `parent_id` d'un autre nœud
du même espace. C'est le seul changement à `chat-init.js`, minimal et nécessaire pour ne
pas polluer le parcours élève avec des titres de chapitre sans contenu.

## 5. Fichiers touchés

| Fichier | Nature |
|---|---|
| `api/curriculum.js` | branche `action: 'generate'` : auth stricte, lecture chunks, appel Haiku, schéma de sortie |
| `api/chat-init.js` | SOURCE A : exclure les nœuds qui sont parents d'un autre nœud |
| `src/pages/admin/Curriculum.jsx` | bouton, panneau brouillon, `appliquerBrouillon`, rendu groupé, templates 2 passes |
| `src/lib/curriculumDraft.js` | **créer** : `draftToNodes`, `groupNodes` (fonctions pures) |
| `src/lib/curriculumDraft.test.js` | **créer** |
| `api/curriculum.test.js` | **créer** : branche generate mockée |
| `package.json` + `vitest.config.js` | **créer/modifier** : ajout Vitest |
| `README.md` | documenter la génération + le plafond 12 fonctions |

Inchangés : schéma Supabase (la table et `parent_id` existent déjà), `Dashboard.jsx`,
`Chat.jsx` (parcours élève), tout le reste de `api/`.

## 6. Tests

Pas d'infra de test dans corpusactif → ajouter Vitest (comme fait pour ProgressActif).

- **`draftToNodes`** : un chapitre avec 2 concepts cochés + 1 décoché → 1 parent + 2
  enfants ; un chapitre sans concept coché → aucun nœud ; concepts déplacés « sans
  chapitre » → `parentTempId: null` ; tous décochés → `{ parents: [], enfants: [] }`.
- **`groupNodes`** : parent + 2 enfants → 1 groupe ; nœud sans parent sans enfant →
  orphelin ; enfant dont le `parent_id` pointe vers un nœud absent → orphelin.
- **`api/curriculum.js` branche generate** (fetch Anthropic mocké) : `action: 'generate'`
  sans auth → 401 ; espace d'un autre user → 403 ; 0 chunk → 400 ; réponse Haiku valide →
  `200 { resultat: { chapitres, concepts_sans_chapitre } }` ; le CRUD existant (GET/POST
  sans `action`) n'est pas cassé.
- **Non testé automatiquement** : la qualité réelle de l'extraction Haiku sur un vrai
  espace — vérification manuelle en prod sur 1-2 espaces après déploiement (comme
  ProgressActif).

## 7. Risques et limites

| Risque | Traitement |
|---|---|
| SDK 0.100.1 sans `output_config` | fallback documenté sur le pattern strip du repo |
| Haiku invente des notions hors contenu | consigne explicite + validation enseignante obligatoire (80/20) ; l'enseignant décoche |
| Espace volumineux (> 120 chunks) | échantillonnage régulier ; documenté ; une passe map-reduce serait un suivi si insuffisant |
| Titre de chapitre pollue le parcours élève | filtré dans `chat-init.js` SOURCE A |
| Ordre des notions instable entre 2 générations | insertion ordonnée ; colonne `position` = suivi propre hors périmètre |
| Suppression d'un parent laisse des enfants orphelins | rendus comme orphelins, jamais masqués ; l'enseignant nettoie |
| Régression sur l'import d'anciens templates | `parentIndex` absent → traité `null`, comportement plat inchangé |

## 8. Décisions ouvertes pour le plan

- `output_config` structuré vs pattern strip — trancher par un appel test SDK à
  l'implémentation.
- Insert groupé Supabase direct depuis le composant vs boucle sur `POST /api/curriculum` —
  le design privilégie l'insert groupé (2 requêtes), à confirmer.
- Emplacement exact du plafond de chunks (120) et de la troncature (500 car.) — ajuster
  selon la taille réelle des chunks observée.
