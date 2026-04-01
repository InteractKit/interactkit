import { BaseObserver } from './base.js';
import type { EventEnvelope } from '../events/types.js';

// ANSI colors
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';

function timestamp(): string {
  return DIM + new Date().toLocaleTimeString('en-US', { hour12: false }) + RESET;
}

function formatEntityId(id: string): string {
  // "agent:abc/brain:def" → "brain"
  const last = id.split('/').pop() ?? id;
  return last.split(':')[0];
}

/**
 * Colored dev-mode observer for stdio.
 * Shows events, tool calls, LLM responses, and errors with colors.
 */
export class DevObserver extends BaseObserver {
  event(envelope: EventEnvelope): void {
    const source = formatEntityId(envelope.source);
    const target = formatEntityId(envelope.target);
    const type = envelope.type;

    // Thinking loop events
    if (type.startsWith('thinkingLoop.')) {
      const event = envelope.payload as any;
      const entity = CYAN + source + RESET;
      switch (event?.type) {
        case 'tick':
          console.log(`${timestamp()} ${YELLOW}◆${RESET} ${entity} ${DIM}(tick) #${event.tickNumber} (${event.pending} pending, ${event.durationMs}ms)${RESET}`);
          break;
        case 'respond':
          console.log(`${timestamp()} ${GREEN}◆${RESET} ${entity} ${BOLD}(respond)${RESET} ${DIM}[${event.taskId}] (${event.latencyMs}ms)${RESET}`);
          break;
        case 'timeout':
          console.log(`${timestamp()} ${event.kind === 'hard' ? RED : YELLOW}◆${RESET} ${entity} ${BOLD}(${event.kind} timeout)${RESET} ${DIM}[${event.taskId}] (${event.elapsedMs}ms)${RESET}`);
          break;
        case 'task_pushed':
          console.log(`${timestamp()} ${BLUE}◆${RESET} ${entity} ${DIM}(task) [${event.taskId}] (${event.pending} pending)${RESET}`);
          break;
        case 'thought':
          console.log(`${timestamp()} ${MAGENTA}◆${RESET} ${entity} ${BOLD}(thought)${RESET} ${DIM}${event.content}${RESET}`);
          break;
        case 'sleep':
          console.log(`${timestamp()} ${YELLOW}◆${RESET} ${entity} ${BOLD}(sleep)${RESET} ${DIM}${event.ticks} ticks (~${event.durationMs / 1000}s)${RESET}`);
          break;
        case 'set_interval':
          console.log(`${timestamp()} ${YELLOW}◆${RESET} ${entity} ${BOLD}(interval)${RESET} ${DIM}${event.previousMs}ms → ${event.newMs}ms${RESET}`);
          break;
        case 'defer':
          console.log(`${timestamp()} ${YELLOW}◆${RESET} ${entity} ${BOLD}(defer)${RESET} ${DIM}[${event.taskId}] (${event.defersUsed}/${event.maxDefers})${RESET}`);
          break;
        case 'idle':
          // Don't log idle — too noisy
          break;
        case 'error':
          console.log(`${timestamp()} ${RED}◆${RESET} ${entity} ${RED}thinking error: ${event.error?.message}${RESET}`);
          break;
      }
      this.emit('event', envelope);
      return;
    }

    // Tool calls
    if (type.includes('.')) {
      const method = type.split('.').pop();
      const args = envelope.payload
        ? DIM + ' ' + JSON.stringify(envelope.payload) + RESET
        : '';
      console.log(`${timestamp()} ${GREEN}▸${RESET} ${CYAN}${source}${RESET} → ${MAGENTA}${target}${RESET}${BOLD}.${method}${RESET}${args}`);
    } else {
      // Generic events
      console.log(`${timestamp()} ${BLUE}▸${RESET} ${DIM}${type}${RESET} ${source} → ${target}`);
    }

    this.emit('event', envelope);
  }

  error(envelope: EventEnvelope, error: Error): void {
    const target = formatEntityId(envelope.target);
    const type = envelope.type;
    console.error(`${timestamp()} ${RED}✗ ${target}.${type}${RESET} ${RED}${error.message}${RESET}`);
    this.emit('error', envelope, error);
  }
}
