CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS documents_embedding_ivfflat_idx
  ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);