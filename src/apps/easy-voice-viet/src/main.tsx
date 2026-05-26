import React, {useMemo, useState, useEffect, useRef} from 'react';
import { FaBroom, FaPlay, FaMicrophone, FaMusic, FaCog, FaFolderOpen, FaKey, FaFileImport, FaFileExport, FaStethoscope, FaTrash, FaSyncAlt, FaDatabase, FaDownload, FaFileAudio, FaVolumeUp, FaCheck, FaTimes, FaListAlt, FaClipboardList, FaCloudUploadAlt } from 'react-icons/fa';
import './style.css';

declare global { interface Window { studioAPI:any } }
type Mode='ads'|'story'|'review';
type Style='Tự nhiên'|'Cảm xúc'|'Năng lượng';
type Gender='female'|'male';
type Stage='idle'|'processing'|'saving'|'done'|'error';
type KeyTab='overview'|'keys'|'vertex';
type DictEntry={id:string; from:string; to:string; enabled:boolean};

const modes:{id:Mode,title:string,desc:string}[]=[
  {id:'ads',title:'Quảng cáo',desc:'Rõ · nhanh · thuyết phục'},
  {id:'story',title:'Đọc truyện',desc:'Êm · chậm · truyền cảm'},
  {id:'review',title:'Review phim',desc:'Cuốn · cinematic · tò mò'}
];
const presets:Record<Mode,{style:Style; speed:number; bgm:boolean; bgmType:string}>= {
  ads:{style:'Năng lượng', speed:64, bgm:true, bgmType:'Nhẹ'},
  story:{style:'Cảm xúc', speed:42, bgm:true, bgmType:'Cảm xúc'},
  review:{style:'Tự nhiên', speed:54, bgm:true, bgmType:'Kịch tính'}
};
const voiceByGender:Record<Gender,string>={female:'Kore', male:'Puck'};
const voiceOptions=['Kore','Puck','Leda','Charon','Zephyr','Fenrir','Aoede','Orus'];
const modelOptions=['gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts'];
const bgmOptions=['Chill','Nhẹ','Cảm xúc','Kịch tính'];

