import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import AgendaCard from './components/AgendaCard.jsx';
import LiveTranscript from './components/LiveTranscript.jsx';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const emptyTopics = { Overview: [], Technical: [], Minutes: [] };

export default function App() {
  const [activeViewTab, setActiveViewTab] = useState('session');
  const [activeTopic, setActiveTopic] = useState('Overview');
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState('Sarah Jenkins');
  const [transcriptData, setTranscriptData] = useState(emptyTopics);
  const [historyCards, setHistoryCards] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');
  const [message, setMessage] = useState('');
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.on('connect_error', () => setConnectionState('disconnected'));
    socket.on('live-transcript-update', (data) => data?.topics && setTranscriptData(data.topics));

    Promise.all([fetch(`${API_BASE_URL}/api/session`), fetch(`${API_BASE_URL}/api/history`)]).then(async ([sessionResponse, historyResponse]) => {
      if (!sessionResponse.ok || !historyResponse.ok) throw new Error('API unavailable');
      const session = await sessionResponse.json();
      const history = await historyResponse.json();
      if (session.topics) setTranscriptData(session.topics);
      if (history.history) setHistoryCards(history.history);
    }).catch((error) => setMessage(`Server connection failed: ${error.message}`));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => () => stopCapture(), []);

  function stopCapture() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
  }

  const toggleRecording = async () => {
    if (isRecording) {
      stopCapture();
      setIsRecording(false);
      setMessage('Meeting capture stopped.');
      return;
    }

    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setMessage('Microphone requires HTTPS (or localhost). Open the deployed site over HTTPS.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('This browser does not provide microphone access. Try current Chrome, Edge, or Safari.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = window.MediaRecorder ? new MediaRecorder(stream) : null;
      if (recorder) {
        recorder.stream = stream;
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setMessage('Microphone is active, but this browser has no speech recognition. Use Chrome/Edge or connect a transcription provider.');
      } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = navigator.language || 'en-US';
        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            if (!event.results[i].isFinal) continue;
            const text = event.results[i][0].transcript.trim();
            if (text && socketRef.current?.connected) {
              socketRef.current.emit('transcript', { text, speaker: activeSpeaker, topic: activeTopic });
            }
          }
        };
        recognition.onerror = (event) => setMessage(`Speech recognition: ${event.error}. Microphone may still be active.`);
        recognition.onend = () => {
          if (recognitionRef.current === recognition && isRecording) recognition.start();
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
      setIsRecording(true);
      setMessage('Microphone is active. Speak normally.');
    } catch (error) {
      setMessage(`Microphone permission failed: ${error.name || error.message}. Allow microphone access in the browser and try again.`);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setMessage('Compiling PDF…');
      const response = await fetch(`${API_BASE_URL}/api/export-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Aetherist AI - Meeting Minutes', topics: transcriptData }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.pdfData) throw new Error(data.error || 'PDF export failed');
      const anchor = document.createElement('a');
      anchor.href = data.pdfData;
      anchor.download = 'Aetherist_Minutes_Log.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setMessage('PDF downloaded successfully.');
    } catch (error) {
      setMessage(`PDF export failed: ${error.message}`);
    }
  };

  const currentEntries = transcriptData[activeTopic] || [];
  const agendaTopics = Object.entries(transcriptData).map(([title, items]) => ({ id: title, title, items }));

  return (
    <main className="app-shell">
      <header className="app-header"><div><h1>Aetherist AI</h1><p>Autonomous Meeting Secretary</p></div><span className={`connection-status ${connectionState}`}>{connectionState}</span></header>
      <nav className="toolbar">
        <button onClick={() => setActiveViewTab(activeViewTab === 'history' ? 'session' : 'history')}>📚 {activeViewTab === 'history' ? 'Workspace' : 'History'}</button>
        <button onClick={handleDownloadPDF}>📥 Export PDF</button>
        <button onClick={toggleRecording}>{isRecording ? '🛑 Stop' : '🎙️ Start'}</button>
      </nav>
      {message && <p role="status" className="status-message">{message}</p>}
      {activeViewTab === 'history' ? <section className="history-list">{historyCards.map((card) => <AgendaCard key={card.id} topic={{ ...card, items: (card.highlights || []).map((text) => ({ speaker: 'Highlight', text })) }} />)}</section> : <>
        <section className="speaker-panel"><h2>Speaker environment</h2>{['Sarah Jenkins', 'David Chen', 'Elena Rosto'].map((name) => <button key={name} onClick={() => setActiveSpeaker(name)} aria-pressed={activeSpeaker === name}>{name}</button>)}</section>
        <section className="topic-tabs">{Object.keys(emptyTopics).map((topic) => <button key={topic} onClick={() => setActiveTopic(topic)} aria-pressed={activeTopic === topic}>{topic}</button>)}</section>
        <LiveTranscript topic={activeTopic} entries={currentEntries} />
        <section className="agenda-list">{agendaTopics.map((topic) => <AgendaCard key={topic.id} topic={topic} />)}</section>
      </>}
    </main>
  );
}
