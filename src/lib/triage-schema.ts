import { z } from "zod";

export const TriageOutputSchema = z.object({
  category: z.string().min(1).max(64),
  priority: z.string().min(1).max(32),
  extracted_fields: z.object({
    subject: z.string().min(1).max(160),
    requester: z.string().min(1).max(80),
    issue_summary: z.string().min(1).max(320),
  }),
  suggested_reply: z.string().min(1).max(2000),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;

function extractCandidates(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const fenced = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim());
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  const sliced = braceStart >= 0 && braceEnd > braceStart ? trimmed.slice(braceStart, braceEnd + 1) : "";

  return [trimmed, ...fenced, sliced].filter(Boolean);
}

export function parseTriageOutput(text: string) {
  for (const candidate of extractCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const result = TriageOutputSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      }
    } catch {
      continue;
    }
  }

  return null;
}