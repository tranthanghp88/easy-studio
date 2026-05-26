const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
let ffmpegPath = null;
function getFfmpegPath(){
  if(ffmpegPath) return ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
    return ffmpegPath;
  } catch (err) {
    return null;
  }
}

let mainWindow;
const isDev = !app.isPackaged;

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function appData(){ const p=path.join(app.getPath('userData'),'EasyVietnameseVoiceStudio'); ensureDir(p); return p; }
function cacheDir(){ const p=path.join(appData(),'cache','audio'); ensureDir(p); return p; }
function finalCacheDir(){ const p=path.join(appData(),'cache','final'); ensureDir(p); return p; }
function cacheManifestFile(){ return path.join(appData(),'cache','manifest.json'); }
function readCacheManifest(){ try{ return JSON.parse(fs.readFileSync(cacheManifestFile(),'utf8')); }catch{ return {chunks:{}, finals:{}, version:1}; } }
function writeCacheManifest(data){ ensureDir(path.dirname(cacheManifestFile())); fs.writeFileSync(cacheManifestFile(), JSON.stringify(data||{chunks:{},finals:{}}, null, 2), 'utf8'); }
function fileSize(file){ try{return fs.statSync(file).size||0}catch{return 0} }
function dirSize(dir){ let total=0; try{ for(const f of fs.readdirSync(dir)){ const p=path.join(dir,f); const st=fs.statSync(p); total += st.isDirectory()?dirSize(p):st.size; } }catch{} return total; }
function formatBytes(n){ const v=Number(n)||0; if(v<1024) return `${v} B`; if(v<1024*1024) return `${(v/1024).toFixed(1)} KB`; if(v<1024*1024*1024) return `${(v/1024/1024).toFixed(1)} MB`; return `${(v/1024/1024/1024).toFixed(1)} GB`; }
function normalizeForCache(text){ return String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim(); }
function outDir(customDir){ const p=customDir ? String(customDir) : path.join(appData(),'exports'); ensureDir(p); return p; }
function bgmDir(){ const p=path.join(appData(),'bgm-library'); ensureDir(p); return p; }
function safeBaseName(name){ return String(name||'EVS-Voice').replace(/[\\/:*?"<>|]/g,'-').trim() || 'EVS-Voice'; }
function hash(input){ return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0,24); }
function parseApiKeys(raw){ return String(raw||'').split(/[\n,;\s]+/).map(x=>x.trim()).map(x=>x.includes('=') ? x.split('=').pop().trim() : x).filter(Boolean); }
function keyLabelFromList(keys, key){ const idx = keys.indexOf(key); return idx >= 0 ? `GEMINI_${String(idx+1).padStart(3,'0')}` : (key ? 'GEMINI_KEY' : 'VERTEX AI'); }
function srtTime(seconds){ const ms=Math.max(0, Math.round(seconds*1000)); const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000); const s=Math.floor((ms%60000)/1000); const n=ms%1000; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(n).padStart(3,'0')}`; }
function buildSrt(chunks, mode='ads'){ let cur=0; const pause=(pauseProfile(mode).chunkMs||500)/1000; return chunks.map((chunk,i)=>{ const dur=Math.max(1.8, Math.min(18, chunk.length/14)); const start=cur; const end=cur+dur; cur=end+pause; const line=String(chunk||'').replace(/\s+/g,' ').trim(); return `${i+1}\n${srtTime(start)} --> ${srtTime(end)}\n${line}\n`; }).join('\n'); }
function writeSrtSidecar(chunks, wavFile, mode){ const srtFile = wavFile.replace(/\.[^.]+$/, '.srt'); fs.writeFileSync(srtFile, buildSrt(chunks, mode), 'utf8'); return srtFile; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function createWindow(){
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1360, height: 850, minWidth: 1100, minHeight: 720,
    title: 'Easy Voice Studio', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false }
  });
  if(isDev) mainWindow.loadURL('http://127.0.0.1:5173'); else mainWindow.loadFile(path.join(__dirname,'../dist/index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });

function splitText(text, max=900){
  const clean = String(text||'').replace(/\r/g,'').trim();
  if(!clean) return [];
  const paras = clean.split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
  const chunks=[];
  for(const para of paras){
    if(para.length<=max){ chunks.push(para); continue; }
    const sentences = para.match(/[^.!?。！？…]+[.!?。！？…]*/g) || [para];
    let buf='';
    for(const s of sentences){
      if((buf+s).length>max && buf){ chunks.push(buf.trim()); buf=s; } else buf += s;
    }
    if(buf.trim()) chunks.push(buf.trim());
  }
  return chunks;
}
function vnClean(text){
  // Giữ paragraph/newline để TTS có nhịp nghỉ tự nhiên hơn.
  return String(text||'')
    .replace(/\r/g,'')
    .replace(/TP\.HCM|TPHCM/gi,'Thành phố Hồ Chí Minh')
    .replace(/TP\./gi,'Thành phố ')
    .replace(/\bAI\b/g,'Ây Ai')
    .replace(/\bKOL\b/g,'Kây Ô Eo')
    .replace(/\bCTA\b/g,'Xi Ti Ây')
    .replace(/\bBGM\b/g,'Bi Gi Em')
    .replace(/(\d{3,4})[ .-](\d{3})[ .-](\d{3,4})/g,'$1, $2, $3')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function pauseProfile(mode){
  if(mode==='story') return { comma:', ', dot:'. ', ellipsis:'... ', paragraph:'\n\n', chunkMs:760 };
  if(mode==='review') return { comma:', ', dot:'. ', ellipsis:'... ', paragraph:'\n\n', chunkMs:560 };
  return { comma:', ', dot:'. ', ellipsis:'... ', paragraph:'\n', chunkMs:360 };
}
function applyPacing(text, mode){
  const p = pauseProfile(mode);
  let t = String(text||'');
  // Chuẩn hóa dấu câu để Gemini có tín hiệu ngắt nghỉ rõ hơn.
  t = t.replace(/\s*([,;:])\s*/g, '$1 ');
  t = t.replace(/\s*([.!?])\s*/g, '$1 ');
  t = t.replace(/\.{3,}|…+/g, p.ellipsis);
  t = t.replace(/([!?]){2,}/g, '$1 ');
  // Nếu xuống dòng một lần, coi như ngắt câu nhẹ; xuống dòng đôi là nghỉ paragraph.
  t = t.replace(/([^.!?…:\n])\n([^\n])/g, `$1.${p.paragraph}$2`);
  t = t.replace(/\n{2,}/g, p.paragraph);
  if(mode==='story') {
    // Truyện cần chậm và mềm hơn, thêm khoảng nghỉ sau hội thoại/câu dài.
    t = t.replace(/([”"'])\s*/g, '$1 ');
    t = t.replace(/([.!?])\s+(?=[A-ZÀ-Ỵa-zà-ỵ0-9])/g, '$1  ');
  }
  if(mode==='ads') {
    // Quảng cáo giữ nhịp punchy, không làm câu bị kéo lê quá nhiều.
    t = t.replace(/\s{2,}/g,' ');
  }
  return t.replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();
}
function writeSilentWav(file, ms=500, sampleRate=24000, channels=1){
  const samples = Math.max(1, Math.floor(sampleRate * ms / 1000));
  const pcm = Buffer.alloc(samples * channels * 2, 0);
  fs.writeFileSync(file, writeWavHeaderForPcm16(pcm, sampleRate, channels));
  return file;
}

function extractInlineAudio(json){
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find(p => p?.inlineData?.data || p?.inline_data?.data);
  if(!audioPart) return null;
  const inline = audioPart.inlineData || audioPart.inline_data;
  return {
    buffer: Buffer.from(inline.data, 'base64'),
    mimeType: inline.mimeType || inline.mime_type || ''
  };
}
function hasRiffHeader(buf){ return Buffer.isBuffer(buf) && buf.length > 44 && buf.slice(0,4).toString('ascii') === 'RIFF' && buf.slice(8,12).toString('ascii') === 'WAVE'; }
function hasMp3Header(buf){ return Buffer.isBuffer(buf) && buf.length > 4 && (buf.slice(0,3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)); }
function writeWavHeaderForPcm16(pcm, sampleRate=24000, channels=1){
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  header.write('RIFF',0);
  header.writeUInt32LE(36 + pcm.length,4);
  header.write('WAVE',8);
  header.write('fmt ',12);
  header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20);
  header.writeUInt16LE(channels,22);
  header.writeUInt32LE(sampleRate,24);
  header.writeUInt32LE(byteRate,28);
  header.writeUInt16LE(blockAlign,32);
  header.writeUInt16LE(16,34);
  header.write('data',36);
  header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header, pcm]);
}
function looksLikeText(buf){
  if(!Buffer.isBuffer(buf) || !buf.length) return true;
  const sample = buf.slice(0, Math.min(buf.length, 120)).toString('utf8');
  return /^\s*[\[{<]|Gemini|error|message|candidates/i.test(sample);
}
async function ensurePlayableWav(inputFile, outputFile, mimeType=''){
  if(!fs.existsSync(inputFile)) throw new Error('Không tìm thấy file audio vừa tạo.');
  const buf = fs.readFileSync(inputFile);
  if(buf.length < 1000 || looksLikeText(buf)) throw new Error('Gemini không tạo được audio hợp lệ. File audio rỗng hoặc là text response. Hãy thử voice Kore/Puck hoặc rút ngắn đoạn text.');
  if(hasRiffHeader(buf)){ fs.copyFileSync(inputFile, outputFile); return outputFile; }
  // Gemini/Vertex đôi khi trả raw LINEAR16 PCM nhưng không có WAV header. Bọc lại thành WAV chuẩn để ffmpeg/player đọc được.
  if(/pcm|linear16|l16/i.test(mimeType) || (!hasMp3Header(buf) && !/mpeg|mp3|aac|m4a|ogg|flac/i.test(mimeType))){
    fs.writeFileSync(outputFile, writeWavHeaderForPcm16(buf, 24000, 1));
    return outputFile;
  }
  // Nếu trả MP3/M4A/codec khác, convert sang WAV chuẩn.
  await runFfmpeg(['-y','-i',inputFile,'-ac','1','-ar','24000','-c:a','pcm_s16le',outputFile]);
  return outputFile;
}
async function isAudioFileValid(file){
  try{
    if(!file || !fs.existsSync(file)) return false;
    const st = fs.statSync(file);
    if(st.size < 1000) return false;
    const buf = fs.readFileSync(file, {start:0, end:63});
    if(looksLikeText(buf)) return false;
    if(hasRiffHeader(buf) || hasMp3Header(buf)) return true;
    return false;
  }catch{ return false; }
}
async function getCacheStats(){
  const audioDir=cacheDir(), finalDir=finalCacheDir();
  const chunkFiles=fs.readdirSync(audioDir).filter(f=>f.endsWith('.wav'));
  const finalFiles=fs.readdirSync(finalDir).filter(f=>f.endsWith('.wav'));
  return {count:chunkFiles.length, chunkCount:chunkFiles.length, finalCount:finalFiles.length, dir:path.join(appData(),'cache'), audioDir, finalDir, bytes:dirSize(path.join(appData(),'cache')), sizeText:formatBytes(dirSize(path.join(appData(),'cache')))};
}
function extractGeminiText(json){
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p?.text).filter(Boolean).join(' ').trim();
}
async function callGeminiTTS({apiKey, model, text, voiceName, prompt}){
  if(!apiKey) throw new Error('Chưa nhập Gemini API Key');
  const finalModel = String(model||'').trim() || 'gemini-2.5-flash-preview-tts';
  const finalVoice = String(voiceName||'').trim() || 'Kore';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${apiKey}`;
  const body = {
    contents:[{
      role:'user',
      parts:[{text:`${prompt}

Hãy tạo AUDIO tiếng Việt trực tiếp. Không trả lời bằng chữ.

Nội dung cần đọc:
${text}`}]
    }],
    generationConfig:{
      responseModalities:['AUDIO'],
      speechConfig:{ voiceConfig:{ prebuiltVoiceConfig:{ voiceName: finalVoice } } }
    }
  };
  const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){ const err=await res.text(); throw new Error(`Gemini lỗi ${res.status}: ${err.slice(0,900)}`); }
  const json = await res.json();
  const audio = extractInlineAudio(json);
  if(audio) return audio;
  const textReply = extractGeminiText(json);
  const reason = json?.candidates?.[0]?.finishReason ? ` FinishReason: ${json.candidates[0].finishReason}.` : '';
  const detail = textReply ? ` Gemini trả về text thay vì audio: ${textReply.slice(0,240)}` : ' Không có inline audio trong response.';
  throw new Error(`Gemini không trả về audio.${reason}${detail} Hãy thử đổi Voice sang Kore/Puck/Leda/Charon, đổi Model về gemini-2.5-flash-preview-tts, hoặc rút ngắn đoạn preview.`);
}
async function callVertexTTS({accessToken, projectId, location, model, text, voiceName, prompt}){
  if(!accessToken || !projectId || !location) throw new Error('Vertex AI cần Access Token, Project ID và Location');
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const body = { contents:[{role:'user',parts:[{text:`${prompt}\n\nNội dung cần đọc:\n${text}`}]}], generationConfig:{responseModalities:['AUDIO'], speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}};
  const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`},body:JSON.stringify(body)});
  if(!res.ok){ const err=await res.text(); throw new Error(`Vertex lỗi ${res.status}: ${err.slice(0,600)}`); }
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data);
  if(!part) throw new Error('Vertex không trả về audio.');
  return { buffer: Buffer.from(part.inlineData.data,'base64'), mimeType: part.inlineData.mimeType || part.inlineData.mime_type || '' };
}

function runFfmpeg(args){
  return new Promise((resolve,reject)=>{
    const bin = getFfmpegPath();
    if(!bin) return reject(new Error('Thiếu ffmpeg-static. Hãy chạy: npm install ffmpeg-static --save rồi mở lại app.'));
    const p=spawn(bin,args,{windowsHide:true}); let err='';
    p.stderr.on('data',d=>err+=d.toString());
    p.on('close',code=> code===0?resolve():reject(new Error(err.slice(-1000)||`ffmpeg exit ${code}`)) );
  });
}
async function concatAudio(files, output){
  if(files.length===1){ fs.copyFileSync(files[0],output); return output; }
  const stamp=Date.now();
  const tempFiles=[];
  try{
    for(let i=0;i<files.length;i++){
      const temp=path.join(appData(),`concat-${stamp}-${i}.wav`);
      tempFiles.push(temp);
      await runFfmpeg(['-y','-i',files[i],'-vn','-ac','2','-ar','24000','-c:a','pcm_s16le',temp]);
    }
    const list=path.join(appData(),`concat-${stamp}.txt`);
    fs.writeFileSync(list,tempFiles.map(f=>`file '${f.replace(/'/g,"'\\''")}'`).join('\n'),'utf8');
    await runFfmpeg(['-y','-f','concat','-safe','0','-i',list,'-c:a','pcm_s16le',output]);
    fs.rmSync(list,{force:true});
  } finally {
    tempFiles.forEach(f=>fs.rmSync(f,{force:true}));
  }
  return output;
}
async function mixBgm(voiceFile,bgmFile,output,bgmVolume=0.18,voiceVolume=1){
  voiceVolume = Math.max(0.05, Math.min(2, Number(voiceVolume || 1)));
  bgmVolume = Math.max(0, Math.min(1, Number(bgmVolume || 0)));
  if(!bgmFile){
    if(Math.abs(voiceVolume-1) < 0.001){ fs.copyFileSync(voiceFile,output); return output; }
    await runFfmpeg(['-y','-i',voiceFile,'-filter:a',`volume=${voiceVolume}`,'-c:a','pcm_s16le',output]);
    return output;
  }
  await runFfmpeg(['-y','-i',voiceFile,'-stream_loop','-1','-i',bgmFile,
    '-filter_complex',`[0:a]volume=${voiceVolume}[voice];[1:a]volume=${bgmVolume}[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2`,
    '-c:a','pcm_s16le',output]);
  return output;
}

