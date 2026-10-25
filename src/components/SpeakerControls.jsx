import React from 'react';

export default function SpeakerControls({
  speakers,
  selectedSpeakerId,
  onSelectSpeaker,
  onSettingChange,
}) {
  const selectedSpeaker = speakers.find((speaker) => speaker.id === selectedSpeakerId) || speakers[0];
  if (!selectedSpeaker) return null;

  return (
    <section className="speaker-panel panel" aria-labelledby="speaker-heading">
      <h2 id="speaker-heading">Speaker environments</h2>
      <div className="speaker-buttons" role="group" aria-label="Choose a speaker">
        {speakers.map((speaker) => (
          <button
            type="button"
            key={speaker.id}
            className={speaker.id === selectedSpeaker.id ? 'selected' : ''}
            onClick={() => onSelectSpeaker(speaker.id)}
            aria-pressed={speaker.id === selectedSpeaker.id}
          >
            {speaker.name}
          </button>
        ))}
      </div>

      <div className="speaker-setting">
        <label htmlFor="speaker-gain">
          <span>Amplification gain</span>
          <output htmlFor="speaker-gain">{selectedSpeaker.gain}%</output>
        </label>
        <input
          id="speaker-gain"
          type="range"
          min="0"
          max="100"
          step="1"
          value={selectedSpeaker.gain}
          style={{ '--range-color': '#3478f6', '--range-progress': `${selectedSpeaker.gain}%` }}
          onChange={(event) => onSettingChange(selectedSpeaker.id, 'gain', Number(event.target.value))}
        />
      </div>

      <div className="speaker-setting">
        <label htmlFor="speaker-suppression">
          <span>Suppression density</span>
          <output htmlFor="speaker-suppression">{selectedSpeaker.suppression} dB</output>
        </label>
        <input
          id="speaker-suppression"
          type="range"
          min="0"
          max="120"
          step="1"
          value={selectedSpeaker.suppression}
          style={{
            '--range-color': '#b246db',
            '--range-progress': `${(selectedSpeaker.suppression / 120) * 100}%`,
          }}
          onChange={(event) => onSettingChange(selectedSpeaker.id, 'suppression', Number(event.target.value))}
        />
      </div>
      <p className="speaker-setting-note">
        Gain is applied to recordings. The suppression level is saved per speaker; actual noise cancellation depends on browser support.
      </p>
    </section>
  );
}
