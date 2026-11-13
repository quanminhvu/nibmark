// Run with: npx electron scripts/render-brand.cjs
// Render the editable SVG sources using Chromium, then create macOS ICNS with iconutil.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Pixel sizes must not depend on the host display's Retina/HiDPI scale.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1024, transparent: true, frame: false, webPreferences: { offscreen: true } });
  async function render(file, width, height) {
    win.setContentSize(width, height);
    const svg = fs.readFileSync(path.join(root, file), 'utf8');
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
    return (await win.webContents.capturePage()).toPNG();
  }
  const icon = await render('assets/icon/nibmark-icon.svg', 1024, 1024);
  for (const file of ['assets/icon/nibmark-icon-1024.png', 'build/icon.png', 'resources/icon.png']) fs.writeFileSync(path.join(root, file), icon);
  fs.writeFileSync(path.join(root, 'assets/icon/nibmark-logo-horizontal.png'), await render('assets/icon/nibmark-logo-horizontal.svg', 1500, 420));
  if (process.platform === 'darwin') {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nibmark-brand-'));
    const iconset = path.join(temp, 'Nibmark.iconset');
    fs.mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        fs.writeFileSync(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`), await render('assets/icon/nibmark-icon.svg', size * scale, size * scale));
      }
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build/icon.icns')]);
    fs.rmSync(temp, {recursive: true, force: true});
  }
  win.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