async function exportToMp3(inputFile, outputBaseName=''){
  if(!inputFile || !fs.existsSync(inputFile)) throw new Error('Không tìm thấy file audio để xuất MP3');
  if(!(await isAudioFileValid(inputFile))) throw new Error('File voice hiện tại không hợp lệ nên không thể xuất MP3. Hãy bấm Generate mới, app sẽ bỏ cache lỗi và tạo lại audio chuẩn.');
  const parsed = path.parse(inputFile);
  const outputName = outputBaseName ? `${safeBaseName(outputBaseName)}.mp3` : `${parsed.name}.mp3`;
  const output = path.join(parsed.dir, outputName);
  await runFfmpeg(['-y','-i',inputFile,'-vn','-codec:a','libmp3lame','-b:a','192k',output]);
  if(!fs.existsSync(output) || fs.statSync(output).size < 1000) throw new Error('Xuất MP3 thất bại: file MP3 không hợp lệ.');
  return output;
}

function promptFor(mode,style,speed){
  const map={
    ads:'Đọc quảng cáo tiếng Việt tự nhiên, rõ chữ, có năng lượng, thuyết phục. Nhịp nhanh gọn nhưng vẫn nghỉ nhẹ sau dấu chấm.',
    story:'Đọc truyện tiếng Việt chậm vừa, truyền cảm, tự nhiên. Ngắt nghỉ rõ sau dấu chấm, xuống dòng, đoạn hội thoại và chuyển cảnh. Giữ nhịp kể mềm, không đọc dính câu.',
    review:'Đọc review phim tiếng Việt kiểu kể chuyện cuốn hút, tò mò, cinematic. Có nhịp nhấn ở tình tiết quan trọng và nghỉ vừa sau câu dài.'
  };
  return `${map[mode]||map.ads} Phong cách: ${style}. Tốc độ: ${speed}. Tôn trọng dấu câu, xuống dòng và khoảng nghỉ tự nhiên. Không đọc ký hiệu kỹ thuật, đọc như người Việt tự nhiên.`;
}

