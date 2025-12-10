#!/usr/bin/env node

const EventSource = require('eventsource');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const clientId = uuidv4();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${colors.cyan}codex> ${colors.reset}`
});

// Track state
let currentThreadId = null;
let currentAgentType = 'chit_chat';
let connected = false;
let eventSource = null;

// Log helper
function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

// Connect to SSE
function connectSSE() {
  log(colors.yellow, 'SYSTEM', `Connecting to server at ${SERVER_URL}...`);

  eventSource = new EventSource(`${SERVER_URL}/stream/${clientId}?agentType=${currentAgentType}`);

  eventSource.onopen = () => {
    connected = true;
    log(colors.green, 'SYSTEM', `Connected to server (Client ID: ${clientId})`);
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (error) {
      log(colors.red, 'ERROR', `Failed to parse event: ${error.message}`);
    }
  };

  eventSource.onerror = (error) => {
    log(colors.red, 'ERROR', `Connection error: ${error.message || 'Unknown error'}`);
    connected = false;

    // Attempt reconnection after 3 seconds
    setTimeout(() => {
      if (!connected) {
        log(colors.yellow, 'SYSTEM', 'Attempting to reconnect...');
        connectSSE();
      }
    }, 3000);
  };
}

// Handle server events
function handleServerEvent(data) {
  switch (data.type) {
    case 'connected':
      log(colors.green, 'SSE', `Connection established`);
      break;

    case 'thread_info':
      currentThreadId = data.threadId;
      log(colors.blue, 'THREAD', `Thread ID: ${data.threadId}`);
      break;

    case 'agent_event':
      handleAgentEvent(data.event);
      break;

    case 'job_complete':
      log(colors.green, 'JOB', `Completed in ${data.duration}ms`);
      rl.prompt();
      break;

    case 'error':
      log(colors.red, 'ERROR', data.error);
      rl.prompt();
      break;

    default:
      log(colors.dim, 'EVENT', JSON.stringify(data, null, 2));
  }
}

// Handle agent events
function handleAgentEvent(event) {
  switch (event.type) {
    case 'response_item':
      if (event.payload?.type === 'message' && event.payload?.role === 'assistant') {
        const content = event.payload.content?.[0]?.text || '';
        if (content) {
          process.stdout.write(`${colors.bright}${content}${colors.reset}`);
        }
      } else if (event.payload?.type === 'function_call') {
        log(colors.magenta, 'TOOL', `${event.payload.name}`);
      }
      break;

    case 'event_msg':
      if (event.payload?.type === 'agent_message') {
        const message = event.payload.message;
        if (message && !message.startsWith('{')) { // Avoid JSON outputs
          console.log(`\n${colors.bright}${message}${colors.reset}`);
        }
      } else if (event.payload?.type === 'token_count') {
        if (event.payload.info?.total_token_usage) {
          const usage = event.payload.info.total_token_usage;
          log(colors.dim, 'TOKENS', `In: ${usage.input_tokens}, Out: ${usage.output_tokens}`);
        }
      }
      break;

    case 'turn.completed':
      if (event.usage) {
        log(colors.dim, 'USAGE', JSON.stringify(event.usage));
      }
      break;

    case 'item.completed':
      // Handle completed items if needed
      break;

    default:
      // Log other events in debug mode
      if (process.env.DEBUG === 'true') {
        log(colors.dim, 'DEBUG', JSON.stringify(event, null, 2));
      }
  }
}

// Send message to server
async function sendMessage(message) {
  if (!connected) {
    log(colors.red, 'ERROR', 'Not connected to server');
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId,
        agentType: currentAgentType,
        message,
        threadId: currentThreadId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      log(colors.red, 'ERROR', error.error || 'Request failed');
      return;
    }

    const result = await response.json();
    log(colors.blue, 'JOB', `Started job ${result.jobId}`);

  } catch (error) {
    log(colors.red, 'ERROR', `Failed to send message: ${error.message}`);
  }
}

// List available agents
async function listAgents() {
  try {
    const response = await fetch(`${SERVER_URL}/agents`);
    const data = await response.json();

    console.log('\nAvailable agents:');
    data.agents.forEach(agent => {
      const current = agent.type === currentAgentType ? ' (current)' : '';
      console.log(`  ${colors.cyan}${agent.type}${colors.reset}${current}`);
      console.log(`    Model: ${agent.model || 'default'}`);
      console.log(`    Provider: ${agent.modelProvider || 'default'}`);
      if (agent.hasMcpServers) {
        console.log(`    MCP Servers: Yes`);
      }
    });
    console.log('');

  } catch (error) {
    log(colors.red, 'ERROR', `Failed to fetch agents: ${error.message}`);
  }
}

// Command handler
async function handleCommand(input) {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/help':
      console.log(`
