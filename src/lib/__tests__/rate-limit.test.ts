import { query } from "@/lib/db";

describe("applyRateLimit", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test("increments requests and blocks once the limit is exceeded", async () => {
    const querySpy = jest.spyOn(await import("@/lib/db"), "query");
    const { applyRateLimit, rateLimitResponse } = await import("@/lib/rate-limit");

    querySpy
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as Awaited<ReturnType<typeof query>>)
      .mockResolvedValueOnce({ rows: [{ request_count: 1 }], rowCount: 1 } as Awaited<ReturnType<typeof query>>)
      .mockResolvedValueOnce({ rows: [{ request_count: 2 }], rowCount: 1 } as Awaited<ReturnType<typeof query>>);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
    });

    const first = await applyRateLimit(request, {
      bucket: "/api/chat",
      limit: 1,
      windowMs: 60_000,
    });

    const second = await applyRateLimit(request, {
      bucket: "/api/chat",
      limit: 1,
      windowMs: 60_000,
    });

    expect(first).toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
        bucket: "/api/chat",
        clientKey: "203.0.113.10",
        requestCount: 1,
      }),
    );
    expect(second).toEqual(
      expect.objectContaining({
        allowed: false,
        remaining: 0,
        bucket: "/api/chat",
        clientKey: "203.0.113.10",
        requestCount: 2,
      }),
    );

    const response = rateLimitResponse(second);
    const body = (await response.json()) as { success?: boolean; error?: string };

    expect(response.status).toBe(429);
    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      }),
    );
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});