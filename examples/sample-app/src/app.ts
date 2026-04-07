import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

// All tool handlers defined via src="" in entities.xml.
// Memory: autotools. Brain.think: LLM auto-invoke. Mouth.getHistory: autotool.

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DevObserver()],
});

await app.boot();

const answer = await app.agent.ask({ question: 'What is the meaning of life?' });
console.log('Answer:', answer);

const reading = await app.agent.readSensor();
console.log('Sensor:', reading);
