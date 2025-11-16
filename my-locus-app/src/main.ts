/**
 * Main Entry Point for A2A Payment Negotiation Agent
 * Starts the A2A server and provides CLI interface for sending requests
 */

import 'dotenv/config';
import * as readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAgentCard } from './agent-card.js';
import { A2AServer } from './a2a-server.js';
import { TaskStore } from './task-store.js';
import { PaymentNegotiationExecutor } from './payment-executor.js';
import { getPersonality } from './personality.js';
import { AgentRegistry } from './agent-client.js';
import { ConversationalAgent } from './conversational-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from environment
const AGENT_PORT = parseInt(process.env.AGENT_PORT || '4000', 10);
const AGENT_NAME = process.env.AGENT_NAME || `Agent-${AGENT_PORT}`;
const AGENT_WALLET = process.env.AGENT_WALLET_ADDRESS || `0xAGENT_${AGENT_PORT}`;
const AGENT_PERSONALITY = process.env.AGENT_PERSONALITY || 'balanced';
const AGENT_API_KEY = process.env.AGENT_API_KEY;

// Hardcoded agent network - Alice and Bob know about each other
const KNOWN_AGENTS: Record<string, { name: string; wallet: string; url: string }> = {
  alice: {
    name: 'Alice',
    wallet: '0xALICE_WALLET',
    url: 'http://localhost:4000'
  },
  bob: {
    name: 'Bob',
    wallet: '0xBOB_WALLET',
    url: 'http://localhost:4001'
  }
};

// Registry for known agents
const agentRegistry = new AgentRegistry();

