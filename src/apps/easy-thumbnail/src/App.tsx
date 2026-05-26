import { useEffect, useMemo, useState } from 'react';
import type { ConceptResponse, Settings, ThumbnailConcept } from './types';

const styles = [
  'Podcast Clean',
  'Bright YouTube',
  'Cinematic Realistic',
  'Cartoon Friendly',
  'Minimal Clean',
  'Faceless Educational'
];

const layouts = [
  'Female left / Male right / Big text center',
  'Character on right / Big text left',
  'Split emotion before-after',
  'Podcast room with two hosts',
  'Object + big question text',
  'Simple background with clean text space'
];

const audiences = [
  'Beginner English learners',
  'Vietnamese learners of English',
  'Adults learning conversational English',
  'YouTube Shorts viewers',
  'Podcast audience'
];

const sampleTopic = `Video topic: How to sound more natural in English small talk.
Two friends explain simple phrases people use at parties, coffee shops, and casual conversations.
Tone: friendly, natural, easy English.`;

function copy(text: string) {
  navigator.clipboard?.writeText(text);
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [topic, setTopic] = useState(sampleTopic);
  const [style, setStyle] = useState(styles[0]);
  const [layout, setLayout] = useState(layouts[0]);
  const [audience, setAudience] = useState(audiences[1]);
  const [channelName, setChannelName] = useState('Easy English Channel');
  const [result, setResult] = useState<ConceptResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    window.thumbnailAPI.getSettings().then((s) => {
      setSettings(s);
      setChannelName(s.defaultChannelName || 'Easy English Channel');
      setShowSettings(!s.geminiApiKey);
    });
    return window.thumbnailAPI.onUpdateStatus((data) => setUpdateStatus(data.message));
  }, []);

  const selected = useMemo<ThumbnailConcept | null>(() => {
    return result?.concepts?.[selectedIndex] || null;
  }, [result, selectedIndex]);

  async function saveSettings() {
    if (!settings) return;
    const saved = await window.thumbnailAPI.saveSettings(settings);
    setSettings(saved);
    setShowSettings(false);
    setNotice('Đã lưu settings.');
  }

  async function generateConcepts() {
    setError('');
    setNotice('');
    setImage(null);
    setLoading('Đang phân tích script và tạo 5 concept thumbnail...');
    try {
      const data = await window.thumbnailAPI.generateConcepts({ topic, style, layout, audience, channelName });
      setResult(data);
      setSelectedIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi khi tạo concept.');
    } finally {
      setLoading('');
    }
  }

  async function generateGeminiImage() {
    if (!selected) return;
    setError('');
    setNotice('');
    setLoading('Đang tạo ảnh bằng Gemini Image...');
    try {
      const img = await window.thumbnailAPI.generateImage({ prompt: selected.geminiImagePrompt || selected.imagePrompt });
      setImage(img);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được ảnh.');
    } finally {
      setLoading('');
    }
  }

  async function saveImage() {
    if (!image) return;
    const fileName = `easy-thumbnail-${Date.now()}`;
    const res = await window.thumbnailAPI.saveImage({ base64: image.base64, fileName });
    if (!res.canceled) setNotice(`Đã lưu ảnh: ${res.filePath}`);
  }

  async function openLeonardo() {
    if (selected?.leonardoPrompt) copy(selected.leonardoPrompt);
    await window.thumbnailAPI.openExternal('https://app.leonardo.ai/');
    setNotice('Đã copy Leonardo prompt và mở Leonardo. Bạn chỉ cần paste prompt để gen free/trial.');
  }

  async function checkUpdates() {
    setUpdateStatus('Đang kiểm tra update...');
    await window.thumbnailAPI.checkForUpdates();
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Creator Tool</div>
          <h1>Easy Thumbnail Studio</h1>
          <p>Tạo prompt, phân tích style và ghép thumbnail trong một giao diện.</p>
        </div>
        <div className="topActions">
          <button className="secondary" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </header>

      {showSettings && settings && (
        <section className="panel settingsPanel">
          <div className="panelHeader">
            <h2>Settings</h2>
            <button className="ghost" onClick={() => setShowSettings(false)}>Close</button>
          </div>
          <div className="settingsGrid">
            <label>Gemini API Key<input type="password" value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} placeholder="AIza..." /></label>
            <label>Concept Model<input value={settings.conceptModel} onChange={(e) => setSettings({ ...settings, conceptModel: e.target.value })} /></label>
            <label>Image Model<input value={settings.imageModel} onChange={(e) => setSettings({ ...settings, imageModel: e.target.value })} /></label>
            <label>Default Channel<input value={settings.defaultChannelName} onChange={(e) => setSettings({ ...settings, defaultChannelName: e.target.value })} /></label>
          </div>
          <button className="primary" onClick={saveSettings}>Save Settings</button>
        </section>
      )}

      {(loading || error || notice || updateStatus) && (
        <div className="statusBar">
          {loading && <span className="loading">{loading}</span>}
          {error && <span className="error">{error}</span>}
          {notice && <span className="notice">{notice}</span>}
          {updateStatus && <span className="notice">{updateStatus}</span>}
        </div>
      )}

      <main className="mainGrid">
        <section className="panel inputPanel">
          <h2>1. Nhập topic hoặc script</h2>
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} />
          <div className="controlGrid">
            <label>Channel<input value={channelName} onChange={(e) => setChannelName(e.target.value)} /></label>
            <label>Style<select value={style} onChange={(e) => setStyle(e.target.value)}>{styles.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Layout<select value={layout} onChange={(e) => setLayout(e.target.value)}>{layouts.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Audience<select value={audience} onChange={(e) => setAudience(e.target.value)}>{audiences.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          <button className="primary wide" disabled={!!loading} onClick={generateConcepts}>Generate 5 Thumbnail Concepts</button>
        </section>

        <section className="panel conceptPanel">
          <h2>2. Chọn concept</h2>
          {!result && <div className="empty">Chưa có concept. Bấm Generate để Gemini phân tích và đề xuất.</div>}
          {result && (
            <>
              <div className="insight"><b>Best hook:</b> {result.bestHook}<br /><b>Nhận xét:</b> {result.scoreReason}</div>
              <div className="conceptList">
                {result.concepts.map((c, i) => (
                  <button key={c.title + i} className={i === selectedIndex ? 'concept active' : 'concept'} onClick={() => { setSelectedIndex(i); setImage(null); }}>
                    <b>{i + 1}. {c.title}</b>
                    <span>{c.thumbnailText}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel detailPanel">
          <h2>3. Prompt + Action</h2>
          {!selected && <div className="empty">Concept detail sẽ hiện ở đây.</div>}
          {selected && (
            <div className="detailStack">
              <div className="thumbnailTextBox">{selected.thumbnailText}</div>
              <p><b>Emotion:</b> {selected.emotion}</p>
              <p><b>Composition:</b> {selected.composition}</p>
              <p><b>Why it works:</b> {selected.whyItWorks}</p>
              <label>Gemini Image Prompt<textarea className="promptBox" value={selected.geminiImagePrompt} readOnly /></label>
              <div className="buttonRow">
                <button className="primary" disabled={!!loading} onClick={generateGeminiImage}>Generate by Gemini</button>
                <button className="secondary" onClick={() => copy(selected.geminiImagePrompt)}>Copy Gemini Prompt</button>
              </div>
              <label>Leonardo Prompt<textarea className="promptBox" value={selected.leonardoPrompt} readOnly /></label>
              <div className="buttonRow">
                <button className="secondary" onClick={openLeonardo}>Copy + Open Leonardo</button>
                <button className="secondary" onClick={() => copy(selected.leonardoPrompt)}>Copy Leonardo Prompt</button>
              </div>
            </div>
          )}
        </section>

        <section className="panel previewPanel">
          <h2>4. Preview / Export</h2>
          <div className="previewCanvas">
            {image ? <img src={`data:${image.mimeType};base64,${image.base64}`} alt="Generated thumbnail" /> : <div className="previewEmpty">Ảnh sẽ hiện ở đây. Text overlay nên làm sau để chữ nét hơn.</div>}
            {image && selected && <div className="fakeOverlay"><span>{selected.thumbnailText}</span></div>}
          </div>
          <div className="buttonRow">
            <button className="secondary" disabled={!image} onClick={saveImage}>Save PNG</button>
            <button className="secondary" disabled={!image} onClick={() => setImage(null)}>Clear Preview</button>
          </div>
          <div className="tip">Gợi ý: Gemini/Leonardo nên tạo ảnh nền trước, còn chữ thumbnail nên overlay trong app/canva để không bị sai chữ.</div>
        </section>
      </main>
    </div>
  );
}
