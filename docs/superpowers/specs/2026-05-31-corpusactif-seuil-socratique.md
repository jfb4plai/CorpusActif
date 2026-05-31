# CorpusActif — Seuil configurable + Mode socratique
Date : 2026-05-31

## Objectif

Deux extensions de CorpusActif modifiant la table `spaces` et le comportement de `/api/chat.js` :

1. **Seuil de similarité configurable par espace** — presets pédagogiques nommés + slider d'affinage pour enseignants avancés
2. **Mode pédagogique socratique** — Claude guide l'apprenant par des questions plutôt que de donner la réponse directement, avec progression en 3 niveaux

---

## 1. Modifications base de données

Deux nouvelles colonnes dans la table `spaces` :

```sql
alter table spaces
  add column similarity_threshold float not null default 0.5
    check (similarity_threshold between 0.1 and 0.9),
  add column pedagogical_mode text not null default 'direct'
    check (pedagogical_mode in ('direct', 'socratique'));
```

Aucune autre table modifiée.

---

## 2. Seuil de similarité

### Presets pédagogiques

| Preset | Valeur | Usage recommandé |
|--------|--------|-----------------|
| Vocabulaire | 0.80 | Définitions, orthographe, langues — correspondance quasi-exacte |
| Compréhension | 0.55 | Sciences, histoire, géographie — reformulations acceptées |
| Exploration | 0.35 | Créativité, projets ouverts — associations larges |

### Interface (SpaceDetail.jsx)

- 3 boutons preset positionnant le slider
- Slider 0.1 → 0.9 affinable manuellement
- Message d'avertissement sous le slider : "Les presets couvrent la majorité des usages. Le curseur est réservé aux enseignants qui souhaitent affiner — une valeur trop basse produit des réponses hors-sujet, une valeur trop haute peut bloquer des reformulations légitimes."
- Tooltips sur chaque preset : description de l'usage concret (pas la valeur numérique)
- Sauvegarde automatique à chaque changement (comme le mode hors-base actuel)

### Impact sur /api/chat.js

Remplace la constante `SIMILARITY_THRESHOLD = 0.5` par la valeur lue depuis `space.similarity_threshold`.

---

## 3. Mode pédagogique socratique

### Interface (SpaceDetail.jsx)

Deux boutons : **Direct** / **Socratique**

Tooltip "Socratique" :
> "Claude guide l'apprenant par des questions plutôt que de donner la réponse directement. Après 5 relances sans progression, un indice est fourni. Après 2 nouveaux blocages, la réponse est donnée en valorisant ce que l'apprenant a déjà compris."

### Progression en 3 niveaux

| Étape | Déclencheur | Comportement Claude |
|-------|-------------|---------------------|
| Relances | Par défaut | Question ancrée dans les ressources |
| Indice 1 | 5 relances sans progression | Indice concret tiré des chunks |
| Indice 2 | 2 blocages après indice 1 | Nouvel indice |
| Réponse finale | 2 blocages après indice 2 | Réponse complète + identification de la dernière bonne intuition de l'apprenant + explication du lien ou de l'étape manquante |

### Mécanisme technique

Le frontend envoie l'historique de la conversation avec chaque requête :
```json
{ "token": "...", "question": "...", "history": [{"role": "user|assistant", "content": "..."}] }
```

`/api/chat.js` analyse l'historique pour compter :
- `relancesCount` : messages assistant sans marqueur `[INDICE]` ni `[RÉPONSE]`
- `indicesCount` : messages assistant contenant le marqueur `[INDICE]`

Ces compteurs sont injectés dans le prompt système.

### Prompt système — mode direct (inchangé)

```
Tu es un assistant pédagogique pour l'espace "[nom]".
Tu réponds uniquement à partir des ressources suivantes :
[chunks]
[instruction hors-base selon mode]
Langue : français. Pas de preamble. Réponses courtes et directes.
Si tu cites une information, indique le titre du document source entre crochets.
```

### Prompt système — mode socratique

```
Tu es un assistant pédagogique socratique pour l'espace "[nom]".
Tu guides l'apprenant vers la réponse par des questions ancrées dans les ressources.

Ressources disponibles :
[chunks]

[instruction hors-base selon mode configuré]

Règles de progression (OBLIGATOIRES) :
- Relances effectuées : [N] / Indices donnés : [N]
- Si indices < 1 et relances < 5 : pose une question de relance courte, ancrée dans les ressources
- Si relances >= 5 et indices < 1 : commence ta réponse par [INDICE] et donne un indice concret tiré des ressources
- Si indices >= 1 et relances_depuis_dernier_indice >= 2 et indices < 2 : commence par [INDICE] et donne un second indice
- Si indices >= 2 et relances_depuis_dernier_indice >= 2 : commence par [RÉPONSE], donne la réponse complète, identifie explicitement la dernière bonne intuition ou réponse partielle de l'apprenant dans la conversation, et explique le lien ou l'étape qu'il doit encore consolider

Langue : français. Pas de preamble. Questions et indices courts.
```

### Logique de comptage dans /api/chat.js

```javascript
function analyzeHistory(history) {
  let relancesCount = 0;
  let indicesCount = 0;
  let relancesSinceLastIndice = 0;

  for (const msg of history) {
    if (msg.role === 'assistant') {
      if (msg.content.startsWith('[INDICE]')) {
        indicesCount++;
        relancesSinceLastIndice = 0;
      } else if (msg.content.startsWith('[RÉPONSE]')) {
        // conversation terminée
      } else {
        relancesCount++;
        relancesSinceLastIndice++;
      }
    }
  }
  return { relancesCount, indicesCount, relancesSinceLastIndice };
}
```

---

## 4. Affichage côté apprenant (Chat.jsx)

- Les marqueurs `[INDICE]` et `[RÉPONSE]` sont retirés du texte affiché
- En mode socratique, un indicateur visuel discret signale le niveau : point teal (relance), point orange (indice), point vert (réponse)
- L'historique complet est envoyé à chaque requête (tableau des messages déjà en mémoire dans le state React)

---

## 5. Compatibilité

- Le mode hors-base (strict/partiel/ouvert) fonctionne indépendamment du mode pédagogique
- Si hors-base → le mode hors-base s'applique, le mode socratique ne change rien
- Les espaces existants reçoivent les valeurs par défaut (threshold 0.5, mode direct) — aucune migration de données

---

## Limites

- Le comptage est basé sur l'analyse textuelle des marqueurs — si Claude oublie d'inclure `[INDICE]`, le compteur sera faux. Le prompt doit insister sur l'obligation des marqueurs.
- L'historique envoyé est limité aux messages en mémoire React (session courante) — si l'apprenant recharge la page, les compteurs repartent à zéro.
- Le mode socratique est plus coûteux en tokens (historique + prompt plus long).
