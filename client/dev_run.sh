#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Codex Chat Client - Development Mode${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Check if server is running
echo -e "${YELLOW}Checking server connection...${NC}"
curl -s http://localhost:3000/health > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}⚠️  Server is not running!${NC}"
    echo -e "${YELLOW}Please start the server first:${NC}"
    echo -e "  cd server && ./dev_run.sh"
    echo ""
    echo -e "${YELLOW}Continuing anyway...${NC}"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${GREEN}Starting React development server...${NC}"
echo -e "${YELLOW}Client URL: http://localhost:3001${NC}"
echo -e "${YELLOW}Server URL: http://localhost:3000${NC}"
echo ""

# Start React on port 3001 to avoid conflict with server on 3000
PORT=3001 npm start
