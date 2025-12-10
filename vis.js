import { Codex } from "@openai/codex-sdk";

const codex = new Codex({
  env: {
    AZURE_OPENAI_API_KEY: "",
    CODEX_HOME: "/Users/preetam/Develop/codex_chat/agents/viz_agent",
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: "/Users/preetam",
    USER: "preetam",
  },
});

const THREAD_OPTS = {
  workingDirectory: "/Users/preetam/Develop/codex_chat/agents/viz_agent",
  sandboxMode: "danger-full-access",
  skipGitRepoCheck: true,
};

async function streamingJsonlExample() {
  const thread = codex.startThread(THREAD_OPTS);

  const { events } = await thread.runStreamed(
    "can you use the mcp , to show me a scatter plot of sales vs profit with some random data"
  );

  console.log("=== Streaming events (JSONL style) ===");

  // Keep only the *last* generate_chart MCP tool call's text content
  let lastGenerateChartSpec = null;
  // Keep the last agent message
  let agentMessage = null;

  for await (const event of events) {
    // Raw JSONL-style logging
    console.log(JSON.stringify(event));

    if (event.type === "item.completed") {
      const item = event.item;

      // Capture generate_chart tool result
      if (
        item.type === "mcp_tool_call" &&
        item.tool === "generate_chart" &&
        item.status === "completed"
      ) {
        const contentArray = item.result && item.result.content;
        if (Array.isArray(contentArray)) {
          const textPart = contentArray.find((part) => part.type === "text");
          if (textPart && textPart.text) {
            lastGenerateChartSpec = textPart.text;
          }
        }
      }

      // Capture agent message (last one wins)
      if (item.type === "agent_message") {
        agentMessage = item.text;
      }
    }
  }

  console.log("=== End of streaming events ===\n");

  const structuredFinal = {
    echart_spec: lastGenerateChartSpec,
    agent_message: agentMessage,
  };

  console.log("=== Aggregated structured result ===");
  console.log(JSON.stringify(structuredFinal, null, 2));

  return structuredFinal;
}

(async () => {
  try {
    const result = await streamingJsonlExample();
    // result.echart_spec -> string containing the ECharts JSON spec
    // result.agent_message -> last agent message text
  } catch (err) {
    console.error("Error:", err);
    process.exitCode = 1;
  }
})();