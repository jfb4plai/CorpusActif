import { createClient } from '@supabase/supabase-js';

// Client dédié au projet Supabase FlashFWB (distinct du projet CorpusActif) —
// utilisé uniquement pour la liaison de compte (option 3 : connexion explicite).
const url = import.meta.env.VITE_FLASHFWB_SUPABASE_URL;
const key = import.meta.env.VITE_FLASHFWB_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('VITE_FLASHFWB_SUPABASE_URL et VITE_FLASHFWB_SUPABASE_ANON_KEY sont requis');
}

export const supabaseFlashfwb = createClient(url, key, {
  auth: {
    // Session FlashFWB indépendante de la session CorpusActif — pas de persistance
    // partagée, on ne garde que le temps de récupérer l'access_token.
    storageKey: 'corpusactif-flashfwb-link',
    persistSession: false,
  },
});