async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('🤖 A2A Payment Negotiation Agent');
  console.log('═'.repeat(60));
  console.log();

  // Load personality
  const personality = getPersonality(AGENT_PERSONALITY);
  console.log(`📋 Agent Configuration:`);
  console.log(`   Name: ${AGENT_NAME}`);
  console.log(`   Port: ${AGENT_PORT}`);
  console.log(`   Wallet: ${AGENT_WALLET}`);
  console.log(`   Personality: ${personality.name}`);
  console.log(`   - ${personality.description}`);
  console.log();

  // Create Agent Card
  const agentUrl = `http://localhost:${AGENT_PORT}`;
  const agentCard = createAgentCard(AGENT_NAME, agentUrl, AGENT_WALLET);

  // Create Task Store
  const taskStore = new TaskStore();

  // Create Executor
  const executor = new PaymentNegotiationExecutor({
    personality,
    walletAddress: AGENT_WALLET,
    agentName: AGENT_NAME
  });

  // Create A2A Server
  const server = new A2AServer({
    agentCard,
    taskStore,
    executor,
    apiKey: AGENT_API_KEY
  });

  const app = server.getExpressApp();

  // Serve static web UI files
  const webappPath = path.join(__dirname, '..', 'webapp');
  app.use('/ui', (await import('express')).default.static(webappPath));

  // Redirect root to UI
  app.get('/', (req, res) => {
    res.redirect('/ui');
  });

  // Start server
  const httpServer = app.listen(AGENT_PORT, () => {
    console.log(`✓ A2A Server running at ${agentUrl}`);
    console.log(`✓ Agent Card available at ${agentUrl}/.well-known/agent-card.json`);
    console.log(`✓ Web UI available at ${agentUrl}/ui`);
    console.log();

    // Auto-register known agents
    console.log('📋 Registering known agents...');
    for (const [agentKey, agentInfo] of Object.entries(KNOWN_AGENTS)) {
      if (agentInfo.url !== agentUrl) {
        // Register other agents, not self
        agentRegistry.registerAgent(agentInfo.wallet, agentInfo.url);
        console.log(`   ✓ ${agentInfo.name} (${agentInfo.wallet}) at ${agentInfo.url}`);
      }
    }
    console.log();

    console.log('─'.repeat(60));
    console.log('Natural Language Interface:');
    console.log('  Just type naturally! Examples:');
    console.log('  "Ask bob to pay me $50 for dinner"');
    console.log('  "Request $100 from alice, she can pay in 14 days"');
    console.log('  "Tell bob I need the $200 he owes me today"');
    console.log('');
    console.log('CLI Commands:');
    console.log('  tasks      - List active tasks');
    console.log('  pending    - Show tasks needing input');
    console.log('  decide <taskId> <decision> - Respond to pending task');
    console.log('  agents     - List known agents');
    console.log('  personality - Show current personality');
    console.log('  help       - Show this help');
    console.log('  exit       - Shutdown agent');
    console.log('─'.repeat(60));
    console.log();
  });

  // Initialize conversational agent
  const conversationalAgent = new ConversationalAgent({
    agentName: AGENT_NAME,
    agentWallet: AGENT_WALLET,
    personality,
    knownAgents: KNOWN_AGENTS,
    agentRegistry
  });

  // CLI Interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${AGENT_NAME}> `
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const command = args[0]?.toLowerCase();

    if (!command) {
      rl.prompt();
      return;
    }

    try {
      switch (command) {
        case 'tasks':
          listTasks(taskStore);
          break;

        case 'pending':
          listPendingTasks(taskStore);
          break;

        case 'decide':
          await handleDecideCommand(args, taskStore, executor);
          break;

        case 'personality':
          showPersonality(personality);
          break;

        case 'list':
        case 'agents':
          console.log('Known agents:');
          for (const [name, info] of Object.entries(KNOWN_AGENTS)) {
            const isSelf = info.url === agentUrl;
            console.log(`  ${name}: ${info.wallet} at ${info.url}${isSelf ? ' (this agent)' : ''}`);
          }
          break;

        case 'help':
          showHelp();
          break;

        case 'exit':
        case 'quit':
          console.log('Shutting down...');
          httpServer.close();
          rl.close();
          process.exit(0);

        default:
          // Treat as natural language input
          console.log('\n🤖 Processing your request...\n');
          const response = await conversationalAgent.processUserInput(line.trim());
          console.log(response);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Agent shutdown');
    process.exit(0);
  });

  function listTasks(store: TaskStore): void {
    const tasks = store.getAllTasks();
    if (tasks.length === 0) {
      console.log('No active tasks');
      return;
    }

    console.log('Active Tasks:');
    tasks.forEach((task) => {
      console.log(`  [${task.id.substring(0, 8)}] ${task.status.state}`);
    });
  }

  function listPendingTasks(store: TaskStore): void {
    const tasks = store.getTasksRequiringInput();
    if (tasks.length === 0) {
      console.log('No tasks requiring input');
      return;
    }

    console.log('Tasks Requiring Input:');
    tasks.forEach((task) => {
      console.log(`\n  Task ID: ${task.id}`);
      const metadata = task.metadata as any;
      if (metadata?.paymentRequest) {
        const req = metadata.paymentRequest;
        console.log(`  From: ${req.from_agent}`);
        console.log(`  Amount: $${req.amount} ${req.currency}`);
        console.log(`  Delay: ${req.proposed_delay_days} days`);
      }
      if (metadata?.creditScore) {
        console.log(`  Credit Score: ${metadata.creditScore}`);
      }
    });
    console.log('\nUse: decide <taskId> <approve|reject|counter>');
  }

  async function handleDecideCommand(
    args: string[],
    store: TaskStore,
    exec: PaymentNegotiationExecutor
  ): Promise<void> {
    if (args.length < 3) {
      console.log('Usage: decide <taskId> <approve|reject|counter> [message]');
      return;
    }

    const taskId = args[1];
    const decision = args[2];
    const message = args.slice(3).join(' ') || undefined;

    const task = store.getTask(taskId);
    if (!task) {
      // Try partial match
      const allTasks = store.getAllTasks();
      const matched = allTasks.find((t) => t.id.startsWith(taskId));
      if (!matched) {
        console.log('Task not found');
        return;
      }
      args[1] = matched.id;
      await handleDecideCommand(args, store, exec);
      return;
    }

    if (task.status.state !== 'input-required') {
      console.log('Task is not waiting for input');
      return;
    }

    // Create decision message
    const decisionMessage = {
      kind: 'message' as const,
      messageId: `decision-${Date.now()}`,
      role: 'user' as const,
      taskId,
      contextId: task.contextId,
      parts: [
        {
          kind: 'data' as const,
          data: {
            type: 'user_decision',
            decision,
            message
          }
        }
      ],
      timestamp: new Date().toISOString()
    };

    store.addMessageToHistory(taskId, decisionMessage);

    const newStatus = await exec.execute(taskId, task.contextId, decisionMessage, store);
    store.updateTaskStatus(taskId, newStatus);

    console.log(`Decision processed: ${newStatus.state}`);
    if (newStatus.message) {
      const textParts = newStatus.message.parts.filter((p) => p.kind === 'text');
      if (textParts.length > 0) {
        console.log(`Response: ${(textParts[0] as any).text}`);
      }
    }
  }

  function showPersonality(p: typeof personality): void {
    console.log(`Personality: ${p.name}`);
    console.log(`  ${p.description}`);
    console.log(`  Risk Tolerance: ${p.riskTolerance}`);
    console.log(`  Min Credit Score for Delay: ${p.minCreditScoreForDelay}`);
    console.log(`  Max Acceptable Delay: ${p.maxAcceptableDelayDays} days`);
    console.log(`  Auto-approve Threshold: ${p.autoApproveScoreThreshold}`);
    console.log(`  Payment Strategy: ${p.paymentStrategy}`);
  }

  function showHelp(): void {
    console.log('Natural Language Examples:');
    console.log('  "Ask bob to pay me $50 for dinner"');
    console.log('  "Request $100 from alice, she can pay in 14 days"');
    console.log('  "Tell bob I need the $200 he owes me today"');
    console.log('');
    console.log('CLI Commands:');
    console.log('  tasks                        - List all active tasks');
    console.log('  pending                      - Show tasks needing user input');
    console.log('  decide <id> <decision> [msg] - Respond to pending task');
    console.log('    Decisions: approve, reject, counter');
    console.log('  agents                       - List known agents');
    console.log('  personality                  - Show personality config');
    console.log('  help                         - Show this help');
    console.log('  exit                         - Shutdown agent');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
