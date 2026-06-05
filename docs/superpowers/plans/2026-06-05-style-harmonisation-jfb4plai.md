# Style Harmonisation jfb4plai — CorpusActif

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmoniser le style de CorpusActif avec jfb4plai.com : Inter en remplacement de DM Sans/DM Serif, border-radius réduit à 4px, motif border-left teal sur les éléments structurants, labels uppercase.

**Architecture:** Modifications purement CSS/Tailwind — aucune logique métier touchée. Chaque tâche couvre un fichier ou un groupe cohérent. L'expérience chat apprenant conserve ses bulles arrondies (`rounded-2xl`).

**Tech Stack:** React 18, Tailwind CSS v3, Google Fonts (Inter)

---

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `index.html` | Remplacer DM Serif Display + DM Sans par Inter |
| `src/index.css` | font-family body/h1-h3, supprimer DM Serif Display |
| `src/pages/admin/AdminLayout.jsx` | Titre nav Inter bold, supprimer fontFamily inline |
| `src/pages/admin/Login.jsx` | rounded-lg → rounded, supprimer DM Serif Display inline |
| `src/pages/admin/Spaces.jsx` | rounded-lg → rounded, border-left sur cards, badge rounded |
| `src/pages/admin/SpaceDetail.jsx` | Labels uppercase sur sections, border-left sur panels, rounded-lg → rounded |
| `src/pages/admin/Dashboard.jsx` | Labels uppercase sur headings, border-left sur StatCards |
| `src/pages/admin/Curriculum.jsx` | rounded-lg → rounded, boutons rounded |
| `src/pages/admin/Documents.jsx` | rounded-lg → rounded |
| `src/pages/admin/LearnerCodes.jsx` | rounded-lg → rounded |
| `src/pages/learner/Chat.jsx` | rounded-full inputs → rounded, header inchangé |
| `src/components/ChatMessage.jsx` | Bulles chat conservées (rounded-2xl), tags rounded |
| `src/components/DocumentUpload.jsx` | rounded-lg → rounded, boutons rounded |

---

## Task 1 — Fond typographique : Inter dans index.html et index.css

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`

- [ ] **Remplacer le lien Google Fonts dans index.html**

```html
<!-- Remplacer la ligne existante -->
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

<!-- Par -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- [ ] **Mettre à jour index.css**

```css
/* Remplacer le contenu intégral par : */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #faf9f7;
  --surface: #ffffff;
  --surface2: #f4f2ee;
  --border: #e8e4dd;
  --border2: #d4cfc6;
  --text: #1a1814;
  --text2: #5a564f;
  --text3: #9a958c;
  --teal: #0a9370;
  --orange: #f97316;
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
}

h1, h2, h3 {
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.02em;
}

input, textarea, select, button {
  font-family: 'Inter', system-ui, sans-serif;
}

.label-upper {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--teal);
}
```

- [ ] **Vérifier le build**

```bash
cd corpusactif && npm run build
```
Attendu : build sans erreur.

- [ ] **Commit**

```bash
git add index.html src/index.css
git commit -m "style: Inter remplace DM Sans/DM Serif Display, classe label-upper"
```

---

## Task 2 — AdminLayout : titre nav et suppression font inline

**Files:**
- Modify: `src/pages/admin/AdminLayout.jsx`

- [ ] **Remplacer le span du titre nav** (ligne 31)

```jsx
// Avant
<span style={{fontFamily:'DM Serif Display, serif', fontSize:'1.2rem', fontWeight:400}}>CorpusActif</span>

// Après
<span className="text-base font-semibold tracking-tight">CorpusActif</span>
```

- [ ] **Commit**

```bash
git add src/pages/admin/AdminLayout.jsx
git commit -m "style: AdminLayout — Inter bold sur titre nav"
```

---

## Task 3 — Login : arrondi + suppression DM Serif

**Files:**
- Modify: `src/pages/admin/Login.jsx`

- [ ] **Remplacer le container card** (ligne 21)

```jsx
// Avant
<div className="p-10 rounded-2xl w-full max-w-sm" style={{...}}>

// Après
<div className="p-10 w-full max-w-sm" style={{backgroundColor:'var(--surface)', border:'1px solid var(--border)', borderRadius:'4px', boxShadow:'0 2px 16px rgba(0,0,0,0.06)'}}>
```

- [ ] **Remplacer le h1** (ligne 23)

```jsx
// Avant
<h1 className="mb-1" style={{fontFamily:'DM Serif Display, serif', fontSize:'1.6rem', fontWeight:400, color:'var(--text)'}}>CorpusActif</h1>

// Après
<h1 className="mb-1 text-2xl font-bold tracking-tight" style={{color:'var(--text)'}}>CorpusActif</h1>
```

- [ ] **Remplacer les classes rounded des inputs et du bouton** (lignes 31, 41, 47)

```jsx
// Inputs : rounded-lg → rounded (= 4px Tailwind)
className="w-full rounded px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"

// Bouton submit
className="w-full py-2.5 rounded text-sm font-semibold transition"
```

