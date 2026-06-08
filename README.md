# MineTech — Mining Operations Intelligence Platform

A full-stack application built for the MineTech Senior Full-Stack Developer 
Technical Assessment. Two production-style AI workflows running entirely on 
a self-hosted local LLM — no external APIs, no cloud model costs.

Live demo: https://minetech-senior-full-stack-develope.vercel.app
(Note: Live demo shows UI only. Full functionality requires local Ollama 
and PostgreSQL — see setup instructions below.)

---

## What it does

### Use Case 1 — Operational Incident Triage
Paste a raw site report or equipment fault description. The app sends it 
to a locally running Phi-3 Mini model via Ollama, classifies the incident 
by category and priority, extracts the worker, equipment, and issue summary, 
drafts a suggested response, and saves everything to PostgreSQL. The 
dashboard is filterable by category and priority with full text search.

### Use Case 2 — Mining Operations Knowledge Base (RAG)
Upload safety manuals, inspection reports, or shift notes. Ask questions 
against the documents. The app retrieves relevant chunks from PostgreSQL, 
sends context and question to Ollama, returns a grounded answer with 
citations, and clearly states when the answer is not in the knowledge base.

---

## Tech Stack

- **Frontend** — Next.js 14 App Router, TypeScript, TailwindCSS
- **Backend** — Next.js API Routes, Node.js
- **Database** — PostgreSQL
- **LLM** — Phi-3 Mini via Ollama (self-hosted, runs locally)

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Ollama installed — https://ollama.com/download

---

## Setup Instructions

### 1. Clone the repository

git clone https://github.com/iPascal619/Minetech-Senior-Full-Stack-Developer-Technical-Assessment.git
cd Minetech-Senior-Full-Stack-Developer-Technical-Assessment

### 2. Install dependencies

npm install

### 3. Install and start Ollama

Download Ollama from https://ollama.com/download and install it.
Then pull the Phi-3 Mini model:

ollama pull phi3:mini

Ollama will start automatically on http://localhost:11434

### 4. Set up PostgreSQL

Create the database and tables:

psql -U postgres -W

Then run:

CREATE DATABASE minetech;
\c minetech

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text TEXT NOT NULL,
  category VARCHAR(100),
  priority VARCHAR(50),
  extracted_fields JSONB,
  suggested_reply TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

### 5. Configure environment variables

Copy .env.example to .env.local:

cp .env.example .env.local

Update .env.local with your values:

DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/minetech
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=phi3:mini

### 6. Run the development server

npm run dev

Open http://localhost:3000

---

## How it works

### Triage flow
1. User pastes a raw incident report
2. API sends text to Ollama with a JSON-only prompt
3. Phi-3 Mini classifies category, priority, extracts fields, drafts reply
4. App handles malformed JSON gracefully with fallback values
5. Structured result saved to PostgreSQL
6. Dashboard displays filterable incident records

### RAG flow
1. User uploads documents to PostgreSQL knowledge base
2. User asks a question
3. App retrieves relevant chunks using PostgreSQL text matching
4. Retrieved context + question sent to Ollama
5. Phi-3 Mini answers grounded in context with citations
6. If no relevant context found — clearly states not in knowledge base

---

## Design decisions

See DECISION_MEMO.md for full reasoning on model choice, 
retrieval strategy, hallucination handling, and ambiguous spec decisions.

---

## Project structure

src/
  app/
    layout.tsx                 — Root layout with fonts and metadata
    page.tsx                   — Home page with workflow overview
    globals.css                — Global styles
    global-error.tsx           — Global error boundary
    api/
      tickets/
        route.ts               — Triage API (GET, POST)
        [id]/
          route.ts             — Triage API (DELETE by ID)
      documents/
        route.ts               — Document API (GET, POST)
        [id]/
          route.ts             — Document API (DELETE by ID)
      chat/
        route.ts               — RAG chat API (POST)
    triage/
      page.tsx                 — Triage page (server component)
      TriageClient.tsx         — Triage dashboard (client component)
    rag/
      page.tsx                 — RAG page (server component)
      RagClient.tsx            — Knowledge base chat (client component)
  lib/
    db.ts                      — PostgreSQL connection pool
    ollama.ts                  — Ollama API utility
    ticket-schema.ts           — Ticket validation schema
    ticket-types.ts            — Shared TypeScript types

---

## Running the Loom demo

To reproduce the demo shown in the submission video:

1. Start Ollama (runs automatically after installation)
2. Run npm run dev
3. Navigate to /triage and submit a mining incident report
4. Navigate to /rag, upload a document, and ask a question
5. Observe grounded answer with citations
6. Ask an out-of-scope question to see "not in knowledge base" response
