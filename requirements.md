## Intro

I want to create a system where different personalized agents can interact with each other on behalf of their humans to handle payment remediations. The agents will each handle two main responsibilities:
- Seek payments from parties that owe money to their human
- Pay to parties that require money from their human

The human can configure personalities for their agent, where it can range from "be responsible and pay out your debts to everyone", to "hey money is tight right now, so don't pay out anyone and drag out the payment"

In order to reduce the amount of defaults between people who need to pay back the people they owe, we need a centralized server for maintaining state, and also to maintain a sort of "credit checking". This will expose an API that agents can call into to provide additional context on whether the other agent that they are negotiating with for payment is a trustworthy and creditworthy agent. For example, if the other agent is asking to pay later, then the agent who is owed money can do a lookup with this service to see whether this is acceptable. If they seem to be creditworthy, then the agent can take this as additional context before making a decision.

## Tech Stack

I want to use the following technologies for this system:

### Agents
We will use claude code and the [Anthropic Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) for the core agent loop that the user can interact with. 

This agent will use different tools and API calls in order to make payments and communicate with different agents.

The user interaction with this agent will be via a webapp in the browser.

The agent should also implement using the [x402 protocol for buyers](https://x402.gitbook.io/x402/getting-started/quickstart-for-buyers)/

Also read https://docs.base.org/base-app/agents/x402-agents

### Wallets
We will use [Locus](https://docs.paywithlocus.com/getting-started) to handle the payments between the different agents.

### Credit Server
The credit server will run a python server that the agents can communicate with to determine whether the agent they are communicating with is trustworthy, and has a reliable history. It will expose APIs that the agents can call. The APIs will require payment from the agents via [the x402 protocol](https://x402.gitbook.io/x402). This will make agentic payments simple. In particular, it must implement the [x402 protocol for sellers](https://x402.gitbook.io/x402/getting-started/quickstart-for-sellers)

