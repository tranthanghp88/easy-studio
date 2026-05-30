const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { GoogleAuth } = require('google-auth-library');
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
  for(const part of parts){
    const inline = part?.inlineData || part?.inline_data;
    if(!inline?.data) continue;
    const mimeType = inline.mimeType || inline.mime_type || '';
    const buffer = Buffer.from(inline.data, 'base64');
    // Chỉ nhận audio thật. Nếu Gemini trả text/JSON dạng inlineData thì bỏ qua để retry an toàn.
    if(/text|json|html|xml/i.test(mimeType)) continue;
    if(buffer.length < 1000 || looksLikeText(buffer)) continue;
    return { buffer, mimeType };
  }
  return null;
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

async function postProcessManualToneAudio(inputFile, outputFile, tone){
  // V46: Gemini/Vertex chỉ nhận text sạch. Nhấn/kéo dài được làm bằng text transform + hậu kỳ audio.
  const t = String(tone || 'normal');
  let filter = '';
  if(t === 'emphasis' || t === 'emphasisMixed'){
    // Làm chunk có markup nổi hơn mà không cần đưa instruction vào TTS.
    filter = 'volume=1.22,acompressor=threshold=-20dB:ratio=2.6:attack=5:release=70,equalizer=f=2600:t=q:w=1:g=1.8,atempo=1.015';
  } else if(t === 'stretch' || t === 'stretchMixed'){
    // Text đã được kéo dài nhẹ; hậu kỳ chỉ làm mềm và chậm rất nhẹ.
    filter = 'volume=1.07,atempo=0.975';
  }
  if(filter){
    await runFfmpeg(['-y','-i',inputFile,'-af',filter,'-ac','1','-ar','24000','-c:a','pcm_s16le',outputFile]);
    return outputFile;
  }
  fs.copyFileSync(inputFile, outputFile);
  return outputFile;
}

