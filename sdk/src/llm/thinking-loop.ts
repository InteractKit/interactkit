import { randomUUID } from "node:crypto";
import type { ThinkingLoopOptions } from "./decorators.js";
import type { EventEnvelope } from "../events/types.js";

/** A scheduled item — fires as a notification at the scheduled time, optionally recurring. */
export interface ScheduledItem {
  id: string;
  message: string;
  nextFireAt: number;
  intervalMs: number | null;
  createdAt: number;
}

/** A pending task waiting for the LLM to respond via the thinking loop. */
export interface PendingTask {
  id: string;
  message: string;
  resolve: (result: string) => void;
  reject: (error: unknown) => void;
  createdAt: number;
  softReminded: boolean;
  defers: number;
}

// ── Event types emitted by the thinking loop ──

export interface ThinkingLoopTickEvent {
  type: "tick";
  tickNumber: number;
  pending: number;
  durationMs: number;
}

export interface ThinkingLoopRespondEvent {
  type: "respond";
  taskId: string;
  message: string;
  result: string;
  latencyMs: number;
}

export interface ThinkingLoopTimeoutEvent {
  type: "timeout";
  taskId: string;
  message: string;
  kind: "soft" | "hard";
  elapsedMs: number;
}

export interface ThinkingLoopIdleEvent {
  type: "idle";
  tickNumber: number;
}

export interface ThinkingLoopErrorEvent {
  type: "error";
  error: Error;
  taskId?: string;
}

export interface ThinkingLoopTaskEvent {
  type: "task_pushed";
  taskId: string;
  message: string;
  pending: number;
}

export interface ThinkingLoopThoughtEvent {
  type: "thought";
  content: string;
}

export interface ThinkingLoopSleepEvent {
  type: "sleep";
  ticks: number;
  durationMs: number;
}

export interface ThinkingLoopIntervalEvent {
  type: "set_interval";
  previousMs: number;
  newMs: number;
}

export interface ThinkingLoopDeferEvent {
  type: "defer";
  taskId: string;
  message: string;
  defersUsed: number;
  maxDefers: number;
}

export interface ThinkingLoopScheduleEvent {
  type: "schedule";
  id: string;
  message: string;
  delayMs: number;
  intervalMs: number | null;
}

export interface ThinkingLoopUnscheduleEvent {
  type: "unschedule";
  id: string;
}

export type ThinkingLoopEvent =
  | ThinkingLoopTickEvent
  | ThinkingLoopRespondEvent
  | ThinkingLoopTimeoutEvent
  | ThinkingLoopIdleEvent
  | ThinkingLoopErrorEvent
  | ThinkingLoopTaskEvent
  | ThinkingLoopThoughtEvent
  | ThinkingLoopSleepEvent
  | ThinkingLoopIntervalEvent
  | ThinkingLoopDeferEvent
  | ThinkingLoopScheduleEvent
  | ThinkingLoopUnscheduleEvent;

type EventHandler = (event: ThinkingLoopEvent) => void;

/**
 * Callback to emit observer events. Injected by LLMEntity so the thinking
 * loop can push events through the observer pipeline without directly
 * depending on it.
 */
export type ObserverEmitter = (envelope: EventEnvelope) => void;

/**
 * Runtime object for the @ThinkingLoop property.
 * Controls the LLM's continuous thinking loop — interval, timeouts,
 * inner monologue toggle, pause/resume.
 *
 * Emits typed events for observability (#2) and pushes EventEnvelopes
 * through the observer pipeline (#3) via the injected emitter.
 */
export class LLMThinkingLoop {
  // ── Config (read/write at runtime) ──
  intervalMs: number;
  softTimeoutMs: number;
  hardTimeoutMs: number;
  contextWindow: number;
  innerMonologue: boolean;
  maxSleepTicks: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  maxDefers: number;
  alwaysThink: boolean;

  // ── Internal state ──
  private _paused = false;
  private _thinking = false;
  private _sleepTicksRemaining = 0;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _tasks: PendingTask[] = [];
  private _notifications: Array<{
    id: string;
    message: string;
    createdAt: number;
  }> = [];
  private _schedules: ScheduledItem[] = [];
  private _onTick: (() => Promise<void>) | null = null;
  private _onForceInvoke: ((task: PendingTask) => Promise<string>) | null =
    null;
  private _lastActivity = 0;
  private _tickCount = 0;
  private _handlers: EventHandler[] = [];
  private _observerEmitter: ObserverEmitter | null = null;
  private _entityId = "";

