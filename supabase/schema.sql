-- ============================================================
-- CorpusActif — schéma (projet Supabase MUTUALISÉ Flashfwb)
-- Toutes les tables sont préfixées corpus_ (règle PLAI absolue).
-- ============================================================

-- Extension pgvector
create extension if not exists vector;

-- Spaces
create table corpus_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  out_of_base_mode text not null default 'partiel'
    check (out_of_base_mode in ('strict', 'partiel', 'ouvert')),
  similarity_threshold float not null default 0.5
    check (similarity_threshold between 0.1 and 0.9),
  pedagogical_mode text not null default 'direct'
    check (pedagogical_mode in ('direct', 'socratique')),
  socratic_relances_threshold int not null default 5
    check (socratic_relances_threshold between 2 and 10),
  class_acquisition_threshold float not null default 0.30
    check (class_acquisition_threshold between 0 and 1),
  niveau text,
  matiere text,
  flashcard_deck_id uuid,
  created_at timestamptz default now()
);
alter table corpus_spaces enable row level security;
create policy "corpus_spaces_owner" on corpus_spaces for all using (auth.uid() = user_id);

-- Documents
create table corpus_documents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  user_id uuid references auth.users not null,
  title text not null,
  type text not null,
  created_at timestamptz default now()
);
alter table corpus_documents enable row level security;
create policy "corpus_documents_owner" on corpus_documents for all using (auth.uid() = user_id);

-- Chunks
create table corpus_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references corpus_documents on delete cascade not null,
  space_id uuid references corpus_spaces on delete cascade not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);
alter table corpus_chunks enable row level security;
create policy "corpus_chunks_owner" on corpus_chunks for all using (
  space_id in (select id from corpus_spaces where user_id = auth.uid())
);

-- Curriculum nodes
create table corpus_curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  concept text not null,
  definition text not null,
  level text,
  parent_id uuid references corpus_curriculum_nodes,
  created_at timestamptz default now()
);
alter table corpus_curriculum_nodes enable row level security;
create policy "corpus_curriculum_nodes_owner" on corpus_curriculum_nodes for all using (
  space_id in (select id from corpus_spaces where user_id = auth.uid())
);

-- Learner codes
create table corpus_learner_codes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  code text not null,
  difficulties text,
  difficulties_updated_at timestamptz,
  created_at timestamptz default now(),
  unique(space_id, code)
);
alter table corpus_learner_codes enable row level security;
create policy "corpus_learner_codes_owner" on corpus_learner_codes for all using (
  space_id in (select id from corpus_spaces where user_id = auth.uid())
);

-- Sessions (apprenant)
create table corpus_sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  learner_code text,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table corpus_sessions enable row level security;
create policy "corpus_sessions_owner" on corpus_sessions for all using (
  space_id in (select id from corpus_spaces where user_id = auth.uid())
);
-- Accès service role pour /api/chat.js (validation token)
create policy "corpus_sessions_service" on corpus_sessions for select using (true);

-- Messages
create table corpus_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references corpus_sessions on delete cascade not null,
  space_id uuid references corpus_spaces not null,
  learner_code text,
  question text not null,
  answer text not null,
  is_out_of_base boolean default false,
  helpful boolean,
  notion_concept text,
  notion_acquired boolean,
  created_at timestamptz default now()
);
alter table corpus_messages enable row level security;
create policy "corpus_messages_owner" on corpus_messages for all using (
  space_id in (select id from corpus_spaces where user_id = auth.uid())
);
create policy "corpus_messages_service" on corpus_messages for insert with check (true);

-- Fonction de recherche par similarité cosinus
create or replace function corpus_match_chunks(
  query_embedding vector(1024),
  match_space_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  document_id uuid,
  similarity float
)
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

-- Passerelle RetroActif
create table corpus_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  eleve_code text not null,
  space_name text,
  points_forts text not null,
  difficultes text not null,
  infos_complementaires text,
  niveau text,
  matiere text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz default now()
);
alter table corpus_handoffs enable row level security;
create policy "corpus_handoffs_owner" on corpus_handoffs
  for all using (auth.uid() = user_id);

-- Connexions aux savoirs antérieurs (fin de notion)
create table corpus_notion_connections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  learner_code text,
  notion_concept text not null,
  connection_text text,
  skipped boolean not null default false,
  created_at timestamptz default now()
);
alter table corpus_notion_connections enable row level security;
create policy "corpus_notion_connections_owner" on corpus_notion_connections
  for all using (space_id in (select id from corpus_spaces where user_id = auth.uid()));
create policy "corpus_notion_connections_service" on corpus_notion_connections
  for insert with check (true);

-- Templates de curriculum (strictement personnels)
create table corpus_curriculum_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  nodes jsonb not null default '[]',
  created_at timestamptz default now()
);
alter table corpus_curriculum_templates enable row level security;
create policy "corpus_curriculum_templates_owner" on corpus_curriculum_templates
  for all using (auth.uid() = user_id);
