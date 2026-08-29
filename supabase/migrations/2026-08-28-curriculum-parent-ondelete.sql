-- Supprimer un nœud parent (chapitre) laisse ses enfants orphelins plutôt que d'échouer.
-- À EXÉCUTER MANUELLEMENT dans Supabase → SQL Editor, projet CorpusActif
-- (dfoaumjleqtxjeaplnna — celui pointé par SUPABASE_URL / VITE_SUPABASE_URL,
-- où vivent les tables corpus_*), AVANT tout déploiement de cette branche.
-- Ce n'est PAS le projet FlashFWB (otiorljbujqzruulmqrs, decks/cards uniquement).
-- Sans cette migration, api/curriculum.js DELETE renvoie 500 (violation FK)
-- dès qu'on supprime un chapitre ayant des concepts enfants.

alter table corpus_curriculum_nodes
  drop constraint corpus_curriculum_nodes_parent_id_fkey;

alter table corpus_curriculum_nodes
  add constraint corpus_curriculum_nodes_parent_id_fkey
  foreign key (parent_id) references corpus_curriculum_nodes(id) on delete set null;
