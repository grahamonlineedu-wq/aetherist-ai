import React from 'react';

export default function AgendaCard({ topic }) {
  if (!topic) return null;

  const items = Array.isArray(topic.items)
    ? topic.items.filter((item) => item && typeof item.text === 'string' && item.text.trim())
    : [];
  const metadata = [topic.date, topic.duration].filter(
    (value) => typeof value === 'string' && value.trim(),
  );

  return (
    <article className="agenda-card" data-testid={`agenda-${topic.id || topic.title}`}>
      <h3>{topic.title || 'Meeting notes'}</h3>
      {metadata.length > 0 && <p className="agenda-card__metadata">{metadata.join(' · ')}</p>}
      {typeof topic.summary === 'string' && topic.summary.trim() && (
        <p className="agenda-card__summary">{topic.summary.trim()}</p>
      )}
      {items.length > 0 ? (
        <ul className="agenda-items">
          {items.map((item, index) => (
            <li key={item.id || `${item.speaker || 'speaker'}-${index}`}>
              <strong>{item.speaker || 'Unknown speaker'}:</strong> {item.text.trim()}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No meeting notes have been added to this card yet.</p>
      )}
    </article>
  );
}
