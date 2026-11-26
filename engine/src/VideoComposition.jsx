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
  const dots = Array.from({ length: 16 }, (_, i) => ({
    x: (i * 197 + 43) % 100,
    yBase: (i * 83 + 19) % 100,
    size: 3 + (i % 4) * 2,
    speed: 0.04 + (i % 5) * 0.015,
    op: 0.08 + (i % 3) * 0.06,
  }));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {dots.map((d, idx) => {
        const y = ((d.yBase - frame * d.speed + 120) % 120) - 10;
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

const SceneTransitionWrapper = ({ children, durFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [Math.max(5, durFrames - 4), durFrames], [1, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>{children}</AbsoluteFill>;
};

const TopStepper = ({ currentIdx, total, accent }) => {
  if (total < 3) return null;
  return (
    <div style={{ position: 'absolute', top: 84, left: 68, right: 68, display: 'flex', gap: 8, zIndex: 30 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 99,
            backgroundColor: i <= currentIdx ? accent : 'rgba(255,255,255,0.16)',
          }}
        />
      ))}
    </div>
  );
};

const HighlightedHeadline = ({ text, accentWord, accent, size = 72 }) => {
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
                    padding: '2px 16px',
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

// --- TEMPLATE: DarkVectorStory / Visual Metaphor ---
const VisualMetaphorScene = ({ scene, durFrames, palette, template, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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
    ty = interpolate(progress, [0, 1], [50, -50]);
  } else if (motion === 'snap_zoom') {
    scale = interpolate(progress, [0, 0.16, 1], [1.0, 1.18, 1.22], { easing: Easing.out(Easing.cubic) });
  } else {
    scale = 1.12;
    tx = interpolate(progress, [0, 1], [-28, 28]);
  }
  const headPop = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
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
            filter: template === 'DarkVectorStory' ? 'contrast(1.12) saturate(0.95)' : 'contrast(1.07) saturate(1.08)',
          }}
        />
      ) : (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 35%, #1E293B 0%, ' + palette.bg + ' 75%)' }} />
      )}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(8,10,16,0.58) 0%, rgba(8,10,16,0.10) 40%, rgba(8,10,16,0.82) 100%)',
        }}
      />
      <DustParticles accent={palette.accent} />
      {scene.on_screen_headline && (
        <div
          style={{
            position: 'absolute',
            top: isLong ? 74 : 150,
            left: isLong ? 120 : 56,
            right: isLong ? 120 : 56,
            transform: 'scale(' + interpolate(headPop, [0, 1], [0.9, 1]) + ')',
            opacity: headPop,
            zIndex: 10,
          }}
        >
          <HighlightedHeadline
            text={scene.on_screen_headline}
            accentWord={scene.accent_word}
            accent={palette.accent}
            size={isLong ? 58 : 56}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// --- TEMPLATE: ComicMotion (2.5D Graphic Novel Panel Slam + Halftone Texture) ---
const ComicMotionScene = ({ scene, durFrames, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 12, stiffness: 170 } });
  const progress = Math.min(1, frame / Math.max(1, durFrames));
  const dir = (scene.scene_index || 1) % 2 === 0 ? 1 : -1;
  const slideX = interpolate(slam, [0, 1], [dir * 120, 0]);
  const tilt = dir * 1.4;
  const innerScale = interpolate(progress, [0, 1], [1.04, 1.16]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#07090F',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1.5px, transparent 1.5px)',
        backgroundSize: '18px 18px',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '56px 110px 180px' : '150px 54px 480px',
      }}
    >
      {scene.on_screen_headline && (
        <div
          style={{
            backgroundColor: palette.accent,
            color: '#0B0E14',
            padding: '12px 28px',
            border: '4px solid #0B0E14',
            boxShadow: '8px 8px 0px #000000',
            fontFamily: FONT_SANS,
            fontSize: isLong ? 38 : 42,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            marginBottom: 24,
            transform: 'rotate(' + (-tilt) + 'deg) scale(' + slam + ')',
            zIndex: 12,
          }}
        >
          {scene.on_screen_headline}
        </div>
      )}
      <div
        style={{
          width: '100%',
          flex: 1,
          borderRadius: 18,
          border: '6px solid #F8FAFC',
          boxShadow: '14px 14px 0px ' + palette.accent,
          overflow: 'hidden',
          transform: 'translateX(' + slideX + 'px) rotate(' + tilt + 'deg)',
          position: 'relative',
          backgroundColor: palette.surface,
        }}
      >
        {scene.imageFile ? (
          <Img
            src={staticFile(scene.imageFile)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scale(' + innerScale + ')',
              filter: 'contrast(1.14) saturate(1.15)',
            }}
          />
        ) : (
          <AbsoluteFill style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0B0E14 100%)' }} />
        )}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)' }} />
      </div>
    </AbsoluteFill>
  );
};

