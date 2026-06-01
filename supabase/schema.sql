-- Extension pgvector
create extension if not exists vector;

-- Spaces
create table spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  out_of_base_mode text not null default 'partiel'
    check (out_of_base_mode in ('strict', 'partiel', 'ouvert')),
  created_at timestamptz default now()
);
alter table spaces enable row level security;
create policy "spaces_owner" on spaces for all using (auth.uid() = user_id);

-- Documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces on delete cascade not null,
  user_id uuid references auth.users not null,
  title text not null,
  type text not null,
  created_at timestamptz default now()
);
alter table documents enable row level security;
create policy "documents_owner" on documents for all using (auth.uid() = user_id);

-- Chunks
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents on delete cascade not null,
  space_id uuid references spaces on delete cascade not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);
alter table chunks enable row level security;
create policy "chunks_owner" on chunks for all using (
  space_id in (select id from spaces where user_id = auth.uid())
);

-- Curriculum nodes
create table curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces on delete cascade not null,
  concept text not null,
  definition text not null,
  level text,
  parent_id uuid references curriculum_nodes,
  created_at timestamptz default now()
);
alter table curriculum_nodes enable row level security;
create policy "curriculum_owner" on curriculum_nodes for all using (
  space_id in (select id from spaces where user_id = auth.uid())
);

-- Learner codes
create table learner_codes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces on delete cascade not null,
  code text not null,
  created_at timestamptz default now(),
  unique(space_id, code)
);
alter table learner_codes enable row level security;
create policy "learner_codes_owner" on learner_codes for all using (
  space_id in (select id from spaces where user_id = auth.uid())
);

-- Sessions (apprenant)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces on delete cascade not null,
  learner_code text,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table sessions enable row level security;
create policy "sessions_owner" on sessions for all using (
  space_id in (select id from spaces where user_id = auth.uid())
);
-- Accès service role pour /api/chat.js (validation token)
create policy "sessions_service" on sessions for select using (true);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade not null,
  space_id uuid references spaces not null,
  learner_code text,
  question text not null,
  answer text not null,
  is_out_of_base boolean default false,
  created_at timestamptz default now()
);
alter table messages enable row level security;
create policy "messages_owner" on messages for all using (
  space_id in (select id from spaces where user_id = auth.uid())
);
create policy "messages_service" on messages for insert with check (true);

-- Fonction de recherche par similarité cosinus
create or replace function match_chunks(
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
  from chunks c
  where c.space_id = match_space_id
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Migration : seuil de similarité configurable + mode pédagogique
alter table spaces
  add column if not exists similarity_threshold float not null default 0.5
    check (similarity_threshold between 0.1 and 0.9),
  add column if not exists pedagogical_mode text not null default 'direct'
    check (pedagogical_mode in ('direct', 'socratique'));

-- Migration : contexte pédagogique + passerelle RetroActif
alter table spaces
  add column if not exists niveau text,
  add column if not exists matiere text;

create table if not exists handoffs (
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
alter table handoffs enable row level security;
create policy "handoffs_owner" on handoffs
  for all using (auth.uid() = user_id);

-- Lien vers le deck FlashFWB généré depuis cet espace
alter table spaces
  add column if not exists flashcard_deck_id uuid;
