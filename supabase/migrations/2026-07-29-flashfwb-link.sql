-- ============================================================
-- CorpusActif — liaison explicite du compte enseignant vers FlashFWB
-- Option 3 : l'enseignant se connecte/s'inscrit une fois sur FlashFWB
-- depuis CorpusActif ; on retient son user_id du projet FlashFWB.
-- À exécuter dans Supabase → SQL Editor (projet CorpusActif, dfoaumjleqtxjeaplnna).
-- ============================================================

create table corpus_flashfwb_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  flashfwb_user_id uuid not null,
  linked_at timestamptz not null default now()
);

alter table corpus_flashfwb_links enable row level security;

create policy "corpus_flashfwb_links_owner" on corpus_flashfwb_links
  for select using (auth.uid() = user_id);

-- Écriture réservée au serveur (clé service role) : le endpoint vérifie
-- le token FlashFWB avant d'écrire, pas de policy insert/update côté client.
