import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import AgendaCard from './components/AgendaCard.jsx';
import LiveTranscript from './components/LiveTranscript.jsx';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SPEAKERS = ['Sarah Jenkins', 'David Chen', 'Elena Rosto'];
const EMPTY_TOPICS = { Overview: [], Technical: [], Minutes: [] };

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const [view, setView] = useState('session');
  const [topic, setTopic] = useState('Overview');
  const [speaker, setSpeaker] = useState(SPEAKERS[0]);
  const [recording, setRecording] = useState(false);
  const [topics, setTopics] = useState(EMPTY_TOPICS);
  const [history, setHistory] = useState([]);
  const [connection, setConnection] = useState('connecting');
  const [message, setMessage] = useState('');
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingContextRef = useRef({ speaker: SPEAKERS[0], topic: 'Overview' });

  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('disconnected'));
    socket.on('live-transcript-update', (data) => data?.topics && setTopics(data.topics));

    Promise.all([fetch(`${API_BASE_URL}/api/session`), fetch(`${API_BASE_URL}/api/history`)]).then(async ([sessionResponse, historyResponse]) => {
      if (!sessionResponse.ok || !historyResponse.ok) throw new Error('Backend unavailable');
      const session = await sessionResponse.json();
      const historyData = await historyResponse.json();
      if (session.topics) setTopics(session.topics);
      if (historyData.history) setHistory(historyData.history);
    }).catch((error) => setMessage(`Backend connection failed: ${error.message}`));

    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socket.disconnect();
    };
  }, []);

  const refineTranscript = async (text, context) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/refine-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: `${context.speaker}: ${text}` }),
      });
      const result = await response.json();
      if (result.success) setMessage(`Article ready: ${result.data.title}`);
    } catch {
      setMessage('Transcript saved, but article refinement is unavailable.');
    }
  };

  const transcribeRecording = async (blob, context) => {
    try {
      setMessage('Uploading audio to Deepgram...');
      const audio = await blobToDataUrl(blob);
      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mimeType: blob.type || 'audio/webm', topic: context.topic, speaker: context.speaker }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Transcription failed');
      if (!result.text) {
        setMessage('Audio was received, but no speech was detected.');
        return;
      }
      setMessage(`Deepgram transcript received (${result.provider}).`);
      await refineTranscript(result.text, context);
    } catch (error) {
      setMessage(`Transcription failed: ${error.message}`);
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const startRecording = async () => {
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setMessage('Microphone requires HTTPS or localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage('This browser does not support audio recording. Try current Chrome or Edge.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingContextRef.current = { speaker, topic };
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const context = recordingContextRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        if (blob.size) await transcribeRecording(blob, context);
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(1000);
      setRecording(true);
      setMessage('Recording meeting audio... press Stop to transcribe with Deepgram.');
    } catch (error) {
      setMessage(`Microphone permission failed: ${error.name || error.message}`);
    }
  };

  const exportPdf = async () => {
    try {
      setMessage('Preparing PDF...');
      const response = await fetch(`${API_BASE_URL}/api/export-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Aetherist AI - Meeting Minutes', topics }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'PDF export failed');
      const link = document.createElement('a');
      link.href = data.pdfData;
      link.download = 'Aetherist_Meeting_Minutes.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage('PDF downloaded.');
    } catch (error) {
      setMessage(`PDF export failed: ${error.message}`);
    }
  };

  const agenda = Object.entries(topics).map(([title, items]) => ({ id: title, title, items }));

  return (
    <main className="app-shell">
      <header className="app-header"><div><h1>Aetherist AI</h1><p>Autonomous Meeting Secretary</p></div><span className={`connection-status ${connection}`}>{connection}</span></header>
      <nav className="toolbar" aria-label="Meeting controls">
        <button type="button" onClick={() => setView(view === 'history' ? 'session' : 'history')}>{view === 'history' ? 'Workspace' : 'History'}</button>
        <button type="button" onClick={exportPdf}>Export PDF</button>
        <button type="button" className={recording ? 'danger-button' : 'primary-button'} onClick={recording ? stopRecording : startRecording}>{recording ? 'Stop and transcribe' : 'Record meeting'}</button>
      </nav>
      {message && <p className="status-message" role="status">{message}</p>}
      {view === 'history' ? <section className="history-list"><h2>Meeting history</h2>{history.length ? history.map((item) => <AgendaCard key={item.id} topic={{ ...item, items: (item.highlights || []).map((text) => ({ speaker: 'Highlight', text })) }} />) : <p className="empty-state">No meeting history yet.</p>}</section> : <>
        <section className="panel speaker-panel"><h2>Speaker environment</h2><div className="speaker-buttons">{SPEAKERS.map((name) => <button type="button" key={name} className={speaker === name ? 'selected' : ''} onClick={() => setSpeaker(name)} aria-pressed={speaker === name}>{name}</button>)}</div></section>
        <section className="topic-tabs" aria-label="Transcript topics">{Object.keys(EMPTY_TOPICS).map((name) => <button type="button" key={name} className={topic === name ? 'selected' : ''} onClick={() => setTopic(name)} aria-pressed={topic === name}>{name}</button>)}</section>
        <LiveTranscript topic={topic} entries={topics[topic] || []} />
        <section className="agenda-list">{agenda.map((item) => <AgendaCard key={item.id} topic={item} />)}</section>
      </>}
    </main>
  );
}
