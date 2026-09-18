import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io as createClient } from 'socket.io-client';
import { addLiveTranscript, app, httpServer } from '../server/index.js';

let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('Aetherist API', () => {
  it('returns the live session topic contract', async () => {
    const response = await fetch(`${baseUrl}/api/session`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.topics), ['Overview', 'Technical', 'Minutes']);
    assert.ok(Array.isArray(body.topics.Overview));
  });

  it('returns meeting history cards', async () => {
    const response = await fetch(`${baseUrl}/api/history`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.history));
    assert.ok(body.history.every((card) => card.id && card.title && Array.isArray(card.highlights)));
  });

  it('exports the current transcript as a data URI PDF', async () => {
    const response = await fetch(`${baseUrl}/api/export-pdf`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.match(body.pdfData, /^data:application\/pdf;base64,/);
  });

  it('broadcasts transcript changes in real time over Socket.IO', async () => {
    const client = createClient(baseUrl, { transports: ['websocket'] });
    try {
      const update = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for transcript update')), 2000);
        client.once('live-transcript-update', (payload) => {
          clearTimeout(timeout);
          resolve(payload);
        });
      });

      await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });

      addLiveTranscript('Technical', 'The test client received a live transcript event.', 'Test Speaker');
      const payload = await update;
      assert.equal(payload.topics.Technical.at(-1).speaker, 'Test Speaker');
      assert.match(payload.topics.Technical.at(-1).text, /test client/);
    } finally {
      client.close();
    }
  });
});
