import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT_SANS = 'DejaVu Sans, Inter, system-ui, sans-serif';
const FONT_SERIF = 'DejaVu Serif, Georgia, serif';
const FONT_MONO = 'DejaVu Sans Mono, monospace';

const DustParticles = ({ accent }) => {
  const frame = useCurrentFrame();
  const dots = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 197 + 43) % 100,
    yBase: (i * 83 + 19) % 100,
    size: 3 + (i % 4) * 2,
    speed: 0.04 + (i % 5) * 0.015,
    op: 0.1 + (i % 3) * 0.07,
  }));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map((d, idx) => {
        const y = (d.yBase - frame * d.speed + 120) % 120 - 10;
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: d.x + '%',
              top: y + '%',
              width: d.size,
              height: d.size,
              borderRadius: '50%',
              backgroundColor: idx % 4 === 0 ? accent : '#FFFFFF',
              opacity: d.op,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const TopStepper = ({ currentIdx, total, accent }) => {
  if (total < 3) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 96,
        left: 72,
        right: 72,
        display: 'flex',
        gap: 10,
        zIndex: 30,
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const active = i <= currentIdx;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 99,
              backgroundColor: active ? accent : 'rgba(255,255,255,0.16)',
            }}
          />
        );
      })}
    </div>
  );
};

const HighlightedHeadline = ({ text, accentWord, accent, size = 76 }) => {
  if (!text) return null;
  const words = String(text).split(/\s+/);
  const target = String(accentWord || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    <div
      style={{
        fontFamily: FONT_SANS,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.12,
        color: '#F8FAFC',
        textAlign: 'center',
        letterSpacing: '-0.02em',
      }}
    >
      {words.map((w, i) => {
        const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isMatch = target && clean && (clean === target || clean.includes(target));
        return (
          <span
            key={i}
            style={
              isMatch
                ? {
                    fontFamily: FONT_SERIF,
                    fontStyle: 'italic',
                    color: '#0B0E14',
                    backgroundColor: accent,
                    padding: '2px 18px',
                    borderRadius: 14,
                    margin: '0 6px',
                    display: 'inline-block',
                  }
                : { margin: '0 6px', display: 'inline-block' }
            }
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

const VisualMetaphorScene = ({ scene, durFrames, palette }) => {
  const frame = useCurrentFrame();
  const progress = Math.min(1, frame / Math.max(1, durFrames));
  const motion = scene.camera_motion || 'push_in';
  let scale = 1.06;
  let tx = 0;
  let ty = 0;
  if (motion === 'push_in') {
    scale = interpolate(progress, [0, 1], [1.0, 1.15]);
  } else if (motion === 'pull_out') {
    scale = interpolate(progress, [0, 1], [1.16, 1.02]);
  } else if (motion === 'pan_up') {
    scale = 1.16;
    ty = interpolate(progress, [0, 1], [55, -55]);
  } else if (motion === 'snap_zoom') {
    scale = interpolate(progress, [0, 0.18, 1], [1.0, 1.18, 1.22], { easing: Easing.out(Easing.cubic) });
  } else {
    scale = 1.12;
    tx = interpolate(progress, [0, 1], [-28, 28]);
  }
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
      {scene.imageFile ? (
        <Img
          src={staticFile(scene.imageFile)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(' + scale + ') translate(' + tx + 'px,' + ty + 'px)',
            filter: 'contrast(1.07) saturate(1.08)',
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 35%, #1E293B 0%, ' + palette.bg + ' 75%)',
          }}
        />
      )}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(8,10,16,0.45) 0%, rgba(8,10,16,0.08) 42%, rgba(8,10,16,0.78) 100%)',
        }}
      />
      <DustParticles accent={palette.accent} />
    </AbsoluteFill>
  );
};

const HookHeadlineScene = ({ scene, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const bgOpacity = scene.imageFile ? 0.24 : 0;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bg,
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '80px 140px' : '120px 68px',
      }}
    >
      {scene.imageFile && (
        <Img
          src={staticFile(scene.imageFile)}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: bgOpacity,
            filter: 'blur(6px)',
          }}
        />
      )}
      <DustParticles accent={palette.accent} />
      <div style={{ transform: 'scale(' + interpolate(pop, [0, 1], [0.88, 1]) + ')', zIndex: 5 }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || scene.narration.split(' ').slice(0, 6).join(' ')}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={isLong ? 84 : 82}
        />
      </div>
    </AbsoluteFill>
  );
};

