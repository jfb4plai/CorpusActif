-- ============================================================
-- CorpusActif — préfixage des tables (projet mutualisé Flashfwb)
-- À exécuter dans Supabase → SQL Editor, EN UNE SEULE FOIS.
-- Renommer suit automatiquement les policies RLS, index et clés étrangères.
-- ============================================================

-- (Optionnel) Vérification préalable : confirmer que 'sessions' est bien
-- la table de CorpusActif. Doit lister : token, expires_at, space_id, learner_code.
-- Si elle liste des colonnes de dictée → NE PAS renommer sessions, me prévenir.
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'sessions';

alter table spaces               rename to corpus_spaces;
alter table documents            rename to corpus_documents;
alter table chunks               rename to corpus_chunks;
alter table curriculum_nodes     rename to corpus_curriculum_nodes;
alter table learner_codes        rename to corpus_learner_codes;
alter table sessions             rename to corpus_sessions;
alter table messages             rename to corpus_messages;
alter table handoffs             rename to corpus_handoffs;
alter table curriculum_templates rename to corpus_curriculum_templates;

-- Recréer la fonction de recherche vectorielle avec le nouveau nom de table
drop function if exists match_chunks(vector, uuid, float, int);
create or replace function corpus_match_chunks(
  query_embedding vector(1024),
  match_space_id uuid,
  match_threshold float,
  match_count int
)
returns table (id uuid, content text, document_id uuid, similarity float)
language sql stable
as $$
  select
    c.id,
    c.content,
    c.document_id,
    1 - (c.embedding <=> query_embedding) as similarity
  from corpus_chunks c
  where c.space_id = match_space_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
