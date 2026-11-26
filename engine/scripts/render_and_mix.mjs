import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const rootDir = process.cwd();
const props = JSON.parse(fs.readFileSync(path.join(rootDir, 'engine/public/props.json'), 'utf-8'));
const audioPlan = JSON.parse(fs.readFileSync(path.join(rootDir, 'audio_plan.json'), 'utf-8'));

console.log('Bundling Remotion v9 engine...');
const serveUrl = await bundle({
  entryPoint: path.join(rootDir, 'engine/src/index.jsx'),
  publicDir: path.join(rootDir, 'engine/public'),
});

const composition = await selectComposition({
  serveUrl,
  id: 'MainVideo',
  inputProps: props,
});

console.log('Rendering frames:', composition.durationInFrames, composition.width + 'x' + composition.height);
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: 21,
  pixelFormat: 'yuv420p',
  outputLocation: path.join(rootDir, 'raw_remotion.mp4'),
  inputProps: props,
  concurrency: 2,
});

console.log('Mixing mastered voice + ducked music + SFX...');
const totalSec = Number(audioPlan.total_sec) || composition.durationInFrames / 30;
const fadeOut = Math.max(0.8, totalSec - 1.4);
const args = ['-y', '-i', 'raw_remotion.mp4', '-i', 'voice_master.wav'];
const chains = ['[1:a]volume=1.18,apad[v_aud]'];
const mixIns = ['[v_aud]'];
let inIdx = 2;

if (audioPlan.music_path && fs.existsSync(audioPlan.music_path)) {
  args.push('-stream_loop', '-1', '-i', audioPlan.music_path);
  const mVol = audioPlan.is_long ? 0.08 : 0.11;
  chains.push(`[${inIdx}:a]volume=${mVol},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.4[m_aud]`);
  mixIns.push('[m_aud]');
  inIdx++;
}

const sfxList = (audioPlan.sfx_events || []).slice(0, 14);
for (let i = 0; i < sfxList.length; i++) {
  const ev = sfxList[i];
  if (!ev.path || !fs.existsSync(ev.path)) continue;
  args.push('-i', ev.path);
  const ms = Math.max(0, Number(ev.ms) || 0);
  chains.push(`[${inIdx}:a]volume=0.30,adelay=${ms}|${ms}[sfx${i}]`);
  mixIns.push(`[sfx${i}]`);
  inIdx++;
}

chains.push(`${mixIns.join('')}amix=inputs=${mixIns.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`);
args.push(
  '-filter_complex', chains.join(';'),
  '-map', '0:v',
  '-map', '[aout]',
  '-t', totalSec.toFixed(2),
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '160k',
  '-movflags', '+faststart',
  'output.mp4'
);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('Final output.mp4 ready!');