ipcMain.handle('voice:generate', async (_evt, payload)=>{
  const progress=(msg)=> mainWindow?.webContents.send('voice:progress',msg);
  const preview = !!payload.preview;
  const cacheEnabled = payload.cacheEnabled !== false;
  const rawText = preview ? String(payload.text||'').slice(0,650) : String(payload.text||'');
  progress('Làm sạch script...');
  const cleanText = applyPacing(vnClean(rawText), payload.mode);
  const normalizedText = normalizeForCache(cleanText);
  const chunks = splitText(normalizedText, preview?650:900);
  progress(`Tách chunk: 0/${chunks.length}`);
  if(!chunks.length) throw new Error('Chưa có nội dung để gen voice');

  const geminiKeysRaw = Array.isArray(payload.apiKeys) ? payload.apiKeys.join('\n') : (payload.apiKeys || payload.apiKey || '');
  const geminiKeys = parseApiKeys(geminiKeysRaw);
  const startKeyIndex = Math.max(0, geminiKeys.indexOf(payload.apiKey));
  const orderedGeminiKeys = geminiKeys.length ? [...geminiKeys.slice(startKeyIndex), ...geminiKeys.slice(0,startKeyIndex)] : (payload.apiKey ? [payload.apiKey] : []);

  const pProfile = pauseProfile(payload.mode);
  const cacheIdentity = {
    version:'phase21-voice-cache-v1',
    preview,
    text: normalizedText,
    engine: payload.engine,
    voiceName: payload.voiceName,
    mode: payload.mode,
    style: payload.style,
    speed: payload.speed,
    model: payload.model,
    chunkMs: pProfile.chunkMs
  };
  const finalKey = hash(cacheIdentity);
  const cachedFinal = path.join(finalCacheDir(), `${finalKey}.wav`);
  const manifest = readCacheManifest();

  if(cacheEnabled && await isAudioFileValid(cachedFinal)){
    const wantedBase = safeBaseName(payload.outputBaseName || payload.mode);
    const exportRoot = outDir(payload.outputDir);
    const base = `${wantedBase}-${preview?'preview':'full'}-cached-${Date.now()}`;
    const voiceMaster = path.join(exportRoot, `${base}-voice.wav`);
    const finalFile = path.join(exportRoot, `${base}.wav`);
    fs.copyFileSync(cachedFinal, voiceMaster);
    progress(`Dùng lại voice cache hoàn chỉnh: ${chunks.length}/${chunks.length}`);
    if(payload.bgmPath) progress('Đang mix BGM local từ voice cache...');
    await mixBgm(voiceMaster, payload.bgmPath || '', finalFile, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1);
    manifest.finals = manifest.finals || {};
    const srtContent = buildSrt(chunks, payload.mode);
    manifest.finals[finalKey] = {...(manifest.finals[finalKey]||{}), lastUsedAt:new Date().toISOString(), hits:((manifest.finals[finalKey]?.hits||0)+1), file:cachedFinal};
    writeCacheManifest(manifest);
    return { ok:true, filePath:finalFile, voiceFile:voiceMaster, fileUrl:pathToFileURL(finalFile).href, srtContent, cacheHits:chunks.length, chunks:chunks.length, finalCacheHit:true };
  }

  const files=[]; let cacheHits=0; let generatedChunks=0;
  for(let i=0;i<chunks.length;i++){
    const chunk=chunks[i];
    const chunkKey=hash({version:'phase15-chunk-v1', chunk, engine:payload.engine, voiceName:payload.voiceName, mode:payload.mode, style:payload.style, speed:payload.speed, model:payload.model});
    const file=path.join(cacheDir(),`${chunkKey}.wav`);
    if(cacheEnabled && await isAudioFileValid(file)){
      cacheHits++;
      progress(`Dùng lại cache chunk ${i+1}/${chunks.length}`);
      manifest.chunks = manifest.chunks || {};
      manifest.chunks[chunkKey] = {...(manifest.chunks[chunkKey]||{}), lastUsedAt:new Date().toISOString(), hits:((manifest.chunks[chunkKey]?.hits||0)+1), file, chars:chunk.length};
      files.push(file);
      continue;
    }
    if(fs.existsSync(file)) fs.rmSync(file,{force:true});
    progress(`Đang tạo giọng đọc ${i+1}/${chunks.length}...`);
    const baseParams={...payload,text:chunk,prompt:promptFor(payload.mode,payload.style,payload.speed)};
    let audio=null;
    let lastErr=null;
    if(payload.engine==='vertex'){
      try{
        progress(`Đang tạo giọng đọc ${i+1}/${chunks.length} • VERTEX AI`);
        audio = await callVertexTTS(baseParams);
      }catch(err){ lastErr=err; }
    }
    if(!audio){
      const candidates = orderedGeminiKeys.length ? orderedGeminiKeys : [payload.apiKey].filter(Boolean);
      for(let attempt=0; attempt<candidates.length; attempt++){
        const key = candidates[attempt];
        const keyLabel = keyLabelFromList(geminiKeys, key);
        try{
          progress(`Đang tạo giọng đọc ${i+1}/${chunks.length} • ${keyLabel}${attempt?` • thử lại ${attempt+1}`:''}`);
          audio = await callGeminiTTS({...baseParams, apiKey:key});
          break;
        }catch(err){
          lastErr=err;
          const msg = String(err && err.message ? err.message : err);
          progress(`Key ${keyLabel} lỗi, đổi key khác...`);
          if(!/quota|429|RESOURCE_EXHAUSTED|rate|timeout|fetch|audio|invalid|403|400/i.test(msg)) break;
          await sleep(1200 + attempt*500);
        }
      }
    }
    if(!audio) throw lastErr || new Error('Không tạo được audio sau khi thử các key khả dụng.');
    const rawFile = path.join(cacheDir(),`${chunkKey}.raw`);
    fs.writeFileSync(rawFile,audio.buffer || audio);
    await ensurePlayableWav(rawFile,file,audio.mimeType || '');
    fs.rmSync(rawFile,{force:true});
    if(!(await isAudioFileValid(file))) throw new Error('File voice vừa tạo chưa hợp lệ nên app đã dừng trước khi export. Hãy thử đổi voice/model hoặc rút ngắn script.');
    manifest.chunks = manifest.chunks || {};
    manifest.chunks[chunkKey] = {file, chars:chunk.length, createdAt:new Date().toISOString(), lastUsedAt:new Date().toISOString(), hits:0, engine:payload.engine, voiceName:payload.voiceName, mode:payload.mode, style:payload.style, speed:payload.speed, model:payload.model};
    generatedChunks++;
    files.push(file);
    await sleep(300);
  }
  writeCacheManifest(manifest);

  progress('Đang ghép giọng đọc...');
  const concatFiles = [];
  if(files.length > 1){
    const silence = path.join(cacheDir(), `silence-${pProfile.chunkMs}ms.wav`);
    if(!fs.existsSync(silence)) writeSilentWav(silence, pProfile.chunkMs);
    files.forEach((f, idx)=>{ concatFiles.push(f); if(idx < files.length-1) concatFiles.push(silence); });
  } else {
    concatFiles.push(...files);
  }
  const wantedBase = safeBaseName(payload.outputBaseName || payload.mode);
  const base= `${wantedBase}-${preview?'preview':'full'}-${Date.now()}`;
  const exportRoot = outDir(payload.outputDir);
  const merged=path.join(exportRoot,`${base}-voice.wav`);
  await concatAudio(concatFiles,merged);
  progress('Đang xử lý nhạc nền...');
  const finalFile=path.join(exportRoot,`${base}.wav`);
  await mixBgm(merged,payload.bgmPath,finalFile,payload.bgmVolume ?? 0.18,payload.voiceVolume ?? 1);
  const srtContent = buildSrt(chunks, payload.mode);

  if(cacheEnabled && await isAudioFileValid(merged)){
    fs.copyFileSync(merged, cachedFinal);
    const manifest2 = readCacheManifest();
    manifest2.finals = manifest2.finals || {};
    manifest2.finals[finalKey] = {file:cachedFinal, type:'voice-master', createdAt:new Date().toISOString(), lastUsedAt:new Date().toISOString(), hits:0, chunks:chunks.length, cacheHits, generatedChunks, engine:payload.engine, voiceName:payload.voiceName, mode:payload.mode, style:payload.style, speed:payload.speed, model:payload.model, chars:normalizedText.length};
    writeCacheManifest(manifest2);
  }
  progress('Hoàn tất');
  return { ok:true, filePath:finalFile, voiceFile:merged, fileUrl:pathToFileURL(finalFile).href, srtContent, cacheHits, generatedChunks, chunks:chunks.length, finalCacheHit:false };
});

