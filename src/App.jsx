import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
<<<<<<< HEAD

const API_BASE_URL = 'http://localhost:5000';
=======
import AgendaCard from './components/AgendaCard.jsx';
import AudioMonitor from './components/AudioMonitor.jsx';
import LiveTranscript from './components/LiveTranscript.jsx';
import SpeakerControls from './components/SpeakerControls.jsx';
import { API_BASE_URL, isTopicsMap, requestJson } from './lib/api.js';

const DEFAULT_SPEAKERS = [
  { id: 'sarah', name: 'Sarah', gain: 80, suppression: 90 },
  { id: 'david', name: 'David', gain: 100, suppression: 83 },
  { id: 'elena', name: 'Elena', gain: 100, suppression: 120 },
];
const EMPTY_TOPICS = { Overview: [], Technical: [], Minutes: [] };
>>>>>>> 5cc9afccabf8701f3c9e60b9fb68d5c90344e393

function normalizeSpeakers(value) {
  if (!Array.isArray(value)) return DEFAULT_SPEAKERS;
  return DEFAULT_SPEAKERS.map((preset) => {
    const saved = value.find((speaker) => speaker?.id === preset.id);
    const gain = Number(saved?.gain);
    const suppression = Number(saved?.suppression);
    return {
      ...preset,
      gain: Number.isInteger(gain) && gain >= 0 && gain <= 100 ? gain : preset.gain,
      suppression: Number.isInteger(suppression) && suppression >= 0 && suppression <= 120
        ? suppression
        : preset.suppression,
    };
  });
}

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The recorded audio could not be prepared for upload.'));
    reader.readAsDataURL(blob);
  });
}

