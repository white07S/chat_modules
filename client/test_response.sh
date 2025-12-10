#!/bin/bash

CLIENT_ID="debug-test-$(date +%s)"

# Connect SSE and capture response to file
(curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=chit_chat" 2>/dev/null | tee sse_debug.txt) &
SSE_PID=$!

sleep 1

# Send a simple message
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"chit_chat\",\"message\":\"Say hello\"}" 2>/dev/null

sleep 5
kill $SSE_PID 2>/dev/null

echo "=== SSE Events ==="
cat sse_debug.txt | grep "data:" | while IFS= read -r line; do
    echo "$line" | cut -d: -f2- | jq '.' 2>/dev/null || echo "$line"
done
