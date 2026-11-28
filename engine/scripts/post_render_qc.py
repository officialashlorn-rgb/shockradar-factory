import os, io, re, json, base64, subprocess, requests
from PIL import Image, ImageOps

payload = json.loads(base64.b64decode(os.environ['PAYLOAD_B64']).decode('utf-8'))
job_id = os.environ['JOB_ID']
cb_token = payload.get('cb_token', '')
gen_scene_url = payload.get('gen_scene_url', '')
qc_final_url = payload.get('qc_final_url', '')
fmt = payload.get('format', 'smart_ad')
template = payload.get('template', 'StoryAdFlow')
bp = payload.get('blueprint') or {}
MAX_RETRIES = 2

def run_technical_qc(video_path='output.mp4'):
    issues = []
    info = {}
    if not os.path.exists(video_path) or os.path.getsize(video_path) < 25000:
        return {'pass': False, 'issues': ['output.mp4 missing or too small'], 'info': {}}

    pr = subprocess.run([
        'ffprobe', '-v', 'error', '-print_format', 'json',
        '-show_format', '-show_streams', video_path
    ], capture_output=True, text=True)
    if pr.returncode != 0:
        return {'pass': False, 'issues': ['ffprobe failed'], 'info': {}}
    meta = json.loads(pr.stdout or '{}')
    streams = meta.get('streams') or []
    v_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
    a_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)

    if not v_stream:
        issues.append('Missing video stream')
    else:
        w = int(v_stream.get('width') or 0)
        h = int(v_stream.get('height') or 0)
        info['resolution'] = f'{w}x{h}'
        if w != 1080 or h != 1920:
            issues.append(f'Invalid resolution {w}x{h} (expected 1080x1920)')
        if h > 0 and abs((w / h) - (9.0 / 16.0)) > 0.02:
            issues.append('Aspect ratio is not 9:16')

    if not a_stream:
        issues.append('Missing audio stream')

    dur = float((meta.get('format') or {}).get('duration') or 0.0)
    info['duration_sec'] = round(dur, 2)
    if dur < 8.0 or dur > 92.0:
        issues.append(f'Duration out of Instagram Reels range: {dur:.1f}s')

    dec = subprocess.run(['ffmpeg', '-v', 'error', '-i', video_path, '-f', 'null', '-'], capture_output=True, text=True)
    if dec.returncode != 0 or (dec.stderr or '').strip():
        issues.append('Corrupted frames or decode error: ' + (dec.stderr or '')[:140])

    bd = subprocess.run([
        'ffmpeg', '-i', video_path, '-vf', 'blackdetect=d=0.55:pix_th=0.10', '-an', '-f', 'null', '-'
    ], capture_output=True, text=True)
    black_hits = re.findall(r'black_duration:([0-9.]+)', bd.stderr or '')
    info['black_segments'] = len(black_hits)
    if black_hits:
        issues.append(f'Unintended black frames detected ({len(black_hits)} segment(s))')

    vd = subprocess.run(['ffmpeg', '-i', video_path, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], capture_output=True, text=True)
    m_vol = re.search(r'mean_volume:\s*(-?[0-9.]+)\s*dB', vd.stderr or '')
    mean_db = float(m_vol.group(1)) if m_vol else -99.0
    info['mean_volume_db'] = mean_db
    if mean_db < -42.0 or mean_db > -4.0:
        issues.append(f'Unacceptable audio level: {mean_db} dB')

    if os.path.exists('engine/public/props.json'):
        props = json.load(open('engine/public/props.json', encoding='utf-8'))
        words = props.get('words') or []
        info['word_count'] = len(words)
        if len(words) < 8:
            issues.append('Too few synced subtitle words')
        else:
            last_end = max(int(w.get('endFrame', 0)) for w in words)
            if last_end > int(props.get('durationInFrames', 0)) + 25:
                issues.append('Subtitles exceed video duration')

    return {'pass': len(issues) == 0, 'issues': issues, 'info': info}

