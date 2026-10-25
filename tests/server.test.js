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
    assert.deepEqual(body.speakers.map(({ id }) => id), ['sarah', 'david', 'elena']);
  });

  it('returns and saves speaker controls with bounded values', async () => {
    const defaultsResponse = await fetch(`${baseUrl}/api/speakers`);
    const defaults = await defaultsResponse.json();
    assert.equal(defaultsResponse.status, 200);
    assert.equal(defaults.speakers[1].gain, 100);

    const updatedSpeakers = defaults.speakers.map((speaker) => (
      speaker.id === 'david'
        ? { ...speaker, gain: 75, suppression: 60 }
        : speaker
    ));
    const updateResponse = await fetch(`${baseUrl}/api/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers: updatedSpeakers }),
    });
    const update = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(update.speakers.find(({ id }) => id === 'david').gain, 75);

    const invalidResponse = await fetch(`${baseUrl}/api/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        speakers: updatedSpeakers.map((speaker) => (
          speaker.id === 'david' ? { ...speaker, gain: 101 } : speaker
        )),
      }),
    });
    assert.equal(invalidResponse.status, 400);
  });

  it('returns meeting history cards', async () => {
    const response = await fetch(`${baseUrl}/api/history`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(Array.isArray(body.history));
    assert.ok(body.history.every((card) => (
      card.id &&
      card.title &&
      typeof card.summary === 'string' &&
      Array.isArray(card.highlights)
    )));
  });

  it('rejects refinement requests without usable transcript text', async () => {
    const response = await fetch(`${baseUrl}/api/refine-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: '   ' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { success: false, error: 'rawText is required' });
  });

  it('rejects malformed audio before calling an external transcription provider', async () => {
    const response = await fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: 'not-base64', topic: 'Overview' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /base64/i);
  });

  it('exports the current transcript as a data URI PDF', async () => {
    const response = await fetch(`${baseUrl}/api/export-pdf`, { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.match(body.pdfData, /^data:application\/pdf(?:;filename=[^;,]+)?;base64,/);
  });

  it('rejects malformed PDF topic payloads with JSON errors', async () => {
    const response = await fetch(`${baseUrl}/api/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics: [] }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).success, false);
  });

  it('broadcasts transcript changes in real time over Socket.IO', async () => {
    const client = createClient(baseUrl, { transports: ['websocket'] });
    let timeout;
    try {
      const update = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Timed out waiting for transcript update')), 2000);
        client.on('live-transcript-update', (payload) => {
          const entries = payload.topics.Technical || [];
          if (entries.some((item) => item.text.includes('test client received'))) {
            clearTimeout(timeout);
            resolve(payload);
          }
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
      clearTimeout(timeout);
      client.close();
    }
  });
});
