import {
  cleanText,
  normalizeCategory,
  normalizePriority,
  normalizeTicketStatus,
} from "@/lib/normalization";

describe("normalizeCategory", () => {
  test.each([
    ["billing issue", "billing"],
    ["can't login", "account_access"],
    ["app crashed", "bug_report"],
    ["random gibberish xyz", "general"],
    [null, "general"],
    [undefined, "general"],
    ["", "general"],
  ])("%p -> %p", (input, expected) => {
    expect(normalizeCategory(input)).toBe(expected);
  });
});

describe("normalizePriority", () => {
  test.each([
    ["urgent", "urgent"],
    ["critical", "urgent"],
    ["p1", "urgent"],
    ["high", "high"],
    ["low", "low"],
    [null, "medium"],
    ["", "medium"],
  ])("%p -> %p", (input, expected) => {
    expect(normalizePriority(input)).toBe(expected);
  });
});

describe("normalizeTicketStatus", () => {
  test.each([
    ["open", "open"],
    ["in progress", "in_progress"],
    ["in-progress", "in_progress"],
    ["resolved", "resolved"],
    ["closed", "closed"],
    [null, "open"],
    ["unknown", "open"],
  ])("%p -> %p", (input, expected) => {
    expect(normalizeTicketStatus(input)).toBe(expected);
  });
});

describe("cleanText", () => {
  test("returns trimmed compact text for a normal string", () => {
    expect(cleanText("  hello   world  ", "fallback")).toBe("hello world");
  });

  test.each([
    [null, "fallback"],
    [undefined, "fallback"],
    ["", "fallback"],
  ])("returns fallback for %p", (input, expected) => {
    expect(cleanText(input, expected)).toBe(expected);
  });

  test("collapses multiple spaces into a single space", () => {
    expect(cleanText("one    two   three", "fallback")).toBe("one two three");
  });
});