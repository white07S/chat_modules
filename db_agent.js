import { Codex } from "@openai/codex-sdk";

const codex = new Codex({
    env:{
        AZURE_OPENAI_API_KEY: "",
        CODEX_HOME: "/Users/preetam/Develop/codex_chat/agents/db_agent",
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        HOME: "/Users/preetam",
        USER: "preetam"
    }
});

const THREAD_OPTS = {
  workingDirectory: "/Users/preetam/Develop/codex_chat/agents/db_agent",
  sandboxMode: "danger-full-access",
  skipGitRepoCheck: true,
};

// --- 1) Streaming example: raw JSONL-style events ---------------------------

async function streamingJsonlExample() {
  const thread = codex.startThread(THREAD_OPTS);

  // runStreamed gives us an async iterator of *structured* events
  const { events } = await thread.runStreamed(
    "can you explore the schema and explain what these business interpreations are?"
  );

  console.log("=== Streaming events (JSONL style) ===");

  // If you want *pure* JSONL (no header), remove the line above.
  for await (const event of events) {
    // One JSON object per line, like `codex exec --json`
    console.log(JSON.stringify(event));
  }

  console.log("=== End of streaming events ===\n");
}

// --- 2) Structured parsing example (buffered) -------------------------------

// async function structuredParsingExample() {
//   const thread = codex.startThread(THREAD_OPTS);

//   // Plain JS JSON Schema (no `as const`)
//   const schema = {
//     type: "object",
//     properties: {
//       user_name: { type: "string" },
//       short_intro: { type: "string" },
//       sentiment: {
//         type: "string",
//         enum: ["positive", "neutral", "negative"],
//       },
//     },
//     required: ["user_name", "short_intro", "sentiment"],
//     additionalProperties: false,
//   };

//   const turn = await thread.run(
//     "The user is Alex, a data analyst who likes Python and SQL. Summarize them.",
//     { outputSchema: schema }
//   );

//   // With outputSchema, finalResponse is guaranteed to be valid JSON
//   const parsed = JSON.parse(turn.finalResponse);

//   console.log("=== Structured parsing (finalResponse) ===");
//   console.log(turn.finalResponse);

//   console.log("\n=== Parsed JSON ===");
//   console.dir(parsed, { depth: null });

//   console.log(`\nHello ${parsed.user_name}, sentiment = ${parsed.sentiment}\n`);
// }

// ---------------------------------------------------------------------------

(async () => {
  try {
    // 1) Show full streaming event feed in JSONL style
    await streamingJsonlExample();

    // 2) Show a structured-output turn
    // await structuredParsingExample();
  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  }
})();