// --- TEMPLATE: TwoVoiceStick (Animated 2-Character Contrast Dialogue) ---
const StickFigureSvg = ({ color, isActive, frame, flip }) => {
  const bob = isActive ? Math.sin(frame * 0.45) * 8 : Math.sin(frame * 0.08) * 2;
  const mouthH = isActive ? 6 + Math.abs(Math.sin(frame * 0.8)) * 14 : 3;
  const armAngle = isActive ? Math.sin(frame * 0.4) * 18 : 0;
  return (
    <svg
      viewBox="0 0 220 340"
      style={{
        width: 220,
        height: 340,
        transform: 'translateY(' + bob + 'px) scaleX(' + (flip ? -1 : 1) + ')',
        filter: isActive ? 'drop-shadow(0 0 24px ' + color + ')' : 'none',
        opacity: isActive ? 1 : 0.36,
      }}
    >
      <circle cx="110" cy="70" r="42" fill="#0B0E14" stroke={color} strokeWidth="9" />
      <circle cx="96" cy="62" r="5" fill={color} />
      <circle cx="126" cy="62" r="5" fill={color} />
      <rect x="98" y={84 - mouthH / 2} width="26" height={mouthH} rx="6" fill={color} />
      <line x1="110" y1="112" x2="110" y2="232" stroke={color} strokeWidth="10" strokeLinecap="round" />
      <line
        x1="110"
        y1="145"
        x2={165}
        y2={120 + armAngle}
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <line x1="110" y1="145" x2="62" y2="188" stroke={color} strokeWidth="10" strokeLinecap="round" />
      <line x1="110" y1="232" x2="72" y2="318" stroke={color} strokeWidth="10" strokeLinecap="round" />
      <line x1="110" y1="232" x2="148" y2="318" stroke={color} strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
};

const TwoVoiceStickScene = ({ scene, palette, speakerLabels, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = scene.speaker === 'B' ? 'B' : 'A';
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const colA = palette.danger || '#FB7185';
  const colB = palette.positive || '#10B981';
  const lblA = (speakerLabels && speakerLabels.A) || 'RETAIL FOMO';
  const lblB = (speakerLabels && speakerLabels.B) || 'CALM SYSTEM';

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at ' + (active === 'A' ? '28% 45%' : '72% 45%') + ', rgba(245,184,46,0.14) 0%, ' + palette.bg + ' 66%)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '70px 120px 180px' : '180px 44px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ marginBottom: 38, zIndex: 10, transform: 'scale(' + interpolate(pop, [0, 1], [0.9, 1]) + ')' }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || (active === 'A' ? lblA : lblB)}
          accentWord={scene.accent_word}
          accent={active === 'A' ? colA : colB}
          size={isLong ? 60 : 58}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          width: '100%',
          maxWidth: 960,
          marginTop: isLong ? 20 : 80,
          zIndex: 8,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'scale(' + (active === 'A' ? 1.08 : 0.92) + ')' }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 800, color: colA, marginBottom: 14, opacity: active === 'A' ? 1 : 0.45 }}>
            {lblA}
          </div>
          <StickFigureSvg color={colA} isActive={active === 'A'} frame={frame} flip={false} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'scale(' + (active === 'B' ? 1.08 : 0.92) + ')' }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 800, color: colB, marginBottom: 14, opacity: active === 'B' ? 1 : 0.45 }}>
            {lblB}
          </div>
          <StickFigureSvg color={colB} isActive={active === 'B'} frame={frame} flip={true} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HookHeadlineScene = ({ scene, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 150 } });
  const barW = interpolate(pop, [0, 1], [0, 180]);
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 42%, rgba(245,184,46,0.16) 0%, ' + palette.bg + ' 68%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '80px 140px 180px' : '140px 64px 440px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'scale(' + interpolate(pop, [0, 1], [0.88, 1]) + ')', zIndex: 5 }}>
        <div style={{ width: barW, height: 7, borderRadius: 99, backgroundColor: palette.accent, marginBottom: 30, boxShadow: '0 0 24px ' + palette.accent }} />
        <HighlightedHeadline
          text={scene.on_screen_headline || scene.narration.split(' ').slice(0, 6).join(' ')}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={isLong ? 82 : 78}
        />
      </div>
    </AbsoluteFill>
  );
};

