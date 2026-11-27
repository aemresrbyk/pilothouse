// Renders promo.html frame by frame (window.seek(t)) with Electron offscreen and pipes raw frames to ffmpeg.
// Usage: npx electron render.cjs <dir with promo.html, logo.png, web.png, phone.mp4> <out.mp4>
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const [dir, out] = process.argv.slice(-2), FPS = 30;
  const w = new BrowserWindow({ width: 1920, height: 1080, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await w.loadFile(path.join(dir, 'promo.html'));
  await w.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>{const v=document.getElementById("vid");v.readyState>=2?r():v.oncanplay=r}))');
  const dur = await w.webContents.executeJavaScript('window.DURATION'), n = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', '1920x1080', '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < n; f++) {
    await w.webContents.executeJavaScript(`window.seek(${f / FPS})`);
    let img = await w.webContents.capturePage();
    const s = img.getSize(); if (s.width !== 1920) img = img.resize({ width: 1920, height: 1080 });
    if (!ff.stdin.write(img.toBitmap())) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`${f}/${n}`);
  }
  ff.stdin.end(); ff.on('close', c => { console.log('done', c); app.exit(c); });
});
