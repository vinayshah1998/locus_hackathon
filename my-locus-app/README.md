# my-locus-app

A Locus-powered payment agent using Anthropic Claude Agent SDK with MCP integration and credit checking capabilities.

## About

This project was created using `create-locus-app` and is configured to use:
- **Claude Agent SDK** for AI interactions with tool support
- **Locus MCP server** integration with API key authentication
- **Credit Checking Server** integration for agent creditworthiness verification
- **Full tool calling** capabilities including custom credit checking tools

## Getting Started

### Prerequisites

1. **Start the Credit Checking Server** (in a separate terminal):
```bash
cd ../credit_checking_server
uvicorn src.main:app --reload
```

2. **Configure Environment Variables**:
Edit `.env` and set:
- `AGENT_WALLET_ADDRESS` - Your agent's wallet address
- `CREDIT_SERVER_URL` - URL of credit server (default: http://localhost:8000)

### Running the Agent

```bash
# Run the application
npm start

# or with auto-restart on file changes
npm run dev
```

The agent will start in interactive chat mode where you can ask it to:
- Check credit scores of other agents
- View payment histories
- Report payment events
- Perform Locus wallet operations

## Project Structure

- `index.ts` - Main application file with interactive chat interface
- `tools.ts` - Credit checking tool definitions and API wrappers
- `CREDIT_TOOLS.md` - Documentation for credit checking tools
- `.env` - Environment variables (credentials are already configured)
- `.env.example` - Example environment variables for reference
- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## How It Works

1. **MCP Connection**: Connects to Locus MCP server with API key authentication
2. **Tool Registration**: Loads Locus MCP tools and custom credit checking tools
3. **Interactive Chat**: User interacts with agent via terminal chat interface
4. **Tool Execution**: Claude autonomously uses tools to:
   - Query credit scores from the credit checking server
   - View payment histories for creditworthiness assessment
   - Report payment events to update credit scores
   - Perform Locus wallet operations (when needed)
5. **Conversation Context**: Maintains conversation history for coherent multi-turn interactions

## Features

✅ **Fully Integrated:**
- Locus MCP server connection with all Locus tools
- Credit checking server integration with 4 custom tools
- Interactive terminal-based chat interface
- API key authentication (secure, no OAuth needed)
- Automatic tool discovery and registration
- Streaming agent responses with real-time display
- Conversation history and context maintenance
- Visual tool usage indicators

✅ **Credit Checking Capabilities:**
- Query agent credit scores (0-100 scale)
- View detailed payment histories
- Report payment events (on_time, late, defaulted)
- Assess creditworthiness before accepting delayed payments
- Health check for credit server connectivity

## Customization

### Modify the Prompt

Edit the query prompt in `index.ts`:

```javascript
for await (const message of query({
  prompt: 'Your custom prompt here - can ask Claude to use Locus tools!',
  options
})) {
  // handle messages
}
```

### Add More MCP Servers

You can connect to multiple MCP servers:

```javascript
const mcpServers = {
  'locus': {
    type: 'http',
    url: 'https://mcp.paywithlocus.com/mcp',
    headers: { 'Authorization': `Bearer ${process.env.LOCUS_API_KEY}` }
  },
  'another-server': {
    type: 'sse',
    url: 'https://example.com/mcp',
    headers: { 'X-API-Key': process.env.OTHER_API_KEY }
  }
};
```

### Restrict Tools

Limit which tools Claude can use with `allowedTools`:

```javascript
const options = {
  mcpServers,
  allowedTools: [
    'mcp__locus__specific_tool',  // only allow specific tool
    'mcp__list_resources'
  ],
  apiKey: process.env.ANTHROPIC_API_KEY
};
```

### Handle Different Message Types

Process various message types from the agent:

```javascript
for await (const message of query({ prompt, options })) {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log('MCP servers:', message.mcp_servers);
  } else if (message.type === 'result' && message.subtype === 'success') {
    console.log('Final result:', message.result);
  } else if (message.type === 'error_during_execution') {
    console.error('Error:', message.error);
  }
}
```

## Environment Variables

Your `.env` file contains:
- `LOCUS_API_KEY` - Your Locus API key for MCP server authentication
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude

**Important**: Never commit your `.env` file to version control!

## Example Interactions

### Check Credit Score
```
You: What is the credit score for agent 0xAGENT_BOB_WALLET_002?

Agent: Let me check that for you.
🏦 Agent using credit checking tool: get_credit_score

The credit score for agent 0xAGENT_BOB_WALLET_002 is 85 out of 100.
This is a good score indicating reliable payment history with 42 payments recorded.
The agent is not new to the system.
```

### Review Payment History
```
You: Show me the payment history for agent 0xAGENT_BOB_WALLET_002

Agent: Let me retrieve that information.
🏦 Agent using credit checking tool: get_payment_history

Agent 0xAGENT_BOB_WALLET_002 has 42 payment events:
- 38 on-time payments
- 3 late payments (1-7 days)
- 1 late payment (8-30 days)
- 0 defaults

Overall, this agent shows reliable payment behavior with 90% on-time rate.
```

### Report Payment
```
You: I just received $250 from agent 0xAGENT_BOB_WALLET_002.
     It was due yesterday but paid today (1 day late).

Agent: I'll report that payment event to update credit scores.
🏦 Agent using credit checking tool: report_payment

Payment reported successfully!
- Event ID: evt_abc123xyz
- Status: late (1 day overdue)
- Credit scores updated:
  - Payer (Bob): 84 (-1 for late payment)
  - Payee (You): 72 (no change)
```

### Assess Creditworthiness
```
You: Agent Bob wants to pay me $500 but needs 30 days. Should I accept?

Agent: Let me check Bob's creditworthiness.
🏦 Agent using credit checking tool: get_credit_score
🏦 Agent using credit checking tool: get_payment_history

Based on my analysis:
- Credit Score: 85 (Good)
- Payment History: 90% on-time rate, no defaults
- Risk Assessment: Low risk

Recommendation: ACCEPT the 30-day payment delay.
Agent Bob has demonstrated reliable payment behavior and a strong credit score.
Consider documenting the agreement and reporting the payment when received.
```

## Debugging

If the agent doesn't respond or you want to see what's happening behind the scenes:

### Enable Debug Mode

Add to your `.env` file:
```bash
DEBUG=true
```

Then restart the agent. You'll see:
- All message types from Claude Agent SDK
- Tool execution details
- Message content for debugging

### Example Debug Output
```
[DEBUG] Message type: assistant, subtype: none
[DEBUG] Message: {"type":"assistant","content":[{"type":"text","text":"Let me check..."}]}

  🔧 Using tool: check_credit_server
```

For more troubleshooting help, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Learn More

- [Credit Tools Documentation](CREDIT_TOOLS.md) - Detailed credit checking tools guide
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Debug and fix common issues
- [Locus Documentation](https://docs.paywithlocus.com)
- [Claude SDK Documentation](https://docs.anthropic.com)
- [Claude API Reference](https://docs.anthropic.com/en/api)
- [Credit Server API](../credit_checking_server/API_SPEC.md)

## Support

For issues or questions:
- Check the [Locus documentation](https://docs.paywithlocus.com)
- Contact Locus support

---

Built with Locus 🎯