// Uses explicit scene.card_bullets (NEVER raw visual_spec image prompts!)
const UiCardScene = ({ scene, palette, brandName, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 130 } });
  const rawBullets = Array.isArray(scene.card_bullets) && scene.card_bullets.length
    ? scene.card_bullets
    : String(scene.narration || '').split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const lines = rawBullets.slice(0, 3);

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 20%, #172033 0%, ' + palette.bg + ' 70%)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '80px 150px 180px' : '185px 54px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ marginBottom: 34, zIndex: 5 }}>
        <HighlightedHeadline
          text={scene.on_screen_headline || ''}
          accentWord={scene.accent_word}
          accent={palette.accent}
          size={isLong ? 58 : 56}
        />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: isLong ? 1120 : 940,
          backgroundColor: palette.surface,
          borderRadius: 32,
          border: '2px solid rgba(255,255,255,0.12)',
          boxShadow: '0 28px 84px rgba(0,0,0,0.55)',
          padding: 36,
          transform: 'translateY(' + interpolate(enter, [0, 1], [50, 0]) + 'px) scale(' + interpolate(enter, [0, 1], [0.95, 1]) + ')',
          opacity: enter,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: '#FB7185' }} />
            <div style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: '#F5B82E' }} />
            <div style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: '#10B981' }} />
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 20, color: '#94A3B8' }}>
            {String(brandName || 'SYSTEM').toUpperCase()} • ENGINE
          </div>
        </div>
        {lines.map((ln, idx) => {
          const rowOp = interpolate(frame, [idx * 7, idx * 7 + 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 22px',
                marginBottom: 14,
                borderRadius: 18,
                backgroundColor: 'rgba(11,14,20,0.78)',
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
              <div style={{ fontFamily: FONT_SANS, fontSize: 29, fontWeight: 700, color: '#E2E8F0', lineHeight: 1.28 }}>
                {String(ln).slice(0, 78)}
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
  const match = String((scene.on_screen_headline || '') + ' ' + (scene.narration || '')).match(/([+-]?\$?\d+(?:[.,]\d+)?(?:[BMK%]|\s?(?:billion|million|trillion|days|hours|minutes|years))?)/i);
  if (!match) return <HookHeadlineScene scene={scene} palette={palette} isLong={isLong} />;
  const bigStat = match[1].trim().toUpperCase();
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 40%, rgba(245,184,46,0.16) 0%, ' + palette.bg + ' 65%)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLong ? '60px 140px 180px' : '140px 64px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: isLong ? 172 : 158,
          fontWeight: 900,
          color: palette.accent,
          transform: 'scale(' + interpolate(pop, [0, 1], [0.75, 1]) + ')',
          textShadow: '0 14px 50px rgba(245,184,46,0.35)',
        }}
      >
        {bigStat}
      </div>
      <div style={{ marginTop: 26 }}>
        <HighlightedHeadline text={scene.on_screen_headline || ''} accentWord={scene.accent_word} accent={palette.accent} size={54} />
      </div>
    </AbsoluteFill>
  );
};

