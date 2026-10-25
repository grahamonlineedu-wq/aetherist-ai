import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Aetherist AI - Meeting Minutes', topics }),
      });
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
        </>
      )}
    </main>
  );
}
