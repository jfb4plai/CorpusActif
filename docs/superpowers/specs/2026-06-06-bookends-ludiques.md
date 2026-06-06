# Bookends ludiques — CorpusActif

## Contexte pédagogique

L'app est utilisée sur la base du volontariat. L'engagement durable repose sur la motivation intrinsèque, pas sur les récompenses extrinsèques. Les mécaniques conçues ici informent l'apprenant sur sa progression — elles ne le récompensent pas pour sa présence.

**Fondements RISS :**
- Tricot (1998, edutice-00000081) : exclure tout élément visuel superflu pendant la tâche cognitive (charge extrinsèque)
- Louvet & Basile (2023, W4327813725) : la continuité perçue soutient la motivation autodéterminée
- Georget & Amourdom (2025, dumas-05110873) : situer ses acquis dans la structure totale produit un sentiment de compétence durable
- Tremblay et al. (2025, W4410983326) : une rétroaction personnalisée immédiate produit un effet sur la motivation à poursuivre
- Bofala (2022, tel-03895804) + Gernigon (1998, hal-02166286) : les récompenses extrinsèques continues risquent de déplacer l'objectif de l'apprentissage vers l'accumulation (effet de surjustification) — éviter points visibles en continu et classements

**Architecture temporelle retenue : option A (bookends)**
- Aucun élément visuel de progression pendant la session (zéro charge extrinsèque)
- Rappel au chargement (activation des acquis antérieurs, amorçage)
- Carte de notions + message de clôture en fin de parcours (consolidation + tension Zeigarnik)

---

## Composant 1 — Rappel d'ouverture

### Déclenchement
Au chargement de la session socratique, si le learner_code a déjà des messages enregistrés dans cet espace (même `space_id`, même `learner_code`). Injecté comme premier message dans le fil de chat, avant l'ouverture de la première notion.

Pas de rappel si c'est la première session de ce code sur cet espace.

### Données requises
`api/chat-init.js` renvoie deux nouveaux champs :
```json
{
  "previous_notions": [
    { "concept": "Photosynthèse", "acquired": true },
    { "concept": "Chlorophylle", "acquired": true },
    { "concept": "Respiration", "acquired": false },
    { "concept": "ATP", "acquired": null }
  ],
  "last_session_date": "2026-06-03T14:22:00Z"
}
```

`previous_notions` : dernière valeur `notion_acquired` par concept pour ce learner_code × space_id.
`last_session_date` : `created_at` du message le plus récent de ce learner_code dans cet espace.

### Contenu du message
Un message injecté dans `messages` avec `isRecap: true`. Contient :
- Durée depuis la dernière session (formatée en français : "hier", "il y a 3 jours", "la semaine dernière")
- Liste des notions avec état visuel (chip teal = acquis, chip gris = non acquis / non encore vu)
- Phrase fixe de relance ("Il t'en reste N. Reprends où tu t'étais arrêté.")

Pas d'appel IA — texte calculé côté client depuis `previous_notions` et `last_session_date`.

### Style visuel
Carte pleine-largeur centrée. Rompt avec l'esthétique bulle de chat.
- Fond blanc, border-left 3px teal, border-radius 4px
- Titre "Bon retour." en Inter 700 teal
- Chips notion : teal plein (acquis) / gris clair (non acquis)
- Texte de relance en gris foncé, taille sm

### Règle d'affichage
Visible une seule fois par chargement de session. Pas de fermeture manuelle — fait partie du fil de chat comme un message ordinaire (non interactif).

---

## Composant 2 — Carte de notions

### Déclenchement
Quand `openNotion(notionsList, index)` est appelé avec `index >= notionsList.length` (fin du parcours). Injectée dans le fil avant le message de clôture.

### Données requises
Calculé depuis les messages de la session courante en mémoire (pas de requête Supabase supplémentaire) :
- Notion acquise sans indice = `notion_acquired: true` sans `[INDICE]` dans l'historique pour cette notion
- Notion acquise avec indice = `notion_acquired: true` avec au moins un `[INDICE]` pour cette notion
- Notion non acquise = `notion_acquired: false` ou `[RÉPONSE]` donné

### Contenu du message
Message injecté avec `isNotionMap: true`. Contient :
- Label uppercase "TON PARCOURS"
- Grille de chips, un par notion, trois états :
  - Teal plein + ✓ : acquis sans indice (maîtrise)
  - Teal clair + ~ : acquis avec indice (compris avec aide)
  - Orange + ✗ : non acquis (à retravailler)
