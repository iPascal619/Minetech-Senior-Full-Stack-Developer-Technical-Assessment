import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://localhost:3000";
const rootDir = process.cwd();
const triageBenchPath = path.join(rootDir, "benchmarks", "triage-bench.json");
const ragBenchPath = path.join(rootDir, "benchmarks", "rag-bench.json");

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function trimText(value) {
  return String(value ?? "").trim();
}

async function loadJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE" });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function parseSseText(text) {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/);
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));

      return {
        event: eventLine ? eventLine.slice("event: ".length).trim() : "",
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : null,
      };
    });
}

async function runTriageBenchmarks() {
  const cases = await loadJson(triageBenchPath);
  const results = [];

  for (const testCase of cases) {
    const { response, data } = await postJson(`${baseUrl}/api/tickets`, { rawText: testCase.rawText });

    assert(response.ok, `triage case \"${testCase.name}\" failed with HTTP ${response.status}`);
    assert(data?.success, `triage case \"${testCase.name}\" did not return success`);
    assert(data?.ticket, `triage case \"${testCase.name}\" did not return a ticket`);

    const ticket = data.ticket;
    const passed =
      ticket.category === testCase.expectedCategory &&
      ticket.priority === testCase.expectedPriority &&
      trimText(ticket.extracted_fields?.subject).includes(testCase.expectedSubjectContains);

    results.push({
      name: testCase.name,
      passed,
      category: ticket.category,
      priority: ticket.priority,
      subject: ticket.extracted_fields?.subject,
      warnings: data.warnings ?? [],
    });

    assert(passed, `triage case \"${testCase.name}\" did not match expected category/priority/subject`);

    const deleteResult = await deleteJson(`${baseUrl}/api/tickets/${ticket.id}`);
    assert(deleteResult.response.ok, `cleanup failed for triage case \"${testCase.name}\"`);
  }

  return results;
}

async function seedDocuments(documents) {
  const created = [];

  for (const document of documents) {
    const { response, data } = await postJson(`${baseUrl}/api/documents`, document);

    assert(response.ok, `failed to seed benchmark document ${document.filename}`);
    assert(data?.success, `benchmark document ${document.filename} did not save successfully`);
    assert(data?.document?.id, `benchmark document ${document.filename} did not return an id`);

    created.push(data.document);
  }

  return created;
}

async function cleanupDocuments(documents) {
  for (const document of documents) {
    await deleteJson(`${baseUrl}/api/documents/${document.id}`);
  }
}

async function readSseResponse(response) {
  const text = await response.text();
  return parseSseText(text);
}

async function runRagBenchmarks() {
  const benchmark = await loadJson(ragBenchPath);
  const seededDocuments = await seedDocuments(benchmark.documents);

  try {
    const results = [];

    for (const testCase of benchmark.cases) {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: testCase.question }),
      });

      assert(response.ok, `rag case \"${testCase.name}\" failed with HTTP ${response.status}`);

      const events = await readSseResponse(response);
      const doneEvent = events.find((entry) => entry.event === "done");
      const metaEvent = events.find((entry) => entry.event === "meta");

      assert(doneEvent?.data, `rag case \"${testCase.name}\" did not return a done event`);
      assert(metaEvent?.data, `rag case \"${testCase.name}\" did not return a meta event`);

      const done = doneEvent.data;
      const meta = metaEvent.data;
      const citations = Array.isArray(done.citations) ? done.citations : [];
      const answer = trimText(done.answer);
      const citationsText = JSON.stringify(citations);

      if (testCase.expectGrounded === true) {
        assert(done.grounded === true, `rag case \"${testCase.name}\" was not grounded`);
        assert(meta.grounded === true, `rag case \"${testCase.name}\" meta did not mark grounded`);
        assert(citations.length > 0, `rag case \"${testCase.name}\" returned no citations`);
      }

      if (testCase.expectGrounded === false) {
        assert(done.grounded === false, `rag case \"${testCase.name}\" unexpectedly grounded`);
        assert(meta.grounded === false, `rag case \"${testCase.name}\" meta unexpectedly grounded`);
      }

      if (typeof testCase.expectNotInKnowledgeBase === "boolean") {
        assert(
          done.notInKnowledgeBase === testCase.expectNotInKnowledgeBase,
          `rag case \"${testCase.name}\" notInKnowledgeBase mismatch`,
        );
      }

      if (testCase.expectCitationFilenameContains) {
        assert(
          citationsText.includes(testCase.expectCitationFilenameContains),
          `rag case \"${testCase.name}\" did not cite the expected document`,
        );
      }

      if (testCase.expectAnswerContains) {
        assert(
          answer.toLowerCase().includes(String(testCase.expectAnswerContains).toLowerCase()),
          `rag case \"${testCase.name}\" answer did not contain the expected phrase`,
        );
      }

      results.push({
        name: testCase.name,
        grounded: done.grounded,
        notInKnowledgeBase: done.notInKnowledgeBase,
        citationsCount: citations.length,
      });
    }

    return results;
  } finally {
    await cleanupDocuments(seededDocuments);
  }
}

async function main() {
  console.log(`Benchmarking against ${baseUrl}`);

  const triageResults = await runTriageBenchmarks();
  const ragResults = await runRagBenchmarks();

  console.log("Triage results:");
  for (const result of triageResults) {
    console.log(`- ${result.name}: pass (${result.category}, ${result.priority})`);
  }

  console.log("RAG results:");
  for (const result of ragResults) {
    console.log(`- ${result.name}: grounded=${result.grounded}, notInKB=${result.notInKnowledgeBase}, citations=${result.citationsCount}`);
  }

  console.log("All benchmarks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
