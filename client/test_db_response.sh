#!/bin/bash

CLIENT_ID="db-test-$(date +%s)"

# Connect SSE and capture response
(timeout 10 curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=db_agent" 2>/dev/null | tee db_sse.txt) &
SSE_PID=$!

sleep 1

# Send a DB query
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"db_agent\",\"message\":\"Show first 2 employees\"}" 2>/dev/null | jq .

wait $SSE_PID 2>/dev/null

echo "=== DB Agent Response Events ==="
cat db_sse.txt | grep "item.completed" | head -1 | cut -d: -f2- | jq '.event.item.text' 2>/dev/null
