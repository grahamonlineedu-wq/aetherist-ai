import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE_URL = 'http://localhost:5000';
const socket = io(API_BASE_URL);

export default function App() {
  const [activeViewTab, setActiveViewTab] = useState('session'); 
  const [activeTopic, setActiveTopic] = useState('Overview');
  const [isRecording, setIsRecording] = useState(false);
  const [micGain, setMicGain] = useState(75);
  const [suppression, setSuppression] = useState(86);
  const [activeSpeaker, setActiveSpeaker] = useState('Sarah Jenkins');
  
  const [transcriptData, setTranscriptData] = useState({ Overview: [], Technical: [], Minutes: [] });
  const [historyCards, setHistoryCards] = useState([]);

  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/session`)
      .then(res => res.json())
      .then(data => { if (data.topics) setTranscriptData(data.topics); })
      .catch(err => console.error("Session sync issue:", err));

    fetch(`${API_BASE_URL}/api/history`)
      .then(res => res.json())
      .then(data => { if (data.history) setHistoryCards(data.history); })
      .catch(err => console.error("History sync issue:", err));

    socket.on('live-transcript-update', (data) => {
      if (data.topics) setTranscriptData(data.topics);
    });

    return () => socket.off('live-transcript-update');
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            socket.emit('audio-stream-chunk', { blob: event.data, speaker: activeSpeaker });
          }
        };
        mediaRecorder.start(3000);
      } catch (err) {
        alert("Microphone capture blocked: " + err.message);
        setIsRecording(false);
      }
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/export-pdf`, { method: 'POST' });
      const data = await response.json();
      if (data.success && data.pdfData) {
        const anchor = document.createElement('a');
        anchor.href = data.pdfData;
        anchor.download = `Aetherist_Minutes_Log.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
    } catch (err) {
      alert("Error compiling data streams.");
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '440px', margin: '0 auto', background: '#080914', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#ffffff' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, #a21caf, #6366f1)', padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span>✨</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>Aetherist AI</h1>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Autonomous Meeting Secretary</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <button 
          style={{ flex: 1, background: activeViewTab === 'history' ? '#2563eb' : '#111322', color: activeViewTab === 'history' ? 'white' : '#94a3b8', border: '1px solid #1e293b', padding: '12px', borderRadius: '24px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          onClick={() => setActiveViewTab(activeViewTab === 'history' ? 'session' : 'history')}
        >
          ⏱️ {activeViewTab === 'history' ? 'Workspace' : 'History'}
        </button>
        <button style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '12px', borderRadius: '24px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }} onClick={handleDownloadPDF}>📥 PDF</button>
        <button style={{ flex: 1.5, background: isRecording ? '#7f1d1d' : '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '24px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }} onClick={toggleRecording}>
          {isRecording ? '🛑 Stop' : '🎙️ Start'}
        </button>
      </div>

      {activeViewTab === 'history' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '12px', margin: 0, color: '#94a3b8', textTransform: 'uppercase' }}>📚 Saved Session Logs</h3>
          {historyCards.map((card) => (
            <div key={card.id} style={{ background: '#0e101f', borderRadius: '16px', padding: '18px', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6366f1', fontWeight: '700', marginBottom: '6px' }}>
                <span>📅 {card.date}</span>
                <span>⏱️ {card.duration}</span>
              </div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#ffffff' }}>{card.title}</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.4' }}>{card.summary}</p>
              <div style={{ background: '#111322', padding: '10px', borderRadius: '8px', borderTop: '2px solid #a855f7' }}>
                {card.highlights.map((hlt, idx) => (
                  <div key={idx} style={{ fontSize: '11.5px', color: '#94a3b8', margin: '2px 0' }}>• {hlt}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ background: '#0e101f', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b', marginBottom: '20px' }}>
            <div style={{ height: '60px', width: '100%', position: 'relative', marginBottom: '14px' }}>
              <svg viewBox="0 0 400 60" style={{ width: '100%', height: '100%' }}>
                <path d={isRecording ? "M 0 30 Q 50 5, 100 50 T 200 10 T 300 55 T 400 30" : "M 0 30 L 400 30"} fill="none" stroke="#2563eb" strokeWidth="2" />
                <path d={isRecording ? "M 0 35 Q 60 50, 120 10 T 240 50 T 360 10 T 400 35" : "M 0 35 L 400 35"} fill="none" stroke="#c026d3" strokeWidth="1.5" opacity="0.5" />
              </svg>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Active Input</div><div style={{ fontSize: '12px', fontWeight: '700', color: isRecording ? '#10b981' : '#f1f5f9' }}>{isRecording ? activeSpeaker.split(' ')[0] : 'None'}</div></div>
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Gain Scale</div><div style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6' }}>{micGain}%</div></div>
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Suppression</div><div style={{ fontSize: '12px', fontWeight: '700', color: '#a855f7' }}>{suppression} dB</div></div>
            </div>
          </div>

          <div style={{ background: '#0e101f', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '12px', margin: '0 0 16px 0', color: '#94a3b8', textTransform: 'uppercase' }}>Speaker Environments</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
              {['Sarah Jenkins', 'David Chen', 'Elena Rosto'].map((name) => (
                <button key={name} style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', border: 'none', background: activeSpeaker === name ? '#2563eb' : '#111322', color: activeSpeaker === name ? 'white' : '#94a3b8' }} onClick={() => setActiveSpeaker(name)}>{name.split(' ')[0]}</button>
              ))}
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}><span>Amplification Gain</span></div>
              <input type="range" min="0" max="100" value={micGain} onChange={(e) => setMicGain(Number(e.target.value))} style={{ width: '100%', accentColor: '#2563eb' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}><span>Suppression Density</span></div>
              <input type="range" min="0" max="120" value={suppression} onChange={(e) => setSuppression(Number(e.target.value))} style={{ width: '100%', accentColor: '#a855f7' }} />
            </div>
          </div>

          <div style={{ background: '#0e101f', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b' }}>
            <h3 style={{ fontSize: '12px', margin: '0 0 14px 0', color: '#94a3b8', textTransform: 'uppercase' }}>Live Transcripts</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {['Overview', 'Technical', 'Minutes'].map((tab) => (
                <button key={tab} style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', fontWeight: '600', border: 'none', background: activeTopic === tab ? '#2563eb' : '#111322', color: activeTopic === tab ? 'white' : '#94a3b8' }} onClick={() => setActiveTopic(tab)}>{tab}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(transcriptData[activeTopic] || []).length === 0 ? (
                <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center', margin: '10px 0' }}>Waiting for speech chunks...</p>
              ) : (
                transcriptData[activeTopic].map((item, index) => (
                  <div key={index} style={{ borderBottom: index !== transcriptData[activeTopic].length - 1 ? '1px solid #16192e' : 'none', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: '#6366f1', fontWeight: '700' }}>{item.speaker}</span>
                      <span style={{ color: '#475569' }}>{item.time}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>{item.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