function estimateDuration(chars:number){ return Math.max(0, Math.round(chars/14)); }
function formatTime(sec:number){ const m=Math.floor(sec/60), s=sec%60; return `${m}:${String(s).padStart(2,'0')}`; }
function speedLabel(value:number){ if(value<46) return 'Chậm rãi'; if(value>60) return 'Nhanh gọn'; return 'Vừa tự nhiên'; }
function speedToEngine(value:number){ if(value<46) return 'Chậm'; if(value>60) return 'Nhanh'; return 'Vừa'; }
function stageFromMessage(msg:string):Stage{
  const m=String(msg||'');
  if(/lỗi|error|thất bại/i.test(m)) return 'error';
  if(/xuất mp3|saving|lưu|export/i.test(m)) return 'saving';
  if(/hoàn tất|xong|sẵn sàng/i.test(m)) return 'done';
  if(/làm sạch|tách chunk|đang tạo|ghép|xử lý|chuẩn bị/i.test(m)) return 'processing';
  return 'processing';
}
function friendlyProgress(msg:string){
  const m=String(msg||'');
  if(/Làm sạch/i.test(m)) return 'Đang chuẩn bị nội dung...';
  if(/Tách chunk/i.test(m)) return 'Đang chia nội dung thành đoạn đọc...';
  if(/Đang tạo giọng đọc/i.test(m)) return m;
  if(/đổi key khác/i.test(m)) return m;
  if(/Dùng lại cache hoàn chỉnh/i.test(m)) return 'Dùng lại bản audio đã tạo trước đó...';
  if(/Dùng lại cache chunk/i.test(m)) return m;
  if(/cache|Đã tìm thấy/i.test(m)) return 'Dùng lại voice đã tạo trước đó...';
  if(/ghép giọng|Merge/i.test(m)) return 'Đang ghép các đoạn giọng đọc...';
  if(/Mix BGM|BGM|nhạc nền/i.test(m)) return 'Đang xử lý nhạc nền...';
  if(/Hoàn tất|Xong/i.test(m)) return 'Đã tạo xong voice.';
  return m;
}
function safeName(name:string){ return (name||'EVS-Voice').replace(/[\\/:*?"<>|]/g,'-').trim() || 'EVS-Voice'; }
function fileNameOnly(filePath:string){ return String(filePath||'').split(/[\\/]/).pop() || String(filePath||''); }
function splitKeys(raw:string){ return String(raw||'').split(/[\n,;\s]+/).map(x=>x.trim()).map(x=>x.includes('=') ? x.split('=').pop()!.trim() : x).filter(Boolean); }
function escapeRegExp(value:string){ return String(value||'').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function applyWordDictionary(input:string, entries:DictEntry[], enabled=true){
  if(!enabled) return String(input||'');
  let out=String(input||'');
  const active=[...(entries||[])].filter(e=>e.enabled!==false && e.from.trim() && e.to.trim()).sort((a,b)=>b.from.length-a.from.length);
  for(const e of active){
    const from=e.from.trim();
    const to=e.to.trim();
    // Với từ viết tắt/brand ngắn như TGDD, AI, KOL: chỉ thay khi là token riêng, không thay lẫn trong từ khác.
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(from)})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
    out = out.replace(pattern, (_m, lead)=>`${lead}${to}`);
  }
  return out;
}
function parseDictionaryText(raw:string):DictEntry[]{
  return String(raw||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,idx)=>{
    const parts=line.split(/=>|=/);
    const from=(parts.shift()||'').trim();
    const to=parts.join('=').trim();
    return from && to ? {id:`dict-${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}`,from,to,enabled:true} : null;
  }).filter(Boolean) as DictEntry[];
}
type LocalKeyStat={active:boolean; status:'active'|'limited'|'invalid'|'error'|'unused'; success:number; fail:number; chars:number; lastUsedAt:string; lastError:string};
function maskKey(k:string){ return k ? `${k.slice(0,6)}••••••${k.slice(-6)}` : '-'; }
function keyTag(keyList:string[], key:string){ const idx=keyList.indexOf(key); return idx>=0 ? `GEMINI_${String(idx+1).padStart(3,'0')}` : (key ? 'GEMINI_KEY' : '-'); }
function statFor(stats:Record<string,LocalKeyStat>, key:string):LocalKeyStat{ return stats[key] || {active:true,status:'unused',success:0,fail:0,chars:0,lastUsedAt:'',lastError:''}; }
function niceDate(v:string){ if(!v) return '-'; try{return new Date(v).toLocaleString('vi-VN')}catch{return '-'} }

function App(){
  const [mode,setMode]=useState<Mode>('ads');
  const [text,setText]=useState('');
  const [fileName,setFileName]=useState(localStorage.getItem('evsFileName') || 'Ep01');
  const [outputDir,setOutputDir]=useState(localStorage.getItem('evsOutputDir') || '');
  const [engine,setEngine]=useState<'gemini'|'vertex'>('gemini');
  const [apiKey,setApiKey]=useState(localStorage.getItem('geminiKey')||'');
  const [accessToken,setAccessToken]=useState(localStorage.getItem('vertexToken')||'');
  const [projectId,setProjectId]=useState(localStorage.getItem('vertexProject')||'');
  const [location,setLocation]=useState(localStorage.getItem('vertexLocation')||'us-central1');
  const [model,setModel]=useState(localStorage.getItem('ttsModel')||'gemini-2.5-flash-preview-tts');
  const [gender,setGender]=useState<Gender>('female');
  const [voiceName,setVoiceName]=useState(voiceByGender.female);
  const [style,setStyle]=useState<Style>(presets.ads.style);
  const [speed,setSpeed]=useState(presets.ads.speed);
  const [bgmEnabled,setBgmEnabled]=useState(true);
  const [bgmType,setBgmType]=useState(presets.ads.bgmType);
  const [bgmPath,setBgmPath]=useState(localStorage.getItem('evsLastBgmPath')||'');
  const [externalAudioPath,setExternalAudioPath]=useState(localStorage.getItem('evsExternalAudioPath')||'');
  const [bgmLibrary,setBgmLibrary]=useState<string[]>(()=>{ try{return JSON.parse(localStorage.getItem('evsBgmLibrary')||'[]')}catch{return []} });
  const [bgmVolume,setBgmVolume]=useState(()=>Number(localStorage.getItem('evsBgmVolume') || 0.18));
  const [voiceVolume,setVoiceVolume]=useState(()=>Number(localStorage.getItem('evsVoiceVolume') || 1));
  const [bgmPreviewBusy,setBgmPreviewBusy]=useState(false);
  const [showBgm,setShowBgm]=useState(false);
  const [showDict,setShowDict]=useState(false);
  const [dictEnabled,setDictEnabled]=useState(localStorage.getItem('evsDictEnabled') !== '0');
  const [dictEntries,setDictEntries]=useState<DictEntry[]>(()=>{ try{return JSON.parse(localStorage.getItem('evsDictEntries')||'[]')}catch{return []} });
  const [dictFrom,setDictFrom]=useState('');
  const [dictTo,setDictTo]=useState('');
  const [showKeys,setShowKeys]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [keyTab,setKeyTab]=useState<KeyTab>('overview');
  const [keySearch,setKeySearch]=useState('');
  const [selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [keyStats,setKeyStats]=useState<Record<string,LocalKeyStat>>(()=>{ try{return JSON.parse(localStorage.getItem('evsKeyStats')||'{}')}catch{return {}} });
  const [keyLogs,setKeyLogs]=useState<any[]>(()=>{ try{return JSON.parse(localStorage.getItem('evsKeyLogs')||'[]')}catch{return []} });
  const pushKeyLog=(type:string,status:string,message:string,keyLabel='SYSTEM',charsCount=0)=>{
    setKeyLogs(prev=>[{id:String(Date.now()+Math.random()),time:new Date().toISOString(),type,keyLabel,status,chars:charsCount,message},...prev].slice(0,300));
  };
  const [vertexJsonPath,setVertexJsonPath]=useState(localStorage.getItem('vertexJsonPath')||'');
  const [vertexClientEmail,setVertexClientEmail]=useState(localStorage.getItem('vertexClientEmail')||'');
  const [progress,setProgress]=useState<string[]>([]);
  const [stage,setStage]=useState<Stage>('idle');
  const [busy,setBusy]=useState(false);
  const [audio,setAudio]=useState('');
  const [lastFile,setLastFile]=useState('');
  const [lastVoiceFile,setLastVoiceFile]=useState('');
  const [lastMp3,setLastMp3]=useState('');
  const [lastSrt,setLastSrt]=useState('');
  const [lastSrtContent,setLastSrtContent]=useState('');
  const [activeKeyLabel,setActiveKeyLabel]=useState('-');
  const [cacheInfo,setCacheInfo]=useState<any>(null);
  const [cacheEnabled,setCacheEnabled]=useState(localStorage.getItem('evsCacheEnabled') !== '0');
  const [jobStart,setJobStart]=useState<number|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const [chunkInfo,setChunkInfo]=useState({current:0,total:0});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processedText=useMemo(()=>applyWordDictionary(text,dictEntries,dictEnabled),[text,dictEntries,dictEnabled]);
  const chars=text.length;
  const processedChars=processedText.length;
  const replacedCount=useMemo(()=>dictEnabled && text ? dictEntries.filter(e=>e.enabled!==false && e.from.trim() && e.to.trim() && text.toLowerCase().includes(e.from.trim().toLowerCase())).length : 0,[dictEnabled,dictEntries,text]);
  const duration=useMemo(()=>formatTime(estimateDuration(processedChars)),[processedChars]);
  const progressPercent = stage==='done' ? 100 : stage==='saving' ? 86 : stage==='error' ? 100 : (chunkInfo.total ? Math.max(6, Math.round((chunkInfo.current / chunkInfo.total) * 76)) : (stage==='processing' ? 18 : 0));
  const keyList = useMemo(()=>splitKeys(apiKey),[apiKey]);
  const currentKey = keyList[0] || '';
  const visibleKeys = useMemo(()=>keyList.filter(k=>!keySearch.trim() || k.toLowerCase().includes(keySearch.toLowerCase()) || maskKey(k).toLowerCase().includes(keySearch.toLowerCase())),[keyList,keySearch]);
  const keySummary = useMemo(()=>{
    let active=0, limited=0, invalid=0, error=0, charsUsed=0, success=0, fail=0;
    keyList.forEach(k=>{ const st=statFor(keyStats,k); if(st.active) active++; if(st.status==='limited') limited++; if(st.status==='invalid') invalid++; if(st.status==='error') error++; charsUsed+=st.chars||0; success+=st.success||0; fail+=st.fail||0; });
    return {total:keyList.length, active, limited, invalid, error, charsUsed, success, fail};
  },[keyList,keyStats]);

  useEffect(()=>{ const p=presets[mode]; setStyle(p.style); setSpeed(p.speed); setBgmEnabled(p.bgm); setBgmType(p.bgmType); },[mode]);
  useEffect(()=>{ setVoiceName(voiceByGender[gender]); },[gender]);
  useEffect(()=>{ localStorage.setItem('geminiKey',apiKey); localStorage.setItem('vertexToken',accessToken); localStorage.setItem('vertexProject',projectId); localStorage.setItem('vertexLocation',location); localStorage.setItem('ttsModel',model); localStorage.setItem('evsFileName',fileName); localStorage.setItem('evsOutputDir',outputDir); localStorage.setItem('vertexJsonPath',vertexJsonPath); localStorage.setItem('vertexClientEmail',vertexClientEmail); },[apiKey,accessToken,projectId,location,model,fileName,outputDir,vertexJsonPath,vertexClientEmail]);
  useEffect(()=>{ localStorage.setItem('evsKeyStats', JSON.stringify(keyStats)); },[keyStats]);
  useEffect(()=>{ localStorage.setItem('evsKeyLogs', JSON.stringify(keyLogs)); },[keyLogs]);
  useEffect(()=>{ localStorage.setItem('evsBgmLibrary', JSON.stringify(bgmLibrary)); if(bgmPath) localStorage.setItem('evsLastBgmPath', bgmPath); },[bgmLibrary,bgmPath]);
  useEffect(()=>{ localStorage.setItem('evsBgmVolume', String(bgmVolume)); localStorage.setItem('evsVoiceVolume', String(voiceVolume)); },[bgmVolume,voiceVolume]);
  useEffect(()=>{ if(externalAudioPath) localStorage.setItem('evsExternalAudioPath', externalAudioPath); else localStorage.removeItem('evsExternalAudioPath'); },[externalAudioPath]);
  useEffect(()=>{ localStorage.setItem('evsDictEntries', JSON.stringify(dictEntries)); localStorage.setItem('evsDictEnabled', dictEnabled ? '1' : '0'); },[dictEntries,dictEnabled]);
  useEffect(()=>{ localStorage.setItem('evsCacheEnabled', cacheEnabled ? '1' : '0'); },[cacheEnabled]);
  useEffect(()=>{ window.studioAPI?.getCacheInfo?.().then(setCacheInfo).catch(()=>{}); },[]);
  useEffect(()=>{
    const off = window.studioAPI?.onProgress?.((msg:string)=>{
      const raw = String(msg||'');
      const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
      if(m){
        const current = Math.max(0, Number(m[1]) || 0);
        const total = Math.max(current, Number(m[2]) || 0);
        setChunkInfo({current,total});
      }
      const keyMatch = raw.match(/(GEMINI_\d{3}|VERTEX AI)/i);
      if(keyMatch) setActiveKeyLabel(keyMatch[1].toUpperCase());
      const line = friendlyProgress(raw);
      setProgress(p=>[...p.slice(-5), line]);
      setStage(stageFromMessage(line));
    });
    return ()=>{ try{ off?.(); }catch{} };
  },[]);
  useEffect(()=>{
    if(!jobStart || !busy) return;
    const timer = window.setInterval(()=>setElapsed(Math.max(0, Math.floor((Date.now()-jobStart)/1000))), 500);
    return ()=>window.clearInterval(timer);
  },[jobStart,busy]);
  useEffect(()=>{
    if(!audio || !audioRef.current) return;
    const player = audioRef.current;
    player.pause();
    player.src = audio;
    player.load();
    const tryPlay = async()=>{
      try{ player.currentTime = 0; await player.play(); }
      catch{ setTimeout(()=>player.play().catch(()=>{}), 700); }
    };
    const timer = window.setTimeout(tryPlay, 250);
    return ()=>window.clearTimeout(timer);
  },[audio]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{ if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='k'){ e.preventDefault(); setShowKeys(v=>!v); } };
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey);
  },[]);

  async function pickBgm(){
    const f=await window.studioAPI.importBgmAsset?.() || await window.studioAPI.chooseBgm?.();
    if(f){
      const pathValue = typeof f === 'string' ? f : (f.path || f.filePath || '');
      if(!pathValue) return;
      setBgmPath(pathValue); setBgmEnabled(true);
      setBgmLibrary(prev=>Array.from(new Set([pathValue,...prev])).slice(0,50));
    }
  }
  async function pickExternalAudio(){
    const f=await window.studioAPI.chooseExternalAudio?.();
    if(f?.path){ setExternalAudioPath(f.path); setProgress(p=>[...p.slice(-5), `Đã thêm audio ngoài: ${fileNameOnly(f.path)}`]); }
  }
  async function makeAudioUrl(filePath:string, fallbackUrl?:string){
    try{
      // Làm giống app English: đọc file audio qua Electron rồi tạo ObjectURL cho <audio>.
      // Cách này ổn hơn file:// và data-url dài, nhất là với WAV.
      const result = await window.studioAPI.readAudioFile?.({ filePath });
      if(result?.ok && result.data){
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: result.mimeType || 'audio/wav' });
        return URL.createObjectURL(blob);
      }
    }catch(err){ console.warn('readAudioFile preview failed', err); }
    try{
      const dataUrl = await window.studioAPI.readAudioDataUrl?.(filePath);
      if(dataUrl){
        const blob = await (await fetch(dataUrl)).blob();
        return URL.createObjectURL(blob);
      }
    }catch(err){ console.warn('readAudioDataUrl preview failed', err); }
    return fallbackUrl || `file:///${String(filePath).replace(/\\/g,'/')}?t=${Date.now()}`;
  }
  async function importKeys(){
    try{
      if(!window.studioAPI?.importKeysTxt) throw new Error('Electron API importKeysTxt chưa sẵn sàng. Hãy tắt app và chạy lại dev.bat.');
      const raw = await window.studioAPI.importKeysTxt();
      if(!raw) return;
      const before = keyList.length;
      const merged = Array.from(new Set([...keyList, ...splitKeys(raw)]));
      setApiKey(merged.join('\n'));
      setSelectedKeys([]);
      setKeyTab('keys');
      pushKeyLog('IMPORT','success',`Đã nhập ${merged.length-before} key mới. Tổng ${merged.length} key. Key trùng đã tự bỏ qua.`);
      alert(`Đã nhập ${merged.length-before} key mới. Tổng ${merged.length} key. Key trùng đã tự bỏ qua.`);
    }catch(e:any){ pushKeyLog('IMPORT','error',e.message || String(e)); alert(e.message || String(e)); }
  }
  async function exportKeys(){
    try{
      if(!keyList.length){ alert('Chưa có key để xuất.'); return; }
      if(!window.studioAPI?.exportKeysTxt) throw new Error('Electron API exportKeysTxt chưa sẵn sàng. Hãy tắt app và chạy lại dev.bat.');
      const saved = await window.studioAPI.exportKeysTxt(Array.from(new Set(keyList)).join('\n'));
      if(saved){ pushKeyLog('EXPORT','success',`Đã xuất keys.txt: ${saved}`); alert('Đã xuất keys.txt.'); }
    }catch(e:any){ pushKeyLog('EXPORT','error',e.message || String(e)); alert(e.message || String(e)); }
  }
  async function exportKeyLogs(){
    try{
      const content = keyLogs.length
        ? keyLogs.map(l=>`[${niceDate(l.time)}] ${l.type} ${l.keyLabel} ${l.status}: ${l.message}${l.chars?` (${l.chars} ký tự)`:''}`).join('\n')
        : 'Chưa có log key.';
      if(window.studioAPI?.exportKeyLogTxt){
        const saved = await window.studioAPI.exportKeyLogTxt(content);
        if(saved){ alert('Đã tải log key.'); }
        return;
      }
      if(window.studioAPI?.exportKeysTxt){
        const saved = await window.studioAPI.exportKeysTxt(content);
        if(saved){ alert('Đã tải log key.'); }
        return;
      }
      throw new Error('Electron API tải log chưa sẵn sàng. Hãy tắt app và chạy lại dev.bat.');
    }catch(e:any){ alert(e.message || String(e)); }
  }
  function deleteSelectedOrBadKeys(){
    const bad = keyList.filter(k=>['error','invalid'].includes(statFor(keyStats,k).status));
    const targets = selectedKeys.length ? selectedKeys : bad;
    if(!targets.length){ alert('Chưa chọn key nào và cũng chưa có key lỗi. Hãy tick key cần xóa hoặc bấm Test all keys trước.'); return; }
    const label = selectedKeys.length ? `${targets.length} key đã chọn` : `${targets.length} key lỗi/invalid`;
    if(!confirm(`Xóa ${label}?`)) return;
    const keep = keyList.filter(k=>!targets.includes(k));
    setApiKey(keep.join('\n'));
    setSelectedKeys([]);
    pushKeyLog('DELETE','success',`Đã xóa ${targets.length} key.`);
  }
  async function importVertexJson(){
    const info = await window.studioAPI.importVertexJson?.();
    if(!info) return;
    setVertexJsonPath(info.path || '');
    setVertexClientEmail(info.clientEmail || '');
    if(info.projectId) setProjectId(info.projectId);
    setEngine('vertex');
    pushKeyLog('VERTEX','success',`Đã import Vertex JSON: ${info.clientEmail || info.projectId || info.path}`);
    alert('Đã import service-account JSON. Project ID đã được nhận diện nếu có trong file.');
  }
  async function testAllKeys(){
    if(!keyList.length){ alert('Chưa có key để test.'); return; }
    setKeyTab('keys');
    for(const k of keyList){
      setKeyStats(prev=>{ const st=statFor(prev,k); return {...prev,[k]:{...st,active:st.active!==false,status:'unused',lastError:'Đang test...'}}; });
      try{
        const url=`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`;
        const res=await fetch(url);
        if(res.ok){ setKeyStats(prev=>{const st=statFor(prev,k); return {...prev,[k]:{...st,status:'active',active:true,lastUsedAt:new Date().toISOString(),lastError:''}};}); pushKeyLog('TEST','active','Key hoạt động bình thường',maskKey(k)); }
        else {
          const tx=await res.text();
          const low=tx.toLowerCase();
          const status = res.status===429 || low.includes('quota') ? 'limited' : (res.status===400||res.status===403 ? 'invalid' : 'error');
          setKeyStats(prev=>{const st=statFor(prev,k); return {...prev,[k]:{...st,status:status as any,active:status==='limited',lastUsedAt:new Date().toISOString(),lastError:`${res.status}: ${tx.slice(0,180)}`}};}); pushKeyLog('TEST',status,`${res.status}: ${tx.slice(0,180)}`,maskKey(k));
        }
      }catch(e:any){ setKeyStats(prev=>{const st=statFor(prev,k); return {...prev,[k]:{...st,status:'error',active:false,lastUsedAt:new Date().toISOString(),lastError:String(e.message||e).slice(0,180)}};}); pushKeyLog('TEST','error',String(e.message||e).slice(0,180),maskKey(k)); }
      await new Promise(r=>setTimeout(r,850));
    }
  }
  async function pickOutputDir(){ const f=await window.studioAPI.chooseOutputDir?.(); if(f) setOutputDir(f); }
  function cleanText(){ setText(t=>t.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()); }
  function addDictEntry(){
    const rawFrom=dictFrom.trim();
    const to=dictTo.trim();
    if(!rawFrom || !to){ alert('Nhập đủ Từ viết tắt và Từ thay thế.'); return; }
    const fromItems=rawFrom.split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
    if(!fromItems.length){ alert('Chưa có từ viết tắt hợp lệ.'); return; }
    setDictEntries(prev=>{
      const lowerSet=new Set(fromItems.map(x=>x.toLowerCase()));
      const filtered=prev.filter(e=>!lowerSet.has(e.from.trim().toLowerCase()));
      const created=fromItems.map((from,idx)=>({id:`dict-${Date.now()}-${idx}`,from,to,enabled:true}));
      return [...created,...filtered];
    });
    setDictFrom('');
    setDictTo('');
  }
  function importDictFromText(){
    const raw=prompt('Dán danh sách từ, mỗi dòng dạng: TGDD = Thế Giới Di Động');
    if(!raw) return;
    const parsed=parseDictionaryText(raw);
    if(!parsed.length){ alert('Không tìm thấy dòng hợp lệ. Ví dụ: TGDD = Thế Giới Di Động'); return; }
    setDictEntries(prev=>{
      const map=new Map<string,DictEntry>();
      [...parsed,...prev].forEach(e=>map.set(e.from.trim().toLowerCase(),e));
      return Array.from(map.values());
    });
  }
  function exportDict(){
    const content=dictEntries.map(e=>`${e.from} = ${e.to}`).join('\n');
    try{ navigator.clipboard?.writeText(content); alert('Đã copy từ điển vào clipboard. Bạn có thể dán ra file .txt để lưu.'); }
    catch{ alert(content || 'Từ điển đang trống.'); }
  }
  async function previewBgmSetting(){
    if(bgmPreviewBusy) return;
    const voiceForMix = lastVoiceFile || lastFile;
    if(!voiceForMix && !externalAudioPath){ alert('Hãy bấm Tạo giọng hoặc thêm file audio ngoài trước khi nghe thử BGM.'); return; }
    setBgmPreviewBusy(true);
    try{
      const res=await window.studioAPI.mixBgmPreview?.({voiceFile:voiceForMix,externalAudioFile:externalAudioPath,bgmFile:bgmEnabled?bgmPath:'',bgmVolume,voiceVolume,outputBaseName:`${safeName(fileName)}-bgm-preview`,outputDir});
      if(!res?.filePath) throw new Error('Không tạo được file nghe thử BGM.');
      const playableUrl = await makeAudioUrl(res.filePath, res.fileUrl ? `${res.fileUrl}?t=${Date.now()}` : undefined);
      setAudio(playableUrl);
      setLastFile(res.filePath);
      setProgress(p=>[...p.slice(-5),'Đã cập nhật bản nghe thử BGM từ voice hiện tại.']);
    }catch(e:any){ alert(e.message || String(e)); }
    finally{ setBgmPreviewBusy(false); }
  }
  async function openOutput(){
    const target = lastMp3 || lastFile || outputDir || cacheInfo?.dir || '';
    if(target) await window.studioAPI.openFolder(target);
  }
  async function gen(preview=false){
    setBusy(true); setJobStart(Date.now()); setElapsed(0); setChunkInfo({current:0,total:0}); setStage('processing'); setProgress([preview?'Đang tạo bản nghe thử 20 giây...':'Đang tạo giọng đọc...']); setAudio(''); setLastVoiceFile(''); setLastMp3(''); setLastSrt(''); setLastSrtContent(''); setActiveKeyLabel(engine==='gemini' ? keyTag(keyList,currentKey) : 'VERTEX AI');
    try{
      const textForTts = processedText;
      const res=await window.studioAPI.generateVoice({preview,text:textForTts,originalText:text,dictEnabled,dictCount:dictEntries.length,engine,apiKey:currentKey,apiKeys:keyList,accessToken,projectId,location,model,voiceName,mode,style,speed:speedToEngine(speed),bgmPath:bgmEnabled?bgmPath:'',bgmVolume,voiceVolume, outputBaseName:safeName(fileName), outputDir, cacheEnabled});
      if(currentKey){ setKeyStats(prev=>{ const st=statFor(prev,currentKey); return {...prev,[currentKey]:{...st,active:true,status:'active',success:st.success+1,chars:st.chars+processedChars,lastUsedAt:new Date().toISOString(),lastError:''}}; }); pushKeyLog('GENERATE','success','Tạo audio thành công', maskKey(currentKey), processedChars); }
      setLastFile(res.filePath);
      setLastVoiceFile(res.voiceFile || res.filePath);
      setLastSrt(res.srtPath || '');
      setLastSrtContent(res.srtContent || '');
      setLastMp3('');
      const playableUrl = await makeAudioUrl(res.filePath, res.fileUrl ? `${res.fileUrl}?t=${Date.now()}` : `file:///${String(res.filePath).replace(/\\/g,'/')}?t=${Date.now()}`);
      setAudio(playableUrl);
      setChunkInfo({current:res.chunks || chunkInfo.current, total:res.chunks || chunkInfo.total});
      setStage('done');
      setProgress(p=>[...p.slice(-5), res.finalCacheHit ? 'Đã dùng lại audio từ cache' : (res.cacheHits ? `Đã tạo xong audio • dùng lại ${res.cacheHits}/${res.chunks} chunk` : 'Đã tạo xong audio')]);
      const info=await window.studioAPI.getCacheInfo(); setCacheInfo(info);
    }catch(e:any){ if(currentKey){ setKeyStats(prev=>{ const st=statFor(prev,currentKey); return {...prev,[currentKey]:{...st,status:'error',fail:st.fail+1,lastUsedAt:new Date().toISOString(),lastError:String(e.message||e).slice(0,240)}}; }); pushKeyLog('GENERATE','error',String(e.message||e).slice(0,240), maskKey(currentKey), processedChars); } setStage('error'); setProgress(p=>[...p,`Lỗi: ${e.message||e}`]); alert(e.message||String(e)); }
    finally{ setBusy(false); }
  }
  async function exportMp3(){
    const voiceForExport = lastVoiceFile || lastFile;
    if(!voiceForExport && !externalAudioPath){ alert('Chưa có audio để xuất MP3. Hãy Tạo giọng hoặc thêm audio ngoài.'); return; }
    setBusy(true); setJobStart(Date.now()); setStage('saving'); setProgress(p=>[...p.slice(-5),'Đang xuất MP3...']);
    try{
      const res=await window.studioAPI.exportMp3WithMix?.({voiceFile:voiceForExport,externalAudioFile:externalAudioPath,bgmFile:bgmEnabled?bgmPath:'',bgmVolume,voiceVolume,outputBaseName:safeName(fileName),outputDir})
        || await window.studioAPI.exportMp3(voiceForExport, safeName(fileName));
      setLastMp3(res.filePath);
      let playableUrl = res.fileUrl ? `${res.fileUrl}?t=${Date.now()}` : `file:///${res.filePath.replace(/\\/g,'/')}?t=${Date.now()}`;
      try{ playableUrl = await window.studioAPI.readAudioDataUrl?.(res.filePath) || playableUrl; }catch{}
      setAudio(playableUrl); setStage('done');
      setProgress(p=>[...p.slice(-5),'MP3 đã sẵn sàng.']);
    }catch(e:any){ setStage('error'); setProgress(p=>[...p,`Lỗi xuất MP3: ${e.message||e}`]); alert(e.message||String(e)); }
    finally{ setBusy(false); }
  }
  async function exportSrt(){
    if(!lastSrt && !lastSrtContent){ alert('Chưa có SRT. Hãy tạo giọng trước.'); return; }
    try{
      const res = lastSrtContent ? await window.studioAPI.saveSubtitleSrtContent?.(lastSrtContent, safeName(fileName)) : await window.studioAPI.saveSubtitleSrt?.(lastSrt, safeName(fileName));
      if(res?.filePath){ setProgress(p=>[...p.slice(-5),'SRT đã sẵn sàng.']); }
    }catch(e:any){ alert(e.message || String(e)); }
  }

  return <div className="appLight">
    <header className="globalTitle"><div>EASY STUDIO</div><h1>Easy Voice Việt</h1></header>
    <aside className="leftRail">
      <section className="leftCard presetBox compactLeft">
        <div className="cardTop noCaret"><h2>Preset Manager</h2></div>
        <div className="presetGrid">{modes.map(m=><button key={m.id} className={mode===m.id?'active':''} onClick={()=>setMode(m.id)}><b>{m.title}</b><span>{m.desc}</span></button>)}</div>
        <div className="rowBtns tight"><button className="iconBtn cleanBtn" onClick={cleanText}><FaBroom /> Làm sạch text</button><button className="primarySoft iconBtn previewBtn" onClick={()=>gen(true)} disabled={busy||!text.trim()}><FaPlay /> Nghe thử</button></div>
      </section>

      <section className="leftCard voiceBox compactLeft">
        <div className="cardTop noCaret"><h2>Thiết lập giọng đọc</h2></div>
        <label className="fieldLabel">Voice</label>
        <div className="seg"><button className={gender==='female'?'active':''} onClick={()=>setGender('female')}>Nữ</button><button className={gender==='male'?'active':''} onClick={()=>setGender('male')}>Nam</button></div>
        <label className="fieldLabel">Style</label>
        <select className="fullSelect" value={style} onChange={e=>setStyle(e.target.value as Style)}><option>Tự nhiên</option><option>Cảm xúc</option><option>Năng lượng</option></select>
        <label className="fieldLabel">Speed</label>
        <div className="rangeLine"><input type="range" min="30" max="75" value={speed} onChange={e=>setSpeed(Number(e.target.value))}/><span>{speedLabel(speed)} • {speed}</span></div>
      </section>
    </aside>

    <main className="rightWorkspace">
      <section className="scriptPanel">
        <div className="scriptHead">
          <h2>Nhập văn bản</h2>
          <div className="headTools">
            <button type="button" className={dictEnabled?'dictTopBtn enabled':'dictTopBtn'} onClick={()=>setShowDict(true)}>Từ điển đọc{replacedCount ? ` • ${replacedCount}` : ''}</button>
            <div className={bgmEnabled?'bgmCombo enabled':'bgmCombo'}>
              <label><input type="checkbox" checked={bgmEnabled} onChange={e=>setBgmEnabled(e.target.checked)} /> BGM nền</label>
            </div>
            <div className="charPill">{chars.toLocaleString('vi-VN')} ký tự{processedChars!==chars ? ` → ${processedChars.toLocaleString('vi-VN')}` : ''}</div>
          </div>
        </div>
        <textarea value={text} maxLength={12000} onChange={e=>setText(e.target.value)} placeholder="Dán nội dung cần tạo voice tại đây..." />
        <div className="scriptMeta"><span>Ước tính: {duration}</span><span>File: {safeName(fileName)}.mp3</span><span>Preset: {modes.find(m=>m.id===mode)?.title}</span><span>Từ điển: {dictEnabled ? `${dictEntries.length} mục` : 'Tắt'}</span></div>
      </section>

      <div className="actionBar">
        <button className="mainCta" onClick={()=>gen(false)} disabled={busy||!text.trim()}><FaMicrophone /> Tạo giọng</button>
        <button className="bgmSettingBtn" onClick={()=>setShowBgm(true)} disabled={!bgmEnabled}><FaMusic /> Thiết lập BGM</button>
        <button className="settingsActionBtn" onClick={()=>setShowSettings(true)}><FaCog /> Thiết lập</button>
        <button className="folderActionBtn" onClick={openOutput}><FaFolderOpen /> Mở thư mục</button>
        <button className="keyActionBtn" onClick={()=>setShowKeys(v=>!v)}><FaKey /> {showKeys?'Ẩn Key Manager':'Key Manager'}</button>
      </div>

      {showSettings && <div className="modalBackdrop" onMouseDown={()=>setShowSettings(false)}><section className="modalCard fileSettings" onMouseDown={e=>e.stopPropagation()}>
        <div className="cardTop"><div><h2>Thiết lập xuất file</h2></div><button className="roundMini" onClick={()=>setShowSettings(false)}>×</button></div>
        <label className="fieldLabel">Tên file</label>
        <input className="nameInput" value={fileName} onChange={e=>setFileName(e.target.value)} placeholder="Ví dụ: Ep01-001" />
        <label className="fieldLabel">Thư mục lưu</label>
        <input className="nameInput" readOnly value={outputDir || 'Mặc định: thư mục exports của app'} />
        <div className="rowBtns"><button className="iconBtn folderPickBtn" onClick={pickOutputDir}><FaFolderOpen /> Chọn thư mục</button><button className="primarySoft iconBtn doneBtn" onClick={()=>setShowSettings(false)}><FaCheck /> Xong</button></div>
      </section></div>}

      {showBgm && <div className="modalBackdrop" onMouseDown={()=>setShowBgm(false)}><section className="modalCard bgmModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="cardTop"><div><h2>Thiết lập BGM</h2></div><button className="roundMini" onClick={()=>setShowBgm(false)}>×</button></div>
        <div className="settingsGrid bgmSettingsGrid">
          <label className="span2">BGM Preset<select value={bgmType} onChange={e=>setBgmType(e.target.value)}>{bgmOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Âm lượng Voice <b>{Math.round(voiceVolume*100)}%</b><input type="range" min="0.5" max="1.5" step="0.05" value={voiceVolume} onChange={e=>setVoiceVolume(Number(e.target.value))}/></label>
          <label>Âm lượng BGM <b>{Math.round(bgmVolume*100)}%</b><input type="range" min="0" max="0.7" step="0.01" value={bgmVolume} onChange={e=>setBgmVolume(Number(e.target.value))}/></label>
        </div>
        <div className="externalAudioBox"><h3>Audio ngoài</h3><div className="externalAudioRow"><span title={externalAudioPath}>{externalAudioPath ? fileNameOnly(externalAudioPath) : 'Chưa thêm audio ngoài'}</span><button className="iconBtn audioAddBtn" onClick={pickExternalAudio}><FaFileAudio /> Thêm audio ngoài</button>{externalAudioPath && <button className="iconBtn removeBtn" onClick={()=>setExternalAudioPath('')}><FaTimes /> Bỏ chọn</button>}</div></div>
        <div className="bgmLibrary"><h3>Danh sách BGM đã lưu</h3>{bgmLibrary.length===0?<p>Chưa có BGM nào. Bấm “Thêm BGM từ máy” để lưu vào list.</p>:bgmLibrary.map((p,i)=><div className={p===bgmPath?'bgmItem active':'bgmItem'} key={p+i}><span title={fileNameOnly(p)}>{fileNameOnly(p)}</span><button onClick={()=>{setBgmPath(p); setBgmEnabled(true);}}>Chọn</button><button onClick={()=>setBgmLibrary(prev=>prev.filter(x=>x!==p))}>Xóa</button></div>)}</div>
        <div className="rowBtns bgmActionRow"><button className="iconBtn bgmAddBtn" onClick={pickBgm}><FaMusic /> Thêm BGM từ máy</button><button className="iconBtn removeBtn" onClick={()=>setBgmPath('')}><FaTimes /> Bỏ chọn BGM</button><button className="iconBtn previewBtn" onClick={previewBgmSetting} disabled={bgmPreviewBusy || busy || (!lastVoiceFile && !lastFile && !externalAudioPath)}><FaVolumeUp /> {bgmPreviewBusy?'Đang nghe thử...':'Nghe thử'}</button><button className="iconBtn folderActionBtn" onClick={()=>window.studioAPI?.openBgmFolder?.()}><FaFolderOpen /> Mở thư mục BGM</button><button className="primarySoft" onClick={()=>setShowBgm(false)}>Xong</button></div>
      </section></div>}

      {showDict && <div className="modalBackdrop" onMouseDown={()=>setShowDict(false)}><section className="modalCard dictModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="cardTop"><div><h2>Từ điển đọc</h2></div><button className="roundMini" onClick={()=>setShowDict(false)}>×</button></div>
        <label className="checkLine dictToggle"><input type="checkbox" checked={dictEnabled} onChange={e=>setDictEnabled(e.target.checked)} /> Bật thay thế tự động khi tạo giọng</label>
        <div className="dictAddRow twoInputs"><input value={dictFrom} onChange={e=>setDictFrom(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addDictEntry(); }} placeholder="Từ viết tắt"/><span>=</span><input value={dictTo} onChange={e=>setDictTo(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addDictEntry(); }} placeholder="Từ thay thế"/><button className="primarySoft" onClick={addDictEntry}>Thêm / cập nhật</button></div>
        <div className="dictActions"><button className="iconBtn importBtn" onClick={importDictFromText}><FaFileImport /> Nhập danh sách</button><button className="iconBtn exportBtn" onClick={exportDict}><FaFileExport /> Copy để xuất</button><button className="iconBtn dangerBtn" onClick={()=>{ if(confirm('Xóa toàn bộ từ điển đọc?')) setDictEntries([]); }}><FaTrash /> Xóa tất cả</button></div>
        <div className="dictList">{dictEntries.length===0?<p>Chưa có mục nào. Hãy thêm ví dụ: TGDD = Thế Giới Di Động.</p>:dictEntries.map((e,idx)=><div className="dictItem" key={e.id}><label><input type="checkbox" checked={e.enabled!==false} onChange={ev=>setDictEntries(prev=>prev.map(x=>x.id===e.id?{...x,enabled:ev.target.checked}:x))}/></label><input value={e.from} onChange={ev=>setDictEntries(prev=>prev.map(x=>x.id===e.id?{...x,from:ev.target.value}:x))}/><span>→</span><input value={e.to} onChange={ev=>setDictEntries(prev=>prev.map(x=>x.id===e.id?{...x,to:ev.target.value}:x))}/><button onClick={()=>setDictEntries(prev=>prev.filter(x=>x.id!==e.id))}>Xóa</button></div>)}</div>
        {text && <div className="dictPreview"><b>Xem trước đoạn đầu sau thay thế:</b><p>{applyWordDictionary(text,dictEntries,dictEnabled).slice(0,260) || '-'}</p></div>}
      </section></div>}

      {showKeys && <div className="keyModalBackdrop" onMouseDown={()=>setShowKeys(false)}><section className="settingsCard keyManagerPanel englishKeyManager englishKeyManagerModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="keyHeader"><div><h2>Key Manager</h2></div><div className="lastKeyBox"><span>Key đang dùng gần nhất</span><b>{engine==='gemini' ? keyTag(keyList,currentKey) : 'VERTEX AI'}</b></div><button className="plainBtn closeTop" onClick={()=>setShowKeys(false)}>✖ Đóng</button></div>
        <div className="keyTabs"><button className={keyTab==='overview'?'active':''} onClick={()=>setKeyTab('overview')}><FaClipboardList /> Tổng quan</button><button className={keyTab==='keys'?'active':''} onClick={()=>setKeyTab('keys')}><FaKey /> Keys</button><button className={keyTab==='vertex'?'active':''} onClick={()=>setKeyTab('vertex')}><FaDatabase /> Vertex Profile</button></div>
        {keyTab==='overview' && <>
          <div className="statsRow"><div><span>Tổng key</span><b>{keySummary.total}</b></div><div className="green"><span>Active</span><b>{keySummary.active}</b></div><div className="yellow"><span>Limited</span><b>{keySummary.limited}</b></div><div className="red"><span>Invalid</span><b>{keySummary.invalid}</b></div><div><span>Error</span><b>{keySummary.error}</b></div><div className="blue"><span>Tổng ký tự</span><b>{keySummary.charsUsed}</b></div></div>
          <div className="cacheCard"><div className="cacheHead"><h3>TTS Cache</h3><div className="rowBtns tight"><label className="cacheToggle"><input type="checkbox" checked={cacheEnabled} onChange={e=>setCacheEnabled(e.target.checked)} /> Bật cache</label><button className="iconBtn refreshBtn" onClick={()=>window.studioAPI?.getCacheInfo?.().then(setCacheInfo)}><FaSyncAlt /> Làm mới cache</button><button className="iconBtn dangerBtn" onClick={()=>{ if(confirm('Xóa toàn bộ cache TTS? Lần gen sau sẽ gọi API lại.')) window.studioAPI?.clearCache?.().then(()=>window.studioAPI?.getCacheInfo?.().then(setCacheInfo))}}><FaTrash /> Xóa cache</button><button className="primarySoft iconBtn folderActionBtn" onClick={()=>cacheInfo?.dir && window.studioAPI.openFolder(cacheInfo.dir)}><FaFolderOpen /> Mở thư mục cache</button><button className="iconBtn downloadBtn" onClick={exportKeyLogs}><FaDownload /> Tải Log</button><button className="iconBtn dangerBtn" onClick={()=>setKeyLogs([])}><FaTrash /> Clear log</button></div></div><div className="statsRow small"><div><span>Chunk cache</span><b>{cacheInfo?.chunkCount ?? cacheInfo?.count ?? 0}</b></div><div><span>Full cache</span><b>{cacheInfo?.finalCount ?? 0}</b></div><div className="blue"><span>Dung lượng</span><b>{cacheInfo?.sizeText ?? '-'}</b></div><div className="green"><span>Success</span><b>{keySummary.success}</b></div><div className="yellow"><span>Fail</span><b>{keySummary.fail}</b></div></div><p className="cacheNote">Cache voice tự dùng lại khi text + voice + preset + speed + model giống nhau. BGM được mix local sau nên đổi BGM không tốn quota API.</p></div>
        </>}
        {keyTab==='keys' && <div className="keyDashboardBox">
          <div className="keyDashHead"><h3>Danh sách Key</h3><div className="keyDashActions"><button className="iconBtn importBtn" onClick={importKeys}><FaFileImport /> Import</button><button className="iconBtn exportBtn" onClick={exportKeys}><FaFileExport /> Export</button><button className="primarySoft iconBtn testBtn" onClick={testAllKeys}><FaStethoscope /> Test all Keys</button><button className="iconBtn dangerBtn" onClick={deleteSelectedOrBadKeys}><FaTrash /> Xóa keys</button></div><div className="keyDashControls"><input value={keySearch} onChange={e=>setKeySearch(e.target.value)} placeholder="🔍 Tìm theo KEY_01, lỗi, status..."/><select><option>Tất cả</option><option>Active</option><option>Limited</option><option>Invalid</option><option>Error</option></select><select><option>10/trang</option><option>20/trang</option><option>50/trang</option></select></div></div>
          <div className="apiKeyTable dashboard"><div className="th"><b><input type="checkbox" checked={visibleKeys.length>0 && visibleKeys.every(k=>selectedKeys.includes(k))} onChange={e=>setSelectedKeys(e.target.checked?Array.from(new Set([...selectedKeys,...visibleKeys])):selectedKeys.filter(k=>!visibleKeys.includes(k)))} /></b><b>Key</b><b>Status</b><b>Success</b><b>Fail</b><b>Quota hit</b><b>Chars</b><b>Last used</b><b>Last error</b><b>Thao tác</b></div>{visibleKeys.length===0?<p className="emptyKey">Chưa có key. Bấm “Import Keys” để import từ máy.</p>:visibleKeys.map((k,i)=>{const st=statFor(keyStats,k);return <div className={k===currentKey?'tr current':'tr'} key={k+i}><span><input type="checkbox" checked={selectedKeys.includes(k)} onChange={e=>setSelectedKeys(prev=>e.target.checked?Array.from(new Set([...prev,k])):prev.filter(x=>x!==k))} /></span><span title={k}>{`GEMINI_${String(i+1).padStart(3,'0')}`}</span><em className={st.status}>{st.status}</em><span>{st.success}</span><span>{st.fail}</span><span>{st.status==='limited'?1:0}</span><span>{st.chars}</span><span>{niceDate(st.lastUsedAt)}</span><span title={st.lastError}>{st.lastError || '-'}</span><button onClick={()=>setKeyStats(prev=>{const old=statFor(prev,k);return {...prev,[k]:{...old,active:!old.active}}})}>{st.active?'Disable':'Enable'}</button></div>})}</div>
          <div className="keyDashFoot"><span>Tổng {visibleKeys.length} key</span><div><button disabled>‹ Prev</button><button>Next ›</button></div></div>
        </div>}
        {keyTab==='vertex' && <div className="vertexProfileBox">
          <div className="cacheHead"><h3>Vertex + Gemini Key Pool</h3><div className="rowBtns tight"><button className="iconBtn importBtn" onClick={importVertexJson}><FaCloudUploadAlt /> Import service-account JSON</button><button className="iconBtn refreshBtn" onClick={()=>setKeyTab('vertex')}><FaSyncAlt /> Làm mới</button></div></div>
          <div className="poolBox"><h3>Xoay key TTS</h3><p>Bật/tắt nguồn tạo voice. Auto sẽ ưu tiên Vertex, nếu lỗi quota sẽ chuyển sang Gemini key pool.</p><div className="poolGrid"><label><b>Vertex AI</b><span>Service account / quota chính</span><input type="checkbox" checked={engine==='vertex'} onChange={()=>setEngine(engine==='vertex'?'gemini':'vertex')} /></label><label><b>Gemini API Keys</b><span>Danh sách key dự phòng</span><input type="checkbox" checked={engine==='gemini'} onChange={()=>setEngine(engine==='gemini'?'vertex':'gemini')} /></label></div></div>
          <div className="settingsGrid vertexGrid"><label>Vertex Access Token<input value={accessToken} onChange={e=>setAccessToken(e.target.value)} type="password"/></label><label>Vertex Project ID<input value={projectId} onChange={e=>setProjectId(e.target.value)}/></label><label>Vertex Location<input value={location} onChange={e=>setLocation(e.target.value)}/></label><label>Model<select value={model} onChange={e=>setModel(e.target.value)}>{modelOptions.map(x=><option key={x}>{x}</option>)}</select></label><label>Voice<select value={voiceName} onChange={e=>setVoiceName(e.target.value)}>{voiceOptions.map(x=><option key={x}>{x}</option>)}</select></label><label>Engine<select value={engine} onChange={e=>setEngine(e.target.value as any)}><option value="gemini">Gemini</option><option value="vertex">Vertex AI</option></select></label></div>
          <div className="vertexTable"><div><b>Profile</b><b>Project</b><b>Location</b><b>Action</b></div><div><span>{engine==='vertex'?'VERTEX AI':'Gemini Pool'}</span><span>{projectId || '-'}</span><span>{location || '-'}</span><button className="primarySoft iconBtn doneBtn"><FaCheck /> Đang dùng</button></div></div>
        </div>}
      </section></div>}

      {audio && <section className="previewPanel cleanPreview">
        <audio key={audio.slice(0,80)} ref={audioRef} controls preload="auto" src={audio} onError={()=>alert('Player không đọc được audio preview. Hãy bấm Mở thư mục để kiểm tra file WAV, hoặc Generate mới.')} />
        <div className="rowBtns"><button className="primarySoft iconBtn exportAudioBtn" onClick={exportMp3} disabled={busy||!lastFile}><FaFileAudio /> Xuất MP3</button><button className="iconBtn exportBtn" onClick={exportSrt} disabled={busy||(!lastSrt&&!lastSrtContent)}><FaFileExport /> Xuất SRT</button></div>
      </section>}

      <section className="progressPanel cleanProgress">
        <div className="progressHeader"><h2>Tiến trình xử lý audio</h2><span className="percent"><i/> {Math.round(progressPercent)}%</span></div>
        <div className="stepRow"><div className={stage==='processing'||stage==='saving'||stage==='done'?'active':''}>1. Processing</div><div className={stage==='saving'||stage==='done'?'active':''}>2. Saving</div><div className={stage==='done'?'active':''}>3. Done</div></div>
        <div className="bar"><span style={{width:`${progressPercent}%`}} /></div>
        <div className="infoGrid"><div>Chunk: <b>{chunkInfo.total ? `${chunkInfo.current}/${chunkInfo.total}` : '0/0'}</b></div><div>Thời gian chạy: <b>{formatTime(elapsed)}</b></div><div>Key đang dùng: <b>{activeKeyLabel || (engine==='gemini' ? keyTag(keyList,currentKey) : 'VERTEX AI')}</b></div><div>Cache: <b>{cacheEnabled ? 'Bật' : 'Tắt'}</b></div></div>
      </section>
    </main>
  </div>
}
export default App;