async function postProcessFinalVoiceAudio(inputFile, outputFile, payload={}){
  // Tạo lại cảm giác năng lượng tổng thể giống các bản trước, nhưng không dùng prompt hướng dẫn.
  const mode = String(payload.mode || 'ads');
  const style = String(payload.style || '');
  const speed = String(payload.speed || '');
  let filter = '';
  if(mode === 'ads'){
    filter = 'volume=1.08,acompressor=threshold=-22dB:ratio=2.4:attack=6:release=85,equalizer=f=2800:t=q:w=1:g=1.6';
    if(style === 'Năng lượng' || speed === 'Nhanh') filter += ',atempo=1.025';
  } else if(mode === 'review'){
    filter = 'volume=1.04,acompressor=threshold=-23dB:ratio=1.8:attack=10:release=110,equalizer=f=2200:t=q:w=1:g=0.9';
  } else if(mode === 'story'){
    filter = 'volume=1.02,acompressor=threshold=-24dB:ratio=1.5:attack=15:release=130';
  }
  if(filter){
    await runFfmpeg(['-y','-i',inputFile,'-af',filter,'-ac','1','-ar','24000','-c:a','pcm_s16le',outputFile]);
    return outputFile;
  }
  fs.copyFileSync(inputFile, outputFile);
  return outputFile;
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

async function getVertexAccessTokenFromJson(jsonPath){
  if(!jsonPath || !fs.existsSync(jsonPath)) return '';
  const auth = new GoogleAuth({
    keyFile: jsonPath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return typeof token === 'string' ? token : (token && token.token) || '';
}
function hasVertexConfig(payload){
  return Boolean((payload.accessToken || payload.vertexJsonPath) && payload.projectId && payload.location);
}

async function callGeminiTTS({apiKey, model, text, voiceName, prompt}){
  if(!apiKey) throw new Error('Chưa nhập Gemini API Key');
  const finalModel = String(model||'').trim() || 'gemini-2.5-flash-preview-tts';
  const finalVoice = String(voiceName||'').trim() || 'Kore';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${apiKey}`;
  // V47: khôi phục chất giọng quảng cáo giống V38 bằng prompt ngắn,
  // nhưng không đưa markup kỹ thuật (*, ~, ||) hay thẻ [NHẤN MẠNH] vào nội dung đọc.
  const cleanSpeakText = String(text||'').trim();
  const promptText = String(prompt || '').trim();
  const spokenText = promptText
    ? `${promptText}\n\nCHỈ ĐỌC NỘI DUNG SAU, KHÔNG ĐỌC DÒNG HƯỚNG DẪN NÀY:\n${cleanSpeakText}`
    : cleanSpeakText;
  const body = {
    contents:[{
      role:'user',
      parts:[{text: spokenText}]
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
async function callVertexTTS({accessToken, vertexJsonPath, projectId, location, model, text, voiceName, prompt}){
  let token = accessToken || '';
  if(!token && vertexJsonPath) token = await getVertexAccessTokenFromJson(vertexJsonPath);
  if(!token || !projectId || !location) throw new Error('Vertex AI cần Access Token hoặc Service Account JSON, Project ID và Location');
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  // V47: dùng prompt ngắn để lấy lại chất giọng quảng cáo, không dùng systemInstruction.
  // Nội dung đọc vẫn là text sạch sau parser, không còn *, ~, || hoặc tag kỹ thuật.
  const cleanSpeakText = String(text||'').trim();
  const promptText = String(prompt || '').trim();
  const spokenText = promptText
    ? `${promptText}\n\nCHỈ ĐỌC NỘI DUNG SAU, KHÔNG ĐỌC DÒNG HƯỚNG DẪN NÀY:\n${cleanSpeakText}`
    : cleanSpeakText;
  const body = {
    contents:[{role:'user',parts:[{text: spokenText}]}],
    generationConfig:{responseModalities:['AUDIO'], speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}
  };
  const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)});
  if(!res.ok){ const err=await res.text(); throw new Error(`Vertex lỗi ${res.status}: ${err.slice(0,600)}`); }
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data || p.inline_data?.data);
  const inline = part?.inlineData || part?.inline_data;
  if(!inline?.data) throw new Error('Vertex không trả về audio.');
  return { buffer: Buffer.from(inline.data,'base64'), mimeType: inline.mimeType || inline.mime_type || '' };
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
async function getAudioDurationSeconds(file){
  return new Promise((resolve)=>{
    const bin = getFfmpegPath();
    if(!bin) return resolve(0);
    const p = spawn(bin, ['-i', file], {windowsHide:true});
    let err='';
    p.stderr.on('data', d=>err += d.toString());
    p.on('close', ()=>{
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if(!m) return resolve(0);
      resolve(Number(m[1])*3600 + Number(m[2])*60 + Number(m[3]));
    });
  });
}
async function crossfadeConcatAudio(pieces, output, crossfadeSeconds=2){
  const validPieces = (pieces || []).filter(Boolean);
  if(validPieces.length === 0) throw new Error('Không có đoạn BGM để ghép.');
  if(validPieces.length === 1){ fs.copyFileSync(validPieces[0], output); return output; }
  let current = validPieces[0];
  const tempOutputs = [];
  for(let i=1;i<validPieces.length;i++){
    const next = validPieces[i];
    const d1 = await getAudioDurationSeconds(current).catch(()=>0);
    const d2 = await getAudioDurationSeconds(next).catch(()=>0);
    const cf = Math.max(0.15, Math.min(Number(crossfadeSeconds || 2), Math.max(0.2, d1/3), Math.max(0.2, d2/3)));
    const out = path.join(appData(), `smart-bgm-xfade-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}.wav`);
    tempOutputs.push(out);
    await runFfmpeg([
      '-y','-i',current,'-i',next,
      '-filter_complex',`[0:a]aformat=sample_fmts=fltp:sample_rates=24000:channel_layouts=stereo[a0];[1:a]aformat=sample_fmts=fltp:sample_rates=24000:channel_layouts=stereo[a1];[a0][a1]acrossfade=d=${cf.toFixed(3)}:c1=tri:c2=tri[a]`,
      '-map','[a]','-c:a','pcm_s16le',out
    ]);
    if(i > 1 && current.startsWith(appData())) fs.rmSync(current,{force:true});
    current = out;
  }
  fs.copyFileSync(current, output);
  tempOutputs.forEach(f=>fs.rmSync(f,{force:true}));
  return output;
}

async function makeSmartBgmBed(bgmFile, targetDur){
  const bgmDur = await getAudioDurationSeconds(bgmFile).catch(()=>0);
  const totalDur = Math.max(0.1, Number(targetDur || 0));
  if(!bgmDur || bgmDur <= 0){
    return { file: bgmFile, tempFiles: [], bgmDur, looped: false, trimmed: false };
  }
  // BGM dài hơn voice: không loop, chỉ để mixBgm trim đúng target và fade BGM cuối.
  if(bgmDur >= totalDur){
    return { file: bgmFile, tempFiles: [], bgmDur, looped: false, trimmed: bgmDur > totalDur };
  }

  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempFiles = [];
  const pieces = [];
  let index = 0;
  const crossfade = Math.min(2, Math.max(0.75, bgmDur * 0.08));
  const loopStart = Math.min(8, Math.max(3, bgmDur * 0.18));
  const tailLen = Math.max(1.2, bgmDur - loopStart);

  async function cutPiece(ss, dur){
    const out = path.join(appData(), `smart-bgm-${stamp}-${index++}.wav`);
    tempFiles.push(out);
    await runFfmpeg([
      '-y','-ss',String(Math.max(0,ss).toFixed(3)),'-i',bgmFile,
      '-t',String(Math.max(0.25,dur).toFixed(3)),
      '-vn','-ac','2','-ar','24000','-c:a','pcm_s16le',out
    ]);
    pieces.push(out);
    return out;
  }

  // First pass keeps the full original once, including its intro.
  await cutPiece(0, bgmDur);
  // Effective duration after crossfades. Repeated passes skip intro and overlap smoothly.
  let effective = bgmDur;
  while(effective < totalDur + 0.2){
    const remainingAfterOverlap = totalDur - effective;
    const needLen = Math.min(tailLen, Math.max(crossfade + 0.75, remainingAfterOverlap + crossfade));
    await cutPiece(loopStart, needLen);
    effective += needLen - crossfade;
  }

  const bed = path.join(appData(), `smart-bgm-bed-${stamp}.wav`);
  await crossfadeConcatAudio(pieces, bed, crossfade);
  tempFiles.push(bed);
  return { file: bed, tempFiles, bgmDur, looped: true, trimmed: true };
}

async function mixBgm(voiceFile,bgmFile,output,bgmVolume=0.18,voiceVolume=1,fadeOut=0,fadeIn=0){
  // Voice is the master content. BGM is shaped around it.
  // fadeIn here means BGM intro duration before voice starts, not volume fade-in for the whole output.
  voiceVolume = Math.max(0.05, Math.min(2, Number(voiceVolume || 1)));
  bgmVolume = Math.max(0, Math.min(1, Number(bgmVolume || 0)));
  fadeOut = Math.max(0, Math.min(10, Number(fadeOut || 0)));
  fadeIn = Math.max(0, Math.min(10, Number(fadeIn || 0)));

  if(!bgmFile){
    if(Math.abs(voiceVolume-1) < 0.001){ fs.copyFileSync(voiceFile,output); return output; }
    await runFfmpeg(['-y','-i',voiceFile,'-filter:a',`volume=${voiceVolume}`,'-c:a','pcm_s16le',output]);
    return output;
  }

  const voiceDur = await getAudioDurationSeconds(voiceFile).catch(()=>0);
  const totalDur = Math.max(0.1, (voiceDur || 0) + fadeIn);
  const bedInfo = await makeSmartBgmBed(bgmFile, totalDur);
  const shapedBgmFile = bedInfo.file;
  // If the BGM must be trimmed or looped, auto-fade BGM for 2s to avoid an abrupt cutoff.
  const autoFade = (bedInfo.trimmed || bedInfo.looped) ? 2 : 0;
  const fadeOutDur = Math.min(Math.max(fadeOut, autoFade), Math.max(0, totalDur - 0.1));

  try{
    const voiceDelayMs = Math.round(fadeIn * 1000);
    const voiceChain = voiceDelayMs > 0
      ? `[0:a]volume=${voiceVolume},adelay=${voiceDelayMs}:all=1[voice]`
      : `[0:a]volume=${voiceVolume}[voice]`;
    const bgmFilters = [`volume=${bgmVolume}`, `atrim=0:${totalDur.toFixed(3)}`, `asetpts=N/SR/TB`];
    if(fadeOutDur > 0){
      const st = Math.max(0, totalDur - fadeOutDur);
      bgmFilters.push(`afade=t=out:st=${st.toFixed(3)}:d=${fadeOutDur.toFixed(3)}`);
    }
    const filter = `${voiceChain};[1:a]${bgmFilters.join(',')}[bgm];[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=2,atrim=0:${totalDur.toFixed(3)},asetpts=N/SR/TB[aout]`;
    await runFfmpeg(['-y','-i',voiceFile,'-i',shapedBgmFile,
      '-filter_complex',filter,
      '-map','[aout]','-c:a','pcm_s16le',output]);
    return output;
  } finally {
    for(const f of (bedInfo.tempFiles || [])){
      if(f !== bgmFile) fs.rmSync(f,{force:true});
    }
  }
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



function cleanManualToneText(input){
  return String(input || '')
    .replace(/[\*_~`]+/g,'')
    .replace(/\|\|\|/g,'')
    .replace(/\|\|/g,'')
    .replace(/\[NHẤN MẠNH:\s*([^\]]+)\]/gi, '$1')
    .replace(/\[NGHỈ (?:NGẮN|DÀI)\]/gi, '')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\n */g,'\n')
    .trim();
}
function stripToneMarkupForSrt(input){ return cleanManualToneText(input); }

