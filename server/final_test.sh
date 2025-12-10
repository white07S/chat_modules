#!/bin/bash

echo "===== FINAL AGENT TEST ====="

CLIENT_ID="final-test-$(date +%s)"

# Test 1: Chit Chat
echo -e "\n🤖 Testing CHIT_CHAT Agent"
echo "Connecting SSE and sending message..."

# Store SSE output to file
timeout 5 curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=chit_chat" 2>/dev/null > sse_output.txt &

sleep 1

# Send message
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"chit_chat\",\"message\":\"Say 'Hello World!' and nothing else\"}" 2>/dev/null | jq .

sleep 4

echo -e "\nResponse events captured:"
cat sse_output.txt | grep "data:" | head -20

echo -e "\n===== Test Complete ====="
