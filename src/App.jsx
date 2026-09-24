import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import AgendaCard from './components/AgendaCard.jsx';
import LiveTranscript from './components/LiveTranscript.jsx';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SPEAKERS = ['Sarah Jenkins', 'David Chen', 'Elena Rosto'];
const EMPTY_TOPICS = { Overview: [], Technical: [], Minutes: [] };

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
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('disconnected'));
    socket.on('connect_error', () => setConnection('disconnected'));
    socket.on('live-transcript-update', (data) => {
      if (data?.topics) setTopics(data.topics);
    });

    Promise.all([
      fetch(`${API_BASE_URL}/api/session`),
      fetch(`${API_BASE_URL}/api/history`),
    ]).then(async ([sessionResponse, historyResponse]) => {
      if (!sessionResponse.ok || !historyResponse.ok) throw new Error('Backend unavailable');
      const session = await sessionResponse.json();
      const historyData = await historyResponse.json();
      if (session.topics) setTopics(session.topics);
      if (historyData.history) setHistory(historyData.history);
    }).catch((error) => setMessage(`Backend connection failed: ${error.message}`));

    return () => {
      recordingRef.current = false;
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socket.disconnect();
    };
  }, []);

  const sendTranscript = async (text) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    if (!socketRef.current?.connected) {
      setMessage('Transcript not sent: backend is disconnected.');
      return;
    }
    socketRef.current.emit('transcript', { text: cleanText, speaker, topic });
    try {
      const response = await fetch(`${API_BASE_URL}/api/refine-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: `${speaker}: ${cleanText}` }),
      });
      const result = await response.json();
      if (result.success) setMessage(`Captured: ${result.data.title}`);
    } catch {
      setMessage('Transcript captured, but article refinement is unavailable.');
    }
  };

  const stopRecording = () => {
    recordingRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const startRecording = async () => {
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setMessage('Microphone requires HTTPS or localhost.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser does not support microphone access.');
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setRecording(true);
        setMessage('Microphone is active, but speech recognition is unavailable in this browser.');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) sendTranscript(event.results[index][0].transcript);
        }
      };
      recognition.onerror = (event) => setMessage(`Speech recognition: ${event.error}`);
      recognition.onend = () => {
        if (recordingRef.current) {
          try { recognition.start(); } catch { /* recognition is already restarting */ }
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      setRecording(true);
      setMessage('Microphone is active. Speak normally.');
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMessage(`Microphone permission failed: ${error.name || error.message}`);
    }
  };

  const toggleRecording = () => (recording ? stopRecording() : startRecording());

  const exportPdf = async () => {
    try {
      setMessage('Preparing PDF...');
      const response = await fetch(`${API_BASE_URL}/api/export-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <header className="app-header">
        <div><h1>Aetherist AI</h1><p>Autonomous Meeting Secretary</p></div>
        <span className={`connection-status ${connection}`}>{connection}</span>
      </header>
      <nav className="toolbar" aria-label="Meeting controls">
        <button type="button" onClick={() => setView(view === 'history' ? 'session' : 'history')}>{view === 'history' ? 'Workspace' : 'History'}</button>
        <button type="button" onClick={exportPdf}>Export PDF</button>
        <button type="button" className={recording ? 'danger-button' : 'primary-button'} onClick={toggleRecording}>{recording ? 'Stop microphone' : 'Start microphone'}</button>
      </nav>
      {message && <p className="status-message" role="status">{message}</p>}

      {view === 'history' ? (
        <section className="history-list"><h2>Meeting history</h2>{history.length ? history.map((item) => <AgendaCard key={item.id} topic={{ ...item, items: (item.highlights || []).map((text) => ({ speaker: 'Highlight', text })) }} />) : <p className="empty-state">No meeting history yet.</p>}</section>
      ) : (
        <>
          <section className="panel speaker-panel"><h2>Speaker environment</h2><div className="speaker-buttons">{SPEAKERS.map((name) => <button type="button" key={name} className={speaker === name ? 'selected' : ''} onClick={() => setSpeaker(name)} aria-pressed={speaker === name}>{name}</button>)}</div></section>
          <section className="topic-tabs" aria-label="Transcript topics">{Object.keys(EMPTY_TOPICS).map((name) => <button type="button" key={name} className={topic === name ? 'selected' : ''} onClick={() => setTopic(name)} aria-pressed={topic === name}>{name}</button>)}</section>
          <LiveTranscript topic={topic} entries={topics[topic] || []} />
          <section className="agenda-list">{agenda.map((item) => <AgendaCard key={item.id} topic={item} />)}</section>
        </>
      )}
    </main>
  );
}