function stretchVietnameseText(input){
  const text = String(input || '').trim();
  if(!text) return text;
  const m = text.match(/(.*?)([A-Za-zÀ-ỹ]+)([^A-Za-zÀ-ỹ]*)$/u);
  if(!m) return text;
  const before = m[1], word = m[2], tail = m[3] || '';
  const stretched = word.replace(/([aăâeêioôơuưy])([^aăâeêioôơuưy]*)$/iu, (_all, v, rest)=>`${v}${v}${v}${rest}`);
  return `${before}${stretched}${tail}`;
}

function makeEmphasisText(input){
  // Không thêm ký hiệu kỹ thuật. Chỉ làm sạch text; hiệu ứng chính nằm ở styleInstruction + hậu kỳ chunk.
  return cleanManualToneText(input);
}

function parseManualToneSegments(input){
  const text = String(input || '').replace(/\r/g,'');
  const segments = [];
  let buf = '';
  const pushText = (value, tone='normal') => {
    const cleaned = cleanManualToneText(value);
    if(!cleaned) return;
    const last = segments[segments.length-1];
    if(last && last.type === 'text' && last.tone === tone){
      last.text = `${last.text} ${cleaned}`.replace(/[ \t]+/g,' ').trim();
    } else {
      segments.push({type:'text', tone, text:cleaned});
    }
  };
  const flush = () => { if(buf){ pushText(buf, 'normal'); buf=''; } };
  for(let i=0;i<text.length;i++){
    if(text.startsWith('|||', i)){
      flush(); segments.push({type:'pause', ms:600}); i += 2; continue;
    }
    if(text.startsWith('||', i)){
      flush(); segments.push({type:'pause', ms:250}); i += 1; continue;
    }
    const ch = text[i];
    if(ch === '*' || ch === '~'){
      const close = text.indexOf(ch, i+1);
      if(close > i+1){
        const inner = text.slice(i+1, close);
        const cleaned = cleanManualToneText(inner);
        if(cleaned){
          flush();
          pushText(cleaned, ch === '*' ? 'emphasis' : 'stretch');
        }
        i = close;
        continue;
      }
      // Dấu markup lẻ: bỏ để không bao giờ lọt vào TTS.
      continue;
    }
    buf += ch;
  }
  flush();
  return segments;
}


