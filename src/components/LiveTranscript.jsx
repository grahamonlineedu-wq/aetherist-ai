import React from 'react';

export default function LiveTranscript({ topic, entries = [] }) {
  return (
    <section className="live-transcript" data-testid="live-transcript">
      <h3>📡 Live transcript{topic ? ` · ${topic}` : ''}</h3>
      {entries.length === 0 ? (
        <p className="empty-state">Waiting for speech chunks...</p>
      ) : (
        entries.map((item, index) => (
          <article className="transcript-item" key={`${item.time || 'live'}-${index}`}>
            <div className="transcript-meta">
              <strong>{item.speaker ?? 'Unknown speaker'}</strong>
              <time>{item.time || new Date().toLocaleTimeString()}</time>
            </div>
            <p>{item.text}</p>
          </article>
        ))
      )}
    </section>
  );
}
