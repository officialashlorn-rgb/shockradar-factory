import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { VideoComposition } from './VideoComposition.jsx';

const RemotionRoot = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 900,
        mode: 'promo',
        template: 'UiMotionPromo',
        palette: {
          bg: '#0B0E14',
          surface: '#141923',
          text_primary: '#F8FAFC',
          accent: '#F5B82E',
          positive: '#10B981',
          danger: '#FB7185',
        },
        brandName: 'ShockRadar AI',
        siteHost: 'shockradarai.pages.dev',
        autoDmKeyword: '1',
        speakerLabels: { A: 'FOMO TRADER', B: 'QUANT SYSTEM' },
        tradeProof: null,
        scenes: [],
        words: [],
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(90, Number(props.durationInFrames) || 900),
        width: Number(props.width) || 1080,
        height: Number(props.height) || 1920,
        fps: Number(props.fps) || 30,
      })}
    />
  );
};

registerRoot(RemotionRoot);