function makeManualToneDebugLines(ttsItems){
  const lines = [];
  let textNo = 0;
  for(let i=0;i<(ttsItems||[]).length;i++){
    const item = ttsItems[i];
    if(!item) continue;
    if(item.type === 'pause'){
      lines.push(`[ITEM ${String(i+1).padStart(2,'0')}] PAUSE ${item.ms || 0}ms`);
      continue;
    }
    textNo++;
    const text = String(item.text || '').replace(/\s+/g,' ').trim();
    lines.push(`[ITEM ${String(i+1).padStart(2,'0')} | CHUNK ${String(textNo).padStart(2,'0')}] TONE=${item.tone || 'normal'} LEN=${text.length}`);
    lines.push(text);
    lines.push('---');
  }
  return lines;
}

function writeManualToneDebugLog(ttsItems, payload, sourceText){
  try{
    const dir = outDir(payload.outputDir);
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const file = path.join(dir, `${safeBaseName(payload.outputBaseName || 'EVS-Voice')}-chunk-debug-${stamp}.txt`);
    const textItems = (ttsItems||[]).filter(x=>x && x.type === 'text');
    const pauseItems = (ttsItems||[]).filter(x=>x && x.type === 'pause');
    const content = [
      'EASY VOICE VIET - CHUNK DEBUG LOG',
      `Time: ${new Date().toLocaleString('vi-VN')}`,
      `Mode: ${payload.mode || '-'}`,
      `Style: ${payload.style || '-'}`,
      `Speed: ${payload.speed || '-'}`,
      `Voice: ${payload.voiceName || '-'}`,
      `Model: ${payload.model || '-'}`,
      `Text chunks: ${textItems.length}`,
      `Pauses: ${pauseItems.length}`,
      '',
      '===== ITEMS SENT TO TTS / PAUSE PLAN =====',
      ...makeManualToneDebugLines(ttsItems),
      '',
      '===== SOURCE TEXT AFTER vnClean =====',
      String(sourceText || '')
    ].join('\n');
    fs.writeFileSync(file, content, 'utf8');
    return file;
  }catch(err){
    console.warn('[voice-viet] write chunk debug log failed:', err && err.message ? err.message : err);
    return '';
  }
}

function compileManualToneItems(input, mode, preview=false){
  // V45 hybrid parser:
  // - Giữ số request thấp bằng cách gom đoạn dài như V44.
  // - Không gửi *, ~, || sang Gemini.
  // - Nếu chunk có *...* thì hậu kỳ cả chunk sáng/nổi hơn + systemInstruction có năng lượng.
  // - ~...~ vẫn biến đổi text để nghe rõ kéo dài hơn.
  const text = String(input || '').replace(/\r/g,'');
  const maxChunk = preview ? 650 : (mode === 'ads' ? 850 : 950);
  const items = [];
  let buf = '';
  let bufTone = 'normal';
  let emphasisCount = 0;
  let stretchCount = 0;
  let pauseCount = 0;

  const markTone = (tone) => {
    if(tone === 'emphasis') bufTone = 'emphasisMixed';
    else if(tone === 'stretch' && bufTone === 'normal') bufTone = 'stretchMixed';
  };

  const pushText = () => {
    const cleaned = cleanManualToneText(buf);
    const tone = bufTone;
    buf = '';
    bufTone = 'normal';
    if(!cleaned) return;
    const paced = applyPacing(cleaned, mode);
    const pieces = splitText(paced, maxChunk);
    for(const piece of pieces){
      const t = String(piece || '').trim();
      if(t) items.push({type:'text', tone, text:t, displayText:t});
    }
  };

  for(let i=0; i<text.length; i++){
    if(text.startsWith('|||', i)){
      pushText();
      items.push({type:'pause', ms:600});
      pauseCount++;
      i += 2;
      continue;
    }
    if(text.startsWith('||', i)){
      pushText();
      items.push({type:'pause', ms:250});
      pauseCount++;
      i += 1;
      continue;
    }
    const ch = text[i];
    if(ch === '*'){
      const close = text.indexOf('*', i+1);
      if(close > i+1){
        const inner = makeEmphasisText(text.slice(i+1, close));
        if(inner){
          if(buf && !/\s$/.test(buf)) buf += ' ';
          buf += inner;
          markTone('emphasis');
          emphasisCount++;
        }
        i = close;
        continue;
      }
      // Dấu * lẻ: bỏ qua để không lọt vào TTS.
      continue;
    }
    if(ch === '~'){
      const close = text.indexOf('~', i+1);
      if(close > i+1){
        const inner = cleanManualToneText(text.slice(i+1, close));
        if(inner){
          if(buf && !/\s$/.test(buf)) buf += ' ';
          buf += stretchVietnameseText(inner);
          markTone('stretch');
          stretchCount++;
        }
        i = close;
        continue;
      }
      continue;
    }
    buf += ch;
  }
  pushText();

  // Gộp text item liền nhau cùng tone nếu tổng vẫn ngắn. Không gộp qua pause.
  const merged = [];
  for(const item of items){
    if(item.type !== 'text'){
      merged.push(item);
      continue;
    }
    const last = merged[merged.length-1];
    if(last && last.type === 'text' && last.tone === item.tone && (last.text + '\n' + item.text).length <= maxChunk){
      last.text = `${last.text}\n${item.text}`.trim();
      last.displayText = `${last.displayText || last.text}\n${item.displayText || item.text}`.trim();
    } else {
      merged.push({...item});
    }
  }

  // Chống micro-chunk: các đoạn quá ngắn như "Đặc biệt!" đứng riêng giữa 2 pause
  // rất dễ làm Gemini tự bịa/hoàn thiện ngữ cảnh.
  // Cách an toàn: gộp micro-chunk vào chunk kế tiếp, giữ pause trước nó.
  const stable = [];
  const minStandaloneChars = mode === 'ads' ? 24 : 18;
  for(let i=0; i<merged.length; i++){
    const item = merged[i];
    if(item.type === 'text' && item.text.trim().length < minStandaloneChars){
      const nextPause = merged[i+1];
      const nextText = merged[i+2];
      if(nextPause && nextPause.type === 'pause' && nextText && nextText.type === 'text' && (item.text + '\n' + nextText.text).length <= maxChunk){
        stable.push({
          ...nextText,
          tone: item.tone !== 'normal' ? item.tone : nextText.tone,
          text: `${item.text}\n${nextText.text}`.trim(),
          displayText: `${item.displayText || item.text}\n${nextText.displayText || nextText.text}`.trim(),
          microMerged: true
        });
        i += 2;
        continue;
      }
      const prev = stable[stable.length-1];
      if(prev && prev.type === 'text' && (prev.text + '\n' + item.text).length <= maxChunk){
        prev.text = `${prev.text}\n${item.text}`.trim();
        prev.displayText = `${prev.displayText || prev.text}\n${item.displayText || item.text}`.trim();
        prev.microMerged = true;
        if(prev.tone === 'normal' && item.tone !== 'normal') prev.tone = item.tone;
        continue;
      }
    }
    stable.push(item);
  }

  return {items: stable, stats:{emphasisCount, stretchCount, pauseCount, maxChunk, microMergedCount: stable.filter(x=>x.microMerged).length}};
}

