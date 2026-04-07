import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Logger: {
    log: async (e, input) => { e.state.logs.push(input.msg); return { logged: true, total: e.state.logs.length }; },
    getLogs: async (e) => [...e.state.logs],
  },
  Worker: {
    doWork: async (e, input) => { e.state.jobs++; await e.components.logger.log({ msg: `worker did: ${input.task}` }); return { task: input.task, jobNumber: e.state.jobs }; },
    getWorkerLogs: async (e) => e.components.logger.getLogs(),
  },
  Team: {
    assign: async (e, input) => { e.state.tasksAssigned++; const r = await e.components.worker.doWork({ task: input.task }); return { ...r, teamTasks: e.state.tasksAssigned }; },
    getDeepLogs: async (e) => e.components.worker.getWorkerLogs(),
  },
  Manager: {
    delegate: async (e, input) => e.components.team.assign({ task: input.task }),
    audit: async (e) => e.components.team.getDeepLogs(),
  },
}});
await app.boot();

console.log('[04] === 5-level depth: World → Manager → Team → Worker → Logger ===');
for (let i = 0; i < 10; i++) {
  const r = await app.manager.delegate({ task: `task-${i}` });
  if (r.jobNumber !== i + 1) { console.error(`[04] FAIL: expected job ${i+1}, got ${r.jobNumber}`); process.exit(1); }
}
console.log('[04] 10 tasks delegated through 5 levels');

const logs = await app.manager.audit();
console.log(`[04] audit logs count: ${logs.length}`);
console.log(`[04] has first: ${logs.includes('worker did: task-0')}, has last: ${logs.includes('worker did: task-9')}`);

console.log('[04] === Parallel through 5 levels ===');
const parallel = await Promise.all(Array.from({ length: 10 }, (_, i) => app.manager.delegate({ task: `parallel-${i}` })));
console.log(`[04] parallel job numbers: ${parallel.length} results`);
const finalLogs = await app.manager.audit();
console.log(`[04] final log count: ${finalLogs.length}`);
console.log(`[04] has parallel logs: ${finalLogs.some((l: string) => l.includes('parallel-'))}`);

console.log('[04] DONE');
await app.stop();