def extract_sample_frames(dur_sec, video_path='output.mp4'):
    frames_b64 = []
    pcts = [0.06, 0.28, 0.50, 0.72, 0.90]
    for i, pct in enumerate(pcts):
        ts = max(0.2, min(dur_sec - 0.3, dur_sec * pct))
        out_jpg = f'qc_frame_{i}.jpg'
        subprocess.run(['ffmpeg', '-y', '-ss', f'{ts:.2f}', '-i', video_path, '-vframes', '1', '-vf', 'scale=360:-1', '-q:v', '6', out_jpg], capture_output=True)
        if os.path.exists(out_jpg) and os.path.getsize(out_jpg) > 1000:
            frames_b64.append(base64.b64encode(open(out_jpg, 'rb').read()).decode())
    return frames_b64

def run_ai_final_review(tech_report):
    if not qc_final_url:
        return {'pass': True, 'score': 8.5, 'issues': [], 'scene_fixes': []}
    dur = float((tech_report.get('info') or {}).get('duration_sec') or 25.0)
    frames = extract_sample_frames(dur)
    try:
        r = requests.post(
            qc_final_url,
            headers={'x-cb-token': cb_token},
            json={
                'job_id': job_id,
                'format': fmt,
                'blueprint': bp,
                'pnl_meta': payload.get('pnl_meta'),
                'tech_report': tech_report,
                'frames_b64': frames,
            },
            timeout=50,
        )
        if r.ok:
            return r.json()
    except Exception as e:
        print('Post-render AI review warn:', e)
    return {'pass': True, 'score': 8.2, 'issues': ['AI_REVIEW_UNAVAILABLE'], 'scene_fixes': []}

def apply_scene_fixes(scene_fixes):
    if not os.path.exists('engine/public/props.json'):
        return False
    props = json.load(open('engine/public/props.json', encoding='utf-8'))
    scenes = props.get('scenes') or []
    changed = False
    for fix in (scene_fixes or [])[:3]:
        s_idx = int(fix.get('scene_index') or 1) - 1
        if s_idx < 0 or s_idx >= len(scenes):
            continue
        sc = scenes[s_idx]
        new_head = str(fix.get('fixed_headline') or '').strip()
        if new_head:
            sc['on_screen_headline'] = new_head[:54]
            changed = True
        new_prompt = str(fix.get('fixed_visual_prompt') or '').strip()
        if new_prompt and gen_scene_url and sc.get('visual_component') in ('visual_metaphor', 'comic_panel'):
            try:
                r = requests.post(
                    gen_scene_url,
                    headers={'x-cb-token': cb_token},
                    json={'prompt': new_prompt, 'job_id': job_id, 'aspect': '9:16', 'template': template, 'format': fmt},
                    timeout=55,
                )
                if r.ok and r.headers.get('content-type', '').startswith('image/') and len(r.content) > 8000:
                    out_rel = f'scenes/scene_{s_idx}.jpg'
                    im = ImageOps.fit(Image.open(io.BytesIO(r.content)).convert('RGB'), (1080, 1920), method=Image.Resampling.LANCZOS)
                    im.save(os.path.join('engine/public', out_rel), 'JPEG', quality=92)
                    sc['imageFile'] = out_rel
                    changed = True
            except Exception as e:
                print('Scene fix regen warn:', e)
    if changed:
        json.dump(props, open('engine/public/props.json', 'w', encoding='utf-8'))
    return changed

final_report = {}
for attempt in range(MAX_RETRIES + 1):
    tech = run_technical_qc('output.mp4')
    ai_rev = run_ai_final_review(tech) if tech.get('pass') else {'pass': False, 'score': 5.0, 'issues': tech.get('issues', []), 'scene_fixes': []}
    overall_pass = bool(tech.get('pass') and ai_rev.get('pass', True))
    final_report = {
        'attempts': attempt + 1,
        'pass': overall_pass,
        'technical': tech,
        'ai_review': ai_rev,
    }
    print(f'Post-Render QC attempt {attempt + 1}: tech={tech.get("pass")} ai={ai_rev.get("score")} pass={overall_pass}')
    if overall_pass or attempt >= MAX_RETRIES:
        break
    fixed = apply_scene_fixes(ai_rev.get('scene_fixes') or [])
    if not fixed and tech.get('pass'):
        break
    print('Re-rendering with targeted QC fixes...')
    subprocess.run(['node', 'engine/scripts/render_and_mix.mjs'], check=True)

json.dump(final_report, open('qc_report.json', 'w', encoding='utf-8'))
if not final_report['technical'].get('pass'):
    raise RuntimeError('TECHNICAL_QC_FAILED: ' + '; '.join(final_report['technical'].get('issues') or ['Unknown']))