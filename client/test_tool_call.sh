#!/bin/bash

CLIENT_ID="tool-test-$(date +%s)"

# Connect SSE and capture response
(curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=chit_chat" 2>/dev/null | tee tool_sse.txt) &
SSE_PID=$!

sleep 1

# Send a message that will trigger tool usage
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"chit_chat\",\"message\":\"What files are in the current directory? List them for me.\"}" 2>/dev/null | jq .

sleep 10
kill $SSE_PID 2>/dev/null

echo "=== Tool Call Events ==="
cat tool_sse.txt | grep "data:" | grep -E "(function_call|tool|item\.|turn\.|thread\.)" | head -20