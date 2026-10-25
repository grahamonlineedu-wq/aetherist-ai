import React, { useEffect, useRef } from 'react';

export default function AudioMonitor({ stream, isActive, speaker }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let audioContext;
    let source;
    let analyser;
    let frameId;
    let running = true;

    if (isActive && stream && AudioContextClass) {
      try {
        audioContext = new AudioContextClass();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        void audioContext.resume();
      } catch {
        analyser = null;
      }
    }

    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    const draw = () => {
      if (!running) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);

      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      }

      context.clearRect(0, 0, width, height);
      if (samples) analyser.getByteTimeDomainData(samples);

      for (const line of [
        { color: '#3d7cff', scale: 1 },
        { color: '#a846d1', scale: 0.78 },
      ]) {
        context.beginPath();
        context.strokeStyle = line.color;
        context.lineWidth = 2;
        context.globalAlpha = line.scale === 1 ? 0.95 : 0.72;

        const pointCount = Math.max(2, Math.floor(width / 2));
        for (let index = 0; index < pointCount; index += 1) {
          const x = (index / (pointCount - 1)) * width;
          const sampleIndex = samples
            ? Math.floor((index / (pointCount - 1)) * (samples.length - 1))
            : 0;
          const amplitude = samples ? ((samples[sampleIndex] / 128) - 1) * height * 0.36 * line.scale : 0;
          const y = height / 2 + amplitude;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      frameId = window.requestAnimationFrame(draw);
    };

    draw();
    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
      source?.disconnect();
      if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    };
  }, [isActive, stream]);

  return (
    <section className="audio-monitor panel" aria-label="Audio input monitor">
      <div className="audio-waveform" aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>
      <div className="audio-metrics">
        <div>
          <span>Active input</span>
          <strong className={isActive ? 'metric-active' : ''}>{isActive ? speaker?.name || 'Microphone' : 'None'}</strong>
        </div>
        <div>
          <span>Gain scale</span>
          <strong className="metric-blue">{speaker?.gain ?? 100}%</strong>
        </div>
        <div>
          <span>Suppression</span>
          <strong className="metric-purple">{speaker?.suppression ?? 0} dB</strong>
        </div>
      </div>
    </section>
  );
}