ipcMain.handle('audio:exportMp3', async(_e,filePath,outputBaseName)=>{ const output=await exportToMp3(filePath, outputBaseName); return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href}; });

ipcMain.handle('audio:mixBgmPreview', async(_e, payload={})=>{
  const voiceFile = payload.voiceFile;
  const externalAudioFile = payload.externalAudioFile || '';
  if(!voiceFile && !externalAudioFile) throw new Error('Chưa có file audio để nghe thử. Hãy bấm Tạo giọng hoặc thêm audio ngoài.');
  const exportRoot = outDir(payload.outputDir);
  const base = `${safeBaseName(payload.outputBaseName || 'bgm-preview')}-${Date.now()}`;
  const sourceFile = path.join(exportRoot, `${base}-source.wav`);
  const output = path.join(exportRoot, `${base}.wav`);
  const sources=[];
  if(voiceFile){
    if(!fs.existsSync(voiceFile) || !(await isAudioFileValid(voiceFile))) throw new Error('File voice hiện tại không hợp lệ. Hãy Generate mới rồi nghe thử BGM lại.');
    sources.push(voiceFile);
  }
  if(externalAudioFile){
    if(!fs.existsSync(externalAudioFile) || !(await isAudioFileValid(externalAudioFile))) throw new Error('File audio ngoài không hợp lệ. Hãy chọn file audio khác.');
    sources.push(externalAudioFile);
  }
  if(sources.length > 1) await concatAudio(sources, sourceFile);
  else fs.copyFileSync(sources[0], sourceFile);
  await mixBgm(sourceFile, payload.bgmFile || '', output, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1);
  fs.rmSync(sourceFile,{force:true});
  return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href};
});

