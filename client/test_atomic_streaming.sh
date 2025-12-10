#!/bin/bash

echo "=== Testing Atomic Event Streaming from Codex SDK ==="
echo ""

CLIENT_ID="atomic-test-$(date +%s)"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Connecting to SSE stream...${NC}"

# Connect SSE and capture response
(curl -N "http://localhost:3000/stream/$CLIENT_ID?agentType=chit_chat" 2>/dev/null | tee atomic_sse.txt | while IFS= read -r line; do
    if [[ "$line" == data:* ]]; then
        event=$(echo "$line" | cut -d: -f2- | jq -r '.event.type // .type' 2>/dev/null)
        if [ ! -z "$event" ] && [ "$event" != "null" ]; then
            timestamp=$(date +"%H:%M:%S.%3N")
            case "$event" in
                "connected")
                    echo -e "[$timestamp] ${GREEN}✓ Connected to SSE stream${NC}"
                    ;;
                "thread_info")
                    echo -e "[$timestamp] ${BLUE}📋 Thread info received${NC}"
                    ;;
                "thread.started")
                    echo -e "[$timestamp] ${YELLOW}🚀 Thread started${NC}"
                    ;;
                "turn.started")
                    echo -e "[$timestamp] ${YELLOW}⏩ Turn started - processing request${NC}"
                    ;;
                "item.started")
                    item_type=$(echo "$line" | cut -d: -f2- | jq -r '.event.item.type' 2>/dev/null)
                    if [ "$item_type" == "command_execution" ]; then
                        cmd=$(echo "$line" | cut -d: -f2- | jq -r '.event.item.command' 2>/dev/null)
                        echo -e "[$timestamp] ${YELLOW}⚡ Executing command: $cmd${NC}"
                    else
                        echo -e "[$timestamp] ${YELLOW}🔧 Item started: $item_type${NC}"
                    fi
                    ;;
                "item.streaming")
                    echo -e "[$timestamp] ${BLUE}💬 Streaming partial response...${NC}"
                    ;;
                "item.completed")
                    item_type=$(echo "$line" | cut -d: -f2- | jq -r '.event.item.type' 2>/dev/null)
                    if [ "$item_type" == "command_execution" ]; then
                        output=$(echo "$line" | cut -d: -f2- | jq -r '.event.item.aggregated_output' 2>/dev/null | head -1)
                        echo -e "[$timestamp] ${GREEN}✅ Command completed with output: $output${NC}"
                    elif [ "$item_type" == "agent_message" ]; then
                        text=$(echo "$line" | cut -d: -f2- | jq -r '.event.item.text' 2>/dev/null | head -1)
                        echo -e "[$timestamp] ${GREEN}✅ Assistant response: $text${NC}"
                    else
                        echo -e "[$timestamp] ${GREEN}✅ Item completed: $item_type${NC}"
                    fi
                    ;;
                "turn.completed")
                    tokens=$(echo "$line" | cut -d: -f2- | jq -r '.event.usage // ""' 2>/dev/null)
                    echo -e "[$timestamp] ${GREEN}✓ Turn completed $tokens${NC}"
                    ;;
                "job_complete")
                    duration=$(echo "$line" | cut -d: -f2- | jq -r '.duration' 2>/dev/null)
                    echo -e "[$timestamp] ${GREEN}🎉 Job completed in ${duration}ms${NC}"
                    ;;
                *)
                    if [ "$event" != "agent_event" ]; then
                        echo -e "[$timestamp] 📌 Event: $event"
                    fi
                    ;;
            esac
        fi
    fi
done) &
SSE_PID=$!

sleep 1

echo -e "${BLUE}Sending request for command execution...${NC}"

# Send a message that will trigger tool usage
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$CLIENT_ID\",\"agentType\":\"chit_chat\",\"message\":\"List the files in the current directory and count how many there are\"}" 2>/dev/null | jq -r '"\(.status) - Job ID: \(.jobId)"'

echo ""
echo -e "${YELLOW}Waiting for atomic events to stream...${NC}"
echo ""

sleep 8
kill $SSE_PID 2>/dev/null

echo ""
echo -e "${GREEN}=== Test Complete ===${NC}"
echo ""
echo "Raw events saved to: atomic_sse.txt"
echo ""
echo "Summary of atomic events received:"
echo "-----------------------------------"
grep "data:" atomic_sse.txt | while IFS= read -r line; do
    event_type=$(echo "$line" | cut -d: -f2- | jq -r '.event.type // .type' 2>/dev/null)
    if [ ! -z "$event_type" ] && [ "$event_type" != "null" ]; then
        echo "  • $event_type"
    fi
done | sort | uniq -c | sort -rn