const SplitCompareScene = ({ scene, palette, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leftIn = spring({ frame, fps, config: { damping: 15 } });
  const rightIn = spring({ frame: Math.max(0, frame - 9), fps, config: { damping: 15 } });
  const bullets = Array.isArray(scene.card_bullets) && scene.card_bullets.length >= 2
    ? scene.card_bullets
    : String(scene.visual_spec || '').split(/vs\.?|\|/i);
  const leftTxt = String(bullets[0] || 'Emotional Guessing').trim().slice(0, 72);
  const rightTxt = String(bullets[1] || 'Systematic Execution').trim().slice(0, 72);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: palette.bg,
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '70px 120px 180px' : '185px 50px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ marginBottom: 34, zIndex: 5 }}>
        <HighlightedHeadline text={scene.on_screen_headline || 'OLD VS NEW'} accentWord={scene.accent_word} accent={palette.accent} size={54} />
      </div>
      <div style={{ display: 'flex', flexDirection: isLong ? 'row' : 'column', gap: 22, width: '100%', maxWidth: 960, zIndex: 5 }}>
        <div
          style={{
            flex: 1,
            backgroundColor: 'rgba(251,113,133,0.10)',
            border: '2px solid ' + palette.danger,
            borderRadius: 26,
            padding: 32,
            opacity: leftIn,
            transform: 'translateX(' + interpolate(leftIn, [0, 1], [-40, 0]) + 'px)',
          }}
        >
          <div style={{ fontFamily: FONT_SANS, fontSize: 28, fontWeight: 900, color: palette.danger, marginBottom: 12 }}>✕  TRAP</div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 32, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.28 }}>{leftTxt}</div>
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: 'rgba(16,185,129,0.10)',
            border: '2px solid ' + palette.positive,
            borderRadius: 26,
            padding: 32,
            opacity: rightIn,
            transform: 'translateX(' + interpolate(rightIn, [0, 1], [40, 0]) + 'px)',
          }}
        >
          <div style={{ fontFamily: FONT_SANS, fontSize: 28, fontWeight: 900, color: palette.positive, marginBottom: 12 }}>✓  EDGE</div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 32, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.28 }}>{rightTxt}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProofZoomScene = ({ scene, tradeProof, palette, brandName, siteHost, isLong }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = spring({ frame, fps, config: { damping: 14, stiffness: 130 } });
  const circleDraw = interpolate(frame, [8, 30], [860, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const zoom = interpolate(frame, [0, 45], [0.95, 1.03], { extrapolateRight: 'clamp' });

  if (!tradeProof) {
    return <StatCounterScene scene={scene} palette={palette} isLong={isLong} />;
  }

  const tp = tradeProof;
  const sideCol = tp.side === 'SHORT' ? palette.danger : palette.positive;
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 35%, #152238 0%, ' + palette.bg + ' 72%)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '60px 180px 180px' : '185px 52px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div
        style={{
          width: '100%',
          maxWidth: 920,
          backgroundColor: '#0D1424',
          borderRadius: 38,
          border: '3px solid ' + sideCol,
          padding: 44,
          boxShadow: '0 32px 90px rgba(0,0,0,0.65)',
          transform: 'scale(' + cardIn * zoom + ')',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 28, fontWeight: 800, color: '#E2E8F0' }}>⚡ {brandName}</div>
          <div
            style={{
              padding: '8px 22px',
              borderRadius: 99,
              backgroundColor: 'rgba(16,185,129,0.16)',
              border: '1.5px solid ' + sideCol,
              color: sideCol,
              fontFamily: FONT_MONO,
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            ● {tp.stageLabel}
          </div>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 58, fontWeight: 900, color: '#FFFFFF' }}>{tp.symbol}/USDT</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, marginBottom: 20 }}>
          <span style={{ padding: '7px 18px', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', color: sideCol, fontFamily: FONT_SANS, fontWeight: 800, fontSize: 24 }}>
            {tp.side}
          </span>
          <span style={{ padding: '7px 18px', borderRadius: 12, backgroundColor: '#1E293B', color: '#E2E8F0', fontFamily: FONT_MONO, fontWeight: 700, fontSize: 24 }}>
            {tp.leverage}
          </span>
        </div>
        <div style={{ position: 'relative', display: 'inline-block', margin: '8px 0 18px' }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 120, fontWeight: 900, color: sideCol, lineHeight: 1 }}>
            +{tp.displayPnl}%
          </div>
          <svg viewBox="0 0 540 190" style={{ position: 'absolute', left: -30, top: -28, width: '116%', height: '140%', overflow: 'visible' }}>
            <ellipse cx="270" cy="95" rx="250" ry="76" fill="none" stroke="#EF4444" strokeWidth="9" strokeLinecap="round" strokeDasharray="860" strokeDashoffset={circleDraw} />
          </svg>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 24, color: '#94A3B8', marginBottom: 24 }}>{tp.setupName}</div>
        <div style={{ display: 'flex', gap: 18 }}>
          <div style={{ flex: 1, backgroundColor: '#090E1A', borderRadius: 18, padding: 20, border: '1px solid #1E293B' }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 20, color: '#94A3B8' }}>Entry Price</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 32, fontWeight: 800, color: '#FFFFFF', marginTop: 6 }}>${tp.entry}</div>
          </div>
          <div style={{ flex: 1, backgroundColor: '#090E1A', borderRadius: 18, padding: 20, border: '1px solid #1E293B' }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 20, color: '#94A3B8' }}>Peak / Target</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 32, fontWeight: 800, color: sideCol, marginTop: 6 }}>${tp.exit}</div>
          </div>
        </div>
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', fontFamily: FONT_MONO, fontSize: 20, color: '#CBD5E1' }}>
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
  const dmPop = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 13, stiffness: 150 } });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 35%, #162135 0%, ' + palette.bg + ' 75%)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isLong ? '80px 180px 180px' : '240px 60px 480px',
      }}
    >
      <DustParticles accent={palette.accent} />
      <div style={{ fontFamily: FONT_SANS, fontSize: 60, fontWeight: 900, color: '#FFFFFF', textAlign: 'center', marginBottom: 38 }}>
        Comment <span style={{ color: palette.accent }}>"{kw}"</span>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 780,
          backgroundColor: palette.surface,
          borderRadius: 99,
          border: '2px solid rgba(255,255,255,0.16)',
          padding: '24px 36px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: 36, fontWeight: 800, color: '#FFFFFF' }}>{kw.slice(0, typedLen)}|</span>
        <span style={{ padding: '10px 28px', borderRadius: 99, backgroundColor: palette.accent, color: '#0B0E14', fontFamily: FONT_SANS, fontWeight: 900, fontSize: 24 }}>
          SEND
        </span>
      </div>
      <div
        style={{
          marginTop: 30,
          width: '100%',
          maxWidth: 780,
          backgroundColor: 'rgba(16,185,129,0.14)',
          border: '2px solid ' + palette.positive,
          borderRadius: 26,
          padding: '26px 32px',
          opacity: dmPop,
          transform: 'translateY(' + interpolate(dmPop, [0, 1], [30, 0]) + 'px)',
        }}
      >
        <div style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 800, color: palette.positive }}>
          ✓ DM Sent Instantly • {brandName}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 22, color: '#E2E8F0', marginTop: 8 }}>
          {siteHost ? 'Free Access → ' + siteHost : 'Check your inbox now ⚡'}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Positioned strictly in the Safe Zone below all cards (ZERO overlap!)
