#!/usr/bin/env node

const EventSource = require('eventsource');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = 'http://localhost:3000';
const clientId = uuidv4();

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAgent(agentType, message) {
  console.log(`\n${colors.cyan}PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP${colors.reset}`);
  console.log(`${colors.bright}Testing ${agentType}${colors.reset}`);
  console.log(`${colors.cyan}PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP${colors.reset}\n`);

  return new Promise(async (resolve, reject) => {
    const eventSource = new EventSource(`${SERVER_URL}/stream/${clientId}?agentType=${agentType}`);
    let response = '';
    let jobId = null;
    let connected = false;

    eventSource.onopen = () => {
      console.log(`${colors.green}[CONNECTED]${colors.reset} SSE connection established`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          connected = true;
          console.log(`${colors.green}[READY]${colors.reset} Client ID: ${data.clientId}`);

          // Send the message after connection is confirmed
          sendMessage(agentType, message).then(result => {
            jobId = result.jobId;
            console.log(`${colors.blue}[JOB]${colors.reset} Job ID: ${jobId}`);
          });
        } else if (data.type === 'thread_info') {
          console.log(`${colors.blue}[THREAD]${colors.reset} Thread ID: ${data.threadId}`);
        } else if (data.type === 'agent_event') {
          // Handle agent response - Log all events for debugging
          if (data.event.type === 'response_item') {
            if (data.event.payload?.type === 'message' && data.event.payload?.role === 'assistant') {
              const content = data.event.payload.content?.[0];
              if (content?.type === 'text' || content?.type === 'output_text') {
                const text = content.text || '';
                if (text) {
                  response += text;
                  console.log(`\n${colors.green}[RESPONSE]${colors.reset} ${colors.bright}${text}${colors.reset}`);
                }
              }
            } else if (data.event.payload?.type === 'function_call') {
              console.log(`${colors.yellow}[TOOL]${colors.reset} ${data.event.payload.name}`);
            }
          } else if (data.event.type === 'event_msg') {
            if (data.event.payload?.type === 'agent_message') {
              const msg = data.event.payload.message;
              if (msg) {
                response += msg;
                console.log(`\n${colors.green}[MESSAGE]${colors.reset} ${colors.bright}${msg}${colors.reset}`);
              }
            }
          }
        } else if (data.type === 'job_complete') {
          console.log(`\n${colors.green}[COMPLETE]${colors.reset} Job completed in ${data.duration}ms`);
          eventSource.close();
          resolve(response);
        } else if (data.type === 'error') {
          console.error(`${colors.red}[ERROR]${colors.reset} ${data.error}`);
          eventSource.close();
          reject(new Error(data.error));
        }
      } catch (error) {
        console.error(`${colors.red}[PARSE ERROR]${colors.reset} ${error.message}`);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`${colors.red}[CONNECTION ERROR]${colors.reset} ${error.message || 'Unknown error'}`);
      eventSource.close();
      reject(error);
    };
  });
}

async function sendMessage(agentType, message) {
  console.log(`${colors.yellow}[SENDING]${colors.reset} "${message}"`);

  const response = await fetch(`${SERVER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      agentType,
      message
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  return await response.json();
}

async function runTests() {
  console.log(`${colors.bright}PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP`);
  console.log(`         Codex Chat Server Agent Testing`);
  console.log(`PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP${colors.reset}`);

  try {
    // Test chit_chat agent
    await testAgent('chit_chat', 'Hello! How are you today?');
    await sleep(2000);

    // Test db_agent
    await testAgent('db_agent', 'Can you show me the first 3 rows from the employees table?');

    console.log(`\n${colors.green}${colors.bright} All tests completed successfully!${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}L Test failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  process.exit(0);
}

// Run the tests
runTests();