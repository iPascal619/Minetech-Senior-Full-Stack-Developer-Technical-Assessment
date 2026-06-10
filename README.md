# MineTech

MineTech is a mining operations intelligence platform built for the Senior Full-Stack Developer technical assessment. The current implementation includes two local AI workflows, PostgreSQL persistence, a Next.js App Router frontend, structured API logging, and a small benchmark harness for repeatable validation.

It currently provides:

1. Operational incident triage for mining site reports.
2. A retrieval-augmented knowledge base for safety and operations documents.
3. Local-first chat storage, source citations, and incident management UI.
4. Benchmark scripts for triage and RAG scenarios.
5. Automatic browser-based chat history for the RAG workflow.

## Highlights

- Triage raw incident text into structured records with a local Ollama model.
- Persist triaged incidents in PostgreSQL and browse them in a filterable dashboard.
- Ingest documents into a knowledge base with PostgreSQL + pgvector.
- Ask grounded questions against indexed site documents.
- See citations inline and open the cited source document from the chat UI.
- Save chat transcripts locally in the browser and start a fresh chat.
- Rate limit the API routes to avoid accidental bursts.
- Emit structured request logs for triage and RAG requests.
- Validate the main AI flows with a repeatable local benchmark harness.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- PostgreSQL
- pgvector
- Ollama

Current runtime defaults:

- `qwen2.5:3b` for triage and answer generation
- `nomic-embed-text` for document embeddings
- `keep_alive=30m` for Ollama requests
- SSE status events are hidden from the RAG UI

## Repository Layout

```text
src/
  app/
    page.tsx                  Home page / product overview
    layout.tsx                Root layout and metadata
    globals.css                Global styles and theme tokens
    global-error.tsx           Global error boundary
    api/
      chat/route.ts            RAG chat API
      documents/route.ts       Document list + upload API
      documents/[id]/route.ts  Document detail + delete API
      tickets/route.ts         Incident triage list + create API
      tickets/[id]/route.ts     Incident delete API
    rag/
      page.tsx                 RAG page shell
      RagClient.tsx            RAG UI and client logic
    triage/
      page.tsx                 Triage page shell
      TriageClient.tsx         Triage UI and client logic
      TriageDashboard.tsx      Dashboard and incident details
  lib/
    chat-stream.ts             SSE stream parser for Ollama chat responses
    db.ts                      PostgreSQL pool and helpers
    input.ts                   Sanitization and validation helpers
    normalization.ts           Text normalization helpers
    ollama.ts                  Ollama request helpers
    rate-limit.ts              API rate limiting logic
    ticket-schema.ts           Triage schema definitions
    ticket-types.ts            Shared ticket types and helpers
    triage-schema.ts           Triage response schema
migrations/
  20260609_add_api_rate_limits.sql
  20260609_add_pgvector.sql
```

## Features

### Incident triage

- Paste a raw incident report.
- The app asks Ollama to classify the report and extract structured fields.
- Results are saved to PostgreSQL.
- The dashboard supports filtering, search, row actions, and incident detail viewing.

### Retrieval-augmented knowledge base

- Upload `.txt` or `.pdf` documents or paste text directly.
- Documents are stored in PostgreSQL.
- Embeddings are generated locally with Ollama and stored in pgvector.
- Questions are answered from indexed documents when possible.
- Responses include citations and a source viewer for the cited document.
- If no relevant context is found, the assistant clearly says so.

### Chat workflow improvements

- The chat transcript scrolls inside the card instead of stretching the page.
- Chat history auto-saves in the browser as you continue the conversation.
- Restoring a saved chat resumes it as the active thread, so you can keep chatting without storing it again.
- You can start a new chat without losing the existing stored transcript.
- Internal SSE status events are hidden from the UI.

## Prerequisites

- Node.js 18.18+ or 20+
- PostgreSQL 14+
- Ollama installed locally
- The `psql` CLI if you want to run the SQL migrations manually

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/iPascal619/Minetech-Senior-Full-Stack-Developer-Technical-Assessment.git
cd Minetech-Senior-Full-Stack-Developer-Technical-Assessment
```

### 2. Install dependencies

```bash
npm install
```

On Windows PowerShell, use `npm.cmd` if your shell does not resolve `npm` directly.

### 3. Install Ollama models

Install Ollama from https://ollama.com/download, then pull the two models used by the app:

```bash
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
```

The app uses:

- `qwen2.5:3b` for triage and answer generation
- `nomic-embed-text` for document embeddings

Ollama runs on `http://localhost:11434` by default.

### 4. Create the database

Create the database and apply the migrations:

```bash
psql -U postgres -W
```

Then in `psql`:

