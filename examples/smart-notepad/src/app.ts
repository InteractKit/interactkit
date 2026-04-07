import express from 'express';
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

// All NoteStore CRUD = autotools. NotesManager = LLM auto-invoke.
// Zero handlers needed.

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DevObserver()],
  timeout: 120_000,
});

await app.boot();

const server = express();
server.use(express.json());

server.post('/notes', async (req, res) => {
  const id = await app.noteStore.addNote(req.body);
  res.json({ id });
});

server.get('/notes', async (_req, res) => {
  const notes = await app.noteStore.listNotes();
  res.json(notes);
});

server.get('/notes/search', async (req, res) => {
  const notes = await app.noteStore.searchNotes({ query: req.query.q as string });
  res.json(notes);
});

server.get('/notes/:id', async (req, res) => {
  const note = await app.noteStore.getNote({ id: req.params.id });
  res.json(note);
});

server.put('/notes/:id', async (req, res) => {
  await app.noteStore.updateNote({ id: req.params.id, ...req.body });
  res.json({ ok: true });
});

server.delete('/notes/:id', async (req, res) => {
  await app.noteStore.deleteNote({ id: req.params.id });
  res.json({ ok: true });
});

server.post('/review', async (_req, res) => {
  const review = await app.notesManager.reviewAllNotes();
  res.json({ review });
});

server.listen(3000, () => console.log('Smart notepad on http://localhost:3000'));
