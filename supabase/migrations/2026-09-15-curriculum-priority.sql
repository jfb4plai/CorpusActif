-- Ajoute une priorité pédagogique par concept (essentiel / complémentaire).
-- À EXÉCUTER MANUELLEMENT dans Supabase → SQL Editor, projet CorpusActif
-- (dfoaumjleqtxjeaplnna — celui pointé par SUPABASE_URL / VITE_SUPABASE_URL).
--
-- L'enseignant choisit, concept par concept, ceux qui sont essentiels (ordonnés
-- en premier dans le parcours élève, priorisés dans l'alerte de remédiation du
-- tableau de bord) et ceux qui sont complémentaires. Défaut 'essentiel' pour ne
-- rien changer au comportement des curriculums existants.

alter table corpus_curriculum_nodes
  add column priority text not null default 'essentiel'
  check (priority in ('essentiel', 'complementaire'));