const UiCardScene = ({ scene, palette, brandName, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 130 } });
  const lines = String(scene.visual_spec || scene.narration)
    .split(/[.;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 20%, #172033 0%, ' + palette.bg + ' 70%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '60px 150px' : '140px 58px 420px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ marginBottom: 42, zIndex: 5 }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || ''}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={isLong ? 62 : 60}
        />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: isLong ? 1120 : 940,
          backgroundColor: palette.surface,
          borderRadius: 34,
          border: '2px solid rgba(255,255,255,0.12)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
          padding: 40,
          transform: 'translateY(' + interpolate(enter, [0, 1], [60, 0]) + 'px) scale(' + interpolate(enter, [0, 1], [0.94, 1]) + ')',
          opacity: enter,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: '#FB7185' }} />
            <div style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: '#F5B82E' }} />
            <div style={{ width: 15, height: 15, borderRadius: 99, backgroundColor: '#10B981' }} />
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: '#94A3B8' }}>
            {brandName.toUpperCase()} • ENGINE
          </div>
        </div>
        {lines.map((ln, idx) => {
          const rowOp = interpolate(frame, [idx * 8, idx * 8 + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '20px 24px',
                marginBottom: 16,
                borderRadius: 20,
                backgroundColor: 'rgba(11,14,20,0.75)',
                border: '1px solid rgba(255,255,255,0.08)',
                opacity: rowOp,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: palette.accent,
                  color: '#0B0E14',
                  fontFamily: FONT_MONO,
                  fontWeight: 900,
                  fontSize: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 30, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.3 }}>
                {ln.slice(0, 88)}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const StatCounterScene = ({ scene, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const match = String(scene.on_screen_headline + ' ' + scene.narration).match(/([+-]?\$?\d+(?:[.,]\d+)?%?)/);
  const bigStat = match ? match[1] : '90%';
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 45%, rgba(245,184,46,0.16) 0%, ' + palette.bg + ' 65%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '60px 140px' : '120px 64px 360px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: isLong ? 176 : 164,
          fontWeight: 900,
          color: palette.accent,
          transform: 'scale(' + interpolate(pop, [0, 1], [0.75, 1]) + ')',
          textShadow: '0 14px 50px rgba(245,184,46,0.35)',
        }}
      >
        {bigStat}
      </div>
      <div style={{ marginTop: 28 }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || ''}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={56}
        />
      </div>
    </AbsoluteFill>
  );
};

const SplitCompareScene = ({ scene, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leftIn = spring({ frame, fps, config: { damping: 15 } });
  const rightIn = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 15 } });
  const parts = String(scene.visual_spec || '').split(/vs\.?|\|/i);
  const leftTxt = (parts[0] || 'Retail FOMO & Fixed Stops').trim().slice(0, 74);
  const rightTxt = (parts[1] || '15m Quant Confluence & Liquidity').trim().slice(0, 74);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bg,
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '70px 120px' : '150px 52px 390px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ marginBottom: 40, zIndex: 5 }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || 'RETAIL VS QUANT'}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={58}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: isLong ? 'row' : 'column', gap: 26, width: '100%', maxWidth: 960, zIndex: 5 }}>
        <div
          style={{
            flex: 1,
            backgroundColor: 'rgba(251,113,133,0.10)',
            border: '2px solid ' + palette.danger,
            borderRadius: 28,
            padding: 36,
            opacity: leftIn,
            transform: 'translateX(' + interpolate(leftIn, [0, 1], [-45, 0]) + 'px)',
          }}
        >
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, fontWeight: 900, color: palette.danger, marginBottom: 14 }}>
            ✕  OLD WAY (TRAP)
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 34, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.3 }}>
            {leftTxt}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: 'rgba(16,185,129,0.10)',
            border: '2px solid ' + palette.positive,
            borderRadius: 28,
            padding: 36,
            opacity: rightIn,
            transform: 'translateX(' + interpolate(rightIn, [0, 1], [45, 0]) + 'px)',
          }}
        >
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, fontWeight: 900, color: palette.positive, marginBottom: 14 }}>
            ✓  SYSTEM WAY
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 34, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.3 }}>
            {rightTxt}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProofZoomScene = ({ scene, tradeProof, palette, brandName, siteHost, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = spring({ frame, fps, config: { damping: 14, stiffness: 130 } });
  const circleDraw = interpolate(frame, [10, 32], [860, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const zoom = interpolate(frame, [0, 45], [0.96, 1.05], { extrapolateRight: 'clamp' });
  const tp = tradeProof || {
    symbol: 'HYPE',
    side: 'SHORT',
    displayPnl: '31.5',
    leverage: '10x',
    entry: '24.10',
    exit: '23.34',
    stageLabel: 'TP2 HIT',
    setupName: '15m MTF Quant Setup',
  };
  const sideCol = tp.side === 'SHORT' ? palette.danger : palette.positive;
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 40%, #152238 0%, ' + palette.bg + ' 72%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '50px 180px' : '140px 56px 380px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div
        style={{
          width: '100%',
          maxWidth: 920,
          backgroundColor: '#0D1424',
          borderRadius: 42,
          border: '3px solid ' + sideCol,
          padding: 50,
          boxShadow: '0 36px 100px rgba(0,0,0,0.65)',
          transform: 'scale(' + cardIn * zoom + ')',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 30, fontWeight: 800, color: '#E2E8F0' }}>
            ⚡ {brandName}
          </div>
          <div
            style={{
              padding: '10px 24px',
              borderRadius: 99,
              backgroundColor: 'rgba(16,185,129,0.16)',
              border: '1.5px solid ' + sideCol,
              color: sideCol,
              fontFamily: FONT_MONO,
              fontWeight: 800,
              fontSize: 24,
            }}
          >
            ● {tp.stageLabel}
          </div>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 64, fontWeight: 900, color: '#FFFFFF' }}>
          {tp.symbol}/USDT
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 14, marginBottom: 24 }}>
          <span style={{ padding: '8px 20px', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: sideCol, fontFamily: FONT_SANS, fontWeight: 800, fontSize: 26 }}>
            {tp.side}
          </span>
          <span style={{ padding: '8px 20px', borderRadius: 12, backgroundColor: '#1E293B', color: '#E2E8F0', fontFamily: FONT_MONO, fontWeight: 700, fontSize: 26 }}>
            {tp.leverage}
          </span>
        </div>
        <div style={{ position: 'relative', display: 'inline-block', margin: '10px 0 22px' }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 132, fontWeight: 900, color: sideCol, lineHeight: 1 }}>
            +{tp.displayPnl}%
          </div>
          <svg
            viewBox='0 0 540 190'
            style={{ position: 'absolute', left: -34, top: -32, width: '116%', height: '142%', overflow: 'visible' }}
          >
            <ellipse
              cx='270'
              cy='95'
              rx='250'
              ry='78'
              fill='none'
              stroke='#EF4444'
              strokeWidth='9'
              strokeLinecap='round'
              strokeDasharray='860'
              strokeDashoffset={circleDraw}
            />
          </svg>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 26, color: '#94A3B8', marginBottom: 30 }}>
          {tp.setupName}
        </div>
        <div style={{ display: 'flex', gap: 22 }}>
          <div style={{ flex: 1, backgroundColor: '#090E1A', borderRadius: 20, padding: 24, border: '1px solid #1E293B' }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 22, color: '#94A3B8' }}>Entry Price</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 34, fontWeight: 800, color: '#FFFFFF', marginTop: 8 }}>
              ${tp.entry}
            </div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#090E1A', borderRadius: 20, padding: 24, border: '1px solid #1E293B' }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 22, color: '#94A3B8' }}>Peak / Target</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 34, fontWeight: 800, color: sideCol, marginTop: 8 }}>
              ${tp.exit}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 22, color: '#CBD5E1' }}>
          <span>24H FREE TRIAL • NO CARD</span>
          <span style={{ color: palette.accent }}>{siteHost}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const AutoDmOutroScene = ({ palette, autoDmKeyword, brandName, siteHost, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kw = String(autoDmKeyword || 'AI').toUpperCase();
  const typedLen = Math.min(kw.length, Math.floor(frame / 4) + 1);
  const dmPop = spring({ frame: Math.max(0, frame - 22), fps, config: { damping: 13, stiffness: 150 } });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 35%, #162135 0%, ' + palette.bg + ' 75%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '60px 180px' : '160px 64px 360px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ fontFamily: FONT_SANS, fontSize: 64, fontWeight: 900, color: '#FFFFFF', textAlign: 'center', marginBottom: 42 }}>
        Comment <span style={{ color: palette.accent }}>"{kw}"</span>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          backgroundColor: palette.surface,
          borderRadius: 99,
          border: '2px solid rgba(255,255,255,0.16)',
          padding: '26px 38px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: 38, fontWeight: 800, color: '#FFFFFF' }}>
          {kw.slice(0, typedLen)}|
        </span>
        <span
          style={{
            padding: '12px 30px',
            borderRadius: 99,
            backgroundColor: palette.accent,
            color: '#0B0E14',
            fontFamily: FONT_SANS,
            fontWeight: 900,
            fontSize: 26,
          }}
        >
          SEND
        </span>
      </div>
      <div
        style={{
          marginTop: 34,
          width: '100%',
          maxWidth: 780,
          backgroundColor: 'rgba(16,185,129,0.14)',
          border: '2px solid ' + palette.positive,
          borderRadius: 28,
          padding: '28px 34px',
          opacity: dmPop,
          transform: 'translateY(' + interpolate(dmPop, [0, 1], [35, 0]) + 'px)',
        }}
      >
        <div style={{ fontFamily: FONT_SANS, fontSize: 26, fontWeight: 800, color: palette.positive }}>
          ✓ DM Sent Instantly • {brandName}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 24, color: '#E2E8F0', marginTop: 10 }}>
          Free 24h Live Quant Trial → {siteHost}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CleanSubtitles = ({ words, isLong, accent }) => {
  const frame = useCurrentFrame();
  if (!words || !words.length) return null;
  // Group into crisp 1-2 word chunks (short) or 4-5 words (long)
  const maxWords = isLong ? 5 : 2;
  const groups = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const slice = words.slice(i, i + maxWords);
    if (!slice.length) continue;
    groups.push({
      start: slice[0].startFrame,
      end: slice[slice.length - 1].endFrame,
      text: slice.map((w) => w.text).join(' '),
    });
  }
  const active = groups.find((g) => frame >= g.start && frame <= g.end + 2);
  if (!active) return null;
  const local = frame - active.start;
  const sc = interpolate(local, [0, 4], [0.92, 1], { extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: isLong ? 120 : 68,
        right: isLong ? 120 : 68,
        bottom: isLong ? 74 : 470,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      <div
        style={{
          transform: 'scale(' + sc + ')',
          backgroundColor: 'rgba(8,10,16,0.72)',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: isLong ? '12px 28px' : '14px 30px',
          borderRadius: 18,
          fontFamily: FONT_SANS,
          fontSize: isLong ? 44 : 62,
          fontWeight: 900,
          color: '#FFFFFF',
          textAlign: 'center',
          letterSpacing: '-0.01em',
          textShadow: '0 4px 16px rgba(0,0,0,0.85)',
        }}
      >
        {active.text}
      </div>
    </div>
  );
};

