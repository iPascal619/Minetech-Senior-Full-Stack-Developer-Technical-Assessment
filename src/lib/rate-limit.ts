import { query } from "@/lib/db";
import { extractClientIp } from "@/lib/input";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string;
  bucket: string;
  clientKey: string;
  requestCount: number;
};

let rateLimitSchemaReady: Promise<void> | null = null;

async function ensureRateLimitSchema() {
  if (!rateLimitSchemaReady) {
    rateLimitSchemaReady = query(
      `CREATE TABLE IF NOT EXISTS api_rate_limits (
         bucket TEXT NOT NULL,
         client_key TEXT NOT NULL,
         window_start TIMESTAMPTZ NOT NULL,
         request_count INTEGER NOT NULL DEFAULT 1,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (bucket, client_key, window_start)
       )`,
    ).then(() => undefined);
  }

  return rateLimitSchemaReady;
}

function currentWindowStart(windowMs: number, now = Date.now()) {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export async function applyRateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  await ensureRateLimitSchema();

  const clientKey = extractClientIp(request);
  const windowStart = currentWindowStart(options.windowMs);
  const result = await query<{ request_count: number }>(
    `INSERT INTO api_rate_limits (bucket, client_key, window_start, request_count, created_at, updated_at)
     VALUES ($1, $2, $3, 1, NOW(), NOW())
     ON CONFLICT (bucket, client_key, window_start)
     DO UPDATE SET request_count = api_rate_limits.request_count + 1, updated_at = NOW()
     RETURNING request_count`,
    [options.bucket, clientKey, windowStart],
  );

  const requestCount = Number(result.rows[0]?.request_count ?? 0);
  const resetAt = new Date(windowStart.getTime() + options.windowMs);

  return {
    allowed: requestCount <= options.limit,
    limit: options.limit,
    remaining: Math.max(options.limit - requestCount, 0),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
    resetAt: resetAt.toISOString(),
    bucket: options.bucket,
    clientKey,
    requestCount,
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      success: false,
      error: "Rate limit exceeded. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": result.resetAt,
      },
    },
  );
}