function promptFor(mode,style,speed,tone='normal'){
  const speedGuide = speed === 'Nhanh' ? 'nhịp nhanh gọn' : speed === 'Chậm' ? 'nhịp chậm vừa, rõ từng cụm' : 'nhịp vừa phải';
  const styleGuide = {
    'Năng lượng':'nhiều năng lượng, tươi, rõ chữ, thuyết phục, đúng chất giọng quảng cáo bán hàng',
    'Cảm xúc':'ấm, truyền cảm, có nhịp lên xuống tự nhiên',
    'Tự nhiên':'tự nhiên, rõ chữ, gần gũi'
  };
  const map={
    ads:`Đọc tiếng Việt bằng giọng quảng cáo ${styleGuide[style] || styleGuide['Năng lượng']}, ${speedGuide}. Nhấn nhá tự nhiên ở thông tin ưu đãi, giá tiền, số lượng và tên cửa hàng. Giọng phải có sức sống, không đều đều.`,
    story:`Đọc truyện tiếng Việt ${styleGuide[style] || styleGuide['Cảm xúc']}, ${speedGuide}. Ngắt nghỉ rõ, kể mềm và tự nhiên.`,
    review:`Đọc review phim tiếng Việt cuốn hút, tò mò, cinematic, ${speedGuide}.`
  };
  if(String(tone).includes('emphasis')){
    return `${map[mode] || map.ads} Đoạn này có thông tin quan trọng, đọc nổi hơn và có lực hơn, nhưng không thêm từ mới.`;
  }
  if(String(tone).includes('stretch')){
    return `${map[mode] || map.ads} Đoạn này có câu chào thân thiện, đọc mềm hơn và hơi ngân nhẹ tự nhiên, nhưng không thêm từ mới.`;
  }
  return `${map[mode] || map.ads} Chỉ tạo audio cho nội dung được cung cấp, không thêm lời dẫn.`;
}



async function synthesizeVoiceVietChunk({payload, chunk, tone, orderedGeminiKeys, geminiKeys, progress, indexLabel}){
  const requestedEngine = payload.engine || 'auto';
  const canUseVertex = hasVertexConfig(payload);
  const tryToneOrder = tone && tone !== 'normal' ? [tone, 'normal'] : ['normal'];
  let lastErr = null;
  for(const currentTone of tryToneOrder){
    const baseParams={...payload,text:chunk,prompt:promptFor(payload.mode,payload.style,payload.speed,currentTone)};
    if(requestedEngine==='vertex' || (requestedEngine==='auto' && canUseVertex)){
      try{
        progress(`${indexLabel} • VERTEX AI${currentTone!==tone?' • fallback thường':''}`);
        return await callVertexTTS(baseParams);
      }catch(err){
        lastErr=err;
        if(requestedEngine==='vertex' && currentTone === tryToneOrder[tryToneOrder.length-1]) throw err;
        if(requestedEngine==='vertex') continue;
        progress('Vertex chưa khả dụng, chuyển sang Gemini...');
      }
    }
    const candidates = orderedGeminiKeys.length ? orderedGeminiKeys : [payload.apiKey].filter(Boolean);
    for(let attempt=0; attempt<candidates.length; attempt++){
      const key = candidates[attempt];
      const keyLabel = keyLabelFromList(geminiKeys, key);
      try{
        progress(`${indexLabel} • ${keyLabel}${attempt?` • thử lại ${attempt+1}`:''}${currentTone!==tone?' • fallback thường':''}`);
        return await callGeminiTTS({...baseParams, apiKey:key});
      }catch(err){
        lastErr=err;
        const msg = String(err && err.message ? err.message : err);
        progress(`Key ${keyLabel} lỗi, đổi key khác...`);
        if(!/quota|429|RESOURCE_EXHAUSTED|rate|timeout|fetch|audio|invalid|403|400|không trả về audio|text response/i.test(msg)) break;
        await sleep(900 + attempt*350);
      }
    }
  }
  throw lastErr || new Error('Không tạo được audio sau khi thử các key khả dụng.');
}

function getVoiceVietWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function registerEasyVoiceVietHandlers() {
  const forceHandle = (channel, handler) => {
    try { ipcMain.removeHandler(channel); } catch {}
    ipcMain.handle(channel, handler);
  };
forceHandle('voice-viet:generate', async (_evt, payload)=>{
  const progress=(msg)=> getVoiceVietWindow()?.webContents.send('voice-viet:progress', msg);
  const preview = !!payload.preview;
  const cacheEnabled = payload.cacheEnabled !== false;
  const rawText = preview ? String(payload.text||'').slice(0,650) : String(payload.text||'');
  progress('Làm sạch script...');

  const sourceText = vnClean(rawText);
  const displayTextForSrt = normalizeForCache(applyPacing(stripToneMarkupForSrt(sourceText), payload.mode));
  const displayChunks = splitText(displayTextForSrt, preview ? 650 : (payload.mode === 'ads' ? 850 : 950));

  const compiled = compileManualToneItems(sourceText, payload.mode, preview);
  const ttsItems = compiled.items;
  const textItems = ttsItems.filter(x=>x.type==='text');
  progress(`Parser manual: ${textItems.length} đoạn đọc, ${compiled.stats.pauseCount} pause, ${compiled.stats.emphasisCount} nhấn, ${compiled.stats.stretchCount} kéo dài`);
  const chunkDebugFile = writeManualToneDebugLog(ttsItems, payload, sourceText);
  if(chunkDebugFile) progress(`Đã ghi log chia chunk: ${path.basename(chunkDebugFile)}`);
  console.log('[voice-viet][chunk-debug] items:', JSON.stringify(ttsItems.map((x,idx)=>x.type==='pause' ? {idx:idx+1,type:'pause',ms:x.ms} : {idx:idx+1,type:'text',tone:x.tone,len:String(x.text||'').length,text:String(x.text||'').slice(0,220)}), null, 2));
  progress(`Tách đoạn đọc: 0/${textItems.length}`);
  if(!textItems.length) throw new Error('Chưa có nội dung để gen voice');

  const normalizedForCache = normalizeForCache(JSON.stringify(ttsItems.map(x=>x.type==='pause' ? {type:'pause', ms:x.ms} : {type:'text', tone:x.tone, text:x.text})));
  const geminiKeysRaw = Array.isArray(payload.apiKeys) ? payload.apiKeys.join('\n') : (payload.apiKeys || payload.apiKey || '');
  const geminiKeys = parseApiKeys(geminiKeysRaw);
  const startKeyIndex = Math.max(0, geminiKeys.indexOf(payload.apiKey));
  const orderedGeminiKeys = geminiKeys.length ? [...geminiKeys.slice(startKeyIndex), ...geminiKeys.slice(0,startKeyIndex)] : (payload.apiKey ? [payload.apiKey] : []);

  const cacheIdentity = {
    version:'v47-v38-energy-safe-final-v1',
    preview,
    items: normalizedForCache,
    engine: payload.engine,
    voiceName: payload.voiceName,
    mode: payload.mode,
    style: payload.style,
    speed: payload.speed,
    model: payload.model
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
    progress(`Dùng lại voice cache hoàn chỉnh: ${textItems.length}/${textItems.length}`);
    if(payload.bgmPath) progress('Đang mix BGM local từ voice cache...');
    await mixBgm(voiceMaster, payload.bgmPath || '', finalFile, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1, payload.bgmFadeOut ?? payload.fadeOut ?? 0, payload.bgmFadeIn ?? payload.fadeIn ?? 0);
    manifest.finals = manifest.finals || {};
    const srtContent = buildSrt(displayChunks, payload.mode);
    manifest.finals[finalKey] = {...(manifest.finals[finalKey]||{}), lastUsedAt:new Date().toISOString(), hits:((manifest.finals[finalKey]?.hits||0)+1), file:cachedFinal};
    writeCacheManifest(manifest);
    return { ok:true, filePath:finalFile, voiceFile:voiceMaster, fileUrl:pathToFileURL(finalFile).href, srtContent, cacheHits:textItems.length, chunks:textItems.length, finalCacheHit:true };
  }

  const files=[]; let cacheHits=0; let generatedChunks=0; let textIndex=0;
  for(let i=0;i<ttsItems.length;i++){
    const item = ttsItems[i];
    if(item.type === 'pause'){
      const ms = Math.max(80, Number(item.ms || 250));
      const pauseFile = path.join(cacheDir(), `manual-silence-${ms}ms.wav`);
      if(!fs.existsSync(pauseFile)) writeSilentWav(pauseFile, ms);
      files.push(pauseFile);
      continue;
    }
    textIndex++;
    const chunk = item.text;
    const chunkPreview = String(chunk || '').replace(/\s+/g,' ').trim().slice(0,120);
    progress(`Chunk ${textIndex}/${textItems.length} [${item.tone || 'normal'}] ${chunkPreview}`);
    console.log(`[voice-viet][chunk ${textIndex}/${textItems.length}][${item.tone || 'normal'}]`, chunk);
    const chunkKey=hash({version:'v47-v38-energy-safe-chunk-v1', chunk, tone:item.tone, engine:payload.engine, voiceName:payload.voiceName, mode:payload.mode, style:payload.style, speed:payload.speed, model:payload.model});
    const file=path.join(cacheDir(),`${chunkKey}.wav`);
    if(cacheEnabled && await isAudioFileValid(file)){
      cacheHits++;
      progress(`Dùng lại cache đoạn ${textIndex}/${textItems.length}`);
      manifest.chunks = manifest.chunks || {};
      manifest.chunks[chunkKey] = {...(manifest.chunks[chunkKey]||{}), lastUsedAt:new Date().toISOString(), hits:((manifest.chunks[chunkKey]?.hits||0)+1), file, chars:chunk.length};
      files.push(file);
      continue;
    }
    if(fs.existsSync(file)) fs.rmSync(file,{force:true});
    progress(`Đang tạo giọng đọc ${textIndex}/${textItems.length}${item.tone==='emphasis'?' • nhấn mạnh':item.tone==='stretch'?' • kéo dài':''}...`);
    let audio = await synthesizeVoiceVietChunk({
      payload,
      chunk,
      tone:item.tone || 'normal',
      orderedGeminiKeys,
      geminiKeys,
      progress,
      indexLabel:`Đang tạo giọng đọc ${textIndex}/${textItems.length}`
    });
    const rawFile = path.join(cacheDir(),`${chunkKey}.raw`);
    fs.writeFileSync(rawFile,audio.buffer || audio);
    try{
      const cleanWav = path.join(cacheDir(),`${chunkKey}.clean.wav`);
      await ensurePlayableWav(rawFile, cleanWav, audio.mimeType || '');
      await postProcessManualToneAudio(cleanWav, file, item.tone);
      fs.rmSync(cleanWav,{force:true});
    }catch(err){
      fs.rmSync(rawFile,{force:true});
      throw new Error(`${err.message || err} Đoạn lỗi: "${String(chunk).slice(0,90)}"`);
    }
    fs.rmSync(rawFile,{force:true});
    if(!(await isAudioFileValid(file))) throw new Error('File voice vừa tạo chưa hợp lệ nên app đã dừng trước khi export. Hãy thử đổi voice/model hoặc rút ngắn script.');
    manifest.chunks = manifest.chunks || {};
    manifest.chunks[chunkKey] = {file, chars:chunk.length, tone:item.tone, createdAt:new Date().toISOString(), lastUsedAt:new Date().toISOString(), hits:0, engine:payload.engine, voiceName:payload.voiceName, mode:payload.mode, style:payload.style, speed:payload.speed, model:payload.model};
    generatedChunks++;
    files.push(file);
    await sleep(300);
  }
  writeCacheManifest(manifest);

  progress('Đang ghép giọng đọc...');
  const wantedBase = safeBaseName(payload.outputBaseName || payload.mode);
  const base= `${wantedBase}-${preview?'preview':'full'}-${Date.now()}`;
  const exportRoot = outDir(payload.outputDir);
  const mergedRaw=path.join(exportRoot,`${base}-voice-raw.wav`);
  const merged=path.join(exportRoot,`${base}-voice.wav`);
  await concatAudio(files,mergedRaw);
  progress('Đang tăng năng lượng voice...');
  await postProcessFinalVoiceAudio(mergedRaw, merged, payload);
  fs.rmSync(mergedRaw,{force:true});
  progress('Đang xử lý nhạc nền...');
  const finalFile=path.join(exportRoot,`${base}.wav`);
  await mixBgm(merged,payload.bgmPath,finalFile,payload.bgmVolume ?? 0.18,payload.voiceVolume ?? 1, payload.bgmFadeOut ?? payload.fadeOut ?? 0, payload.bgmFadeIn ?? payload.fadeIn ?? 0);
  const srtContent = buildSrt(displayChunks, payload.mode);

  if(cacheEnabled && await isAudioFileValid(merged)){
    fs.copyFileSync(merged, cachedFinal);
    const manifest2 = readCacheManifest();
    manifest2.finals = manifest2.finals || {};
    manifest2.finals[finalKey] = {file:cachedFinal, chunks:textItems.length, createdAt:new Date().toISOString(), lastUsedAt:new Date().toISOString(), hits:0, bytes:fileSize(cachedFinal), cacheHits, generatedChunks};
    writeCacheManifest(manifest2);
  }
  return { ok:true, filePath:finalFile, voiceFile:merged, fileUrl:pathToFileURL(finalFile).href, srtContent, cacheHits, chunks:textItems.length, finalCacheHit:false };
});

forceHandle('voice-viet:audio:exportMp3', async(_e,filePath,outputBaseName)=>{ const output=await exportToMp3(filePath, outputBaseName); return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href}; });