- [ ] **Commit**

```bash
git add src/pages/admin/Login.jsx
git commit -m "style: Login — Inter bold, border-radius 4px"
```

---

## Task 4 — Spaces : cards avec border-left teal, arrondi réduit

**Files:**
- Modify: `src/pages/admin/Spaces.jsx`

- [ ] **Titre h1** (ligne 39)

```jsx
// Avant
<h1 className="text-2xl font-semibold text-gray-800 mb-6">Mes espaces</h1>

// Après
<h1 className="text-2xl font-bold tracking-tight mb-1" style={{color:'var(--text)'}}>Mes espaces</h1>
```

- [ ] **Input + bouton du formulaire** (lignes 43–50)

```jsx
<input
  value={newName}
  onChange={e => setNewName(e.target.value)}
  placeholder="Ex : La photosynthèse, Les fractions…"
  className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
/>
<button type="submit" className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-semibold hover:bg-teal-700">
  Créer
</button>
```

- [ ] **Cards espaces** (ligne 54) — border-left teal, rounded réduit

```jsx
<div
  key={s.id}
  className="bg-white p-4 flex items-center justify-between hover:shadow-sm transition"
  style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}
>
```

- [ ] **Badge socratique** (ligne 63) — rounded-full → rounded

```jsx
<span className="inline-block text-xs bg-orange-100 text-orange-700 rounded px-2 py-0.5 ml-2 font-medium">Socratique</span>
```

- [ ] **Commit**

```bash
git add src/pages/admin/Spaces.jsx
git commit -m "style: Spaces — border-left teal, Inter, border-radius 4px"
```

---

## Task 5 — SpaceDetail : labels uppercase + panels border-left

**Files:**
- Modify: `src/pages/admin/SpaceDetail.jsx`

- [ ] **Labels des sections de configuration** — remplacer les `<p className="text-sm font-medium text-gray-700 mb-3">` par le motif uppercase sur : "Seuil de similarité", "Mode pédagogique", "Contexte pédagogique"

```jsx
// Pattern à appliquer sur chaque label de section
<p className="label-upper mb-3">Seuil de similarité</p>
<p className="label-upper mb-3">Mode pédagogique</p>
<p className="label-upper mb-3">Contexte pédagogique</p>
```

- [ ] **Panels bg-white border rounded-lg** — remplacer `rounded-lg` par `rounded` ET ajouter `borderLeft:'3px solid var(--teal)'` en style inline sur les deux panels principaux (Seuil de similarité et Mode pédagogique)

```jsx
// Panel seuil (ligne ~176)
<div className="bg-white border rounded p-4 mb-4" style={{borderLeft:'3px solid var(--teal)'}}>

// Panel mode pédagogique (ligne ~210)
<div className="bg-white border rounded p-4" style={{borderLeft:'3px solid var(--teal)'}}>

// Panel contexte pédagogique (ligne ~259)
<div className="bg-white border rounded p-4 mt-4" style={{borderLeft:'3px solid var(--teal)'}}>
```

- [ ] **Tous les boutons rounded-full → rounded** dans SpaceDetail (boutons hors-base, presets, mode pédagogique, rythme, Sauvegarder/Importer modèle)

