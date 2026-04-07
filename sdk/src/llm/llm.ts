/**
 * LLM support for v4 entities.
 *
 * Creates executors from XML config, collects tools from the entity tree,
 * and registers the built-in invoke() handler for LLM entities.
 */

import { z } from 'zod';
import { LLMContext } from './context.js';
import { runLLMLoop, type ResolvedTool } from './utils.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Entity } from '../entity.js';
import type { EntityNode, HandlerFn } from '../runtime.js';

// ─── Executor Factory ───────────────────────────────────

export interface ExecutorConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Create a LangChain BaseChatModel from provider + model config.
 * Dynamically imports the appropriate LangChain package.
 */
export async function createExecutor(config: ExecutorConfig): Promise<BaseChatModel> {
  const opts: Record<string, any> = { model: config.model };
  if (config.temperature != null) opts.temperature = config.temperature;
  if (config.maxTokens != null) opts.maxTokens = config.maxTokens;

  switch (config.provider) {
    case 'openai': {
      // @ts-ignore — optional peer dependency
      const mod = await import('@langchain/openai');
      return new mod.ChatOpenAI(opts);
    }
    case 'anthropic': {
      // @ts-ignore — optional peer dependency
      const mod = await import('@langchain/anthropic');
      return new mod.ChatAnthropic(opts);
    }
    case 'google': {
      // @ts-ignore — optional peer dependency
      const mod = await import('@langchain/google-genai');
      // @ts-ignore — opts has model but TS can't narrow Record<string, any>
      return new mod.ChatGoogleGenerativeAI(opts);
    }
    case 'ollama': {
      // @ts-ignore — optional peer dependency
      const mod = await import('@langchain/ollama');
      return new mod.ChatOllama(opts);
    }
    default:
      throw new Error(`Unknown LLM provider: "${config.provider}". Supported: openai, anthropic, google, ollama`);
  }
}

// ─── Tool collection from entity tree ───────────────────

interface ToolFromTree {
  name: string;
  description: string;
  eventName: string;
  entityPath: string;
  isOwn: boolean;
}

/**
 * Collect all tools visible to an LLM entity:
 * - Own tools (from the entity's methods)
 * - Ref/component tools (from sibling/child entities)
 */
export function collectLLMTools(
  node: EntityNode,
  tree: EntityNode,
): ToolFromTree[] {
  const tools: ToolFromTree[] = [];

  // Own tools (marked as llm-callable or all own tools for LLM entities)
  for (const method of node.methods) {
    tools.push({
      name: method.methodName,
      description: method.description ?? method.methodName,
      eventName: method.eventName,
      entityPath: node.id,
      isOwn: true,
    });
  }

  // Ref tools (sibling entities)
  for (const ref of node.refs) {
    const refNode = findNode(ref.id, tree) ?? findNodeByType(ref.targetEntityType, tree);
    if (!refNode) continue;
    for (const method of refNode.methods) {
      tools.push({
        name: `${ref.propertyName}_${method.methodName}`,
        description: method.description ?? method.methodName,
        eventName: method.eventName,
        entityPath: refNode.id,
        isOwn: false,
      });
    }
  }

  // Component tools (child entities)
  for (const comp of node.components) {
    if (!comp.entity) continue;
    for (const method of comp.entity.methods) {
      tools.push({
        name: `${comp.propertyName}_${method.methodName}`,
        description: method.description ?? method.methodName,
        eventName: method.eventName,
        entityPath: comp.entity.id,
        isOwn: false,
      });
    }
  }

  return tools;
}

// ─── Invoke handler ─────────────────────────────────────

/**
 * Create the built-in invoke() handler for an LLM entity.
 * This runs the LLM tool-use loop with the entity's tools.
 */
export function createInvokeHandler(
  node: EntityNode,
  tree: EntityNode,
  executor: BaseChatModel,
  handlers: Map<string, Map<string, HandlerFn>>,
  callFn: (target: string, method: string, input?: any) => Promise<any>,
): HandlerFn {
  // Persistent context per entity
  const context = new LLMContext();

  return async (entity: Entity, input?: any) => {
    const message = input?.message ?? String(input);
    const treeTools = collectLLMTools(node, tree);

    // Build resolved tools
    const resolvedTools: ResolvedTool[] = treeTools.map(t => ({
      name: t.name,
      description: t.description,
      schema: z.object({}), // TODO: use registry schemas for proper validation
      invoke: async (args: any) => {
        if (t.isOwn) {
          // Route to own handler
          const handler = handlers.get(node.type)?.get(t.name);
          if (handler) {
            const result = await handler(entity, args);
            return result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
          }
          return `Error: no handler for ${t.name}`;
        } else {
          // Route to ref/component via event bus
          const result = await callFn(t.entityPath, t.eventName, args);
          return result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
        }
      },
    }));

    // Build system prompt from describe
    const describe = node.describe
      ? interpolateDescribe(node.describe, entity.state)
      : node.type;
    context.setSystemPrompt(describe);

    // Add user message
    context.addUser(message);

    // Run LLM loop
    const result = await runLLMLoop(executor, resolvedTools, context, 20, {
      onTextResponse: () => {},
    });

    return result;
  };
}

// ─── Helpers ────────────────────────────────────────────

function interpolateDescribe(template: string, state: Record<string, any>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const parts = expr.trim().split('.');
    let value: any = state;
    for (const part of parts) {
      if (value == null) return 'undefined';
      value = value[part];
    }
    return String(value ?? 'undefined');
  });
}

function findNode(path: string, root: EntityNode): EntityNode | null {
  if (root.id === path) return root;
  for (const comp of root.components) {
    if (comp.entity) {
      const found = findNode(path, comp.entity);
      if (found) return found;
    }
  }
  return null;
}

function findNodeByType(type: string, root: EntityNode): EntityNode | null {
  if (root.type === type) return root;
  for (const comp of root.components) {
    if (comp.entity) {
      const found = findNodeByType(type, comp.entity);
      if (found) return found;
    }
  }
  return null;
}
