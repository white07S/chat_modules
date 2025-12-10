import { Codex } from "@openai/codex-sdk";

const codex = new Codex({
  env: {
    AZURE_OPENAI_API_KEY: "",
    CODEX_HOME: "/Users/preetam/Develop/codex_chat/agents/doc_agent",
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: "/Users/preetam",
    USER: "preetam",
  },
});

const THREAD_OPTS = {
  workingDirectory: "/Users/preetam/Develop/codex_chat/agents/doc_agent",
  sandboxMode: "danger-full-access",
  skipGitRepoCheck: true,
};

// --- 1) Streaming example: raw JSONL-style events ---------------------------

async function streamingJsonlExample() {
  const thread = codex.startThread(THREAD_OPTS);

  // runStreamed gives us an async iterator of *structured* events
  const { events } = await thread.runStreamed(
    "can you try to search for ubs quaterly results there?"
  );

  console.log("=== Streaming events (JSONL style) ===");

  let final_response = null; // will hold the last completed agent_message item

  for await (const event of events) {
    // One JSON object per line, like `codex exec --json`
    console.log(JSON.stringify(event));

    // Track the last completed agent_message
    if (
      event.type === "item.completed" &&
      event.item &&
      event.item.type === "agent_message"
    ) {
      // store the whole item as a dict-like object
      final_response = event.item;
    }
  }

  // console.log("=== End of streaming events ===\n");
  // console.log("Final agent_message item:", final_response);

  return final_response;
}

(async () => {
  try {
    // 1) Show full streaming event feed in JSONL style
    const final_response = await streamingJsonlExample();
    // You now have the last agent_message here as well
    console.log("Returned final_response:", final_response);
  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  }
})();