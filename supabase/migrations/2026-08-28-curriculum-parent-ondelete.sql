-- Supprimer un nœud parent (chapitre) laisse ses enfants orphelins plutôt que d'échouer.
-- À EXÉCUTER MANUELLEMENT dans Supabase → SQL Editor, projet CorpusActif
-- (dfoaumjleqtxjeaplnna — celui pointé par SUPABASE_URL / VITE_SUPABASE_URL,
-- où vivent les tables corpus_*), AVANT tout déploiement de cette branche.
-- Ce n'est PAS le projet FlashFWB (otiorljbujqzruulmqrs, decks/cards uniquement).
-- Sans cette migration, api/curriculum.js DELETE renvoie 500 (violation FK)
-- dès qu'on supprime un chapitre ayant des concepts enfants.
--
-- La table a été renommée depuis « curriculum_nodes » (migration 2026-07-20) ;
-- Postgres ne renomme pas les contraintes lors d'un RENAME TABLE, donc la FK
-- parent_id peut porter un nom hérité. Le bloc DO la retrouve par sa colonne.

do $$
declare cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_attribute att
    on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where con.conrelid = 'corpus_curriculum_nodes'::regclass
    and con.contype = 'f'
    and att.attname = 'parent_id';

  if cname is not null then
    execute format('alter table corpus_curriculum_nodes drop constraint %I', cname);
  end if;
end $$;

alter table corpus_curriculum_nodes
  add constraint corpus_curriculum_nodes_parent_id_fkey
  foreign key (parent_id) references corpus_curriculum_nodes(id) on delete set null;
