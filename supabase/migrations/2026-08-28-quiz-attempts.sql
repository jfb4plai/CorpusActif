-- Défi de consolidation : chaque réponse au QCM post-parcours = une ligne.
-- Signal DISTINCT de l'acquisition socratique (corpus_messages.notion_acquired
-- n'est jamais réécrit). Agrégé par notion au tableau de bord enseignant.
--
-- À EXÉCUTER MANUELLEMENT dans Supabase → SQL Editor, projet CorpusActif
-- (dfoaumjleqtxjeaplnna — celui pointé par SUPABASE_URL, où vivent les tables
-- corpus_*), AVANT tout déploiement de cette branche. Ce n'est PAS le projet
-- FlashFWB. Sans la table, api/chat-debrief.js action:quiz-submit renvoie 500
-- (le client affiche quand même le bilan — l'enregistrement est un bonus).

create table corpus_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references corpus_spaces on delete cascade not null,
  learner_code text,
  notion_concept text not null,
  correct boolean not null,
  created_at timestamptz default now()
);
alter table corpus_quiz_attempts enable row level security;
create policy "corpus_quiz_attempts_owner" on corpus_quiz_attempts
  for select using (space_id in (select id from corpus_spaces where user_id = auth.uid()));
create policy "corpus_quiz_attempts_service" on corpus_quiz_attempts
  for insert with check (true);
