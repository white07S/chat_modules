#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Codex Chat Server - Development Mode${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Change to server directory
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install dependencies${NC}"
        exit 1
    fi
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    echo -e "${YELLOW}Creating logs directory...${NC}"
    mkdir -p logs
fi

# Clear old log file (optional)
if [ -f "logs/server.jsonl" ]; then
    echo -e "${YELLOW}Archiving previous log file...${NC}"
    mv logs/server.jsonl "logs/server.$(date +%Y%m%d_%H%M%S).jsonl"
fi

# Check if tsx is installed globally or locally
if ! command -v tsx &> /dev/null; then
    if [ ! -f "node_modules/.bin/tsx" ]; then
        echo -e "${YELLOW}Installing tsx...${NC}"
        npm install --save-dev tsx
    fi
fi

echo -e "${GREEN}Starting server...${NC}"
echo -e "${YELLOW}Server URL: http://localhost:3000${NC}"
echo -e "${YELLOW}Logs: ./logs/server.jsonl${NC}"
echo ""

# Run the server with tsx in watch mode
npx tsx watch src/index.ts

# Handle exit
echo -e "${RED}Server stopped${NC}"
