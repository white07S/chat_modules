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

async function streamingJsonlExample() {
  const thread = codex.startThread(THREAD_OPTS);

  const { events } = await thread.runStreamed(
    "can show me top 5 rows in employees table and also tell me how many columns are there in that table?"
  );

  console.log("=== Streaming events (JSONL style) ===");

  // Track all execute_sql MCP tool calls
  const executeSqlCalls = [];
  // Track the last agent message
  let agentMessage = null;

  for await (const event of events) {
    // Raw JSONL log (same shape as `codex exec --json`)
    console.log(JSON.stringify(event));

    if (event.type === "item.completed") {
      const item = event.item;

      // Capture only execute_sql MCP tool calls
      if (
        item.type === "mcp_tool_call" &&
        item.tool === "execute_sql" &&
        item.status === "completed"
      ) {
        executeSqlCalls.push({
          id: item.id,
          sql: item.arguments.sql,
          result: item.result?.content?.[0]?.text || null,
        });
      }

      // Capture agent message
      if (item.type === "agent_message") {
        agentMessage = item.text;
      }
    }
  }

  console.log("=== End of streaming events ===\n");

  const structuredFinal = {
    execute_sql_calls: executeSqlCalls,
    total_calls: executeSqlCalls.length,
    agent_message: agentMessage,
  };

  console.log("=== Aggregated structured result ===");
  console.log(JSON.stringify(structuredFinal, null, 2));

  return structuredFinal;
}

// ---------------------------------------------------------------------------

(async () => {
  try {
    const result = await streamingJsonlExample();
    // Use `result` here or export streamingJsonlExample() from this module.
  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  }
})();