${colors.bright}Available Commands:${colors.reset}
  /help              Show this help message
  /agents            List available agents
  /switch <agent>    Switch to different agent (db_agent, viz_agent, chit_chat)
  /thread            Show current thread ID
  /new               Start a new conversation (new thread)
  /resume <id>       Resume a specific thread
  /debug             Toggle debug mode
  /exit              Exit the CLI

${colors.bright}Usage:${colors.reset}
  Type your message and press Enter to chat with the current agent.
  Current agent: ${colors.cyan}${currentAgentType}${colors.reset}
  Current thread: ${currentThreadId || 'None'}
`);
      break;

    case '/agents':
      await listAgents();
      break;

    case '/switch':
      if (parts[1]) {
        const newAgent = parts[1];
        if (['db_agent', 'viz_agent', 'chit_chat'].includes(newAgent)) {
          currentAgentType = newAgent;
          currentThreadId = null; // Reset thread when switching agents
          log(colors.green, 'SYSTEM', `Switched to ${newAgent}`);

          // Reconnect SSE with new agent
          if (eventSource) {
            eventSource.close();
          }
          connectSSE();
        } else {
          log(colors.red, 'ERROR', `Invalid agent: ${newAgent}`);
        }
      } else {
        log(colors.red, 'ERROR', 'Usage: /switch <agent_type>');
      }
      break;

    case '/thread':
      console.log(`Current thread: ${currentThreadId || 'None'}`);
      break;

    case '/new':
      currentThreadId = null;
      log(colors.green, 'SYSTEM', 'Started new conversation thread');
      break;

    case '/resume':
      if (parts[1]) {
        currentThreadId = parts[1];
        log(colors.green, 'SYSTEM', `Resuming thread: ${currentThreadId}`);
      } else {
        log(colors.red, 'ERROR', 'Usage: /resume <thread_id>');
      }
      break;

    case '/debug':
      process.env.DEBUG = process.env.DEBUG === 'true' ? 'false' : 'true';
      log(colors.yellow, 'SYSTEM', `Debug mode: ${process.env.DEBUG}`);
      break;

    case '/exit':
    case '/quit':
      log(colors.yellow, 'SYSTEM', 'Goodbye!');
      if (eventSource) {
        eventSource.close();
      }
      process.exit(0);
      break;

    default:
      if (input.startsWith('/')) {
        log(colors.red, 'ERROR', `Unknown command: ${command}. Type /help for help.`);
      } else {
        // Send as chat message
        await sendMessage(input);
        return; // Don't prompt yet, wait for response
      }
  }

  rl.prompt();
}

// Main CLI loop
console.log(`
${colors.bright}PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
           Codex Chat CLI Test Tool
PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP${colors.reset}

Welcome! This is a test client for the Codex Chat Server.
Type ${colors.cyan}/help${colors.reset} for available commands or start chatting!
`);

// Connect to server
connectSSE();

// Setup readline
rl.prompt();

rl.on('line', async (input) => {
  if (input.trim()) {
    await handleCommand(input);
  } else {
    rl.prompt();
  }
});

rl.on('close', () => {
  log(colors.yellow, 'SYSTEM', 'Exiting...');
  if (eventSource) {
    eventSource.close();
  }
  process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('');
  log(colors.yellow, 'SYSTEM', 'Received interrupt signal');
  if (eventSource) {
    eventSource.close();
  }
  process.exit(0);
});