# CorpusActif — PLAI

App pédagogique permettant aux enseignants de créer des espaces IA bridés par leurs ressources documentaires. Les apprenants accèdent via QR code.

## Stack
React 18 + Vite 5 + Tailwind CSS v3 / Supabase (pgvector + Auth) / Vercel / Claude Haiku / Voyage AI

## Variables d'environnement
Copier `.env.example` vers `.env.local` et remplir :
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Dashboard Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — côté serveur uniquement
- `ANTHROPIC_API_KEY` — console.anthropic.com
- `VOYAGE_API_KEY` — voyage.ai
- `JWT_SECRET` — clé aléatoire longue (`openssl rand -base64 32`)

## Dev local
```bash
npm install
vercel dev   # pour tester les /api/* avec les env vars
```
