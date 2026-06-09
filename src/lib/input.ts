import { z } from "zod";

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

export const MAX_CHAT_QUESTION_LENGTH = 2_000;
export const MAX_TRIAGE_TEXT_LENGTH = 8_000;
export const MAX_DOCUMENT_FILENAME_LENGTH = 160;
export const MAX_DOCUMENT_CONTENT_LENGTH = 200_000;
export const MAX_ASSIGNEE_LENGTH = 120;
export const MAX_SUGGESTED_REPLY_LENGTH = 4_000;

export type TextSanitizeOptions = {
  allowNewlines?: boolean;
};

export function stripDangerousCharacters(value: string) {
  return value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(CONTROL_CHAR_PATTERN, " ")
    .replace(ZERO_WIDTH_PATTERN, "");
}

export function sanitizeText(value: string, options: TextSanitizeOptions = {}) {
  const normalized = stripDangerousCharacters(value).normalize("NFKC").replace(/\r\n?/g, "\n");

  if (options.allowNewlines) {
    return normalized.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function sanitizeFilename(value: string, fallback = "document.txt") {
  const compact = sanitizeText(value, { allowNewlines: false })
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\.+$/g, "")
    .replace(/-+/g, "-")
    .trim();

  return compact || fallback;
}

export function createSanitizedTextSchema(options: {
  maxLength: number;
  minLength?: number;
  allowNewlines?: boolean;
}) {
  return z
    .string()
    .transform((value) => sanitizeText(value, { allowNewlines: options.allowNewlines }))
    .pipe(z.string().min(options.minLength ?? 1).max(options.maxLength));
}

export function extractClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();

  return forwarded || realIp || clientIp || "anonymous";
}