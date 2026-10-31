import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Sparkles, Tag, Download, History, X, Plus, Share2, SlidersHorizontal } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast, { Toaster } from 'react-hot-toast';

const API_URL = 'http://localhost:5000';
const WS_URL = 'ws://localhost:5000';

// Waveform component matching your screenshot
const WaveformCanvas = ({ isRecording, audioContext, analyser }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      if (!isRecording || !analyser) {
        // Idle state - flat line with slight gradient
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT / 2);
        ctx.lineTo(WIDTH, HEIGHT / 2);
        ctx.stroke();
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      // Clear with dark bg
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Create gradient for waveform - blue to purple like screenshot
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
      gradient.addColorStop(0, '#3b82f6'); // blue
      gradient.addColorStop(0.5, '#8b5cf6'); // purple  
      gradient.addColorStop(1, '#ec4899'); // pink

      ctx.lineWidth = 2;
      ctx.strokeStyle = gradient;
      ctx.beginPath();

      const sliceWidth = WIDTH / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * HEIGHT / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(WIDTH, HEIGHT / 2);
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isRecording, analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={80} 
      className="w-full h-20 rounded-lg bg-slate-950"
    />
  );
};

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionsList, setSessionsList] = useState([]);
  const [agendas, setAgendas] = useState([]);
  const [activeSpeaker, setActiveSpeaker] = useState('David');
  const [speakers, setSpeakers] = useState(['Sarah', 'David', 'Elena']);
  const [gainScale, setGainScale] = useState(100);
  const [suppression, setSuppression] = useState(83);
  const [transcriptTab, setTranscriptTab] = useState('Overview');

  const reportRef = useRef(null);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const gainNodeRef = useRef(null);

  useEffect(() => { createNewSession(); }, []);

  const api = async (path, opts = {}) => {
    try {
      const res = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      toast.error(e.message);
      return { success: false };
    }
  };

  const createNewSession = async () => {
    const data = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ title: `Meeting ${new Date().toLocaleString()}` }) });
    if (data.success) {
      setCurrentSessionId(data.session.id);
      setAgendas([]);
      setSpeakers(data.session.speakers || speakers);
      toast.success('New session ready');
    }
  };

  const loadPastSessions = async () => {
    const data = await api('/api/sessions');
    if (data.success) {
      setSessionsList(data.sessions);
      setIsDrawerOpen(true);
    }
  };

  const loadSpecificSession = async (id) => {
    const data = await api(`/api/sessions/${id}`);
    if (data.success) {
      setCurrentSessionId(data.session.id);
      setAgendas(data.session.agendas || []);
      setSpeakers(data.session.speakers || speakers);
      setIsDrawerOpen(false);
    }
  };

  const publishSession = async () => {
    const data = await api(`/api/sessions/${currentSessionId}/publish`, { method: 'POST' });
    if (data.success) {
      navigator.clipboard.writeText(`${window.location.origin}/share/${data.shareId}`);
      toast.success('Published! Link copied');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Web Audio API for waveform + gain control
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = gainScale / 100; // Apply gain from slider
      
      source.connect(gainNodeRef.current);
      gainNodeRef.current.connect(analyserRef.current);
      
      socketRef.current = new WebSocket(`${WS_URL}?sessionId=${currentSessionId}`);
      socketRef.current.onopen = () => {
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        mediaRecorderRef.current.ondataavailable = e => {
          if (e.data.size > 0) socketRef.current.send(e.data);
        };
        mediaRecorderRef.current.start(250);
        setIsRecording(true);
      };
      
      socketRef.current.onmessage = e => {
        const data = JSON.parse(e.data);
        if (data.type === 'TRANSCRIPT' && data.isFinal) refineTranscript(data.text, data.speaker);
        if (data.type === 'SPEAKER_DETECTED') setActiveSpeaker(data.speaker);
      };
      
      socketRef.current.onclose = () => {
        setIsRecording(false);
        stream.getTracks().forEach(t => t.stop());
        audioContextRef.current?.close();
      };
    } catch {
      toast.error('Mic permission denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    socketRef.current?.close();
    audioContextRef.current?.close();
  };

  // Update gain in real-time when slider moves
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gainScale / 100;
    }
  }, [gainScale]);

  const refineTranscript = async (rawText, speaker) => {
    const data = await api('/api/refine-speech', {
      method: 'POST',
      body: JSON.stringify({ rawText, sessionId: currentSessionId, speaker: speaker || activeSpeaker })
    });
    if (data.success) setAgendas(prev => [data.agenda, ...prev]);
  };

  const exportPDF = async () => {
    setIsExporting(true);
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#020617' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`Aetherist_Report_${Date.now()}.pdf`);
    setIsExporting(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6">
      <Toaster position="top-right" />
      <header className="max-w-7xl mx-auto flex flex-wrap items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Aetherist AI</h1>
            <p className="text-xs text-slate-400">Autonomous Meeting Secretary</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPastSessions} className="px-4 py-3 rounded-full bg-slate-900 border border-slate-800 flex items-center gap-2">
            <History className="w-4 h-4 text-violet-400" /> History
          </button>
          <button onClick={exportPDF} disabled={!agendas.length || isExporting} className="px-4 py-3 rounded-full bg-emerald-600 text-white flex items-center gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={publishSession} disabled={!agendas.length} className="px-4 py-3 rounded-full bg-blue-600 text-white flex items-center gap-2 disabled:opacity-50">
            <Share2 className="w-4 h-4" /> Publish
          </button>
          <button onClick={isRecording ? stopRecording : startRecording} className={`px-6 py-3 rounded-full font-semibold flex items-center gap-2 ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-r from-violet-600 to-pink-500'} text-white`}>
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {isRecording ? 'Stop' : 'Start'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-6 space-y-6">
        {/* Waveform Card - matches your screenshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <WaveformCanvas isRecording={isRecording} audioContext={audioContextRef.current} analyser={analyserRef.current} />
          <div className="grid grid-cols-3 text-center text-sm mt-4">
            <div><p className="text-slate-400">Active Input</p><p className="text-emerald-400 font-semibold">{activeSpeaker}</p></div>
            <div><p className="text-slate-400">Gain Scale</p><p className="text-blue-400 font-semibold">{gainScale}%</p></div>
            <div><p className="text-slate-400">Suppression</p><p className="text-purple-400 font-semibold">{suppression} dB</p></div>
          </div>
        </div>

        {/* Speaker Environments - matches screenshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase">Speaker Environments</h3>
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex gap-2 mb-6">
            {speakers.map(s => (
              <button key={s} onClick={() => setActiveSpeaker(s)} className={`px-4 py-2 rounded-lg text-sm font-medium ${activeSpeaker === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{s}</button>
            ))}
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Amplification Gain</label>
              <input type="range" min="0" max="200" value={gainScale} onChange={e => setGainScale(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Suppression Density</label>
              <input type="range" min="0" max="100" value={suppression} onChange={e => setSuppression(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
            </div>
          </div>
        </div>

        {/* Live Transcripts - matches screenshot */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Live Transcripts</h3>
          <div className="flex gap-2 mb-4">
            {['Overview', 'Technical', 'Minutes'].map(tab => (
              <button key={tab} onClick={() => setTranscriptTab(tab)} className={`px-4 py-2 rounded-lg text-sm ${transcriptTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{tab}</button>
            ))}
          </div>
          <div className="min-h-32 text-slate-400 text-sm">
            {agendas.length ? agendas[0].summary : 'Say something to start transcribing...'}
          </div>
        </div>
      </main>

      {/* History Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <h3 className="text-lg font-bold">Past Sessions</h3>
              <button onClick={() => setIsDrawerOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <button onClick={() => { createNewSession(); setIsDrawerOpen(false); }} className="w-full py-3 mb-4 bg-violet-600 rounded-xl flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> New Meeting
            </button>
            <div className="space-y-2 overflow-y-auto">
              {sessionsList.map(s => (
                <div key={s.id} onClick={() => loadSpecificSession(s.id)} className="p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-violet-500 cursor-pointer">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString()}</p>
                  {s.is_published && <span className="text-xs text-emerald-400">Published</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden PDF */}
      <div className="absolute -left-[9999px]">
        <div ref={reportRef} className="w-[800px] p-8 bg-slate-950 text-slate-100">
          <h1 className="text-2xl font-bold text-violet-400 mb-6">Aetherist AI — Executive Summary</h1>
          {agendas.map((a, i) => (
            <div key={i} className="mb-4 p-4 border border-slate-800 rounded-lg">
              <p className="text-xs text-fuchsia-400">{a.timestamp} — {a.speaker}</p>
              <h2 className="text-lg font-bold">{a.title}</h2>
              <p className="text-sm">{a.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