Chercher et remplacer dans le fichier :
- `rounded-full` → `rounded` (sauf si c'est un avatar ou logo)
- Conserver `rounded-full` uniquement sur les `span` qui sont des pastilles de progression (notionIndex badge dans le header Chat)

- [ ] **Commit**

```bash
git add src/pages/admin/SpaceDetail.jsx
git commit -m "style: SpaceDetail — labels uppercase, border-left teal, border-radius 4px"
```

---

## Task 6 — Dashboard : labels uppercase + StatCards border-left

**Files:**
- Modify: `src/pages/admin/Dashboard.jsx`

- [ ] **Headings des sections** — remplacer les `<h3 className="text-sm font-semibold text-gray-700 mb-3">` par le motif uppercase

```jsx
// Avant
<h3 className="text-sm font-semibold text-gray-700 mb-3">Questions bloquées</h3>
<h3 className="text-sm font-semibold text-gray-700 mb-3">Par code apprenant</h3>
<h3 className="text-sm font-semibold text-gray-700 mb-3">Acquisition par notion</h3>

// Après
<h3 className="label-upper mb-3">Questions bloquées</h3>
<h3 className="label-upper mb-3">Par code apprenant</h3>
<h3 className="label-upper mb-3">Acquisition par notion</h3>
```

- [ ] **StatCard** — ajouter border-left teal

```jsx
function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white px-4 py-4" style={{border:'1px solid var(--border)', borderLeft:'3px solid var(--teal)', borderRadius:'4px'}}>
      <p className="text-2xl font-bold" style={{color:'var(--teal)'}}>{value}</p>
      <p className="text-xs mt-1" style={{color:'var(--text3)'}}>{label}</p>
      {sub && <p className="text-xs" style={{color:'var(--text3)'}}>{sub}</p>}
    </div>
  );
}
```

- [ ] **Cards "Questions bloquées"** — rounded-lg → rounded

```jsx
<div key={q} className="flex items-start gap-3 bg-white border rounded px-4 py-2">
```

- [ ] **Details cards "Par code apprenant"** — rounded-lg → rounded

```jsx
<details key={code} className="bg-white border rounded">
```

- [ ] **Commit**

```bash
git add src/pages/admin/Dashboard.jsx
git commit -m "style: Dashboard — labels uppercase, StatCards border-left teal, border-radius 4px"
```

---

## Task 7 — Curriculum, Documents, LearnerCodes : nettoyage arrondi

**Files:**
- Modify: `src/pages/admin/Curriculum.jsx`
- Modify: `src/pages/admin/Documents.jsx`
- Modify: `src/pages/admin/LearnerCodes.jsx`

- [ ] **Curriculum.jsx** — remplacer tous les `rounded-lg` par `rounded`, `rounded-full` par `rounded` sur boutons et inputs

Chercher dans le fichier : `rounded-lg` → `rounded` / `rounded-full` → `rounded` (boutons uniquement)

- [ ] **Documents.jsx** — même transformation

```jsx
// Ligne ~29
<div key={doc.id} className="flex items-center justify-between bg-white border rounded px-4 py-3">
```

- [ ] **LearnerCodes.jsx** — même transformation sur les cards et boutons. Conserver `rounded-full` uniquement sur les QR code display circles si présents.

- [ ] **Commit**

```bash
git add src/pages/admin/Curriculum.jsx src/pages/admin/Documents.jsx src/pages/admin/LearnerCodes.jsx
git commit -m "style: Curriculum/Documents/LearnerCodes — border-radius 4px"
```

---

## Task 8 — Chat apprenant : input + header, bulles conservées

**Files:**
- Modify: `src/pages/learner/Chat.jsx`
- Modify: `src/components/ChatMessage.jsx`
- Modify: `src/components/DocumentUpload.jsx`

- [ ] **Chat.jsx — input message** : `rounded-full` → `rounded` sur le champ de saisie uniquement. Le bouton "Envoyer" aussi.

```jsx
// Input (ligne ~260)
className="flex-1 border rounded px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"

// Bouton Envoyer (ligne ~267)
className="bg-[#0a9370] text-white px-5 py-2 rounded text-sm font-semibold disabled:opacity-50"
```

- [ ] **Chat.jsx — badge Socratique dans le header** : conserver `rounded-full` (pastille — exception justifiée)

- [ ] **Chat.jsx — formulaire code apprenant** : `rounded` sur input et bouton

```jsx
// Input code (ligne ~196)
className="w-full border rounded px-3 py-2 text-sm mb-3"

// Bouton Commencer
className="w-full bg-[#0a9370] text-white py-2 rounded text-sm font-semibold"
```

- [ ] **ChatMessage.jsx — bulles de chat** : CONSERVER `rounded-2xl` — exception justifiée pour la lisibilité conversationnelle. Ne pas toucher.

- [ ] **ChatMessage.jsx — indicateurs socratiques** : tag `rounded-full` → `rounded` sur les tags et feedback buttons si présents (les boutons ✓ Utile / ✗ Pas clair sont du texte, pas de containers)

- [ ] **DocumentUpload.jsx — boutons mode** : `rounded` déjà en place pour certains, vérifier cohérence

```jsx
// Bouton Importer
className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50 shrink-0"
```

- [ ] **Commit**

```bash
git add src/pages/learner/Chat.jsx src/components/ChatMessage.jsx src/components/DocumentUpload.jsx
git commit -m "style: Chat/ChatMessage/DocumentUpload — border-radius 4px, bulles chat préservées"
```

---

## Task 9 — Build final et push

- [ ] **Build de vérification**

```bash
cd corpusactif && npm run build
```
Attendu : 0 erreur, 0 warning TypeScript/JSX.

- [ ] **Vérification visuelle rapide avec vercel dev**

```bash
vercel dev
```
Ouvrir http://localhost:3000 — vérifier :
- Login : Inter, pas de serif, bords à 4px
- Liste espaces : border-left teal visible sur les cards
- SpaceDetail : labels uppercase en teal, panels avec border-left
- Dashboard : StatCards avec border-left, headings uppercase
- Chat : input et bouton carrés, bulles toujours arrondies

- [ ] **Push**

```bash
git push origin main
```

---

## Résultat attendu

| Avant | Après |
|-------|-------|
| DM Sans + DM Serif Display | Inter 400/500/600/700 |
| Titres décoratifs serif | Titres Inter 700 tracking-tight |
| border-radius 8-16px sur cards | border-radius 4px |
| Boutons pills rounded-full | Boutons rounded 4px |
| Aucun motif de mise en valeur | border-left: 3px teal sur panels et cards |
| Labels texte gris | Labels uppercase 10px teal |
| Bulles chat 16px | Bulles chat 16px (conservé) |
