function safeText(value){return String(value==null?"":value);}function normalizeLaughSubtitleText(text){const raw=String(text||"").trim();if(!raw)return raw;const clean=raw.toLowerCase().replace(/[“”"\'`]/g,"").replace(/[()\[\]{}]/g," ").replace(/[.!?,;:~…]+$/g,"").replace(/\s+/g," ").trim();const compact=clean.replace(/\s+/g,"");const isLaughWord=/^(?:ha){2,}h?$/.test(compact)||/^(?:he){2,}h?$/.test(compact)||/^(?:hi){2,}h?$/.test(compact)||/^(?:ho){2,}h?$/.test(compact)||compact==="lol"||compact==="laugh"||compact==="laughnaturally";if(clean==="[laugh]"||clean==="laugh"||clean==="laugh naturally"||compact==="[laugh]"||compact==="laughnaturally"||isLaughWord)return "[laugh]";return raw;}
function escapeAssText(text){return String(text||"").replace(/\\/g,"\\\\").replace(/\{/g,"\\{").replace(/\}/g,"\\}").replace(/\n/g," ").trim();}
function formatAssTime(seconds){const totalCs=Math.max(0,Math.round(Number(seconds||0)*100));const hours=Math.floor(totalCs/360000);const minutes=Math.floor((totalCs%360000)/6000);const secs=Math.floor((totalCs%6000)/100);const cs=totalCs%100;const pad=(n,w=2)=>String(n).padStart(w,"0");return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`;}
function hexToRgb(hex,fallback=[255,255,255]){const clean=String(hex||"").trim().replace(/^#/,"");if(!/^[0-9a-fA-F]{6}$/.test(clean))return fallback;return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)];}
function rgbaStringToAssBackColor(rgbaString){const text=String(rgbaString||"");const m=text.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);if(!m)return "&H00202020";const r=Math.max(0,Math.min(255,Number(m[1]||0)));const g=Math.max(0,Math.min(255,Number(m[2]||0)));const b=Math.max(0,Math.min(255,Number(m[3]||0)));const a=Math.max(0,Math.min(1,Number(m[4]==null?1:m[4])));const alpha=Math.round((1-a)*255).toString(16).padStart(2,"0").toUpperCase();const hx=(n)=>n.toString(16).padStart(2,"0").toUpperCase();return `&H${alpha}${hx(b)}${hx(g)}${hx(r)}`;}
function rgbToAssColor(rgb=[255,255,255]){const [r,g,b]=rgb;const hex=(n)=>Math.max(0,Math.min(255,Number(n||0))).toString(16).padStart(2,"0").toUpperCase();return `&H00${hex(b)}${hex(g)}${hex(r)}&`;}
function splitSubtitleLines(text="",maxLineChars=32){const clean=safeText(text).replace(/\s+/g," ").trim();if(!clean)return [""];const limit=Math.max(16,Number(maxLineChars||32));if(clean.length<=limit)return [clean];const words=clean.split(" ");if(words.length<6)return [clean];const midpoint=Math.ceil(words.length/2);const first=words.slice(0,midpoint).join(" ");const second=words.slice(midpoint).join(" ");if(first.length>limit||second.length>limit)return [clean];return [first,second];}
function normalizeSubtitleCues(subtitles=[],totalDuration=0){const capDuration=Number(totalDuration||0)>0?Number(totalDuration||0):Infinity;return(Array.isArray(subtitles)?subtitles:[]).map((cue)=>({start:Math.max(0,Number(cue?.start||0)),end:Math.max(0,Number(cue?.end||0)),text:normalizeLaughSubtitleText(safeText(cue?.text).replace(/\s+/g," ").trim()),role:safeText(cue?.role).trim().toUpperCase()||"A"})).filter((cue)=>cue.text&&cue.end>cue.start).map((cue)=>({...cue,end:Math.min(cue.end,capDuration)}));}
function buildStyledAssContent(subtitleCues = [], totalDuration = 0, layoutConfig = {}) {
    const subtitleCfg = layoutConfig?.subtitle || {};
    const fontSize = Math.max(20, Number(subtitleCfg.fontSize || 40));
    const subtitleFontName = String(subtitleCfg.fontFamily || subtitleCfg.fontName || "Segoe UI").trim() || "Segoe UI";
    const marginBottom = Math.max(20, Number(subtitleCfg.marginBottom || 120));
    const outlineWidth = Math.max(0, Number(subtitleCfg.outlineWidth || 1.2));
    const shadowDepth = Math.max(0, Number(subtitleCfg.shadowDepth || 3.0));
    const maxLineChars = Math.max(16, Number(subtitleCfg.maxLineChars || 32));
    const offsetX = Math.round(Number(subtitleCfg.offsetX || 0));
    const colorA = rgbToAssColor(hexToRgb(subtitleCfg.colorA || "#37A5B4", [55, 165, 180]));
    const colorR = rgbToAssColor(hexToRgb(subtitleCfg.colorR || "#BE6E55", [190, 110, 85]));
    const colorBoth = rgbToAssColor(hexToRgb(subtitleCfg.colorBoth || "#C8AA5A", [200, 170, 90]));
    const outlineColor = rgbToAssColor(hexToRgb(subtitleCfg.outlineColor || "#353535", [53, 53, 53]));
    const backColor = rgbaStringToAssBackColor(subtitleCfg.backgroundColor || "rgba(0,0,0,0.18)");
    
    const header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1280",
        "PlayResY: 720",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "Collisions: Normal",
        "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
        `Style: Default,${subtitleFontName},${fontSize},&H00FFFFFF,&H00FFFFFF,${outlineColor},${backColor},1,0,0,0,100,100,0,0,1,${outlineWidth.toFixed(2)},${shadowDepth.toFixed(2)},2,42,42,${marginBottom},1`,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];
    
    const normalized = normalizeSubtitleCues(subtitleCues, totalDuration);
    const events = [];
    
    normalized.forEach((cue) => {
        const roleColor = cue.role === "R" ? colorR : cue.role === "BOTH" ? colorBoth : colorA;
        const lines = splitSubtitleLines(cue.text, maxLineChars).map((line) => escapeAssText(line));
        const wrapped = lines.join("\\N");
        const moveTag = offsetX ? `\\pos(${640 + offsetX},360)` : "";
        
        const assText = `{\\blur0.9\\bord${outlineWidth.toFixed(2)}\\shad${shadowDepth.toFixed(2)}\\fad(70,90)\\fscx97\\fscy97${moveTag}\\t(0,140,\\fscx100\\fscy100)\\1c${roleColor}\\3c${outlineColor}\\4c${backColor}}` + wrapped;
        
        events.push(`Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${assText}`);
    });
    
    return header.concat(events).join("\n");
}
module.exports={buildStyledAssContent};
