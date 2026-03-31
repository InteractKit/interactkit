/**
 * A scripted mock LLM for testing. Returns pre-defined responses
 * and tool calls in sequence, compatible with LangChain's BaseChatModel.
 *
 * Usage:
 *   const llm = mockLLM([
 *     { toolCalls: [{ name: 'think', args: { query: 'test' } }] },
 *     { response: 'Done thinking.' },
 *   ]);
 */

export interface MockToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface MockLLMStep {
  /** Text response from the LLM */
  response?: string;
  /** Tool calls the LLM makes (triggers the tool-call loop) */
  toolCalls?: MockToolCall[];
}

/**
 * Create a mock LLM executor that follows a scripted sequence.
 * Each invoke() call consumes the next step in the script.
 */
export function mockLLM(script: MockLLMStep[]) {
  let stepIndex = 0;
  const calls: Array<{ messages: any[] }> = [];

  const mock = {
    /** Recorded invoke() calls for assertions */
    calls,

    /** bindTools is a no-op for mock — tools are handled by the framework */
    bindTools() {
      return mock;
    },

    /** Invoke the mock — returns the next scripted response */
    async invoke(messages: any[]) {
      calls.push({ messages: [...messages] });

      if (stepIndex >= script.length) {
        throw new Error(
          `mockLLM: script exhausted after ${script.length} steps. ` +
          `The LLM loop called invoke() more times than expected.`
        );
      }

      const step = script[stepIndex++];

      const toolCalls = (step.toolCalls ?? []).map((tc, i) => ({
        name: tc.name,
        args: tc.args,
        id: tc.id ?? `mock_call_${stepIndex}_${i}`,
        type: 'tool_use' as const,
      }));

      return {
        content: step.response ?? '',
        tool_calls: toolCalls,
        additional_kwargs: {},
      };
    },
  };

  return mock;
}
