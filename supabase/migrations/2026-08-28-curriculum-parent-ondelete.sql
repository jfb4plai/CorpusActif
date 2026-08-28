-- Supprimer un nœud parent (chapitre) laisse ses enfants orphelins plutôt que d'échouer.
-- À EXÉCUTER MANUELLEMENT sur le projet Supabase partagé « Flashfwb »
-- (otiorljbujqzruulmqrs) AVANT tout déploiement de cette branche.
-- Sans cette migration, api/curriculum.js DELETE renvoie 500 (violation FK)
-- dès qu'on supprime un chapitre ayant des concepts enfants.

alter table corpus_curriculum_nodes
  drop constraint corpus_curriculum_nodes_parent_id_fkey;

alter table corpus_curriculum_nodes
  add constraint corpus_curriculum_nodes_parent_id_fkey
  foreign key (parent_id) references corpus_curriculum_nodes(id) on delete set null;