export const VideoComposition = (props) => {
  const frame = useCurrentFrame();
  const isLong = Number(props.width) > Number(props.height);
  const scenes = props.scenes || [];
  const palette = props.palette || {
    bg: '#0B0E14',
    surface: '#141923',
    text_primary: '#F8FAFC',
    accent: '#F5B82E',
    positive: '#10B981',
    danger: '#FB7185',
  };
  const activeSceneIdx = Math.max(0, scenes.findIndex((s) => frame >= s.startFrame && frame < s.endFrame));
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      {scenes.map((sc, idx) => {
        const dur = Math.max(15, sc.endFrame - sc.startFrame);
        const comp = sc.visual_component || 'visual_metaphor';
        return (
          <Sequence key={idx} from={sc.startFrame} durationInFrames={dur}>
            {comp === 'hook_headline' && <HookHeadlineScene scene={sc} palette={palette} isLong={isLong} />}
            {comp === 'ui_card' && <UiCardScene scene={sc} palette={palette} brandName={props.brandName} isLong={isLong} />}
            {comp === 'stepper_progress' && <UiCardScene scene={sc} palette={palette} brandName={props.brandName} isLong={isLong} />}
            {comp === 'stat_counter' && <StatCounterScene scene={sc} palette={palette} isLong={isLong} />}
            {comp === 'split_compare' && <SplitCompareScene scene={sc} palette={palette} isLong={isLong} />}
            {comp === 'proof_zoom' && (
              <ProofZoomScene
                scene={sc}
                tradeProof={props.tradeProof}
                palette={palette}
                brandName={props.brandName}
                siteHost={props.siteHost}
                isLong={isLong}
              />
            )}
            {comp === 'autodm_outro' && (
              <AutoDmOutroScene
                palette={palette}
                autoDmKeyword={props.autoDmKeyword}
                brandName={props.brandName}
                siteHost={props.siteHost}
                isLong={isLong}
              />
            )}
            {comp === 'visual_metaphor' && <VisualMetaphorScene scene={sc} durFrames={dur} palette={palette} />}
          </Sequence>
        );
      })}
      {!isLong && (props.mode === 'promo' || props.mode === 'edu') && (
        <TopStepper currentIdx={activeSceneIdx} total={scenes.length} accent={palette.accent} />
      )}
      <CleanSubtitles words={props.words} isLong={isLong} accent={palette.accent} />
    </AbsoluteFill>
  );
};