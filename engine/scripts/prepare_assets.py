import os, io, re, json, glob, math, time, base64, random, asyncio, urllib.parse, subprocess, requests
import edge_tts
from PIL import Image, ImageOps, ImageStat

payload = json.loads(base64.b64decode(os.environ['PAYLOAD_B64']).decode('utf-8'))
fmt = payload.get('format', 'smart_ad')
template = payload.get('template', 'StoryAdFlow')
W, H = 1080, 1920
FPS = 30
brand_voice = payload.get('voice_name') or 'en-US-AndrewMultilingualNeural'
gen_scene_url = payload.get('gen_scene_url', '')
qc_scene_url = payload.get('qc_scene_url', '')
cb_token = payload.get('cb_token', '')
pexels_key = (os.environ.get('PEXELS_API_KEY') or '').strip()
job_id = os.environ['JOB_ID']
bp = payload.get('blueprint') or {}
scenes = bp.get('scenes') or []
palette = payload.get('palette') or {}

os.makedirs('assets/sfx', exist_ok=True)
os.makedirs('assets/music', exist_ok=True)
os.makedirs('engine/public/scenes', exist_ok=True)

UA = {'User-Agent': 'ShockRadarIGFactory/18.0 (https://shockradarai.pages.dev)'}

def probe_dur(path, fallback=2.5):
    if not os.path.exists(path) or os.path.getsize(path) < 500:
        return fallback
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], capture_output=True, text=True)
    try:
        return max(0.2, float(p.stdout.strip() or fallback))
    except Exception:
        return fallback

def tts_pronounce_clean(text):
    t = ' '.join(str(text or '').replace('\r', ' ').split())
    t = re.sub(r'\bShockRadar\b', 'Shock Radar', t, flags=re.I)
    t = re.sub(r'\baltcoin(s?)\b', r'alt coin\1', t, flags=re.I)
    t = re.sub(r'\bUSDT\b', 'U S D T', t)
    t = re.sub(r'\b72h\b', '72 hour', t, flags=re.I)
    t = re.sub(r'\b24h\b', '24 hour', t, flags=re.I)
    t = re.sub(r'\bTP1\b', 'Target 1', t)
    t = re.sub(r'\bTP2\b', 'Target 2', t)
    t = re.sub(r'\$(\d+(?:\.\d+)?)M\b', r'\1 million dollars', t)
    t = re.sub(r'\$(\d+(?:\.\d+)?)B\b', r'\1 billion dollars', t)
    return t

async def synth_scene_tts(txt, out_mp3, vname, rate_str):
    try:
        comm = edge_tts.Communicate(txt, vname, rate=rate_str, boundary='WordBoundary')
    except TypeError:
        comm = edge_tts.Communicate(txt, vname, rate=rate_str)
    wlist = []
    with open(out_mp3, 'wb') as out_f:
        async for chunk in comm.stream():
            ct = chunk.get('type')
            if ct == 'audio':
                out_f.write(chunk['data'])
            elif ct == 'WordBoundary':
                s = chunk['offset'] / 10_000_000.0
                d = chunk['duration'] / 10_000_000.0
                w = str(chunk.get('text', '')).strip()
                if w:
                    wlist.append((s, s + max(d, 0.08), w))
    return wlist

# 1. Single Consistent Brand Narrator (Natural Podcast Cadence)
rate_str = '+2%'
concat_list = []
edge_words = []
scene_timings = []
cursor_sec = 0.0
used_voice = brand_voice

