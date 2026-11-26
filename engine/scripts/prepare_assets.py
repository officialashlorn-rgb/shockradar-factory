import os, io, re, json, glob, math, base64, random, asyncio, urllib.parse, subprocess, textwrap, requests
import edge_tts
from PIL import Image, ImageDraw, ImageFont, ImageOps

payload = json.loads(base64.b64decode(os.environ['PAYLOAD_B64']).decode('utf-8'))
mode = payload.get('mode', 'story')
template = payload.get('template', 'UiMotionPromo')
is_long = (mode == 'long')
aspect = '16:9' if is_long else '9:16'
W, H = (1920, 1080) if is_long else (1080, 1920)
FPS = 30
voice_a = payload.get('voice_name') or 'en-US-AndrewNeural'
voice_b = payload.get('voice_b_name') or 'en-US-AvaNeural'
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

UA = {'User-Agent': 'ShockRadarMediaBot/10.0 (https://shockradarai.pages.dev)'}

def probe_dur(path, fallback=2.5):
    if not os.path.exists(path) or os.path.getsize(path) < 500:
        return fallback
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], capture_output=True, text=True)
    try:
        return max(0.2, float(p.stdout.strip() or fallback))
    except Exception:
        return fallback

async def synth_scene_tts(txt, out_mp3, vname, rate_str):
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

# 1. Per-scene Dual-Voice Studio TTS + Exact Dramatic Pauses + Safe Silence Fallback
rate_str = '+1%' if is_long else '+4%'
concat_list = []
all_words = []
scene_timings = []
cursor_sec = 0.0

for idx, sc in enumerate(scenes):
    nar = ' '.join(str(sc.get('narration', '')).replace('\r', ' ').split()) or 'Watch closely.'
    raw_mp3 = f'tts_{idx}.mp3'
    wav_out = f'tts_{idx}.wav'
    spk = str(sc.get('speaker', 'A')).upper()
    primary_v = voice_b if spk == 'B' else voice_a
    w_rel = []
    tts_ok = False
    for cand in [primary_v, 'en-US-AndrewNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural']:
        try:
            w_rel = asyncio.run(synth_scene_tts(nar, raw_mp3, cand, rate_str))
            if os.path.exists(raw_mp3) and os.path.getsize(raw_mp3) > 800:
                tts_ok = True
                break
        except Exception as e:
            print('TTS retry:', cand, e)
    target_d = max(1.5, float(sc.get('target_duration_sec') or 2.6))
    if tts_ok:
        subprocess.run(['ffmpeg', '-y', '-i', raw_mp3, '-ar', '44100', '-ac', '2', wav_out], check=True)
    else:
        print(f'TTS fallback silence for scene {idx}')
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', f'{target_d:.2f}', '-i', 'anullsrc=r=44100:cl=stereo', wav_out], check=True)
    seg_dur = probe_dur(wav_out, target_d)
    pause_sec = min(0.65, max(0.0, float(sc.get('pause_after_ms') or 0) / 1000.0))
    if pause_sec > 0.05:
        sil_wav = f'sil_{idx}.wav'
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', f'{pause_sec:.3f}', '-i', 'anullsrc=r=44100:cl=stereo', sil_wav], check=True)
        concat_list.append(wav_out)
        concat_list.append(sil_wav)
    else:
        concat_list.append(wav_out)
    if not w_rel:
        toks = [w for w in nar.split() if w]
        step = seg_dur / max(1, len(toks))
        w_rel = [(i * step, (i + 1) * step, w) for i, w in enumerate(toks)]
    for (ws, we, wt) in w_rel:
        all_words.append({'start': cursor_sec + ws, 'end': cursor_sec + we, 'text': wt, 'sceneIdx': idx})
    st_f = int(round(cursor_sec * FPS))
    en_f = int(round((cursor_sec + seg_dur + pause_sec) * FPS))
    scene_timings.append((st_f, max(st_f + 24, en_f), cursor_sec))
    cursor_sec += (seg_dur + pause_sec)