  constructor(options: ThinkingLoopOptions = {}) {
    this.intervalMs = options.intervalMs ?? 5000;
    this.softTimeoutMs = options.softTimeoutMs ?? 30000;
    this.hardTimeoutMs = options.hardTimeoutMs ?? 60000;
    this.contextWindow = options.contextWindow ?? 50;
    this.innerMonologue = options.innerMonologue ?? true;
    this.maxSleepTicks = options.maxSleepTicks ?? 200;
    this.minIntervalMs = options.minIntervalMs ?? 2000;
    this.maxIntervalMs = options.maxIntervalMs ?? 60000;
    this.maxDefers = options.maxDefers ?? 2;
    this.alwaysThink = options.alwaysThink ?? true;
  }

  // ── Readonly state ──

  get pending(): number {
    return this._tasks.length;
  }

  get isThinking(): boolean {
    return this._thinking;
  }

  get paused(): boolean {
    return this._paused;
  }

  get tasks(): readonly PendingTask[] {
    return this._tasks;
  }

  get tickCount(): number {
    return this._tickCount;
  }

  // ── Event subscription (#2) ──

  /**
   * Subscribe to thinking loop events.
   * ```ts
   * this.thinkingLoop.on((event) => {
   *   if (event.type === 'respond') console.log(`Answered ${event.taskId}`);
   *   if (event.type === 'tick') console.log(`Tick #${event.tickNumber}`);
   * });
   * ```
   */
  on(handler: EventHandler): void {
    this._handlers.push(handler);
  }

  off(handler: EventHandler): void {
    const idx = this._handlers.indexOf(handler);
    if (idx !== -1) this._handlers.splice(idx, 1);
  }

  /** @internal Emit a thinking loop event. Public for LLMEntity access. */
  _emit(event: ThinkingLoopEvent): void {
    for (const h of this._handlers) {
      try {
        h(event);
      } catch {}
    }
    // Also push through observer pipeline (#3)
    this._emitObserver(event);
  }

  private _emitObserver(event: ThinkingLoopEvent): void {
    if (!this._observerEmitter) return;

    const envelope: EventEnvelope = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: this._entityId,
      target: this._entityId,
      type: `thinkingLoop.${event.type}`,
      payload: event,
      timestamp: Date.now(),
    };

    if (event.type === "error") {
      // Use error channel
      envelope.error = {
        message: event.error.message,
        stack: event.error.stack,
      };
    }

