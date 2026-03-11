# PromptStudio

An AI-powered creative workspace for generating, refining, and managing image prompts and AI-generated art using Google's Gemini models.

## Tech Stack

- **Frontend:** React 19, Tailwind CSS 4, Lucide React, Motion (Framer Motion)
- **Backend:** Node.js + Express (TypeScript via `tsx`)
- **Build Tool:** Vite 6
- **Databases:**
  - Local: SQLite (`better-sqlite3`) for ephemeral/local dev
  - Cloud: Supabase (PostgreSQL) for persistent multi-user storage
- **AI:** Google Gemini SDK (`@google/genai`)
- **Auth:** Replit Auth (OpenID Connect via passport)
- **Storage:** Google Cloud Storage (GCS) for workspace backups

## Project Structure

```
.
├── src/                  # Frontend React source
│   ├── components/       # React components
│   ├── constants/        # App constants and presets
│   ├── services/         # API client and Gemini AI logic
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── replit_integrations/   # Replit Auth module (OIDC + passport)
├── server.ts             # Express backend (API + Vite middleware)
├── supabase_schema.sql   # Supabase/Postgres schema
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── index.html            # HTML entry point
```

## Development

The app runs as a unified Express + Vite dev server:

```bash
npm run dev
```

Server listens on port 5000 (configured via `PORT` env var).

## Environment Variables

See `.env.example` for all available configuration:

- `GEMINI_API_KEY` — Google Gemini API key for AI features
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase credentials
- `SESSION_SECRET` — Express session secret (provided by Replit)
- `DATABASE_URL` — PostgreSQL connection for session storage (provided by Replit)
- `GCS_BUCKET_NAME` — Google Cloud Storage bucket

Without Supabase configured, the app falls back to local SQLite storage.

## Key Features

- Generate structured JSON prompts from simple ideas using Gemini
- AI image generation from structured prompts
- Prompt refinement and AI critique
- Project-based organization
- Moodboard generation
- Prompt library
- Showcase with starring and comments
- Hybrid local/cloud storage mode