const CleanSubtitles = ({ words, isLong, accent }) => {
  const frame = useCurrentFrame();
  if (!words || !words.length) return null;
  const maxWords = isLong ? 5 : 2;
  const groups = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const sceneChanged = cur.length > 0 && w.sceneIdx !== undefined && cur[0].sceneIdx !== w.sceneIdx;
    if (sceneChanged || cur.length >= maxWords) {
      groups.push({
        start: cur[0].startFrame,
        end: cur[cur.length - 1].endFrame,
        text: cur.map((x) => x.text).join(' '),
        idx: groups.length,
      });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) {
    groups.push({
      start: cur[0].startFrame,
      end: cur[cur.length - 1].endFrame,
      text: cur.map((x) => x.text).join(' '),
      idx: groups.length,
    });
  }
  const active = groups.find((g) => frame >= g.start && frame <= g.end + 2);
  if (!active) return null;
  const local = frame - active.start;
  const sc = interpolate(local, [0, 4], [0.92, 1], { extrapolateRight: 'clamp' });
  const txtCol = active.idx % 4 === 2 ? accent : '#FFFFFF';
  return (
    <div
      style={{
        position: 'absolute',
        left: isLong ? 120 : 64,
        right: isLong ? 120 : 64,
        bottom: isLong ? 62 : 295,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          transform: 'scale(' + sc + ')',
          backgroundColor: 'rgba(8,10,16,0.82)',
          border: '1.5px solid rgba(255,255,255,0.14)',
          padding: isLong ? '12px 28px' : '14px 28px',
          borderRadius: 18,
          fontFamily: FONT_SANS,
          fontSize: isLong ? 42 : 58,
          fontWeight: 900,
          color: txtCol,
          textAlign: 'center',
          letterSpacing: '-0.01em',
          textShadow: '0 4px 16px rgba(0,0,0,0.9)',
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
  const template = props.template || 'UiMotionPromo';
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

  const renderSceneBody = (sc, dur) => {
    const comp = sc.visual_component || 'visual_metaphor';
    if (comp === 'proof_zoom') {
      return (
        <ProofZoomScene
          scene={sc}
          tradeProof={props.tradeProof}
          palette={palette}
          brandName={props.brandName}
          siteHost={props.siteHost}
          isLong={isLong}
        />
      );
    }
    if (comp === 'autodm_outro') {
      return (
        <AutoDmOutroScene
          palette={palette}
          autoDmKeyword={props.autoDmKeyword}
          brandName={props.brandName}
          siteHost={props.siteHost}
          isLong={isLong}
        />
      );
    }
    if (template === 'TwoVoiceStick' && (comp === 'two_voice_dialogue' || comp === 'visual_metaphor' || comp === 'split_compare')) {
      return <TwoVoiceStickScene scene={sc} palette={palette} speakerLabels={props.speakerLabels} isLong={isLong} />;
    }
    if (template === 'ComicMotion' && comp === 'visual_metaphor') {
      return <ComicMotionScene scene={sc} durFrames={dur} palette={palette} isLong={isLong} />;
    }
    if (comp === 'two_voice_dialogue') {
      return <TwoVoiceStickScene scene={sc} palette={palette} speakerLabels={props.speakerLabels} isLong={isLong} />;
    }
    if (comp === 'comic_panel') {
      return <ComicMotionScene scene={sc} durFrames={dur} palette={palette} isLong={isLong} />;
    }
    if (comp === 'hook_headline') return <HookHeadlineScene scene={sc} palette={palette} isLong={isLong} />;
    if (comp === 'ui_card' || comp === 'stepper_progress') {
      return <UiCardScene scene={sc} palette={palette} brandName={props.brandName} isLong={isLong} />;
    }
    if (comp === 'stat_counter') return <StatCounterScene scene={sc} palette={palette} isLong={isLong} />;
    if (comp === 'split_compare') return <SplitCompareScene scene={sc} palette={palette} isLong={isLong} />;
    return <VisualMetaphorScene scene={sc} durFrames={dur} palette={palette} template={template} isLong={isLong} />;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      {scenes.map((sc, idx) => {
        const dur = Math.max(15, sc.endFrame - sc.startFrame);
        return (
          <Sequence key={idx} from={sc.startFrame} durationInFrames={dur}>
            <SceneTransitionWrapper durFrames={dur}>{renderSceneBody(sc, dur)}</SceneTransitionWrapper>
          </Sequence>
        );
      })}
      {!isLong && (props.mode === 'promo' || props.mode === 'edu' || template === 'UiMotionPromo') && (
        <TopStepper currentIdx={activeSceneIdx} total={scenes.length} accent={palette.accent} />
      )}
      <CleanSubtitles words={props.words} isLong={isLong} accent={palette.accent} />
    </AbsoluteFill>
  );
};