    this._observerEmitter(envelope);
  }

  // ── Control ──

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  /** Force an immediate tick (even if paused). */
  async tick(): Promise<void> {
    if (this._thinking) return;
    await this._runTick();
  }

  // ── Task management ──

  /**
   * Push a task into the thinking loop. Returns a promise that resolves
   * when the LLM calls respond(taskId, result).
   */
  pushTask(message: string): Promise<string> {
    const task: PendingTask = {
      id: randomUUID().slice(0, 8),
      message,
      resolve: null!,
      reject: null!,
      createdAt: Date.now(),
      softReminded: false,
      defers: 0,
    };

    const promise = new Promise<string>((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });

    this._tasks.push(task);
    this._lastActivity = Date.now();

    // Trigger immediate tick so tasks don't wait for the next interval
    if (!this._thinking && !this._paused) {
      this._runTick();
    }

    this._emit({
      type: "task_pushed",
      taskId: task.id,
      message: task.message,
      pending: this._tasks.length,
    });

    return promise;
  }

  /**
   * Resolve a pending task. Called when the LLM uses the respond() tool.
   */
  resolveTask(taskId: string, result: string): boolean {
    const idx = this._tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    const task = this._tasks.splice(idx, 1)[0];

    this._emit({
      type: "respond",
      taskId: task.id,
      message: task.message,
      result,
      latencyMs: Date.now() - task.createdAt,
    });

    task.resolve(result);
    return true;
  }

  /**
   * Get a task by ID.
   */
  getTask(taskId: string): PendingTask | undefined {
    return this._tasks.find((t) => t.id === taskId);
  }

  /**
   * Remove and reject a task (used on hard timeout before force-invoke).
   */
  removeTask(taskId: string): PendingTask | undefined {
    const idx = this._tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return undefined;
    return this._tasks.splice(idx, 1)[0];
  }

  // ── Lifecycle ──

  /**
   * Start the thinking loop. Called by LLMEntity after boot.
   * @param onTick — called each tick to run the LLM thinking step
   * @param onForceInvoke — called when a task hits hard timeout; must force a direct LLM result
   */
  start(
    onTick: () => Promise<void>,
    onForceInvoke: (task: PendingTask) => Promise<string>,
  ): void {
    this._onTick = onTick;
    this._onForceInvoke = onForceInvoke;

    this._timer = setInterval(async () => {
      // Check scheduled items before anything else
      this._checkSchedules();

      // Always check timeouts — even while thinking, so a hung LLM call
      // doesn't prevent hard-timeout force-invokes from firing.
      await this._checkTimeouts();

      if (this._paused || this._thinking) return;

      // Sleeping — decrement and skip. Wake early if tasks arrive.
      if (
        this._sleepTicksRemaining > 0 &&
        this._tasks.length === 0 &&
        this._notifications.length === 0
      ) {
        this._sleepTicksRemaining--;
        this._tickCount++;
        this._emit({ type: "idle", tickNumber: this._tickCount });
        return;
      }
      this._sleepTicksRemaining = 0; // wake on tasks

      // Skip tick if no tasks/notifications and no recent activity (save tokens) — unless alwaysThink
      const hasWork = this._tasks.length > 0 || this._notifications.length > 0;
      const recentActivity =
        Date.now() - this._lastActivity < this.intervalMs * 2;
      if (!this.alwaysThink && !hasWork && !recentActivity) {
        this._tickCount++;
        this._emit({ type: "idle", tickNumber: this._tickCount });
        return;
      }

      await this._runTick();
    }, this.intervalMs);
  }

  /**
   * Set the observer emitter and entity ID. Called by LLMEntity after boot
   * so events flow through the observer pipeline.
   */
  setObserver(entityId: string, emitter: ObserverEmitter): void {
    this._entityId = entityId;
    this._observerEmitter = emitter;
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const task of this._tasks) {
      task.reject(new Error("Thinking loop stopped"));
    }
    this._tasks = [];
    this._schedules = [];
    this._notifications = [];
  }

  // ── Internal ──

  private async _runTick(): Promise<void> {
    if (!this._onTick) return;
    this._thinking = true;
    this._tickCount++;
    const start = Date.now();

    try {
      await this._onTick();
      this._emit({
        type: "tick",
        tickNumber: this._tickCount,
        pending: this._tasks.length,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._emit({ type: "error", error });
    } finally {
      this._thinking = false;
    }
  }

  private async _checkTimeouts(): Promise<void> {
    const now = Date.now();

    for (const task of [...this._tasks]) {
      const elapsed = now - task.createdAt;

      // Hard timeout — remove from loop and force-invoke directly
      if (elapsed >= this.hardTimeoutMs) {
        this._emit({
          type: "timeout",
          taskId: task.id,
          message: task.message,
          kind: "hard",
          elapsedMs: elapsed,
        });

        const removed = this.removeTask(task.id);
        if (removed && this._onForceInvoke) {
          try {
            const result = await this._onForceInvoke(removed);
            removed.resolve(result);
          } catch (err) {
            removed.reject(err);
          }
        }
        continue;
      }

      // Soft timeout — mark for reminder (the tick prompt will include it)
      if (elapsed >= this.softTimeoutMs && !task.softReminded) {
        task.softReminded = true;
        this._emit({
          type: "timeout",
          taskId: task.id,
          message: task.message,
          kind: "soft",
          elapsedMs: elapsed,
        });
      }
    }
  }

  /**
   * Build the pending tasks section for the thinking loop prompt.
   */
  buildTasksPrompt(): string {
    if (this._tasks.length === 0) return "";

    const lines = this._tasks.map((t) => {
      const age = Math.round((Date.now() - t.createdAt) / 1000);
      const urgent = t.softReminded
        ? " [URGENT — waiting " + age + "s]"
        : ` [${age}s ago]`;
      return `  [${t.id}] ${t.message}${urgent}`;
    });

    return `\nPending tasks (use respond tool to answer):\n${lines.join("\n")}`;
  }

  /**
   * Push a notification — informational message that doesn't need a response.
   * The LLM sees it on the next tick but doesn't need to call respond().
   */
  pushNotification(message: string): void {
    this._notifications.push({
      id: randomUUID().slice(0, 8),
      message,
      createdAt: Date.now(),
    });
    this._lastActivity = Date.now();

    // Wake from sleep
    if (!this._thinking && !this._paused) {
      this._runTick();
    }
  }

  /**
   * Build the notifications section for the tick prompt.
   * Notifications are consumed after being shown once.
   */
  buildNotificationsPrompt(): string {
    if (this._notifications.length === 0) return "";
    const lines = this._notifications.map((n) => `  - ${n.message}`);
    this._notifications = [];
    return `\nNotifications (FYI — no response needed):\n${lines.join("\n")}`;
  }

  // ── Scheduling ──

  /**
   * Schedule a future notification. Fires once after delayMs, or recurring if intervalMs is set.
   */
  schedule(message: string, delayMs: number, intervalMs?: number): string {
    const id = randomUUID().slice(0, 8);
    this._schedules.push({
      id,
      message,
      nextFireAt: Date.now() + delayMs,
      intervalMs: intervalMs ?? null,
      createdAt: Date.now(),
    });
    this._emit({
      type: "schedule",
      id,
      message,
      delayMs,
      intervalMs: intervalMs ?? null,
    });
    return id;
  }

  /**
   * Remove a scheduled item by ID.
   */
  unschedule(id: string): boolean {
    const idx = this._schedules.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this._schedules.splice(idx, 1);
    this._emit({ type: "unschedule", id });
    return true;
  }

  /**
   * List all scheduled items.
   */
  getSchedules(): readonly ScheduledItem[] {
    return this._schedules;
  }

  /**
   * Check scheduled items — fire any that are due as notifications.
   * Called each tick.
   */
  private _checkSchedules(): void {
    const now = Date.now();
    const fired: string[] = [];

    for (const item of this._schedules) {
      if (now >= item.nextFireAt) {
        this.pushNotification(`[scheduled] ${item.message}`);
        if (item.intervalMs) {
          item.nextFireAt = now + item.intervalMs;
        } else {
          fired.push(item.id);
        }
      }
    }

    // Remove one-shot schedules that fired
    this._schedules = this._schedules.filter((s) => !fired.includes(s.id));
  }

  /**
   * Restore schedules from persisted state. Called on boot.
   */
  restoreSchedules(schedules: ScheduledItem[]): void {
    if (schedules.length > 0) {
      this._schedules = schedules.map((s) => ({ ...s }));
    }
  }

  /**
   * Restore tick count from persisted state. Called on boot.
   */
  restoreTickCount(count: number): void {
    this._tickCount = count;
  }

  /** Record that something happened (prevents idle skip). */
  touch(): void {
    this._lastActivity = Date.now();
  }

  // ── Built-in tool helpers ──

  /** Put the loop to sleep for N ticks. Wakes early if new tasks arrive. */
  sleep(ticks: number): string {
    const clamped = Math.min(Math.max(1, ticks), this.maxSleepTicks);
    this._sleepTicksRemaining = clamped;
    const durationMs = clamped * this.intervalMs;
    this._emit({ type: "sleep", ticks: clamped, durationMs });
    return `Sleeping for ${clamped} ticks (~${durationMs / 1000}s). Will wake early if a task arrives.`;
  }

  /** Change the tick interval. Clamped to [minIntervalMs, maxIntervalMs]. */
  setInterval(ms: number): string {
    const previousMs = this.intervalMs;
    const clamped = Math.min(
      Math.max(ms, this.minIntervalMs),
      this.maxIntervalMs,
    );
    this.intervalMs = clamped;
    this._emit({ type: "set_interval", previousMs, newMs: clamped });
    // Restart the timer with new interval
    if (this._timer && this._onTick) {
      clearInterval(this._timer);
      this.start(this._onTick, this._onForceInvoke!);
    }
    return `Interval set to ${clamped}ms.`;
  }

  /**
   * Defer a task — push it back with a reset timeout.
   * Returns false if the task has been deferred too many times.
   */
  deferTask(taskId: string): { ok: boolean; message: string } {
    const task = this._tasks.find((t) => t.id === taskId);
    if (!task) return { ok: false, message: `Task ${taskId} not found.` };
    if (task.defers >= this.maxDefers) {
      return {
        ok: false,
        message: `Task ${taskId} already deferred ${task.defers} times (max: ${this.maxDefers}). Must respond now.`,
      };
    }
    task.defers++;
    task.createdAt = Date.now(); // reset timeout clock
    task.softReminded = false;
    this._emit({
      type: "defer",
      taskId: task.id,
      message: task.message,
      defersUsed: task.defers,
      maxDefers: this.maxDefers,
    });
    return {
      ok: true,
      message: `Task ${taskId} deferred (${task.defers}/${this.maxDefers}).`,
    };
  }
}
