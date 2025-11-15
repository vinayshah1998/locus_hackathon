import 'dotenv/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import { creditCheckingTools, executeCreditTool } from './tools.js';

// Enable debug mode to see all message types
const DEBUG_MODE = process.env.DEBUG === 'true';

async function main(): Promise<void> {
  try {
    console.log('🎯 Starting Locus Payment Agent Chat Interface...\n');
    if (DEBUG_MODE) {
      console.log('🐛 Debug mode enabled - showing all message types\n');
    }

    // 1. Configure MCP connection to Locus
    console.log('Configuring Locus MCP connection...');
    const mcpServers = {
      'locus': {
        type: 'http' as const,
        url: 'https://mcp.paywithlocus.com/mcp',
        headers: {
          'Authorization': `Bearer ${process.env.LOCUS_API_KEY}`
        }
      }
    };

    const options = {
      mcpServers,
      tools: creditCheckingTools, // Add credit checking tools
      allowedTools: [
        'mcp__locus__*',      // Allow all Locus tools
        'mcp__list_resources',
        'mcp__read_resource',
        'get_credit_score',   // Credit checking tools
        'get_payment_history',
        'report_payment',
        'check_credit_server'
      ],
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Auto-approve tool usage
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (toolName.startsWith('mcp__locus__')) {
          console.log(`\n🔧 Agent using Locus tool: ${toolName}`);
          return {
            behavior: 'allow' as const,
            updatedInput: input
          };
        }
        if (['get_credit_score', 'get_payment_history', 'report_payment', 'check_credit_server'].includes(toolName)) {
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
      },
      // Execute custom credit checking tools
      executeTool: async (toolName: string, input: Record<string, unknown>) => {
        if (['get_credit_score', 'get_payment_history', 'report_payment', 'check_credit_server'].includes(toolName)) {
          try {
            const result = await executeCreditTool(toolName, input);
            return {
              success: true,
              result
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              success: false,
              error: errorMessage
            };
          }
        }
        // For MCP tools, return undefined to let SDK handle them
        return undefined;
      }
    };

    console.log('✓ MCP configured');
    console.log('✓ Credit checking tools loaded\n');

    // 2. Test connection with initial query
    console.log('Testing Locus MCP connection...');
    let mcpConnected = false;

    for await (const message of query({
      prompt: 'Say "ready" if you can see the Locus tools.',
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
    console.log('  🏦 get_credit_score');
    console.log('  🏦 get_payment_history');
    console.log('  🏦 report_payment');
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