forceHandle('voice-viet:audio:mixBgmPreview', async(_e, payload={})=>{
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
  await mixBgm(sourceFile, payload.bgmFile || '', output, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1, payload.bgmFadeOut ?? payload.fadeOut ?? 0, payload.bgmFadeIn ?? payload.fadeIn ?? 0);
  fs.rmSync(sourceFile,{force:true});
  return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href};
});

forceHandle('voice-viet:audio:chooseExternal', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Thêm file audio ngoài',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  const filePath=r.filePaths[0];
  return {ok:true,path:filePath,name:path.basename(filePath)};
});

forceHandle('voice-viet:audio:exportMp3WithMix', async(_e, payload={})=>{
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
  await mixBgm(sourceFile, payload.bgmFile || '', mixedFile, payload.bgmVolume ?? 0.18, payload.voiceVolume ?? 1, payload.bgmFadeOut ?? payload.fadeOut ?? 0, payload.bgmFadeIn ?? payload.fadeIn ?? 0);
  const output = await exportToMp3(mixedFile, payload.outputBaseName || base);
  fs.rmSync(sourceFile,{force:true});
  fs.rmSync(mixedFile,{force:true});
  return {ok:true,filePath:output,fileUrl:pathToFileURL(output).href};
});

forceHandle('voice-viet:subtitle:saveAs', async(_e, srtPath, outputBaseName)=>{
  if(!srtPath || !fs.existsSync(srtPath)) throw new Error('Chưa có file phụ đề SRT. Hãy generate voice trước.');
  const result = await dialog.showSaveDialog(getVoiceVietWindow(), { title:'Lưu file SRT', defaultPath:`${safeBaseName(outputBaseName||path.parse(srtPath).name)}.srt`, filters:[{name:'SubRip Subtitle', extensions:['srt']}] });
  if(result.canceled || !result.filePath) return null;
  fs.copyFileSync(srtPath, result.filePath);
  return {ok:true,filePath:result.filePath};
});


