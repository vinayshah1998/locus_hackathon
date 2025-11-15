# Troubleshooting Guide

## Agent Not Responding

If the agent doesn't seem to respond when you ask it questions, try these steps:

### 1. Enable Debug Mode

Set `DEBUG=true` in your `.env` file to see all message types from the Claude Agent SDK:

```bash
# .env
DEBUG=true
```

Then restart the agent:
```bash
npm start
```

This will show you:
- All message types being received
- Message content (first 200 characters)
- Help identify where the response is getting stuck

### 2. Check Credit Server Connection

If asking about the credit server (e.g., "Is the credit server running?"), make sure:

1. **Credit server is running**:
```bash
cd ../credit_checking_server
uvicorn src.main:app --reload
```

2. **Verify it's accessible**:
```bash
curl http://localhost:8000/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T...",
  "version": "1.0.0"
}
```

3. **Check CREDIT_SERVER_URL in .env**:
```bash
CREDIT_SERVER_URL=http://localhost:8000
```

### 3. Check Network Issues

If tools are timing out:
- Ensure no firewall blocking localhost:8000
- Check MongoDB is running (credit server needs it)
- Check Locus MCP server is accessible

### 4. Review Tool Execution

When the agent uses a tool, you should see:
```
🤖 Agent: 💭
  🔧 Using tool: check_credit_server
```

If you see the tool being used but no response:
- Check the credit server logs for errors
- Enable DEBUG mode to see tool results
- Check network connectivity

### 5. Common Message Types

In debug mode, you'll see message types like:
- `system` - System messages (init, MCP connection)
- `user` - Your input echoed back
- `assistant` - Agent's response (contains text or tool_use)
- `tool_progress` - Tool execution in progress
- `result` - Final result with success/error
- `stream_event` - Streaming text deltas

### 6. Test with Simple Query

Try a simple test first:
```
You: Hello
```

Should get immediate response. If this works but tool queries don't, the issue is with tool execution.

### 7. Check Environment Variables

Verify all required variables are set in `.env`:
```bash
LOCUS_API_KEY=...        # For Locus MCP
ANTHROPIC_API_KEY=...    # For Claude
CREDIT_SERVER_URL=...    # For credit checking
AGENT_WALLET_ADDRESS=... # Your agent identity
```

## Specific Issues

### Agent shows "💭" but nothing else

This means:
- Agent is receiving messages but not producing text output
- Check DEBUG mode to see what messages are coming through
- Likely the message format isn't being handled correctly

### Tool execution fails silently

Check:
1. Credit server is running and accessible
2. MongoDB is running (needed by credit server)
3. Tool returns valid JSON response

### "Payment required" errors

These are expected if x402 payment verification is enabled in the credit server. To disable for testing:

In `credit_checking_server/.env`:
```bash
X402_ENABLED=false
```

Or accept test payment proofs (development mode):
```bash
ENV=development
```

### Conversation history issues

If the agent loses context:
- History is limited to last 10 messages
- Each message is stored as role + content
- Check if responses are being saved to history

## Getting Help

If issues persist:

1. **Check logs with DEBUG=true**
2. **Test each component separately**:
   - Credit server health check
   - Simple agent query (no tools)
   - Individual tool execution
3. **Review recent changes** to code or environment
4. **Check GitHub issues** for similar problems

## Example Debug Session

```bash
# Terminal 1: Start credit server with logs
cd credit_checking_server
uvicorn src.main:app --reload --log-level debug

# Terminal 2: Start agent with debug mode
cd my-locus-app
DEBUG=true npm start

# Now try your query and observe both terminals
```

Compare the logs:
- Agent should show tool execution
- Credit server should show incoming request
- Response should flow back to agent

## Still Not Working?

Create a minimal reproduction:
1. Start fresh terminal
2. Verify credit server: `curl http://localhost:8000/health`
3. Start agent with DEBUG=true
4. Try: "Check if credit server is running"
5. Capture all debug output
6. Check where the flow breaks