```sql
CREATE DATABASE minetech;
\c minetech
\i migrations/20260609_add_api_rate_limits.sql
\i migrations/20260609_add_pgvector.sql
```

If your base schema has not been created yet, make sure the application tables exist before running the app. The project expects these core tables:

- `tickets`
- `documents`
- `conversations`
- `api_rate_limits`

### 5. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then review `.env.local`:

```env
DATABASE_URL=postgresql://postgres:pascal123@localhost:5432/minetech
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_KEEP_ALIVE=30m
```

The app reads these values from `src/lib/db.ts` and `src/lib/ollama.ts`.

### 6. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available Scripts

- `npm run dev` - Start the Next.js development server.
- `npm run build` - Build the production app.
- `npm run start` - Start the production server.
- `npm run lint` - Run ESLint.
- `npm test` - Run the Jest test suite.
- `npm run benchmark:ai` - Run the local triage and RAG benchmark harness against a live app.

## API Routes

### Triage

- `GET /api/tickets` - List triaged incidents.
- `POST /api/tickets` - Submit raw incident text for structured triage.
- `DELETE /api/tickets/[id]` - Delete a triaged incident.

### Knowledge base

- `GET /api/documents` - List indexed documents.
- `POST /api/documents` - Upload a document or paste text content.
- `GET /api/documents/[id]` - Fetch a document for citation/source viewing.
- `DELETE /api/documents/[id]` - Delete a document.
- `POST /api/chat` - Stream a RAG answer using Server-Sent Events.

## Data Flow Overview

### Triage flow

1. A user pastes a raw incident report.
2. The server sends the text to Ollama with a structured prompt.
3. The model returns a triage payload.
4. The app normalizes the response and falls back when the model output is incomplete.
5. The incident is saved in PostgreSQL.
6. The dashboard displays the new record.

### RAG flow

1. A user uploads a document or pastes report text.
2. The content is stored in PostgreSQL.
3. Ollama generates an embedding with `nomic-embed-text`.
4. The embedding is saved into pgvector.
5. A question is submitted to `/api/chat`.
6. The app searches for relevant content and streams a grounded answer.
7. Citations can be opened to inspect the source document.

## Database Notes

The project uses two database migrations:

- `20260609_add_api_rate_limits.sql` creates the `api_rate_limits` table used by the rate limiter.
- `20260609_add_pgvector.sql` enables the `vector` extension and adds a `vector(768)` embedding column to `documents`.

The document index uses an IVFFlat index for cosine similarity search.

## Current State

The repo is currently in a working state with these behaviors implemented:

- The triage route normalizes model output, falls back on incomplete JSON, and stores incidents in PostgreSQL.
- The RAG route retrieves citations with vector-first search, falls back to keyword search, and hides internal status events from the UI.
- The chat page supports scrollable transcripts, automatic local chat storage, source inspection, and a new-chat flow.
- The API routes emit structured JSON logs for request-level observability.
- `npm test` and `npm run build` pass, and `npm run benchmark:ai` is available for a live end-to-end check.

## Troubleshooting

### `npm` not found on Windows PowerShell

Use `npm.cmd` instead:

```bash
npm.cmd run build
```

### `CREATE EXTENSION IF NOT EXISTS vector` fails

- Make sure PostgreSQL is running.
- Confirm you are connected to the `minetech` database.
- Ensure the `pgvector` extension is installed in your PostgreSQL instance.

### Ollama requests fail

- Verify Ollama is running on `http://localhost:11434`.
- Make sure `qwen2.5:3b` and `nomic-embed-text` are available locally.

### Citations show but do not open

- The app opens citation sources from `/api/documents/[id]`.
- If the source viewer does not open, check that the document still exists in PostgreSQL.

### RAG answers always say the content is missing

- Confirm the document has been indexed.
- Confirm the embedding was stored successfully.
- Confirm the relevant document content actually contains the query terms.

## Notes

- The app is designed to work best when PostgreSQL and Ollama are both available.
- Chat transcripts can be stored locally in the browser from the RAG page.
- This repository keeps the AI workflows on-device as much as possible.
- The decision memo is intentionally kept out of the GitHub push.

## Deployment

The UI can be deployed to Vercel as a standard Next.js app, but the AI features require external services:

- A reachable PostgreSQL database for `DATABASE_URL`
- A reachable Ollama endpoint for `OLLAMA_BASE_URL`
- The same models available on that Ollama host: `qwen2.5:3b` and `nomic-embed-text`

If only the frontend is deployed, the shell will load but the triage and RAG APIs will fail until the environment variables are set and the services are reachable.

For production, run the SQL migrations against the hosted database before sending traffic.

## License

No license file is included in this assessment repository.
