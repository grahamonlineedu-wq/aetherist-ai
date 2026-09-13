import React, { useState, useEffect } from 'react';

export default function App() {
  const [activeTab, setActiveTab] = useState('session'); // 'history' | 'session'
  const [speakers, setSpeakers] = useState([]);
  const [topics, setTopics] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Hydrate initial runtime data configurations from server node
  useEffect(() => {
    fetch('http://localhost:5000/api/session')
      .then((res) => res.json())
      .then((data) => {
        setSpeakers(data.speakers);
        setTopics(data.topics);
      })
      .catch((err) => console.error("Error communicating with Aetheris server:", err));
  }, []);

  // Update specific environment field properties on the fly
  const handleSpeakerChange = (id, field, value) => {
    const updated = speakers.map(s => s.id === id ? { ...s, [field]: value } : s);
    setSpeakers(updated);
    
    // Sync adjustments directly back to environment storage API
    fetch('http://localhost:5000/api/speakers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers: updated })
    });
  };

  // Compile transcription data chunks and process client file download
  const handleDownloadPDF = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Aetheris AI Summary Log', topics })
      });
      const data = await response.json();
      
      if (data.success && data.pdfData) {
        // Create invisible anchor target element link to drop compiled download document file
        const downloadLink = document.createElement('a');
        downloadLink.href = data.pdfData;
        downloadLink.download = `Aetheris_Minutes_${Date.now()}.pdf`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    } catch (error) {
      console.error("PDF compiling routine failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Navigation Headers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#a21caf', padding: '10px', borderRadius: '8px', color: 'white', fontWeight: 'bold' }}>✨</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Aetheris AI</h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Autonomous Meeting Secretary</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn-outline-custom" 
            style={{ padding: '10px 20px', borderRadius: '20px', fontWeight: '500' }}
            onClick={() => setActiveTab(activeTab === 'history' ? 'session' : 'history')}
          >
            📋 {activeTab === 'history' ? 'Show Current Session' : 'View History Log'}
          </button>
          
          <button 
            className="btn-primary-glow" 
            style={{ padding: '10px 24px', borderRadius: '20px' }}
            onClick={() => setIsRecording(!isRecording)}
          >
            {isRecording ? '🛑 Stop Stream' : '🎙️ Start Session'}
          </button>
        </div>
      </div>

      {/* Primary Configuration & Interface Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        
        {/* Left Interactive Card Panel: Speaker Environments Configuration */}
        <div style={{ background: '#0e101f', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '16px', color: '#cbd5e1' }}>🎙️ Environment Profiles</h3>
          {speakers.map((spk) => (
            <div key={spk.id} className="speaker-card" style={{ padding: '14px', marginBottom: '12px' }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Speaker Identity Name</label>
                <input 
                  type="text" 
                  value={spk.name} 
                  onChange={(e) => handleSpeakerChange(spk.id, 'name', e.target.value)}
                  style={{ width: '90%', background: '#1e293b', border: '1px solid #334155', padding: '6px', borderRadius: '4px', color: 'white' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Audio Filter</label>
                  <select 
                    value={spk.profile} 
                    onChange={(e) => handleSpeakerChange(spk.id, 'profile', e.target.value)}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="Studio Clear">Studio Clear</option>
                    <option value="Noise Reduction High">Noise Isolation</option>
                    <option value="Dynamic Boost">Dynamic Boost</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Mic Profile</label>
                  <select 
                    value={spk.micGain} 
                    onChange={(e) => handleSpeakerChange(spk.id, 'micGain', e.target.value)}
                    style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: 'white', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="Low">Low Gain</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High Gain</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Active Transcript Dashboard Area */}
        <div style={{ background: '#0e101f', borderRadius: '12px', padding: '20px', border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', margin: 0, color: '#cbd5e1' }}>📊 Generated Speech Articles By Topic</h3>
            
            {topics.length > 0 && (
              <button 
                onClick={handleDownloadPDF} 
                disabled={isLoading}
                style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
              >
                {isLoading ? 'Compiling Doc...' : '📥 Export PDF Minutes'}
              </button>
            )}
          </div>

          {topics.length === 0 ? (
            <div className="agenda-card-empty" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              No live agenda metrics mapped yet. Toggle "Start Session" to initiate audio tracks.
            </div>
          ) : (
            topics.map((topic) => (
              <div key={topic.id} style={{ background: '#16192e', borderRadius: '8px', padding: '16px', marginBottom: '16px', borderLeft: '4px solid #db2777' }} >
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f1f5f9' }}>📌 Topic Category: {topic.title}</h4>
                <div style={{ display: 'flex', flexDirection: 'col', gap: '8px', paddingLeft: '8px' }}>
                  {topic.items.map((item, idx) => (
                    <p key={idx} style={{ margin: '4px 0', fontSize: '13px', lineHeight: '1.5' }}>
                      <strong style={{ color: '#f472b6' }}>{item.speaker}:</strong> <span style={{ color: '#cbd5e1' }}>{item.text}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