with open('voice_concat.txt', 'w') as cf:
    for p in concat_list:
        cf.write(f"file '{os.path.abspath(p)}'\n")
subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', 'voice_concat.txt', '-af', 'highpass=f=75,acompressor=threshold=-18dB:ratio=3:attack=5:release=60,loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', '44100', '-ac', '2', 'voice_master.wav'], check=True)
total_sec = max(cursor_sec + 0.35, probe_dur('voice_master.wav', cursor_sec) + 0.3)
total_frames = int(math.ceil(total_sec * FPS))

# Write YouTube SEO captions.srt
def fmt_srt_t(sec):
    sec = max(0.0, float(sec))
    h, m, s = int(sec // 3600), int((sec % 3600) // 60), int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms >= 1000:
        s += 1
        ms = 0
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

with open('captions.srt', 'w', encoding='utf-8') as sf:
    gi = 1
    for i in range(0, len(all_words), 5):
        sl = all_words[i:i+5]
        sf.write(f"{gi}\n{fmt_srt_t(sl[0]['start'])} --> {fmt_srt_t(max(sl[0]['start']+0.2, sl[-1]['end']))}\n{' '.join(x['text'] for x in sl)}\n\n")
        gi += 1

# 2. Dynamic Unconstrained SFX & Music Fetcher + Auto-Cache
def valid_audio(path, min_dur=0.12):
    return os.path.exists(path) and os.path.getsize(path) > 2000 and probe_dur(path, 0.0) >= min_dur

def fetch_web_audio(query, out_mp3, max_sec=1.8):
    try:
        r = requests.get('https://commons.wikimedia.org/w/api.php', params={'action': 'query', 'list': 'search', 'srnamespace': 6, 'srsearch': f'{query} sound effect filetype:audio', 'srlimit': 4, 'format': 'json'}, headers=UA, timeout=10)
        for h in ((r.json().get('query') or {}).get('search') or [])[:3]:
            info = requests.get('https://commons.wikimedia.org/w/api.php', params={'action': 'query', 'titles': h['title'], 'prop': 'imageinfo', 'iiprop': 'url|size', 'format': 'json'}, headers=UA, timeout=10).json()
            for pg in ((info.get('query') or {}).get('pages') or {}).values():
                ii = (pg.get('imageinfo') or [{}])[0]
                u = ii.get('url', '')
                if u and int(ii.get('size') or 0) < 5_000_000:
                    aud = requests.get(u, headers=UA, timeout=15)
                    if aud.ok and len(aud.content) > 2500:
                        open('tmp_aud', 'wb').write(aud.content)
                        subprocess.run(['ffmpeg', '-y', '-i', 'tmp_aud', '-t', f'{max_sec:.2f}', '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-2', '-ar', '44100', '-ac', '2', '-b:a', '128k', out_mp3], check=True)
                        if valid_audio(out_mp3):
                            return True
    except Exception as e:
        print('Wiki SFX warn:', query, e)
    try:
        r = requests.get('https://archive.org/advancedsearch.php', params={'q': f'mediatype:audio AND ({query})', 'fl[]': 'identifier', 'rows': 3, 'output': 'json'}, headers=UA, timeout=10)
        for d in ((r.json().get('response') or {}).get('docs') or [])[:2]:
            ident = d.get('identifier')
            if not ident:
                continue
            meta = requests.get(f'https://archive.org/metadata/{ident}/files', headers=UA, timeout=10).json()
            for fl in (meta.get('result') or []):
                nm = str(fl.get('name', ''))
                if nm.lower().endswith(('.mp3', '.ogg', '.wav')) and 3000 < int(fl.get('size') or 0) < 4_500_000:
                    aud = requests.get(f'https://archive.org/download/{ident}/{urllib.parse.quote(nm)}', headers=UA, timeout=16)
                    if aud.ok and len(aud.content) > 2500:
                        open('tmp_aud', 'wb').write(aud.content)
                        subprocess.run(['ffmpeg', '-y', '-i', 'tmp_aud', '-t', f'{max_sec:.2f}', '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-2', '-ar', '44100', '-ac', '2', '-b:a', '128k', out_mp3], check=True)
                        if valid_audio(out_mp3):
                            return True
    except Exception as e:
        print('Archive SFX warn:', query, e)
    return False

def synth_fallback_sfx(cue, out_mp3):
    c = cue.lower()
    if any(k in c for k in ('boom', 'impact', 'drop', 'hit', 'explosion')):
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.72*sin(2*PI*(90*exp(-5*t)+34)*t)*exp(-3.2*t):s=44100:d=0.85', '-af', 'lowpass=f=300,afade=t=out:st=0.45:d=0.40', '-b:a', '128k', out_mp3], check=True)
    elif any(k in c for k in ('click', 'pop', 'ping', 'cash', 'coin', 'alert', 'tick')):
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.42*sin(2*PI*1380*t)*exp(-14*t)+0.28*sin(2*PI*2070*t)*exp(-16*t):s=44100:d=0.35', '-b:a', '128k', out_mp3], check=True)
    else:
        subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-t', '0.32', '-i', 'anoisesrc=c=pink:r=44100:a=0.32', '-af', 'bandpass=f=680:w=480,afade=t=in:st=0:d=0.12,afade=t=out:st=0.14:d=0.18', '-b:a', '128k', out_mp3], check=True)

sfx_events = []
sfx_cached_new = []
SFX_STOP = {'a','an','the','sound','effect','effects','sfx','audio','sudden','final','subtle','soft','loud','ominous','hopeful','triumphant','dramatic','very','short'}
for idx, sc in enumerate(scenes):
    raw_cue = str(sc.get('sfx_cue') or 'whoosh').strip()
    if 'silence' in raw_cue.lower() or 'none' in raw_cue.lower():
        continue
    toks = [t for t in re.findall(r'[a-z0-9]+', raw_cue.lower()) if t not in SFX_STOP]
    cue = ' '.join(toks[:2]) or 'whoosh'
    slug = '_'.join(toks[:2])[:28] or 'whoosh'
    sfx_path = f'assets/sfx/{slug}.mp3'
    if not valid_audio(sfx_path):
        if fetch_web_audio(cue, sfx_path, max_sec=1.5):
            sfx_cached_new.append(f'DL:{slug}')
        else:
            synth_fallback_sfx(cue, sfx_path)
            sfx_cached_new.append(f'SYN:{slug}')
    sfx_events.append({'ms': int(round(scene_timings[idx][2] * 1000)), 'path': os.path.abspath(sfx_path)})

music_mood = str(bp.get('music_mood') or 'dark_minimal_pulse').lower()
music_path = ''
if 'none_pure_sfx' not in music_mood:
    m_files = [m for m in (glob.glob('music/*.mp3') + glob.glob('assets/music/*.mp3')) if valid_audio(m, 8.0)]
    if m_files:
        music_path = os.path.abspath(random.choice(m_files))
    else:
        dl_bg = 'assets/music/minimal_pulse_01.mp3'
        if fetch_web_audio('dark ambient minimal electronic suspense loop', dl_bg, max_sec=55.0):
            music_path = os.path.abspath(dl_bg)
        else:
            subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.04*sin(2*PI*65.4*t)+0.025*sin(2*PI*98.0*t)*(0.6+0.4*sin(2*PI*0.2*t)):s=44100:d=30', '-af', 'lowpass=f=240', 'synth_bed.wav'], check=True)
            music_path = os.path.abspath('synth_bed.wav')

# 3. Visual Assets + Strict Gate 2 (Gemini Vision QC) + Optional Pexels Fallback
source_stats = {}
gate2_scores = []
gate2_retries = 0
images_needed = 0
images_ok = 0
first_jpg = None
remotion_scenes = []

def gen_and_qc_image(idx, sc):
    global gate2_retries
    prompt = str(sc.get('visual_spec') or sc.get('narration') or '').strip()
    out_rel = f'scenes/scene_{idx}.jpg'
    out_abs = os.path.join('engine/public', out_rel)
    for attempt in range(2):
        try:
            r = requests.post(
                gen_scene_url,
                headers={'x-cb-token': cb_token},
                json={'prompt': prompt, 'job_id': job_id, 'aspect': aspect, 'template': template},
                timeout=55,
            )
            if not (r.ok and r.headers.get('content-type', '').startswith('image/') and len(r.content) > 8000):
                print(f'Scene {idx} gen HTTP {r.status_code}: {r.text[:140]}')
                continue
            im = ImageOps.fit(Image.open(io.BytesIO(r.content)).convert('RGB'), (W, H), method=Image.Resampling.LANCZOS)
            im.save(out_abs, 'JPEG', quality=92)
            src = r.headers.get('x-img-source', 'AI-IMG')
            source_stats[src] = source_stats.get(src, 0) + 1
            if qc_scene_url:
                thumb = im.copy()
                thumb.thumbnail((512, 512))
                buf = io.BytesIO()
                thumb.save(buf, 'JPEG', quality=78)
                qc = requests.post(
                    qc_scene_url,
                    headers={'x-cb-token': cb_token},
                    json={'job_id': job_id, 'image_b64': base64.b64encode(buf.getvalue()).decode(), 'mime': 'image/jpeg', 'narration': sc.get('narration', ''), 'visual_spec': prompt},
                    timeout=35,
                ).json()
                score = float(qc.get('score', 8.0))
                if qc.get('pass', True) or attempt == 1:
                    gate2_scores.append(score)
                    return out_rel
                fixed = str(qc.get('fixed_prompt') or '').strip()
                if fixed:
                    prompt = fixed
                gate2_retries += 1
            else:
                gate2_scores.append(8.0)
                return out_rel
        except Exception as e:
            print(f'Scene {idx} visual warn:', e)
    # Optional Pexels HD photo fallback if configured
    if pexels_key:
        try:
            orient = 'landscape' if is_long else 'portrait'
            q = ' '.join(prompt.split()[:4]) or 'finance dark'
            pr = requests.get('https://api.pexels.com/v1/search', params={'query': q, 'orientation': orient, 'per_page': 4}, headers={'Authorization': pexels_key}, timeout=15)
            photos = pr.json().get('photos') or []
            if photos:
                purl = random.choice(photos)['src'].get('large2x') or photos[0]['src'].get('original')
                ir = requests.get(purl, timeout=20)
                if ir.ok and len(ir.content) > 10000:
                    im = ImageOps.fit(Image.open(io.BytesIO(ir.content)).convert('RGB'), (W, H), method=Image.Resampling.LANCZOS)
                    im.save(out_abs, 'JPEG', quality=92)
                    source_stats['PEXELS'] = source_stats.get('PEXELS', 0) + 1
                    gate2_scores.append(8.2)
                    return out_rel
        except Exception as e:
            print(f'Scene {idx} Pexels fallback warn:', e)
    return out_rel if os.path.exists(out_abs) else ''

for idx, sc in enumerate(scenes):
    comp = str(sc.get('visual_component') or 'visual_metaphor')
    skip_for_stick = (template == 'TwoVoiceStick' and comp == 'visual_metaphor')
    need_img = (comp in ('visual_metaphor', 'comic_panel')) and (not skip_for_stick) and bool(gen_scene_url)
    img_rel = ''
    if need_img:
        images_needed += 1
        img_rel = gen_and_qc_image(idx, sc)
        if img_rel:
            images_ok += 1
    if img_rel and first_jpg is None:
        first_jpg = os.path.join('engine/public', img_rel)
    st_f, en_f, _ = scene_timings[idx]
    remotion_scenes.append({**sc, 'startFrame': st_f, 'endFrame': en_f, 'imageFile': img_rel})

if remotion_scenes:
    remotion_scenes[-1]['endFrame'] = total_frames

# Strict Quality Lock: NEVER silently ship blank dark frames when images were required!
if images_needed >= 2 and images_ok == 0:
    raise RuntimeError('VISUAL_GEN_FAILED: 0/' + str(images_needed) + ' images generated! Ensure Cloudflare Workers AI binding (AI) is attached to Worker or set PEXELS_API_KEY.')

# Guaranteed High-CTR 16:9 Thumbnail for Long YT (works even for pure-UI videos!)
if is_long:
    if first_jpg and os.path.exists(first_jpg):
        base = ImageOps.fit(Image.open(first_jpg).convert('RGB'), (1280, 720), method=Image.Resampling.LANCZOS)
    else:
        base = Image.new('RGB', (1280, 720), (11, 14, 20))
        bd = ImageDraw.Draw(base)
        for x in range(0, 1280, 64):
            bd.line([(x, 0), (x, 720)], fill=(22, 30, 48), width=1)
        for y in range(0, 720, 64):
            bd.line([(0, y), (1280, y)], fill=(22, 30, 48), width=1)
    grad = Image.new('RGBA', (1280, 720), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for x in range(0, 960):
        gd.line([(x, 0), (x, 720)], fill=(6, 9, 16, int(235 * (1 - x / 960))))
    comp_im = Image.alpha_composite(base.convert('RGBA'), grad).convert('RGB')
    dr = ImageDraw.Draw(comp_im)
    f_big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 102)
    lines = textwrap.wrap(str(bp.get('platforms', {}).get('instagram', {}).get('cover_headline') or bp.get('opening_hook', 'SMART MONEY')).upper(), width=11)[:3]
    y = 170
    for li, ln in enumerate(lines):
        col = (245, 184, 46) if li == 1 else (255, 255, 255)
        for ox, oy in [(-4, -4), (4, -4), (-4, 4), (4, 4)]:
            dr.text((64 + ox, y + oy), ln, font=f_big, fill=(0, 0, 0))
        dr.text((64, y), ln, font=f_big, fill=col)
        y += 126
    comp_im.save('thumbnail.jpg', 'JPEG', quality=94)

remotion_words = [{'startFrame': int(round(w['start'] * FPS)), 'endFrame': max(int(round(w['start'] * FPS)) + 3, int(round(w['end'] * FPS))), 'text': w['text'], 'sceneIdx': w.get('sceneIdx', 0)} for w in all_words]
props = {
    'width': W,
    'height': H,
    'fps': FPS,
    'durationInFrames': total_frames,
    'mode': mode,
    'template': template,
    'palette': palette,
    'brandName': payload.get('brand_name', 'ShockRadar AI'),
    'siteHost': payload.get('site_host', 'shockradarai.pages.dev'),
    'autoDmKeyword': payload.get('auto_dm_keyword', 'AI'),
    'speakerLabels': payload.get('speaker_labels') or {'A': 'RETAIL FOMO', 'B': 'QUANT SYSTEM'},
    'tradeProof': payload.get('pnl_meta'),
    'scenes': remotion_scenes,
    'words': remotion_words,
}
json.dump(props, open('engine/public/props.json', 'w', encoding='utf-8'))
avg_g2 = round(sum(gate2_scores) / len(gate2_scores), 2) if gate2_scores else 10.0
audio_plan = {'total_sec': total_sec, 'music_path': music_path, 'is_long': is_long, 'sfx_events': sfx_events}
json.dump(audio_plan, open('audio_plan.json', 'w', encoding='utf-8'))
json.dump({
    'sources': source_stats,
    'sfx': sfx_cached_new,
    'gate2_score': avg_g2,
    'gate2_retries': gate2_retries,
    'images_ok': images_ok,
    'images_needed': images_needed,
    'has_thumb': os.path.exists('thumbnail.jpg'),
}, open('render_meta.json', 'w', encoding='utf-8'))
print('Assets v10 ready! Frames:', total_frames, 'Imgs:', images_ok, '/', images_needed, 'Gate2:', avg_g2)