export default function App() {
<<<<<<< HEAD
  const [activeViewTab, setActiveViewTab] = useState('session'); 
  const [activeTopic, setActiveTopic] = useState('Overview');
  const [isRecording, setIsRecording] = useState(false);
  const [micGain, setMicGain] = useState(100);
  const [suppression, setSuppression] = useState(120);
  const [activeSpeaker, setActiveSpeaker] = useState('Sarah');
  
  const [transcriptData, setTranscriptData] = useState({ Overview: [], Technical: [], Minutes: [] });
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(API_BASE_URL, { query: { speaker: activeSpeaker } });

    socketRef.current.on('live-transcript-update', (data) => {
      if (data.topics) setTranscriptData(data.topics);
    });

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [activeSpeaker]);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        
        // Switched to uncompressed audio streams to fit AI expectations perfectly
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socketRef.current) {
            socketRef.current.emit('audio-stream-chunk', { blob: event.data });
          }
        };
        mediaRecorder.start(250);
      } catch (err) {
        alert("Microphone hardware error: " + err.message);
        setIsRecording(false);
      }
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/export-pdf`, { 
=======
  const [view, setView] = useState('session');
  const [topic, setTopic] = useState('Overview');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(DEFAULT_SPEAKERS[0].id);
  const [speakers, setSpeakers] = useState(DEFAULT_SPEAKERS);
  const [recording, setRecording] = useState(false);
  const [topics, setTopics] = useState(EMPTY_TOPICS);
  const [history, setHistory] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [microphoneStream, setMicrophoneStream] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingContextRef = useRef({ speaker: DEFAULT_SPEAKERS[0].name, topic: 'Overview' });
  const shouldTranscribeRef = useRef(true);
  const settingsTimerRef = useRef(null);
  const selectedSpeaker = speakers.find((speaker) => speaker.id === selectedSpeakerId) || speakers[0];

  useEffect(() => {
    const controller = new AbortController();
    const socket = io(API_BASE_URL || undefined, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('disconnected'));
    socket.on('live-transcript-update', (data) => {
      if (isTopicsMap(data?.topics)) setTopics(data.topics);
    });
    socket.on('speaker-settings-update', (data) => {
      if (Array.isArray(data?.speakers)) setSpeakers(normalizeSpeakers(data.speakers));
    });

    Promise.all([
      requestJson('/api/session', { signal: controller.signal }),
      requestJson('/api/history', { signal: controller.signal }),
    ])
      .then(([session, historyData]) => {
        if (isTopicsMap(session.topics)) setTopics(session.topics);
        if (Array.isArray(session.speakers)) setSpeakers(normalizeSpeakers(session.speakers));
        setHistory(Array.isArray(historyData.history) ? historyData.history : []);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setMessage(`Backend connection failed: ${error.message}`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      shouldTranscribeRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      stopTracks(streamRef.current);
      stopTracks(processedStreamRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close().catch(() => {});
      }
      window.clearTimeout(settingsTimerRef.current);
      socket.disconnect();
    };
  }, []);

  const saveSpeakerSettings = (updatedSpeakers) => {
    window.clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await requestJson('/api/speakers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speakers: updatedSpeakers }),
        });
        if (result.success && Array.isArray(result.speakers)) {
          setSpeakers(normalizeSpeakers(result.speakers));
          setMessage('Speaker settings saved.');
        } else {
          throw new Error(result.error || 'The server did not save these settings.');
        }
      } catch (error) {
        setMessage(`Speaker settings could not be saved: ${error.message}`);
      }
    }, 350);
  };

  const updateSpeakerSetting = (speakerId, field, value) => {
    const updatedSpeakers = speakers.map((speaker) => (
      speaker.id === speakerId ? { ...speaker, [field]: value } : speaker
    ));
    setSpeakers(updatedSpeakers);

    if (speakerId === selectedSpeakerId && field === 'gain' && gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(value / 100, audioContextRef.current.currentTime, 0.03);
    }
    saveSpeakerSettings(updatedSpeakers);
  };

  const refineTranscript = async (text, context) => {
    const result = await requestJson('/api/refine-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: `${context.speaker}: ${text}`,
        topic: context.topic,
      }),
    });
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Article refinement failed.');
    }
    setMessage(`Meeting summary added to ${context.topic}: ${result.data.title}`);
  };

  const transcribeRecording = async (blob, context) => {
    try {
      setMessage('Uploading audio for transcription…');
      const audio = await blobToDataUrl(blob);
      const result = await requestJson('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio,
          mimeType: blob.type || 'audio/webm',
          topic: context.topic,
          speaker: context.speaker,
        }),
      });
      if (!result.success) throw new Error(result.error || 'Transcription failed.');
      if (!result.text) {
        setMessage('Audio was received, but no speech was detected.');
        return;
      }
      setMessage('Transcript received. Preparing meeting summary…');
      await refineTranscript(result.text, context);
    } catch (error) {
      setMessage(`Transcription failed: ${error.message || 'Unexpected server error.'}`);
    }
  };

  const releaseAudioResources = () => {
    stopTracks(streamRef.current);
    stopTracks(processedStreamRef.current);
    streamRef.current = null;
    processedStreamRef.current = null;
    gainNodeRef.current = null;
    setMicrophoneStream(null);
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    releaseAudioResources();
    setRecording(false);
    setMessage('Recording stopped. Preparing transcript…');
  };

  const startRecording = async () => {
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setMessage('Microphone access requires HTTPS or localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('This browser does not support audio recording. Try a current version of Chrome, Edge, or Safari.');
      return;
    }

    let microphone;
    let audioContext;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      let recorderStream = microphone;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        try {
          audioContext = new AudioContextClass();
          await audioContext.resume();
          const source = audioContext.createMediaStreamSource(microphone);
          const gainNode = audioContext.createGain();
          const destination = audioContext.createMediaStreamDestination();
          gainNode.gain.value = (selectedSpeaker?.gain ?? 100) / 100;
          source.connect(gainNode);
          gainNode.connect(destination);
          recorderStream = destination.stream;
          audioContextRef.current = audioContext;
          gainNodeRef.current = gainNode;
          processedStreamRef.current = recorderStream;
        } catch {
          if (audioContext && audioContext.state !== 'closed') await audioContext.close();
          audioContext = null;
          setMessage('Audio gain processing is unavailable; recording with the browser microphone settings.');
        }
      }

      const preferredMimeType = 'audio/webm;codecs=opus';
      const recorderOptions = window.MediaRecorder.isTypeSupported(preferredMimeType)
        ? { mimeType: preferredMimeType }
        : undefined;
      const recorder = new MediaRecorder(recorderStream, recorderOptions);
      recordingContextRef.current = {
        speaker: selectedSpeaker?.name || 'Unknown speaker',
        topic,
      };
      shouldTranscribeRef.current = true;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const context = recordingContextRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        if (blob.size && shouldTranscribeRef.current) await transcribeRecording(blob, context);
      };

      recorderRef.current = recorder;
      streamRef.current = microphone;
      setMicrophoneStream(microphone);
      recorder.start(1000);
      setRecording(true);
      setMessage(`Recording ${selectedSpeaker?.name || 'meeting'} audio. Select Stop when the meeting is finished.`);
    } catch (error) {
      stopTracks(microphone);
      if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
      setMessage(`Microphone permission failed: ${error.name || error.message}`);
    }
  };

  const exportPdf = async () => {
    try {
      setExporting(true);
      setMessage('Preparing PDF…');
      const result = await requestJson('/api/export-pdf', {
>>>>>>> 5cc9afccabf8701f3c9e60b9fb68d5c90344e393
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
<<<<<<< HEAD
      const data = await response.json();
      if (data.success && data.pdfData) {
        const anchor = document.createElement('a');
        anchor.href = data.pdfData;
        anchor.download = `Aetherist_AI_Minutes.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        alert("Server failed building report parameters.");
      }
    } catch (err) {
      alert("Error compiling data streams. Recheck if backend server process is active.");
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '440px', margin: '0 auto', background: '#080914', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#ffffff' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', textAlign: 'center' }}>Aetherist AI</h1>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b', textAlign: 'center' }}>Autonomous Meeting Secretary</p>
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
        <div style={{ padding: '20px 0', color: '#64748b', textAlign: 'center', border: '1px dashed #1e293b', borderRadius: '12px' }}>History storage synced to cloud database profile logs.</div>
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
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Active Input</div><div style={{ fontSize: '12px', fontWeight: '700', color: isRecording ? '#10b981' : '#f1f5f9' }}>{isRecording ? activeSpeaker : 'None'}</div></div>
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Gain Scale</div><div style={{ fontSize: '12px', fontWeight: '700', color: '#3b82f6' }}>{micGain}%</div></div>
              <div><div style={{ fontSize: '10px', color: '#64748b' }}>Suppression</div><div style={{ fontSize: '12px', fontWeight: '700', color: '#a855f7' }}>{suppression} dB</div></div>
            </div>
          </div>

          <div style={{ background: '#0e101f', borderRadius: '16px', padding: '20px', border: '1px solid #1e293b', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '12px', margin: '0 0 16px 0', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Speaker Environments</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
              {['Sarah', 'David', 'Elena'].map((name) => (
                <button key={name} style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', border: 'none', background: activeSpeaker === name ? '#2563eb' : '#111322', color: activeSpeaker === name ? 'white' : '#94a3b8' }} onClick={() => setActiveSpeaker(name)}>{name}</button>
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
            <h3 style={{ fontSize: '12px', margin: '0 0 14px 0', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Live Transcripts</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', justifyContent: 'center' }}>
              {['Overview', 'Technical', 'Minutes'].map((tab) => (
                <button key={tab} style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', fontWeight: '600', border: 'none', background: activeTopic === tab ? '#2563eb' : '#111322', color: activeTopic === tab ? 'white' : '#94a3b8' }} onClick={() => setActiveTopic(tab)}>{tab}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(transcriptData[activeTopic] || []).length === 0 ? (
                <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center', margin: '10px 0' }}>Say something to start transcribing...</p>
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
=======
      if (!result.success || typeof result.pdfData !== 'string') {
        throw new Error(result.error || 'PDF export failed.');
      }
      const link = document.createElement('a');
      link.href = result.pdfData;
      link.download = 'Aetherist_Meeting_Minutes.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage('PDF downloaded.');
    } catch (error) {
      setMessage(`PDF export failed: ${error.message || 'Unexpected server error.'}`);
    } finally {
      setExporting(false);
    }
  };

  const agenda = Object.entries(topics).map(([title, items]) => ({ id: title, title, items }));
  const hasMeetingNotes = agenda.some((item) => item.items.length > 0);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Aetherist AI</h1>
        <p>Autonomous Meeting Secretary</p>
        <span className={`connection-status ${connection}`} role="status">{connection}</span>
      </header>

      <nav className="toolbar" aria-label="Meeting controls">
        <button
          type="button"
          className="history-button"
          onClick={() => setView(view === 'history' ? 'session' : 'history')}
        >
          {view === 'history' ? 'Workspace' : 'History'}
        </button>
        <button type="button" className="pdf-button" onClick={exportPdf} disabled={exporting}>
          {exporting ? 'Preparing…' : 'PDF'}
        </button>
        <button
          type="button"
          className={recording ? 'danger-button' : 'primary-button'}
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? 'Stop' : 'Start'}
        </button>
      </nav>

      {message && <p className="status-message" role="status">{message}</p>}

      {loading ? (
        <p className="empty-state page-loading" role="status">Loading meeting data…</p>
      ) : view === 'history' ? (
        <section className="history-list panel" aria-labelledby="history-heading">
          <h2 id="history-heading">Meeting history</h2>
          {history.length ? history.map((item) => (
            <AgendaCard
              key={item.id || item.title}
              topic={{
                ...item,
                items: Array.isArray(item.highlights)
                  ? item.highlights.map((text) => ({ speaker: 'Highlight', text }))
                  : [],
              }}
            />
          )) : <p className="empty-state">No meeting history yet.</p>}
        </section>
      ) : (
        <>
          <AudioMonitor
            stream={microphoneStream}
            isActive={recording}
            speaker={selectedSpeaker}
          />
          <SpeakerControls
            speakers={speakers}
            selectedSpeakerId={selectedSpeakerId}
            onSelectSpeaker={setSelectedSpeakerId}
            onSettingChange={updateSpeakerSetting}
          />
          <section className="transcript-panel panel" aria-labelledby="transcript-heading">
            <h2 id="transcript-heading">Live transcripts</h2>
            <div className="topic-tabs" role="group" aria-label="Transcript topics">
              {Object.keys(EMPTY_TOPICS).map((name) => (
                <button
                  type="button"
                  key={name}
                  className={topic === name ? 'selected' : ''}
                  onClick={() => setTopic(name)}
                  aria-pressed={topic === name}
                >
                  {name}
                </button>
              ))}
            </div>
            <LiveTranscript topic={topic} entries={topics[topic] || []} isRecording={recording} />
          </section>
          {hasMeetingNotes && (
            <section className="meeting-notes" aria-labelledby="meeting-notes-heading">
              <h2 id="meeting-notes-heading">Meeting notes</h2>
              <div className="agenda-list">
                {agenda.map((item) => <AgendaCard key={item.id} topic={item} />)}
              </div>
            </section>
          )}
>>>>>>> 5cc9afccabf8701f3c9e60b9fb68d5c90344e393
        </>
      )}
    </div>
  );
}
