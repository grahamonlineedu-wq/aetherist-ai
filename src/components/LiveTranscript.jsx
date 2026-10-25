import React from 'react';

export default function LiveTranscript({ topic, entries = [], isRecording = false }) {
  const visibleEntries = Array.isArray(entries)
    ? entries.filter((item) => item && typeof item.text === 'string' && item.text.trim())
    : [];

  return (
    <div className="live-transcript" data-testid="live-transcript" aria-live="polite" aria-label={`${topic || 'Meeting'} transcript`}>
      {visibleEntries.length === 0 ? (
        <p className="empty-state">
          {isRecording ? 'Speak into your microphone to transcribe…' : 'Say something to start transcribing…'}
        </p>
      ) : (
        visibleEntries.map((item, index) => (
          <article className="transcript-item" key={item.id || `${item.time || 'live'}-${index}`}>
            <div className="transcript-meta">
              <strong>{item.speaker ?? 'Unknown speaker'}</strong>
              <time>{item.time || 'Time unavailable'}</time>
            </div>
            <p>{item.text.trim()}</p>
          </article>
        ))
      )}
    </div>
  );
}