ipcMain.handle('audio:chooseExternal', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Thêm file audio ngoài',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  const filePath=r.filePaths[0];
  return {ok:true,path:filePath,name:path.basename(filePath)};
});

ipcMain.handle('audio:exportMp3WithMix', async(_e, payload={})=>{
  const voiceFile = payload.voiceFile || payload.filePath || '';
  const externalAudioFile = payload.externalAudioFile || '';
  if(!voiceFile && !externalAudioFile) throw new Error('Chưa có file audio để xuất MP3.');
  const exportRoot = outDir(payload.outputDir);
  const base = `${safeBaseName(payload.outputBaseName || 'EVS-Audio')}-${Date.now()}`;
  const sourceFile = path.join(exportRoot, `${base}-source.wav`);
  const mixedFile = path.join(exportRoot, `${base}-mix.wav`);
  const sources=[];
  if(voiceFile){
    if(!fs.existsSync(voiceFile) || !(await isAudioFileValid(voiceFile))) throw new Error('File voice hiện tại không hợp lệ. Hãy Generate mới rồi xuất MP3 lại.');
    sources.push(voiceFile);
  }
  if(externalAudioFile){
    if(!fs.existsSync(externalAudioFile) || !(await isAudioFileValid(externalAudioFile))) throw new Error('File audio ngoài không hợp lệ. Hãy chọn file audio khác.');
    sources.push(externalAudioFile);
  }
  if(sources.length > 1) await concatAudio(sources, sourceFile);
  else fs.copyFileSync(sources[0], sourceFile);
  await mixBgm(sourceFile, payload.bgmFile || '', mixedFile, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1);
  const output = await exportToMp3(mixedFile, payload.outputBaseName || base);
  fs.rmSync(sourceFile,{force:true});
  fs.rmSync(mixedFile,{force:true});
  return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href};
});

