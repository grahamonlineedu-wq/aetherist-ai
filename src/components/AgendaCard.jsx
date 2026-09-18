import React from 'react';

export default function AgendaCard({ topic }) {
  if (!topic) return null;

  return (
    <article className="agenda-card" data-testid={`agenda-${topic.id || topic.title}`}>
      <h4>📌 Topic Category: {topic.title}</h4>
      <div className="agenda-items">
        {(topic.items || []).map((item, index) => (
          <p key={`${item.speaker}-${index}`}>
            <strong>{item.speaker}:</strong> {item.text}
          </p>
        ))}
      </div>
    </article>
  );
}