for idx, sc in enumerate(scenes):
    raw_nar = ' '.join(str(sc.get('narration', '')).replace('\r', ' ').split()) or 'Watch closely.'
    spoken_nar = tts_pronounce_clean(raw_nar)
    raw_mp3 = f'tts_{idx}.mp3'
    wav_out = f'tts_{idx}.wav'
    w_rel = []
    tts_ok = False
    for cand in [brand_voice, 'en-US-AndrewMultilingualNeural', 'en-US-AndrewNeural']:
        try:
            w_rel = asyncio.run(synth_scene_tts(spoken_nar, raw_mp3, cand, rate_str))
            if os.path.exists(raw_mp3) and os.path.getsize(raw_mp3) > 800:
                tts_ok = True
                used_voice = cand
                break
        except Exception as e:
            print('TTS retry:', cand, e)
    target_d = max(1.5, float(sc.get('target_duration_sec') or 2.8))
    if tts_ok:
        subprocess.run(['ffmpeg', '-y', '-i', raw_mp3, '-ar', '44100', '-ac', '2', wav_out], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', f'{target_d:.2f}', '-i', 'anullsrc=r=44100:cl=stereo', wav_out], check=True)
    seg_dur = probe_dur(wav_out, target_d)
    pause_sec = min(0.45, max(0.0, float(sc.get('pause_after_ms') or 140) / 1000.0))
    if pause_sec > 0.05:
        sil_wav = f'sil_{idx}.wav'
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', f'{pause_sec:.3f}', '-i', 'anullsrc=r=44100:cl=stereo', sil_wav], check=True)
        concat_list.append(wav_out)
        concat_list.append(sil_wav)
    else:
        concat_list.append(wav_out)

    if not w_rel:
        toks = [w for w in raw_nar.split() if w]
        weights = [max(2.0, float(len(re.sub(r'[^a-zA-Z0-9]', '', w))) + (5.0 if any(ch.isdigit() for ch in w) else 0.0)) for w in toks]
        tot_w = max(1.0, sum(weights))
        acc_t = 0.0
        for w, wt in zip(toks, weights):
            dur_w = seg_dur * (wt / tot_w)
            w_rel.append((acc_t, acc_t + dur_w, w))
            acc_t += dur_w
    for (ws, we, wt) in w_rel:
        edge_words.append({'start': cursor_sec + ws, 'end': cursor_sec + we, 'text': wt.strip(), 'sceneIdx': idx})
    st_f = int(round(cursor_sec * FPS))
    en_f = int(round((cursor_sec + seg_dur + pause_sec) * FPS))
    scene_timings.append((st_f, max(st_f + 24, en_f), cursor_sec, cursor_sec + seg_dur + pause_sec))
    cursor_sec += (seg_dur + pause_sec)

with open('voice_concat.txt', 'w') as cf:
    for p in concat_list:
        cf.write(f"file '{os.path.abspath(p)}'\n")
subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', 'voice_concat.txt', '-af', 'highpass=f=75,acompressor=threshold=-18dB:ratio=2.8:attack=5:release=60,loudnorm=I=-14:TP=-1.5:LRA=8', '-ar', '44100', '-ac', '2', 'voice_master.wav'], check=True)
total_sec = max(cursor_sec + 0.30, probe_dur('voice_master.wav', cursor_sec) + 0.25)
total_frames = int(math.ceil(total_sec * FPS))

subtitle_engine = 'edge-word-exact'
all_words = edge_words
if len(edge_words) < 12:
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel('tiny.en', device='cpu', compute_type='int8')
        segments, _ = model.transcribe('voice_master.wav', word_timestamps=True, beam_size=1)
        fw_words = []
        for seg in segments:
            for w in (seg.words or []):
                wt = str(w.word or '').strip()
                if not wt:
                    continue
                ws = max(0.0, float(w.start))
                we = max(ws + 0.08, float(w.end))
                s_idx = 0
                for si, (_, _, t0, t1) in enumerate(scene_timings):
                    if t0 <= ws <= t1:
                        s_idx = si
                        break
                fw_words.append({'start': ws, 'end': we, 'text': wt, 'sceneIdx': s_idx})
        if len(fw_words) >= 8:
            all_words = fw_words
            subtitle_engine = 'faster-whisper-tiny.en'
    except Exception as e:
        print('Faster-Whisper warn:', e)

def valid_audio(path, min_dur=0.12):
    return os.path.exists(path) and os.path.getsize(path) > 2000 and probe_dur(path, 0.0) >= min_dur

def synth_sfx(cue, out_mp3):
    c = cue.lower()
    if any(k in c for k in ('boom', 'impact', 'drop', 'hit', 'thunder', 'slam')):
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.72*sin(2*PI*(88*exp(-5*t)+34)*t)*exp(-3.4*t):s=44100:d=0.80', '-af', 'lowpass=f=280,afade=t=out:st=0.40:d=0.40', '-b:a', '128k', out_mp3], check=True)
    elif any(k in c for k in ('click', 'pop', 'ping', 'radar', 'cash', 'coin', 'alert', 'tick', 'clock')):
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.40*sin(2*PI*1320*t)*exp(-14*t)+0.25*sin(2*PI*1980*t)*exp(-16*t):s=44100:d=0.32', '-b:a', '128k', out_mp3], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', '0.30', '-i', 'anoisesrc=c=pink:r=44100:a=0.30', '-af', 'bandpass=f=640:w=440,afade=t=in:st=0:d=0.10,afade=t=out:st=0.14:d=0.16', '-b:a', '128k', out_mp3], check=True)

