function safeText(value){return String(value==null?"":value);}function normalizeLaughSubtitleText(text){const raw=String(text||"").trim();if(!raw)return raw;const clean=raw.toLowerCase().replace(/[“”"\'`]/g,"").replace(/[()\[\]{}]/g," ").replace(/[.!?,;:~…]+$/g,"").replace(/\s+/g," ").trim();const compact=clean.replace(/\s+/g,"");const isLaughWord=/^(?:ha){2,}h?$/.test(compact)||/^(?:he){2,}h?$/.test(compact)||/^(?:hi){2,}h?$/.test(compact)||/^(?:ho){2,}h?$/.test(compact)||compact==="lol"||compact==="laugh"||compact==="laughnaturally";if(clean==="[laugh]"||clean==="laugh"||clean==="laugh naturally"||compact==="[laugh]"||compact==="laughnaturally"||isLaughWord)return "[laugh]";return raw;}
function escapeAssText(text){return String(text||"").replace(/\\/g,"\\\\").replace(/\{/g,"\\{").replace(/\}/g,"\\}").replace(/\n/g," ").trim();}
function formatAssTime(seconds){const totalCs=Math.max(0,Math.round(Number(seconds||0)*100));const hours=Math.floor(totalCs/360000);const minutes=Math.floor((totalCs%360000)/6000);const secs=Math.floor((totalCs%6000)/100);const cs=totalCs%100;const pad=(n,w=2)=>String(n).padStart(w,"0");return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`;}
function hexToRgb(hex,fallback=[255,255,255]){const clean=String(hex||"").trim().replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(clean))return fallback;return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)];}
function rgbaStringToAssBackColor(rgbaString){const text=String(rgbaString||"");const m=text.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);if(!m)return "&H00202020";const r=Math.max(0,Math.min(255,Number(m[1]||0)));const g=Math.max(0,Math.min(255,Number(m[2]||0)));const b=Math.max(0,Math.min(255,Number(m[3]||0)));const a=Math.max(0,Math.min(1,Number(m[4]==null?1:m[4])));const alpha=Math.round((1-a)*255).toString(16).padStart(2,"0").toUpperCase();const hx=(n)=>n.toString(16).padStart(2,"0").toUpperCase();return `&H${alpha}${hx(b)}${hx(g)}${hx(r)}`;}
function rgbToAssColor(rgb=[255,255,255]){const [r,g,b]=rgb;const hex=(n)=>Math.max(0,Math.min(255,Number(n||0))).toString(16).padStart(2,"0").toUpperCase();return `&H00${hex(b)}${hex(g)}${hex(r)}&`;}
function estimateWordWidth(word,fontSize){let w=0;for(const ch of String(word||"")){if(/\s/.test(ch)){w+=fontSize*0.32;continue;}if(/[ilI.,'’`!|]/.test(ch))w+=fontSize*0.26;else if(/[mwMW@#%&]/.test(ch))w+=fontSize*0.78;else if(/[A-Z]/.test(ch))w+=fontSize*0.62;else w+=fontSize*0.52;}return w;}
function splitSubtitleLinesByBox(text="",boxWidth=760,fontSize=40,maxLineChars=60,maxLines=5){const clean=safeText(text).replace(/\s+/g," ").trim();if(!clean)return [""];const widthLimit=Math.max(260,Number(boxWidth||760));const charLimit=Math.max(16,Number(maxLineChars||60));const lines=[];let current="";let currentWidth=0;const words=clean.split(" ");for(const word of words){const wordWidth=estimateWordWidth(word,fontSize);const spaceWidth=current?fontSize*0.32:0;const candidate=current?current+" "+word:word;const candidateWidth=currentWidth+spaceWidth+wordWidth;if(current && (candidateWidth>widthLimit || candidate.length>charLimit)){lines.push(current);current=word;currentWidth=wordWidth;continue;}current=candidate;currentWidth=candidateWidth;}if(current)lines.push(current);const limit=Math.max(2,Number(maxLines||5));if(lines.length<=limit)return lines;const merged=lines.slice(0,limit-1);merged.push(lines.slice(limit-1).join(" "));return merged;}
function normalizeSubtitleCues(subtitles=[],totalDuration=0){const capDuration=Number(totalDuration||0)>0?Number(totalDuration||0):Infinity;return(Array.isArray(subtitles)?subtitles:[]).map((cue)=>({start:Math.max(0,Number(cue?.start||0)),end:Math.max(0,Number(cue?.end||0)),text:normalizeLaughSubtitleText(safeText(cue?.text).replace(/\s+/g," ").trim()),role:safeText(cue?.role).trim().toUpperCase()||"A"})).filter((cue)=>cue.text&&cue.end>cue.start).map((cue)=>({...cue,end:Math.min(cue.end,capDuration)}));}
function buildStyledAssContent(subtitleCues = [], totalDuration = 0, layoutConfig = {}) {
    const subtitleCfg = layoutConfig?.subtitle || {};
    const fontSize = Math.max(20, Number(subtitleCfg.fontSize || 40));
    const subtitleFontName = String(subtitleCfg.fontFamily || subtitleCfg.fontName || "Segoe UI").trim() || "Segoe UI";
    const marginBottom = Math.max(20, Number(subtitleCfg.marginBottom || 120));
    const outlineWidth = Math.max(0, Number(subtitleCfg.outlineWidth || 1.2));
    const shadowDepth = Math.max(0, Number(subtitleCfg.shadowDepth || 3.0));
    const boxWidth = Math.max(320, Math.min(1160, Number(subtitleCfg.boxWidth || 760)));
    const computedBoxChars = Math.round(boxWidth / Math.max(10, fontSize * 0.48));
    const maxLineChars = Math.max(16, Math.min(96, Number(subtitleCfg.maxLineChars || computedBoxChars), computedBoxChars));
    const maxLines = Math.max(2, Math.min(6, Number(subtitleCfg.maxLines || 5)));
    const offsetX = Math.round(Number(subtitleCfg.offsetX || 0));
    const marginSide = Math.max(20, Math.round((1280 - boxWidth) / 2));
    const colorA = rgbToAssColor(hexToRgb(subtitleCfg.colorA || "#37A5B4", [55, 165, 180]));
    const colorR = rgbToAssColor(hexToRgb(subtitleCfg.colorR || "#BE6E55", [190, 110, 85]));
    const colorBoth = rgbToAssColor(hexToRgb(subtitleCfg.colorBoth || "#C8AA5A", [200, 170, 90]));
    const outlineColor = rgbToAssColor(hexToRgb(subtitleCfg.outlineColor || "#353535", [53, 53, 53]));
    const backColor = rgbaStringToAssBackColor(subtitleCfg.backgroundColor || "rgba(0,0,0,0.18)");
    const header = ["[Script Info]","ScriptType: v4.00+","PlayResX: 1280","PlayResY: 720","WrapStyle: 2","ScaledBorderAndShadow: yes","Collisions: Normal","","[V4+ Styles]","Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",`Style: Default,${subtitleFontName},${fontSize},&H00FFFFFF,&H00FFFFFF,${outlineColor},${backColor},1,0,0,0,100,100,0,0,1,${outlineWidth.toFixed(2)},${shadowDepth.toFixed(2)},2,${marginSide},${marginSide},${marginBottom},1`,"","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"];
    const normalized = normalizeSubtitleCues(subtitleCues, totalDuration);
    const events = [];
    normalized.forEach((cue) => {
        const roleColor = cue.role === "R" ? colorR : cue.role === "BOTH" ? colorBoth : colorA;
        const lines = splitSubtitleLinesByBox(cue.text, boxWidth, fontSize, maxLineChars, maxLines).map((line) => escapeAssText(line));
        const wrapped = lines.join("\\N");
        const posTag = offsetX ? `\\pos(${640 + offsetX},${Math.max(40, 720 - marginBottom)})` : "";
        const assText = `{\\an2\\blur0.9\\bord${outlineWidth.toFixed(2)}\\shad${shadowDepth.toFixed(2)}\\fad(70,90)\\fscx97\\fscy97${posTag}\\t(0,140,\\fscx100\\fscy100)\\1c${roleColor}\\3c${outlineColor}\\4c${backColor}}` + wrapped;
        events.push(`Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,${marginSide},${marginSide},${marginBottom},,${assText}`);
    });
    return header.concat(events).join("\n");
}
module.exports={buildStyledAssContent};
