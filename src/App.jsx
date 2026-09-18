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
  const mediaRecorderRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.on('connect_error', () => setConnectionState('disconnected'));
    socket.on('live-transcript-update', (data) => {
      if (data?.topics) setTranscriptData(data.topics);
    });

    const load = async () => {
      try {
        const [sessionResponse, historyResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/session`),
          fetch(`${API_BASE_URL}/api/history`),
        ]);
        if (!sessionResponse.ok || !historyResponse.ok) throw new Error('API unavailable');
        const session = await sessionResponse.json();
        const history = await historyResponse.json();
        if (session.topics) setTranscriptData(session.topics);
        if (history.history) setHistoryCards(history.history);
      } catch (error) {
        console.error('Initial session sync failed:', error);
      }
    };
    load();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.stream = stream;
      recorder.ondataavailable = ({ data }) => {
        if (data.size && socketRef.current?.connected) {
          socketRef.current.emit('audio-stream-chunk', { blob: data, speaker: activeSpeaker });
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone capture failed:', error);
      alert(`Microphone capture blocked: ${error.message}`);
    }
  };

  const handleDownloadPDF = async () => {
    const response = await fetch(`${API_BASE_URL}/api/export-pdf`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'PDF export failed');
    const anchor = document.createElement('a');
    anchor.href = data.pdfData;
    anchor.download = 'Aetherist_Minutes_Log.pdf';
    anchor.click();
  };

  const currentEntries = transcriptData[activeTopic] || [];
  const agendaTopics = Object.entries(transcriptData).map(([title, items]) => ({ id: title, title, items }));

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><h1>Aetherist AI</h1><p>Autonomous Meeting Secretary</p></div>
        <span className={`connection-status ${connectionState}`}>{connectionState}</span>
      </header>
      <nav className="toolbar">
        <button onClick={() => setActiveViewTab(activeViewTab === 'history' ? 'session' : 'history')}>📚 {activeViewTab === 'history' ? 'Workspace' : 'History'}</button>
        <button onClick={handleDownloadPDF}>📥 Export PDF</button>
        <button onClick={toggleRecording}>{isRecording ? '🛑 Stop' : '🎙️ Start'}</button>
      </nav>
      {activeViewTab === 'history' ? (
        <section className="history-list">{historyCards.map((card) => <AgendaCard key={card.id} topic={{ ...card, items: (card.highlights || []).map((text) => ({ speaker: 'Highlight', text })) }} />)}</section>
      ) : (
        <>
          <section className="speaker-panel"><h2>Speaker environment</h2>{['Sarah Jenkins', 'David Chen', 'Elena Rosto'].map((name) => <button key={name} onClick={() => setActiveSpeaker(name)} aria-pressed={activeSpeaker === name}>{name}</button>)}</section>
          <section className="topic-tabs">{Object.keys(emptyTopics).map((topic) => <button key={topic} onClick={() => setActiveTopic(topic)} aria-pressed={activeTopic === topic}>{topic}</button>)}</section>
          <LiveTranscript topic={activeTopic} entries={currentEntries} />
          <section className="agenda-list">{agendaTopics.map((topic) => <AgendaCard key={topic.id} topic={topic} />)}</section>
        </>
      )}
    </main>
  );
}