forceHandle('voice-viet:subtitle:saveContent', async(_e, srtContent, outputBaseName)=>{
  if(!srtContent) throw new Error('Chưa có nội dung phụ đề SRT. Hãy generate voice trước.');
  const result = await dialog.showSaveDialog(getVoiceVietWindow(), { title:'Lưu file SRT', defaultPath:`${safeBaseName(outputBaseName||'subtitle')}.srt`, filters:[{name:'SubRip Subtitle', extensions:['srt']}] });
  if(result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(srtContent), 'utf8');
  return {ok:true,filePath:result.filePath};
});

forceHandle('voice-viet:audio:readDataUrl', async(_e,filePath)=>{
  if(!filePath || !fs.existsSync(filePath)) throw new Error('Không tìm thấy file audio để preview.');
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
  const data = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${data}`;
});



forceHandle('voice-viet:file:read-audio-file', async(_e, payload)=>{
  const filePath = typeof payload === 'string' ? payload : (payload && (payload.filePath || payload.path));
  if(!filePath || !fs.existsSync(filePath)) return { ok:false, error:'Không tìm thấy file audio để preview.' };
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
  const data = fs.readFileSync(filePath).toString('base64');
  return { ok:true, data, mimeType, filePath, fileUrl:pathToFileURL(filePath).href };
});


forceHandle('voice-viet:bgm:importAsset', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Easy Studio',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
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

forceHandle('voice-viet:bgm:openLibrary', async()=>{
  const dir = bgmDir();
  ensureDir(dir);
  await shell.openPath(dir);
  return dir;
});

forceHandle('voice-viet:bgm:choose', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Easy Studio',properties:['openFile'],filters:[{name:'Audio',extensions:['mp3','wav','m4a','aac','flac']} ]});
  if(r.canceled) return null; return r.filePaths[0];
});

forceHandle('voice-viet:output:chooseDir', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Easy Studio',properties:['openDirectory','createDirectory']});
  if(r.canceled) return null;
  return r.filePaths[0];
});
forceHandle('voice-viet:file:openFolder', async(_e,filePath)=>{ if(!filePath) return false; try{ const p=String(filePath); if(fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p); else shell.showItemInFolder(p); return true; }catch{ shell.openPath(path.dirname(String(filePath))); return true; } });
forceHandle('voice-viet:cache:info', async()=> await getCacheStats());
forceHandle('voice-viet:cache:clear', async()=>{ fs.rmSync(path.join(appData(),'cache'),{recursive:true,force:true}); ensureDir(cacheDir()); ensureDir(finalCacheDir()); return {ok:true}; });

forceHandle('voice-viet:keys:importTxt', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Easy Studio',properties:['openFile'],filters:[{name:'Text',extensions:['txt','csv','log']},{name:'All files',extensions:['*']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  return fs.readFileSync(r.filePaths[0],'utf8');
});

forceHandle('voice-viet:keys:exportTxt', async(_e, content)=>{
  const r=await dialog.showSaveDialog(getVoiceVietWindow(),{title:'Easy Studio',defaultPath:'keys.txt',filters:[{name:'Text',extensions:['txt']} ]});
  if(r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(content||''), 'utf8');
  return r.filePath;
});

forceHandle('voice-viet:keys:exportLogTxt', async(_e, content)=>{
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const r=await dialog.showSaveDialog(getVoiceVietWindow(),{title:'Easy Studio',defaultPath:`evs-key-log-${stamp}.txt`,filters:[{name:'Text',extensions:['txt']} ]});
  if(r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(content||''), 'utf8');
  return r.filePath;
});

forceHandle('voice-viet:vertex:importJson', async()=>{
  const r=await dialog.showOpenDialog(getVoiceVietWindow(),{title:'Easy Studio',properties:['openFile'],filters:[{name:'Service Account JSON',extensions:['json']},{name:'All files',extensions:['*']} ]});
  if(r.canceled || !r.filePaths?.[0]) return null;
  const src=r.filePaths[0];
  let parsed={};
  try{ parsed=JSON.parse(fs.readFileSync(src,'utf8')); }catch{ throw new Error('File JSON không hợp lệ.'); }
  const destDir=path.join(app.getPath('userData'),'vertex-profiles');
  ensureDir(destDir);
  const safeName=String(parsed.client_email || parsed.project_id || path.basename(src,'.json')).replace(/[^a-z0-9_.-]+/gi,'-');
  const dest=path.join(destDir,`${safeName}-${Date.now()}.json`);
  fs.copyFileSync(src,dest);
  let accessToken = '';
  try { accessToken = await getVertexAccessTokenFromJson(dest); } catch {}
  return {ok:true,path:dest,projectId:parsed.project_id||'',clientEmail:parsed.client_email||'',type:parsed.type||'',accessToken};
});



}

module.exports = { registerEasyVoiceVietHandlers };
