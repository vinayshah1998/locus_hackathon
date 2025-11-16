import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { creditCheckingServer } from './tools.js';

// Enable debug mode to see all message types
const DEBUG_MODE = process.env.DEBUG === 'true';

async function main(): Promise<void> {
  try {
    console.log('🎯 Starting Locus Payment Agent Chat Interface...\n');
    if (DEBUG_MODE) {
      console.log('🐛 Debug mode enabled - showing all message types\n');
    }

    // 1. Configure MCP connections (Locus + Credit Checking)
    console.log('Configuring MCP connections...');
    const mcpServers = {
      'locus': {
        type: 'http' as const,
        url: 'https://mcp.paywithlocus.com/mcp',
        headers: {
          'Authorization': `Bearer ${process.env.LOCUS_API_KEY}`
        }
      },
      'credit-checking': creditCheckingServer  // Add credit checking MCP server
    };

    const options = {
      mcpServers,
      allowedTools: [
        'mcp__locus__*',                      // Allow all Locus tools
        'mcp__list_resources',
        'mcp__read_resource',
        'mcp__credit-checking__*'             // Allow all credit checking tools
      ],
      apiKey: process.env.ANTHROPIC_API_KEY,
      systemPrompt: `You are a payment agent with access to the following tools:

Credit Checking Tools (via MCP):
- mcp__credit-checking__check_credit_server - Check if the credit checking server is running
- mcp__credit-checking__get_credit_score - Get credit score for an agent (0-100 scale) [$0.002 USD via x402]
- mcp__credit-checking__get_payment_history - View detailed payment history for an agent [$0.001 USD via x402]
- mcp__credit-checking__report_payment - Report a payment event to update credit scores [FREE]

Locus Payment Tools (via MCP):
- mcp__locus__send_to_address - Send USDC to any wallet address
- mcp__locus__send_to_contact - Send USDC to whitelisted contacts
- mcp__locus__get_payment_context - Check wallet balance and payment context

X402 PAYMENT PROTOCOL:
The credit checking tools use x402 protocol - they require payment before returning data. Here's how to handle it:

1. FIRST ATTEMPT: Call the credit checking tool normally (without payment params)
2. PAYMENT REQUIRED: If you receive "❌ Payment Required", the response contains:
   - Payment address (recipient wallet)
   - Payment amount (e.g., "0.002")
   - Instructions to retry with payment proof
3. MAKE PAYMENT: Use mcp__locus__send_to_address with:
   - address: [payment address from step 2]
   - amount: [payment amount from step 2]
   - memo: [descriptive memo about what you're paying for]
4. EXTRACT PROOF: From the Locus payment response, extract:
   - transaction_hash (or similar field) → use as payment_proof
   - Use the same amount → payment_amount
   - transaction signature (or hash) → payment_signature
5. RETRY: Call the credit checking tool AGAIN, this time including:
   - payment_proof: [transaction hash from step 4]
   - payment_amount: [amount from step 2]
   - payment_signature: [signature from step 4]
6. SUCCESS: You should receive the actual data (credit score or payment history)

IMPORTANT NOTES:
- Always inform the user when you're making a payment on their behalf
- Track total costs and report them to the user
- If payment fails, explain the error clearly
- The report_payment tool is FREE and doesn't require x402 payment

EXAMPLE FLOW:
User: "Check the credit score for 0xABC123"
You: "I'll check the credit score for 0xABC123. This will cost $0.002."
[Call get_credit_score without payment → receive 402]
You: "Payment required. Sending $0.002 to the credit server..."
[Call send_to_address → get transaction hash]
[Call get_credit_score again with payment_proof → get credit score]
You: "✅ Credit score retrieved! [show results] Total cost: $0.002"

When users ask about credit checking, creditworthiness, payment history, or the credit server, use the credit checking tools to help them.`,
      // Auto-approve tool usage
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (toolName.startsWith('mcp__locus__')) {
          console.log(`\n🔧 Agent using Locus tool: ${toolName}`);
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        if (toolName.startsWith('mcp__credit-checking__')) {
          console.log(`\n🏦 Agent using credit checking tool: ${toolName}`);
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        return {
          behavior: 'deny' as const,
          message: 'Only Locus and credit checking tools are allowed'
        };
      }
    };

    console.log('✓ Locus MCP configured');
    console.log('✓ Credit checking MCP server configured\n');

    // 2. Test connection with initial query
    console.log('Testing Locus MCP connection...');
    let mcpConnected = false;

    // Test query to verify tools are available
    const testPrompt = DEBUG_MODE
      ? 'List all tools you have access to, including credit checking tools.'
      : 'Say "ready" if you can see the Locus tools.';

    for await (const message of query({
      prompt: testPrompt,
      options
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        const mcpServersInfo = (message as any).mcp_servers;
        const mcpStatus = mcpServersInfo?.find((s: any) => s.name === 'locus');
        if (mcpStatus?.status === 'connected') {
          console.log('✓ Connected to Locus MCP server');
          mcpConnected = true;
        } else {
          console.warn('⚠️  MCP connection issue - tools may not be available');
        }
      }
    }

    if (!mcpConnected) {
      console.log('\n⚠️  Warning: Locus MCP server not connected. Agent will have limited capabilities.\n');
    }

    // 3. Start interactive chat
    console.log('\n' + '═'.repeat(60));
    console.log('🤖 Locus Payment Agent - Interactive Chat');
    console.log('═'.repeat(60));
    console.log('\nThis agent can help you with:');
    console.log('  • Locus wallet operations (via Locus MCP)');
    console.log('  • Credit score checking (query other agents)');
    console.log('  • Payment history lookup');
    console.log('  • Reporting payment events');
    console.log('  • Payment negotiations');
    console.log('\nAvailable tools:');
    console.log('  🔧 Locus MCP tools');
    console.log('  🏦 get_credit_score (with x402 payment)');
    console.log('  🏦 get_payment_history (with x402 payment)');
    console.log('  🏦 report_payment (FREE)');
    console.log('  🏦 check_credit_server');
    console.log('\nType your message and press Enter. Type "exit" or "quit" to end.\n');
    console.log('─'.repeat(60));

    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\n💬 You: '
    });

    // Conversation history
    const conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];

    // Chat loop
    const chatLoop = () => {
      rl.prompt();

      rl.on('line', async (userInput: string) => {
        const trimmedInput = userInput.trim();

        // Check for exit commands
        if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
          console.log('\n👋 Goodbye! Thanks for using Locus Payment Agent.\n');
          rl.close();
          process.exit(0);
        }

        // Skip empty inputs
        if (!trimmedInput) {
          rl.prompt();
          return;
        }

        // Add user message to history
        conversationHistory.push({
          role: 'user',
          content: trimmedInput
        });

        // Build conversation context
        let conversationContext = '';
        if (conversationHistory.length > 1) {
          // Include previous messages for context (last 10 messages)
          const recentHistory = conversationHistory.slice(-10);
          conversationContext = recentHistory
            .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
            .join('\n') + '\n\nRespond to the latest user message.';
        } else {
          conversationContext = trimmedInput;
        }

        console.log('\n🤖 Agent: ');
        let hasStartedResponse = false;

        try {
          let assistantResponse = '';
          let toolsUsed: string[] = [];

          for await (const message of query({
            prompt: conversationContext,
            options
          })) {
            // Debug mode: show all message types
            if (DEBUG_MODE) {
              console.log(`\n[DEBUG] Message type: ${message.type}, subtype: ${(message as any).subtype || 'none'}`);
              console.log(`[DEBUG] Message:`, JSON.stringify(message, null, 2).substring(0, 200));
            }

            // Show "thinking" indicator on first message
            if (!hasStartedResponse && message.type !== 'system') {
              process.stdout.write('💭 ');
              hasStartedResponse = true;
            }

            if (message.type === 'assistant') {
              // Handle assistant text responses
              const content = (message as any).content;

              if (typeof content === 'string') {
                // Simple string content
                process.stdout.write(content);
                assistantResponse += content;
              } else if (Array.isArray(content)) {
                // Content blocks array (common format)
                for (const block of content) {
                  if (block.type === 'text' && block.text) {
                    process.stdout.write(block.text);
                    assistantResponse += block.text;
                  } else if (block.type === 'tool_use') {
                    // Tool is being used
                    const toolName = block.name || 'unknown';
                    toolsUsed.push(toolName);
                    console.log(`\n  🔧 Using tool: ${toolName}`);
                  }
                }
              }
            } else if (message.type === 'user') {
              // User message echo (usually not displayed)
              // Skip
            } else if (message.type === 'tool_progress') {
              // Tool execution progress
              const toolInfo = (message as any);
              const toolName = toolInfo.tool || toolInfo.name || 'working';
              console.log(`\n  ⚙️  ${toolName}...`);
            } else if (message.type === 'stream_event') {
              // Streaming event (might contain partial responses)
              const eventData = (message as any);
              if (eventData.delta?.text) {
                process.stdout.write(eventData.delta.text);
                assistantResponse += eventData.delta.text;
              }
            } else if (message.type === 'result') {
              // Final result
              if (message.subtype === 'success') {
                const result = (message as any).result;
                if (result && typeof result === 'string') {
                  // If we haven't displayed anything yet, show the result
                  if (!assistantResponse) {
                    console.log(result);
                    assistantResponse = result;
                  }
                }
              } else if (message.subtype === 'error_during_execution') {
                const error = (message as any).error;
                console.log(`\n\n⚠️  Error: ${error}`);
              } else if (message.subtype === 'error_max_turns') {
                console.log(`\n\n⚠️  Reached maximum conversation turns`);
              } else if (message.subtype === 'error_max_budget_usd') {
                console.log(`\n\n⚠️  Reached maximum budget`);
              }
            }
          }

          // Show tools used summary if any
          if (toolsUsed.length > 0) {
            console.log(`\n\n  ℹ️  Tools used: ${toolsUsed.join(', ')}`);
          }

          // Add assistant response to history
          if (assistantResponse) {
            conversationHistory.push({
              role: 'assistant',
              content: assistantResponse
            });
          }

          console.log('\n');
          rl.prompt();

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`\n❌ Error: ${errorMessage}\n`);
          rl.prompt();
        }
      });

      rl.on('close', () => {
        console.log('\n👋 Chat session ended.\n');
        process.exit(0);
      });
    };

    // Start the chat loop
    chatLoop();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Initialization Error:', errorMessage);
    console.error('\nPlease check:');
    console.error('  • Your .env file contains valid credentials');
    console.error('  • Your network connection is active');
    console.error('  • Your Locus and Anthropic API keys are correct\n');
    process.exit(1);
  }
}

main();
