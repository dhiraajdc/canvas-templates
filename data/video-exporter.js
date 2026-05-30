/**
 * video-exporter.js
 * Exports a CanvasPlayer animation to MP4 using WebCodecs + mp4-muxer.
 * On completion opens a video result page in a new tab.
 */

const VideoExporter = (() => {

  let _cancelled    = false;
  let _currentTopic = '';

  function setTopic(t) { _currentTopic = t ?? ''; }

  function isSupported() {
    return typeof VideoEncoder !== 'undefined' &&
           typeof VideoFrame   !== 'undefined';
  }

  /* ── Lazy load mp4-muxer only when first export starts ── */
  function loadMuxer() {
    return new Promise((resolve, reject) => {
      if (typeof Mp4Muxer !== 'undefined') { resolve(); return; }
      const s  = document.createElement('script');
      s.src    = 'data/mp4-muxer.min.js';
      s.onload = resolve;
      s.onerror= () => reject(new Error('Failed to load mp4-muxer'));
      document.head.appendChild(s);
    });
  }

  function calcBitrate(w, h, fps) {
    return Math.min(Math.round(w * h * fps * 0.07), 4_000_000);
  }

  function calcExportFps(fps, totalFrames) {
    return totalFrames / fps > 15 ? Math.round(fps / 2) : fps;
  }

  function calcExportSize(w, h) {
    const ow = Math.round(w / 2); const oh = Math.round(h / 2);
    return { outWidth: ow % 2 === 0 ? ow : ow + 1, outHeight: oh % 2 === 0 ? oh : oh + 1 };
  }

  /* ── Video result page ── */
  function openResultPage({ filename, videoUrl, brandName, topic, duration, outWidth, outHeight, fileSize }) {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const durStr  = mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';
    const aspectPct = ((outHeight / outWidth) * 100).toFixed(2);

    const html = [
'<!DOCTYPE html>',
'<html lang="en">',
'<head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>' + (brandName || 'AIFeed') + (topic ? ' \xb7 ' + topic : '') + '</title>',
'<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=DM+Sans:wght@300;400;500&family=DM+Mono&display=swap" rel="stylesheet">',
'<style>',
'*{box-sizing:border-box;margin:0;padding:0}',
':root{--bg:#08080B;--s:#0F0F13;--b:#1E1E26;--b2:#2A2A36;--tx:#EEEEF0;--mt2:#7A7A8C;--ac:#6B3CF7;--ac2:#8B5CF6;--ac-glow:rgba(107,60,247,0.3)}',
'html,body{min-height:100vh;background:var(--bg);color:var(--tx);font-family:"DM Sans",sans-serif}',
'.page{max-width:480px;margin:0 auto;padding:20px 16px 60px}',
'.header{display:flex;align-items:center;gap:12px;padding:12px 0 24px}',
'.back-btn{display:flex;align-items:center;gap:6px;background:none;border:1px solid var(--b);border-radius:8px;color:var(--mt2);font-size:13px;font-family:"DM Sans",sans-serif;padding:7px 12px;cursor:pointer;transition:all .15s}',
'.back-btn:hover{border-color:var(--b2);color:var(--tx)}',
'.back-btn svg{width:14px;height:14px;flex-shrink:0}',
'.header-brand{font-family:"Space Grotesk",sans-serif;font-size:14px;font-weight:600;color:var(--tx)}',
'.video-outer{width:100%;position:relative;border-radius:16px;overflow:hidden;background:#000;border:1px solid var(--b);box-shadow:0 8px 40px rgba(0,0,0,.6)}',
'.video-outer::before{content:"";display:block;padding-top:' + aspectPct + '%}',
'video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
'.meta{padding:18px 0 4px;display:flex;flex-direction:column;gap:8px}',
'.meta-title{font-family:"Space Grotesk",sans-serif;font-size:20px;font-weight:600;color:var(--tx);line-height:1.2}',
'.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
'.badge{font-size:11px;font-family:"DM Mono",monospace;color:var(--mt2);background:var(--s);border:1px solid var(--b);border-radius:20px;padding:4px 10px}',
'.actions{display:flex;flex-direction:column;gap:10px;margin-top:24px}',
'.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;border-radius:50px;font-family:"Space Grotesk",sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;text-decoration:none;border:none}',
'.btn-primary{background:var(--ac);color:#fff;box-shadow:0 4px 24px var(--ac-glow)}',
'.btn-primary:hover{background:var(--ac2);transform:translateY(-1px)}',
'.btn-secondary{background:transparent;border:1px solid var(--b);color:var(--mt2)}',
'.btn-secondary:hover{border-color:var(--b2);color:var(--tx)}',
'.btn svg{width:16px;height:16px;flex-shrink:0}',
'</style>',
'</head>',
'<body>',
'<div class="page">',
'  <div class="header">',
'    <button class="back-btn" onclick="window.close()">',
'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
'      Back',
'    </button>',
'    <div class="header-brand">' + (brandName || 'AIFeed') + '</div>',
'  </div>',
'  <div class="video-outer">',
'    <video id="vid" src="' + videoUrl + '" controls autoplay loop playsinline muted></video>',
'  </div>',
'  <div class="meta">',
'    <div class="meta-title">' + (topic || brandName || 'Export') + '</div>',
'    <div class="badges">',
'      <span class="badge">' + durStr + '</span>',
'      <span class="badge">' + outWidth + '\xd7' + outHeight + '</span>',
'      <span class="badge">' + fileSize + ' MB</span>',
'    </div>',
'  </div>',
'  <div class="actions">',
'    <a class="btn btn-primary" id="dlBtn" href="' + videoUrl + '" download="' + filename + '">',
'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
'      Download MP4',
'    </a>',
'    <button class="btn btn-secondary" id="shareBtn" style="display:none">',
'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
'      Share Video',
'    </button>',
'  </div>',
'</div>',
'<script>',
'var vid=document.getElementById("vid");',
'vid.addEventListener("canplay",function(){vid.muted=false;},{ once:true });',
'var shareBtn=document.getElementById("shareBtn");',
'if(typeof navigator.share==="function"&&typeof navigator.canShare==="function"){shareBtn.style.display="flex";}',
'shareBtn.addEventListener("click",async function(){',
'  try{',
'    var res=await fetch("' + videoUrl + '");',
'    var blob=await res.blob();',
'    var file=new File([blob],"' + filename + '",{type:"video/mp4"});',
'    if(navigator.canShare({files:[file]})){',
'      await navigator.share({files:[file],title:"' + (topic || brandName) + '"});',
'    } else {',
'      document.getElementById("dlBtn").click();',
'    }',
'  }catch(e){ if(e.name!=="AbortError") console.warn("Share failed:",e); }',
'});',
'</script>',
'</body>',
'</html>'
    ].join('\n');

    const pageBlob = new Blob([html], { type: 'text/html' });
    const pageUrl  = URL.createObjectURL(pageBlob);
    const win      = window.open(pageUrl, '_blank');
    if (!win) {
      /* Popup blocked — fallback to direct download */
      const a = document.createElement('a');
      a.href = videoUrl; a.download = filename; a.click();
    }
  }

  /* ── Main export ── */
  async function exportVideo(player, {
    filename   = 'post.mp4',
    onProgress = () => {},
    onDone     = () => {},
    onError    = () => {},
  } = {}) {

    if (!isSupported()) {
      onError('Export not supported in this browser — use Chrome or Edge');
      return;
    }

    const state = player.getState();
    if (!state.loaded) { onError('Player not loaded.'); return; }

    const { totalFrames, fps, width, height } = state;
    _cancelled = false;

    try { await loadMuxer(); } catch(e) { onError('Video export module failed to load'); return; }

    const { outWidth, outHeight } = calcExportSize(width, height);
    const exportFps  = calcExportFps(fps, totalFrames);
    const frameStep  = Math.round(fps / exportFps);
    const outFrames  = Math.ceil(totalFrames / frameStep);
    const bitrate    = calcBitrate(outWidth, outHeight, exportFps);

    const { Muxer, ArrayBufferTarget } = Mp4Muxer;
    const target = new ArrayBufferTarget();
    const muxer  = new Muxer({ target, video: { codec: 'avc', width: outWidth, height: outHeight }, fastStart: 'in-memory' });

    let encoderError = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error:  (e) => { encoderError = e; },
    });

    const configs = [
      { codec: 'avc1.640028', width: outWidth, height: outHeight, bitrate, framerate: exportFps, hardwareAcceleration: 'prefer-hardware' },
      { codec: 'avc1.42001f', width: outWidth, height: outHeight, bitrate, framerate: exportFps, hardwareAcceleration: 'prefer-software' },
      { codec: 'avc1.42001f', width: outWidth, height: outHeight, bitrate, framerate: exportFps },
      { codec: 'avc1.420034', width: outWidth, height: outHeight, bitrate, framerate: exportFps },
    ];
    let config = null;
    for (const c of configs) {
      try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) { config = c; break; } } catch(e) {}
    }
    if (!config) { onError('H.264 encoding not supported — try updating Chrome'); return; }
    encoder.configure(config);

    const off    = document.createElement('canvas');
    off.width    = outWidth; off.height = outHeight;
    const offCtx = off.getContext('2d');
    const usPerFrame = Math.round(1_000_000 / exportFps);

    let outIdx = 0;
    for (let f = 0; f < totalFrames; f += frameStep) {
      if (_cancelled) { encoder.close(); muxer.finalize(); return; }

      player.seek(f);

      let bitmap;
      if (typeof off.transferToImageBitmap === 'function') {
        offCtx.drawImage(player._cv, 0, 0, outWidth, outHeight);
        bitmap = off.transferToImageBitmap();
      } else {
        bitmap = await createImageBitmap(player._cv, { resizeWidth: outWidth, resizeHeight: outHeight });
      }

      const frame = new VideoFrame(bitmap, { timestamp: outIdx * usPerFrame, duration: usPerFrame });
      bitmap.close();
      encoder.encode(frame, { keyFrame: outIdx % (exportFps * 2) === 0 });
      frame.close();

      if (encoderError) { onError('Encoding error: ' + encoderError.message); return; }
      if (outIdx % 30 === 0) await new Promise(r => setTimeout(r, 0));
      if (outIdx % 15 === 0 || outIdx === outFrames - 1) {
        onProgress(Math.round((outIdx + 1) / outFrames * 100), outIdx + 1, outFrames);
      }
      outIdx++;
    }

    await encoder.flush();
    encoder.close();
    muxer.finalize();
    if (_cancelled) return;

    const blob    = new Blob([target.buffer], { type: 'video/mp4' });
    const videoUrl = URL.createObjectURL(blob);

    openResultPage({
      filename,
      videoUrl,
      brandName: window.BrandContext?.brand_name ?? 'AIFeed',
      topic:     _currentTopic,
      duration:  Math.round(outFrames / exportFps),
      outWidth,
      outHeight,
      fileSize:  (target.buffer.byteLength / 1_000_000).toFixed(1),
    });

    onDone();
  }

  function cancel() { _cancelled = true; }

  return { export: exportVideo, cancel, isSupported, setTopic };

})();

window.VideoExporter = VideoExporter;
