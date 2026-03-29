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
