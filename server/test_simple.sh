#!/bin/bash

CLIENT_ID="test-$(date +%s)"
echo "Testing with Client ID: $CLIENT_ID"

# 1. Connect SSE in background
echo -e "\n1. Connecting to SSE stream..."
curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=chit_chat" 2>/dev/null | while IFS= read -r line; do
    if [[ $line == data:* ]]; then
        echo "$line" | cut -d: -f2- | jq -r 'select(.event.payload.type == "message" and .event.payload.role == "assistant") | .event.payload.content[0].text // empty' 2>/dev/null | tr -d '\n'
        echo "$line" | cut -d: -f2- | jq -r 'select(.type == "job_complete") | "\n✅ Job completed in \(.duration)ms"' 2>/dev/null
    fi
done &
SSE_PID=$!

sleep 1

# 2. Send message
echo -e "\n2. Sending message to chit_chat..."
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"chit_chat\",\"message\":\"Hello! Tell me a short joke please.\"}" 2>/dev/null | jq .

# Wait for response
sleep 5

# Kill SSE connection
kill $SSE_PID 2>/dev/null

echo -e "\n\nTest completed!"