sfx_events = []
SFX_STOP = {'a','an','the','sound','effect','effects','sfx','audio','sudden','final','subtle','soft','loud','ominous','hopeful','triumphant','dramatic','very','short'}
for idx, sc in enumerate(scenes):
    raw_cue = str(sc.get('sfx_cue') or 'whoosh').strip()
    if 'silence' in raw_cue.lower() or 'none' in raw_cue.lower():
        continue
    toks = [t for t in re.findall(r'[a-z0-9]+', raw_cue.lower()) if t not in SFX_STOP]
    slug = '_'.join(toks[:2])[:28] or 'whoosh'
    sfx_path = f'assets/sfx/{slug}.mp3'
    if not valid_audio(sfx_path):
        synth_sfx(' '.join(toks[:2]) or 'whoosh', sfx_path)
    sfx_events.append({'ms': int(round(scene_timings[idx][2] * 1000)), 'path': os.path.abspath(sfx_path)})

music_path = ''
m_files = [m for m in glob.glob('music/*.mp3') if valid_audio(m, 8.0)]
if m_files:
    music_path = os.path.abspath(random.choice(m_files))
else:
    subprocess.run([
        'ffmpeg', '-y', '-f', 'lavfi',
        '-i', 'aevalsrc=0.055*sin(2*PI*55.0*t)*(0.65+0.35*sin(2*PI*1.2*t))+0.032*sin(2*PI*82.4*t)*(0.5+0.5*sin(2*PI*0.35*t))+0.018*sin(2*PI*110.0*t)*exp(-2*mod(t,1.0)):s=44100:d=36',
        '-af', 'lowpass=f=220,aecho=0.6:0.7:180:0.25',
        'dark_pulse_bed.wav'
    ], check=True)
    music_path = os.path.abspath('dark_pulse_bed.wav')

source_stats = {}
gate2_scores = []
gate2_retries = 0
images_needed = 0
images_ok = 0
remotion_scenes = []

def image_has_detail(im):
    try:
        st = ImageStat.Stat(im.convert('RGB'))
        avg_std = sum(st.stddev) / 3.0
        return avg_std >= 18.0
    except Exception:
        return True