- Ligne de synthèse : "N maîtrisées · N comprises · N à retravailler"
- Si `flashDeckId` présent : lien "Réviser dans FlashFWB →"

### Style visuel
Carte pleine-largeur centrée.
- Fond `#f0fdf4` (vert très clair), border-left 3px teal, border-radius 4px
- Label uppercase teal
- Chips inline, 3 variantes de couleur
- Synthèse en gris foncé sm

---

## Composant 3 — Message de clôture personnalisé

### Déclenchement
Immédiatement après la carte de notions (même moment, injection séquentielle). Requiert un appel à `api/chat-debrief.js`.

### Endpoint : `api/chat-debrief.js`
**Input (POST) :**
```json
{
  "token": "...",
  "notions_acquired": ["Photosynthèse", "Chlorophylle"],
  "notions_with_hint": ["Respiration"],
  "notions_failed": ["ATP", "Cycle de Calvin"],
  "session_messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Validation :** JWT vérifié comme dans `/api/chat`. Session vérifiée dans `sessions`.

**Prompt Haiku :**
```
Tu es un assistant pédagogique. Une session vient de se terminer.

Notions maîtrisées sans aide : [liste]
Notions comprises avec indice : [liste]
Notions non acquises : [liste]

Extraits de la session :
[3-5 échanges significatifs — questions de l'apprenant + réponses assistant tronquées à 100 chars]

Écris un message court (3-5 phrases maximum) à l'apprenant :
- Identifie une formulation ou question de sa part qui a montré une vraie compréhension — cite-la entre guillemets si possible
- Nomme ce qui reste à consolider sans dramatiser
- Ne commence pas par "Bravo", "Bien joué", "Super" ou tout adverbe approbateur
- Pas de preamble. Français direct.
```

**Output :**
```json
{ "debrief": "Tu as su expliquer la différence entre..." }
```

### Style visuel
Carte pleine-largeur centrée.
- Fond `#fff7ed` (orange très clair), border-left 3px orange `#f97316`, border-radius 4px
- Texte Inter 400, taille sm, couleur `#1a1814`
- Pas de titre, pas de label — le message parle directement

### Gestion d'erreur
Si l'appel Haiku échoue : afficher un message de secours côté client ("Parcours terminé. Bien joué.") sans bloquer l'expérience.

---

## Modifications de fichiers

| Fichier | Modification |
|---------|-------------|
| `api/chat-init.js` | Ajouter `previous_notions` et `last_session_date` dans la réponse |
| `api/chat-debrief.js` | Nouveau endpoint — génération message de clôture Haiku |
| `src/pages/learner/Chat.jsx` | Injection `isRecap` au chargement, `isNotionMap` + appel debrief en fin de parcours |
| `src/components/ChatMessage.jsx` | Deux nouveaux rendus : `isRecap` et `isNotionMap` et `isDebrief` |

**Aucune nouvelle table Supabase.** Tout s'appuie sur `messages.notion_acquired`, `messages.answer`, `messages.created_at`.

---

## Ce qui ne change pas

- Aucun élément visuel de progression pendant la session (principe de charge cognitive)
- Aucun point, aucun classement, aucune comparaison entre apprenants
- Codes anonymes — la carte de notions est privée, locale à la session
- Le rappel n'apparaît qu'en mode socratique (les notions n'existent que dans ce mode)

---

## Évaluation — Proposition 5 (Défi de consolidation)

Cohérente pédagogiquement : le quiz auto-déclenché après un parcours complet est la mécanique la plus proche de l'effet de test documenté (récupération active en mémoire à long terme). Bofala (2022) le confirme : quand l'apprenant choisit lui-même d'être mis à l'épreuve, l'autonomie perçue est préservée et l'effet d'apprentissage est maximal.

**Prérequis pour l'implémenter :** les bookends (ce spec) doivent être en place. Le défi de consolidation s'active logiquement depuis le message de clôture ("Veux-tu tester ce que tu viens d'apprendre ?").

**Complexité estimée :** élevée — nouvel endpoint `/api/quiz-gen`, nouvelle table `quiz_attempts`, nouveau mode dans Chat.jsx. À traiter dans un spec séparé une fois les bookends livrés.