ipcMain.handle('subtitle:saveAs', async(_e, srtPath, outputBaseName)=>{
  if(!srtPath || !fs.existsSync(srtPath)) throw new Error('Chưa có file phụ đề SRT. Hãy generate voice trước.');
  const result = await dialog.showSaveDialog(mainWindow, { title:'Lưu file SRT', defaultPath:`${safeBaseName(outputBaseName||path.parse(srtPath).name)}.srt`, filters:[{name:'SubRip Subtitle', extensions:['srt']}] });
  if(result.canceled || !result.filePath) return null;
  fs.copyFileSync(srtPath, result.filePath);
  return {ok:true,filePath:result.filePath};
});


ipcMain.handle('subtitle:saveContent', async(_e, srtContent, outputBaseName)=>{
  if(!srtContent) throw new Error('Chưa có nội dung phụ đề SRT. Hãy generate voice trước.');
  const result = await dialog.showSaveDialog(mainWindow, { title:'Lưu file SRT', defaultPath:`${safeBaseName(outputBaseName||'subtitle')}.srt`, filters:[{name:'SubRip Subtitle', extensions:['srt']}] });
  if(result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(srtContent), 'utf8');
  return {ok:true,filePath:result.filePath};
});

ipcMain.handle('audio:readDataUrl', async(_e,filePath)=>{
  if(!filePath || !fs.existsSync(filePath)) throw new Error('Không tìm thấy file audio để preview.');
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${data}`;
});



ipcMain.handle('file:read-audio-file', async(_e, payload)=>{
  const filePath = typeof payload === 'string' ? payload : (payload && (payload.filePath || payload.path));
  if(!filePath || !fs.existsSync(filePath)) return { ok:false, error:'Không tìm thấy file audio để preview.' };
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
  const data = fs.readFileSync(filePath).toString('base64');
  return { ok:true, data, mimeType, filePath, fileUrl:pathToFileURL(filePath).href };
});


ipcMain.handle('bgm:importAsset', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Thêm BGM vào thư viện app',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  const src=r.filePaths[0];
  const ext=path.extname(src) || '.mp3';
  const base=path.basename(src, ext).replace(/[\/:*?"<>|]/g,'-').trim() || 'bgm';
  let dest=path.join(bgmDir(),`${base}${ext}`);
  let n=1;
  while(fs.existsSync(dest)) dest=path.join(bgmDir(),`${base}-${n++}${ext}`);
  fs.copyFileSync(src,dest);
  return {ok:true,path:dest,name:path.basename(dest)};
});

ipcMain.handle('bgm:openLibrary', async()=>{
  const dir = bgmDir();
  ensureDir(dir);
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('bgm:choose', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Chọn file BGM',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
  if(r.canceled) return null; return r.filePaths[0];
});

ipcMain.handle('output:chooseDir', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Chọn thư mục lưu file xuất',properties:['openDirectory','createDirectory']});
  if(r.canceled) return null;
  return r.filePaths[0];
});
ipcMain.handle('file:openFolder', async(_e,filePath)=>{ if(!filePath) return false; try{ const p=String(filePath); if(fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p); else shell.showItemInFolder(p); return true; }catch{ shell.openPath(path.dirname(String(filePath))); return true; } });
ipcMain.handle('cache:info', async()=> await getCacheStats());
ipcMain.handle('cache:clear', async()=>{ fs.rmSync(path.join(appData(),'cache'),{recursive:true,force:true}); ensureDir(cacheDir()); ensureDir(finalCacheDir()); return {ok:true}; });

ipcMain.handle('keys:importTxt', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Nhập file keys.txt',properties:['openFile'],filters:[{name:'Text',extensions:['txt','csv','log']},{name:'All files',extensions:['*']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  return fs.readFileSync(r.filePaths[0],'utf8');
});

ipcMain.handle('keys:exportTxt', async(_e, content)=>{
  const r=await dialog.showSaveDialog(mainWindow,{title:'Xuất danh sách key',defaultPath:'keys.txt',filters:[{name:'Text',extensions:['txt']} ]});
  if(r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(content||''), 'utf8');
  return r.filePath;
});

ipcMain.handle('keys:exportLogTxt', async(_e, content)=>{
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const r=await dialog.showSaveDialog(mainWindow,{title:'Tải log key',defaultPath:`evs-key-log-${stamp}.txt`,filters:[{name:'Text',extensions:['txt']} ]});
  if(r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(content||''), 'utf8');
  return r.filePath;
});

ipcMain.handle('vertex:importJson', async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{title:'Import Vertex service-account JSON',properties:['openFile'],filters:[{name:'Service Account JSON',extensions:['json']},{name:'All files',extensions:['*']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  const src=r.filePaths[0];
  let parsed={};
  try{ parsed=JSON.parse(fs.readFileSync(src,'utf8')); }catch{ throw new Error('File JSON không hợp lệ.'); }
  const destDir=path.join(app.getPath('userData'),'vertex-profiles');
  ensureDir(destDir);
  const safeName=String(parsed.client_email || parsed.project_id || path.basename(src,'.json')).replace(/[^a-z0-9_.-]+/gi,'-');
  const dest=path.join(destDir,`${safeName}-${Date.now()}.json`);
  fs.copyFileSync(src,dest);
  return {ok:true,path:dest,projectId:parsed.project_id||'',clientEmail:parsed.client_email||'',type:parsed.type||''};
});


