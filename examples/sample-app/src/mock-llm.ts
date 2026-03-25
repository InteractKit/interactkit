/**
 * Mock LLM that follows LangChain's BaseChatModel interface:
 *   - bindTools(tools) → returns self with tools bound
 *   - invoke(messages) → returns AIMessage-shaped response
 *     - AIMessage.content: string
 *     - AIMessage.tool_calls: Array<{ id, name, args }>
 *
 * Swap with `new ChatOpenAI({ model: 'gpt-4' })` for real use.
 */
export class MockLLM {
  private tools: Array<{ name: string; description: string }> = [];
  private callCount = 0;

  /** LangChain: model.bindTools(tools) → model with tools available */
  bindTools(tools: Array<{ name: string; description: string }>): MockLLM {
    const bound = new MockLLM();
    bound.tools = tools;
    return bound;
  }

  /** LangChain: model.invoke(messages) → AIMessage */
  async invoke(messages: Array<{ role: string; content: string }>): Promise<{
    content: string;
    tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  }> {
    this.callCount++;
    const lastMessage = messages.filter(m => m.role === 'user' || m.role === 'tool').pop();
    const userMessage = lastMessage?.content ?? '';

    // If we have tools and this is the first call with "think" in message, use the think tool
    if (this.callCount === 1 && this.tools.length > 0 && userMessage.toLowerCase().includes('think')) {
      const thinkTool = this.tools.find(t => t.name === 'think');
      if (thinkTool) {
        return {
          content: '',
          tool_calls: [{
            id: `call_${this.callCount}`,
            name: 'think',
            args: { query: userMessage },
          }],
        };
      }
    }

    // Final response — no tool calls
    this.callCount = 0;
    return {
      content: `Mock LLM response to: "${userMessage}"`,
    };
  }
}
