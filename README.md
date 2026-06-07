# MineTech Assessment

MineTech Assessment is a Next.js app for two local support workflows:

- Smart ticket triage with JSON extraction, priority classification, and suggested replies.
- Retrieval-augmented chat over uploaded documents stored in PostgreSQL.

The app uses a local Ollama model and a PostgreSQL database. It is designed to run entirely on a developer machine.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file from the example:

```bash
copy .env.example .env.local
```

3. Fill in your values for:

- `DATABASE_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Routes

- `/` - project landing page
- `/triage` - ticket triage dashboard
- `/rag` - document upload and chat interface

## Scripts

- `npm run dev` - start the development server
- `npm run build` - build the app for production
- `npm run start` - run the production build
- `npm run lint` - run ESLint

## Notes

- The app expects PostgreSQL to be available at the configured `DATABASE_URL`.
- Ollama should be running locally at the configured `OLLAMA_BASE_URL`.
- The example env file is tracked so you can copy it into `.env.local` and customize it safely.