def gen_and_qc_image(idx, sc):
    global gate2_retries
    prompt = str(sc.get('visual_spec') or sc.get('narration') or '').strip()
    out_rel = f'scenes/scene_{idx}.jpg'
    out_abs = os.path.join('engine/public', out_rel)
    best_score = -1.0
    best_bytes = None

    for attempt in range(3):
        try:
            r = requests.post(
                gen_scene_url,
                headers={'x-cb-token': cb_token},
                json={'prompt': prompt, 'job_id': job_id, 'aspect': '9:16', 'template': template, 'format': fmt},
                timeout=55,
            )
            if not (r.ok and r.headers.get('content-type', '').startswith('image/') and len(r.content) > 8000):
                print(f'Scene {idx} gen HTTP {r.status_code}: {r.text[:140]}')
                continue
            im = ImageOps.fit(Image.open(io.BytesIO(r.content)).convert('RGB'), (W, H), method=Image.Resampling.LANCZOS)
            if not image_has_detail(im) and attempt < 2:
                print(f'Scene {idx} flat/empty visual rejected locally, regenerating...')
                prompt = f'Dark cinematic moody close-up scene illustrating: {sc.get("narration", "")}, high detail editorial photography, zero text'
                gate2_retries += 1
                continue

            buf_full = io.BytesIO()
            im.save(buf_full, 'JPEG', quality=92)
            full_bytes = buf_full.getvalue()

            src = r.headers.get('x-img-source', 'AI-IMG')
            source_stats[src] = source_stats.get(src, 0) + 1

            score = 8.0
            passed = True
            fixed = ''
            if qc_scene_url:
                if idx > 0 or attempt > 0:
                    time.sleep(1.5)
                thumb = im.copy()
                thumb.thumbnail((512, 512))
                tbuf = io.BytesIO()
                thumb.save(tbuf, 'JPEG', quality=78)
                qc = requests.post(
                    qc_scene_url,
                    headers={'x-cb-token': cb_token},
                    json={'job_id': job_id, 'image_b64': base64.b64encode(tbuf.getvalue()).decode(), 'mime': 'image/jpeg', 'narration': sc.get('narration', ''), 'visual_spec': prompt},
                    timeout=40,
                ).json()
                score = float(qc.get('score', 8.0))
                passed = bool(qc.get('pass', True)) and score >= 7.6
                fixed = str(qc.get('fixed_prompt') or '').strip()
                print(f'Scene {idx} attempt {attempt+1} Gate2={score} pass={passed} via={qc.get("provider","?")}')

            if score > best_score:
                best_score = score
                best_bytes = full_bytes

            if passed:
                break
            if fixed:
                prompt = fixed
            else:
                prompt = f'Realistic dark cinematic scene of: {sc.get("narration", "")}, dramatic lighting, crisp focal subject, strictly zero text or words'
            gate2_retries += 1
        except Exception as e:
            print(f'Scene {idx} visual warn:', e)

    if best_bytes:
        with open(out_abs, 'wb') as f:
            f.write(best_bytes)
        gate2_scores.append(best_score if best_score > 0 else 8.0)
        return out_rel
    return ''

for idx, sc in enumerate(scenes):
    comp = str(sc.get('visual_component') or 'visual_metaphor')
    need_img = (comp in ('visual_metaphor', 'comic_panel')) and bool(gen_scene_url)
    img_rel = ''
    if need_img:
        images_needed += 1
        img_rel = gen_and_qc_image(idx, sc)
        if img_rel:
            images_ok += 1
    st_f, en_f, _, _ = scene_timings[idx]
    remotion_scenes.append({**sc, 'startFrame': st_f, 'endFrame': en_f, 'imageFile': img_rel})

if remotion_scenes:
    remotion_scenes[-1]['endFrame'] = total_frames

if images_needed >= 2 and images_ok == 0:
    raise RuntimeError('VISUAL_GEN_FAILED: 0/' + str(images_needed) + ' images generated!')

remotion_words = [{'startFrame': int(round(w['start'] * FPS)), 'endFrame': max(int(round(w['start'] * FPS)) + 3, int(round(w['end'] * FPS))), 'text': w['text'], 'sceneIdx': w.get('sceneIdx', 0)} for w in all_words]
props = {
    'width': W,
    'height': H,
    'fps': FPS,
    'durationInFrames': total_frames,
    'format': fmt,
    'template': template,
    'palette': palette,
    'brandName': payload.get('brand_name', 'ShockRadar AI'),
    'siteHost': payload.get('site_host', 'shockradarai.pages.dev'),
    'autoDmKeyword': payload.get('auto_dm_keyword', '1'),
    'tradeProof': payload.get('pnl_meta'),
    'scenes': remotion_scenes,
    'words': remotion_words,
}
json.dump(props, open('engine/public/props.json', 'w', encoding='utf-8'))
avg_g2 = round(sum(gate2_scores) / len(gate2_scores), 2) if gate2_scores else 10.0
audio_plan = {'total_sec': total_sec, 'music_path': music_path, 'sfx_events': sfx_events}
json.dump(audio_plan, open('audio_plan.json', 'w', encoding='utf-8'))
json.dump({
    'sources': source_stats,
    'voice': used_voice,
    'subtitle_engine': subtitle_engine,
    'gate2_score': avg_g2,
    'gate2_retries': gate2_retries,
    'images_ok': images_ok,
    'images_needed': images_needed,
}, open('render_meta.json', 'w', encoding='utf-8'))
print('Assets v18 ready! Voice:', used_voice, 'Frames:', total_frames, 'Subs:', subtitle_engine, 'Imgs:', images_ok, '/', images_needed, 'Gate2:', avg_g2)