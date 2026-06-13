import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(projectRoot, 'src-tauri', 'icons');
const publicDir = join(projectRoot, 'public');
const tempDir = join(projectRoot, '.tmp-icons');
const sourceSvgPath = join(iconDir, 'memoji-icon.svg');
const publicSvgPath = join(publicDir, 'memoji-icon.svg');
const basePngPath = join(tempDir, 'memoji-1024.png');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="108" y1="96" x2="900" y2="920" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff1cc"/>
      <stop offset="0.56" stop-color="#ff8aa6"/>
      <stop offset="1" stop-color="#6c4cff"/>
    </linearGradient>
    <linearGradient id="note" x1="278" y1="230" x2="744" y2="770" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fffef8"/>
      <stop offset="1" stop-color="#ffe6ef"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="28" stdDeviation="34" flood-color="#130c25" flood-opacity="0.28"/>
    </filter>
    <filter id="noteShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#221527" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect x="68" y="68" width="888" height="888" rx="210" fill="url(#bg)" filter="url(#softShadow)"/>
  <rect x="158" y="152" width="710" height="710" rx="160" fill="#ffffff" opacity="0.12"/>
  <path d="M178 332c168-68 316-54 444 43 82 62 161 74 236 37v192c-166 79-308 63-428-47-77-72-161-89-252-51V332Z" fill="#ffffff" opacity="0.10"/>

  <g filter="url(#noteShadow)">
    <rect x="282" y="238" width="482" height="548" rx="78" fill="url(#note)" transform="rotate(4 523 512)"/>
    <circle cx="512" cy="252" r="54" fill="#ff4d7a"/>
    <circle cx="512" cy="252" r="22" fill="#8e2548" opacity="0.32"/>
    <path d="M350 596c66-94 126-141 179-141 54 0 105 48 153 145" stroke="#28212d" stroke-width="46" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M350 596V402" stroke="#28212d" stroke-width="46" stroke-linecap="round"/>
    <path d="M682 600V402" stroke="#28212d" stroke-width="46" stroke-linecap="round"/>
    <path d="M382 706h246" stroke="#dfc9d3" stroke-width="28" stroke-linecap="round"/>
  </g>
</svg>
`;

const ensureDir = (path) => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
};

const renderPng = (size, outPath) => {
  ensureDir(dirname(outPath));
  run('sips', ['-z', String(size), String(size), basePngPath, '--out', outPath]);
};

const writeIco = (pngPaths, outPath) => {
  const images = pngPaths.map((path) => ({
    size: Number(path.match(/_(\d+)x\d+\.png$/)?.[1] ?? 32),
    data: readFileSync(path),
  }));
  const headerSize = 6 + images.length * 16;
  let offset = headerSize;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  writeFileSync(outPath, Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]));
};

ensureDir(iconDir);
ensureDir(publicDir);
rmSync(tempDir, { recursive: true, force: true });
ensureDir(tempDir);

writeFileSync(sourceSvgPath, svg);
writeFileSync(publicSvgPath, svg);

run('sips', ['-s', 'format', 'png', sourceSvgPath, '--out', basePngPath]);

const pngTargets = new Map([
  ['32x32.png', 32],
  ['64x64.png', 64],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
  ['icon_16x16.png', 16],
  ['icon_32x32.png', 32],
  ['icon_48x48.png', 48],
  ['icon_128x128.png', 128],
  ['icon_256x256.png', 256],
  ['icon_512x512.png', 512],
  ['icon_1024x1024.png', 1024],
  ['Square30x30Logo.png', 30],
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square89x89Logo.png', 89],
  ['Square107x107Logo.png', 107],
  ['Square142x142Logo.png', 142],
  ['Square150x150Logo.png', 150],
  ['Square284x284Logo.png', 284],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
]);

for (const [name, size] of pngTargets) {
  renderPng(size, join(iconDir, name));
}

const iosTargets = new Map([
  ['AppIcon-20x20@1x.png', 20],
  ['AppIcon-20x20@2x-1.png', 40],
  ['AppIcon-20x20@2x.png', 40],
  ['AppIcon-20x20@3x.png', 60],
  ['AppIcon-29x29@1x.png', 29],
  ['AppIcon-29x29@2x-1.png', 58],
  ['AppIcon-29x29@2x.png', 58],
  ['AppIcon-29x29@3x.png', 87],
  ['AppIcon-40x40@1x.png', 40],
  ['AppIcon-40x40@2x-1.png', 80],
  ['AppIcon-40x40@2x.png', 80],
  ['AppIcon-40x40@3x.png', 120],
  ['AppIcon-60x60@2x.png', 120],
  ['AppIcon-60x60@3x.png', 180],
  ['AppIcon-76x76@1x.png', 76],
  ['AppIcon-76x76@2x.png', 152],
  ['AppIcon-83.5x83.5@2x.png', 167],
  ['AppIcon-512@2x.png', 1024],
]);

for (const [name, size] of iosTargets) {
  renderPng(size, join(iconDir, 'ios', name));
}

const androidTargets = new Map([
  ['mipmap-mdpi/ic_launcher.png', 48],
  ['mipmap-mdpi/ic_launcher_round.png', 48],
  ['mipmap-mdpi/ic_launcher_foreground.png', 108],
  ['mipmap-hdpi/ic_launcher.png', 72],
  ['mipmap-hdpi/ic_launcher_round.png', 72],
  ['mipmap-hdpi/ic_launcher_foreground.png', 162],
  ['mipmap-xhdpi/ic_launcher.png', 96],
  ['mipmap-xhdpi/ic_launcher_round.png', 96],
  ['mipmap-xhdpi/ic_launcher_foreground.png', 216],
  ['mipmap-xxhdpi/ic_launcher.png', 144],
  ['mipmap-xxhdpi/ic_launcher_round.png', 144],
  ['mipmap-xxhdpi/ic_launcher_foreground.png', 324],
  ['mipmap-xxxhdpi/ic_launcher.png', 192],
  ['mipmap-xxxhdpi/ic_launcher_round.png', 192],
  ['mipmap-xxxhdpi/ic_launcher_foreground.png', 432],
]);

for (const [name, size] of androidTargets) {
  renderPng(size, join(iconDir, 'android', name));
}

renderPng(16, join(publicDir, 'favicon-16x16.png'));
renderPng(32, join(publicDir, 'favicon-32x32.png'));
renderPng(180, join(publicDir, 'apple-touch-icon.png'));
renderPng(192, join(publicDir, 'android-chrome-192x192.png'));
renderPng(512, join(publicDir, 'android-chrome-512x512.png'));

const iconsetDir = join(tempDir, 'memoji.iconset');
ensureDir(iconsetDir);
for (const [name, size] of [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]) {
  renderPng(size, join(iconsetDir, name));
}
run('iconutil', ['-c', 'icns', iconsetDir, '-o', join(iconDir, 'icon.icns')]);

const icoSourcePaths = [16, 32, 48, 128, 256].map((size) => join(iconDir, `icon_${size}x${size}.png`));
writeIco(icoSourcePaths, join(iconDir, 'icon.ico'));
writeIco([join(iconDir, 'icon_32x32.png')], join(iconDir, 'favicon'));
writeIco(icoSourcePaths, join(publicDir, 'favicon.ico'));

rmSync(tempDir, { recursive: true, force: true });
console.log('Generated Memoji icon assets.');
