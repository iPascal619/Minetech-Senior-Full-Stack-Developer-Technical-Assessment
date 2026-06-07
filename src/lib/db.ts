import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

declare global {
  var __minetechPool: Pool | undefined;
  var __minetechDatabaseUrl: string | undefined;
}

function parseEnvFileForKey(filePath: string, key: string) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const content = readFileSync(filePath, "utf8");
  const line = content
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(key.length + 1).trim().replace(/^['"]|['"]$/g, "");
}

function findFileRecursively(startDir: string, fileName: string, maxDepth = 4): string | undefined {
  if (maxDepth < 0 || !existsSync(startDir)) {
    return undefined;
  }

  const directMatch = path.join(startDir, fileName);

  if (existsSync(directMatch)) {
    return directMatch;
  }

  if (maxDepth === 0) {
    return undefined;
  }

  const entries = readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") {
      continue;
    }

    const childPath = path.join(startDir, entry.name);

    try {
      if (statSync(childPath).isDirectory()) {
        const found = findFileRecursively(childPath, fileName, maxDepth - 1);

        if (found) {
          return found;
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function loadDatabaseUrlFromDisk() {
  if (globalThis.__minetechDatabaseUrl) {
    return globalThis.__minetechDatabaseUrl;
  }

  const searchRoots: string[] = [];

  let currentDir = process.cwd();

  for (let index = 0; index < 8; index += 1) {
    searchRoots.push(currentDir);
    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  for (const root of searchRoots) {
    const envPath = findFileRecursively(root, ".env.local", 4) ?? path.join(root, ".env.local");
    const candidate = parseEnvFileForKey(envPath, "DATABASE_URL");

    if (candidate) {
      globalThis.__minetechDatabaseUrl = candidate;
      return candidate;
    }
  }

  return undefined;
}

function getConnectionString() {
  const connectionString =
    process.env.DATABASE_URL ??
    loadDatabaseUrlFromDisk() ??
    "postgresql://postgres:pascal123@localhost:5432/minetech";

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = connectionString;
  }

  return connectionString;
}

function createPool() {
  return new Pool({
    connectionString: getConnectionString(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function getPool() {
  if (!globalThis.__minetechPool) {
    globalThis.__minetechPool = createPool();
  }

  return globalThis.__minetechPool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, values as unknown[]);
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}