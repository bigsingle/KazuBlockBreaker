/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Trophy, 
  Volume2, 
  VolumeX, 
  HelpCircle, 
  Sparkles, 
  ArrowLeft, 
  ArrowRight, 
  Flame,
  FastForward,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { sound } from './utils/audio';

// Canvas constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const COLS = 5;
const ROWS = 4;
const TOTAL_BLOCKS = COLS * ROWS; // 20 blocks
const BALL_RADIUS = 9;
const BASE_PADDLE_WIDTH = 132;
const PADDLE_HEIGHT = 18;
const PADDLE_SPEED = 9;
const PADDLE_Y = CANVAS_HEIGHT - 70;
const MAX_RETRIES = 2; // 玉の発射し直しは２回
const BASE_BLOCK_SCORE = 100;
const TOTAL_STAGES = 4;

interface StageConfig {
  stage: number;
  name: string;
  isFinal: boolean;
  paddleWidth: number;
  ballSpeed: number;
  themeName: string;
  badge: string;
  description: string;
  modifierText: string;
  colors: { fill: string; border: string; name: string }[];
}

// Stage configurations based on requirements:
// 1面: 通常パドル (132px), 通常速度 (7.5)
// 2面: パドル幅が3分の2 (88px), 通常速度 (7.5)
// 3面: パドル幅 2/3 (88px), 球の速度が1.5倍 (11.25)
// 4面: 最終面！パドル幅が半分 (66px), 球の速度 1.5倍 (11.25)
const STAGES: StageConfig[] = [
  {
    stage: 1,
    name: '1面',
    isFinal: false,
    paddleWidth: 132,
    ballSpeed: 7.5,
    themeName: 'クラシック',
    badge: '1面：標準',
    description: '基本ステージ（通常パドル・通常速度）',
    modifierText: '通常パドル（幅132px）/ 通常速度',
    colors: [
      { fill: '#f43f5e', border: '#fda4af', name: 'ローズ' },
      { fill: '#f97316', border: '#fdba74', name: 'オレンジ' },
      { fill: '#10b981', border: '#6ee7b7', name: 'グリーン' },
      { fill: '#06b6d4', border: '#67e8f9', name: 'シアン' },
    ],
  },
  {
    stage: 2,
    name: '2面',
    isFinal: false,
    paddleWidth: 88, // 132 * 2/3 = 88
    ballSpeed: 7.5,
    themeName: 'サイバーネオン',
    badge: '2面：パドル2/3',
    description: 'パドルの幅が3分の2に縮小！',
    modifierText: 'パドル幅が3分の2（88px）に縮小！',
    colors: [
      { fill: '#ec4899', border: '#fbcfe8', name: 'ピンク' },
      { fill: '#a855f7', border: '#e9d5ff', name: 'パープル' },
      { fill: '#3b82f6', border: '#bfdbfe', name: 'ブルー' },
      { fill: '#14b8a6', border: '#99f6e4', name: 'ティール' },
    ],
  },
  {
    stage: 3,
    name: '3面',
    isFinal: false,
    paddleWidth: 88,
    ballSpeed: 11.25, // 7.5 * 1.5 = 11.25
    themeName: 'ソーラーフレア',
    badge: '3面：球速1.5倍',
    description: '球の速度が1.5倍にスピードアップ！',
    modifierText: '球の速度が1.5倍に超加速！',
    colors: [
      { fill: '#ef4444', border: '#fecaca', name: 'クリムゾン' },
      { fill: '#f97316', border: '#fed7aa', name: 'フレイム' },
      { fill: '#eab308', border: '#fef08a', name: 'ゴールド' },
      { fill: '#84cc16', border: '#d9f99d', name: 'ライム' },
    ],
  },
  {
    stage: 4,
    name: '4面（最終面）',
    isFinal: true,
    paddleWidth: 66, // 132 * 0.5 = 66
    ballSpeed: 11.25,
    themeName: 'クァンタムコア',
    badge: '4面：最終面',
    description: '最終決戦！パドルが半分 ＆ 球速1.5倍！',
    modifierText: 'パドル幅が半分（66px）＆ 球速1.5倍！',
    colors: [
      { fill: '#8b5cf6', border: '#ddd6fe', name: 'バイオレット' },
      { fill: '#6366f1', border: '#c7d2fe', name: 'インディゴ' },
      { fill: '#06b6d4', border: '#a5f3fc', name: 'エレクトリック' },
      { fill: '#10b981', border: '#a7f3d0', name: 'エメラルド' },
    ],
  },
];

interface Block {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  destroyed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

interface FloatingScore {
  id: number;
  x: number;
  y: number;
  text: string;
  combo: number;
  alpha: number;
  vy: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game states:
  // 'ready': ball resting on paddle, waiting to start
  // 'playing': ball in motion
  // 'paused': game paused
  // 'stage_cleared': cleared stage 1, 2, or 3 (waiting to advance to next stage)
  // 'all_cleared': cleared stage 4 (final victory)
  // 'gameover': ball dropped during 2nd retry
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'paused' | 'stage_cleared' | 'all_cleared' | 'gameover'>('ready');
  const [stage, setStage] = useState<number>(1);
  const [retriesLeft, setRetriesLeft] = useState<number>(MAX_RETRIES); // 2, 1, 0
  const [destroyedCount, setDestroyedCount] = useState<number>(0);
  
  // Score state
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('breakout_game_highscore');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [combo, setCombo] = useState<number>(0);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const currentStageConfig = STAGES[stage - 1] || STAGES[0];

  // Mutable game simulation refs
  const paddleRef = useRef({
    x: (CANVAS_WIDTH - currentStageConfig.paddleWidth) / 2,
    y: PADDLE_Y,
    width: currentStageConfig.paddleWidth,
    height: PADDLE_HEIGHT,
    speed: PADDLE_SPEED,
    movingLeft: false,
    movingRight: false,
  });

  const ballRef = useRef({
    x: CANVAS_WIDTH / 2,
    y: PADDLE_Y - BALL_RADIUS,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
  });

  const blocksRef = useRef<Block[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingScoresRef = useRef<FloatingScore[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const retriesLeftRef = useRef(retriesLeft);
  retriesLeftRef.current = retriesLeft;
  const destroyedCountRef = useRef(destroyedCount);
  destroyedCountRef.current = destroyedCount;
  
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const highScoreRef = useRef(highScore);
  highScoreRef.current = highScore;
  const comboRef = useRef(combo);
  comboRef.current = combo;

  // Touch tracking: enhanced tolerance for tap recognition
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchMaxMovement = useRef<number>(0);

  // Initialize blocks for a specific stage
  const createBlocksForStage = useCallback((stageNum: number): Block[] => {
    const stageConf = STAGES[stageNum - 1] || STAGES[0];
    const blocks: Block[] = [];
    const marginX = 60;
    const startY = 56;
    const gapX = 14;
    const gapY = 14;
    const totalGapX = gapX * (COLS - 1);
    const availableWidth = CANVAS_WIDTH - marginX * 2 - totalGapX;
    const blockWidth = Math.floor(availableWidth / COLS);
    const blockHeight = 32;

    let id = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = marginX + c * (blockWidth + gapX);
        const y = startY + r * (blockHeight + gapY);
        const colorSet = stageConf.colors[r];
        blocks.push({
          id: id++,
          row: r,
          col: c,
          x,
          y,
          width: blockWidth,
          height: blockHeight,
          color: colorSet.fill,
          borderColor: colorSet.border,
          destroyed: false,
        });
      }
    }
    return blocks;
  }, []);

  // Spawn particle explosion when a block breaks
  const spawnParticles = (x: number, y: number, width: number, height: number, color: string) => {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.2;
      particlesRef.current.push({
        x: x + width / 2 + (Math.random() - 0.5) * (width * 0.5),
        y: y + height / 2 + (Math.random() - 0.5) * (height * 0.5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 4 + 2,
        color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02,
      });
    }
  };

  // Reset ball on top of paddle
  const resetBallOnPaddle = useCallback(() => {
    const paddle = paddleRef.current;
    ballRef.current.x = paddle.x + paddle.width / 2;
    ballRef.current.y = paddle.y - ballRef.current.radius;
    ballRef.current.vx = 0;
    ballRef.current.vy = 0;
  }, []);

  // Prevent horizontal ball trajectory: guarantees vertical velocity is always at least 38% of total speed
  const enforceMinimumVerticalSpeed = useCallback((speed: number) => {
    const MIN_VERTICAL_RATIO = 0.38; // at least 22°+ vertical inclination
    const minVy = speed * MIN_VERTICAL_RATIO;
    if (Math.abs(ballRef.current.vy) < minVy) {
      const signY = ballRef.current.vy < 0 ? -1 : 1;
      ballRef.current.vy = signY * minVy;
      const signX = ballRef.current.vx < 0 ? -1 : 1;
      const vxSq = Math.max(0, speed * speed - ballRef.current.vy * ballRef.current.vy);
      ballRef.current.vx = signX * Math.sqrt(vxSq);
    }
  }, []);

  // Launch the ball upwards with stage-appropriate speed
  const launchBall = useCallback(() => {
    const stageConf = STAGES[stageRef.current - 1] || STAGES[0];
    const speed = stageConf.ballSpeed;
    const angleJitter = (Math.random() - 0.5) * 0.4; // roughly ±12 degrees from vertical
    const launchAngle = -Math.PI / 2 + angleJitter;
    ballRef.current.vx = speed * Math.cos(launchAngle);
    ballRef.current.vy = speed * Math.sin(launchAngle);
    enforceMinimumVerticalSpeed(speed);
    sound.playLaunch();
    setGameState('playing');
  }, [enforceMinimumVerticalSpeed]);

  // Advance to next stage (1面 -> 2面 -> 3面 -> 4面)
  const handleAdvanceToNextStage = useCallback(() => {
    const nextStage = stageRef.current + 1;
    if (nextStage > TOTAL_STAGES) return;

    setStage(nextStage);
    stageRef.current = nextStage;
    const stageConf = STAGES[nextStage - 1];

    // Update paddle width according to new stage specifications
    paddleRef.current.width = stageConf.paddleWidth;
    paddleRef.current.x = Math.max(12, Math.min(CANVAS_WIDTH - 12 - stageConf.paddleWidth, (CANVAS_WIDTH - stageConf.paddleWidth) / 2));

    // Refresh blocks for new stage
    blocksRef.current = createBlocksForStage(nextStage);
    particlesRef.current = [];
    floatingScoresRef.current = [];
    setDestroyedCount(0);
    destroyedCountRef.current = 0;
    
    // Give fresh retries for new stage
    setRetriesLeft(MAX_RETRIES);
    retriesLeftRef.current = MAX_RETRIES;
    comboRef.current = 0;
    setCombo(0);

    resetBallOnPaddle();
    setGameState('ready');
  }, [createBlocksForStage, resetBallOnPaddle]);

  // Restart game completely from Stage 1
  const handleRestartFromStage1 = useCallback(() => {
    setStage(1);
    stageRef.current = 1;
    const stageConf = STAGES[0];

    paddleRef.current.width = stageConf.paddleWidth;
    paddleRef.current.x = (CANVAS_WIDTH - stageConf.paddleWidth) / 2;

    blocksRef.current = createBlocksForStage(1);
    particlesRef.current = [];
    floatingScoresRef.current = [];
    setDestroyedCount(0);
    destroyedCountRef.current = 0;
    setRetriesLeft(MAX_RETRIES);
    retriesLeftRef.current = MAX_RETRIES;
    setScore(0);
    scoreRef.current = 0;
    setCombo(0);
    comboRef.current = 0;

    resetBallOnPaddle();
    setGameState('ready');
  }, [createBlocksForStage, resetBallOnPaddle]);

  // Retry current stage on game over
  const handleRetryCurrentStage = useCallback(() => {
    const curStage = stageRef.current;
    const stageConf = STAGES[curStage - 1];

    paddleRef.current.width = stageConf.paddleWidth;
    paddleRef.current.x = (CANVAS_WIDTH - stageConf.paddleWidth) / 2;

    blocksRef.current = createBlocksForStage(curStage);
    particlesRef.current = [];
    floatingScoresRef.current = [];
    setDestroyedCount(0);
    destroyedCountRef.current = 0;
    setRetriesLeft(MAX_RETRIES);
    retriesLeftRef.current = MAX_RETRIES;
    comboRef.current = 0;
    setCombo(0);

    resetBallOnPaddle();
    setGameState('ready');
  }, [createBlocksForStage, resetBallOnPaddle]);

  // Combined Start & Pause Toggle
  const handleStartPauseToggle = useCallback(() => {
    const current = gameStateRef.current;
    if (current === 'ready') {
      launchBall();
    } else if (current === 'playing') {
      setGameState('paused');
    } else if (current === 'paused') {
      setGameState('playing');
    } else if (current === 'stage_cleared') {
      handleAdvanceToNextStage();
    } else if (current === 'all_cleared' || current === 'gameover') {
      handleRestartFromStage1();
      launchBall();
    }
  }, [launchBall, handleAdvanceToNextStage, handleRestartFromStage1]);

  // Toggle sound mute
  const handleToggleMute = () => {
    const nextMuted = sound.toggleMute();
    setIsMuted(nextMuted);
  };

  // Setup initial stage 1 blocks on mount
  useEffect(() => {
    blocksRef.current = createBlocksForStage(1);
    resetBallOnPaddle();
  }, [createBlocksForStage, resetBallOnPaddle]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        paddleRef.current.movingLeft = true;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        paddleRef.current.movingRight = true;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        handleStartPauseToggle();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        paddleRef.current.movingLeft = false;
      }
      if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        paddleRef.current.movingRight = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleStartPauseToggle]);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 16.666, 2.0);
      lastTime = currentTime;

      const paddle = paddleRef.current;
      const ball = ballRef.current;
      const currentState = gameStateRef.current;
      const stageConf = STAGES[stageRef.current - 1] || STAGES[0];
      const speed = stageConf.ballSpeed;

      // 1. Paddle movement
      if (paddle.movingLeft) {
        paddle.x -= paddle.speed * dt;
        if (paddle.x < 12) paddle.x = 12;
      }
      if (paddle.movingRight) {
        paddle.x += paddle.speed * dt;
        if (paddle.x + paddle.width > CANVAS_WIDTH - 12) {
          paddle.x = CANVAS_WIDTH - 12 - paddle.width;
        }
      }

      // Ball sits on paddle if ready
      if (currentState === 'ready') {
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius;
      }

      // 2. Ball physics & collisions
      if (currentState === 'playing') {
        // High-speed ball uses 3 sub-steps for smooth precision collision
        const steps = speed > 10 ? 3 : 2;
        const subDt = dt / steps;

        for (let step = 0; step < steps; step++) {
          ball.x += ball.vx * subDt;
          ball.y += ball.vy * subDt;

          // Wall collision: Left wall
          if (ball.x - ball.radius <= 12) {
            ball.x = 12 + ball.radius;
            ball.vx = Math.abs(ball.vx);
            enforceMinimumVerticalSpeed(speed);
            sound.playWallHit();
          }
          // Wall collision: Right wall
          else if (ball.x + ball.radius >= CANVAS_WIDTH - 12) {
            ball.x = CANVAS_WIDTH - 12 - ball.radius;
            ball.vx = -Math.abs(ball.vx);
            enforceMinimumVerticalSpeed(speed);
            sound.playWallHit();
          }

          // Wall collision: Ceiling (Top wall)
          if (ball.y - ball.radius <= 12) {
            ball.y = 12 + ball.radius;
            ball.vy = Math.abs(ball.vy);
            enforceMinimumVerticalSpeed(speed);
            sound.playWallHit();
          }

          // Paddle collision (bottom horizontal bar)
          const paddleTop = paddle.y;
          const paddleBottom = paddle.y + paddle.height;
          const paddleLeft = paddle.x;
          const paddleRight = paddle.x + paddle.width;

          if (
            ball.vy > 0 &&
            ball.y + ball.radius >= paddleTop &&
            ball.y - ball.radius <= paddleBottom &&
            ball.x + ball.radius >= paddleLeft &&
            ball.x - ball.radius <= paddleRight
          ) {
            ball.y = paddleTop - ball.radius;
            const hitRatio = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
            // Limit ratio to ±0.8 to strictly avoid flat horizontal paddle reflections
            const clampedRatio = Math.max(-0.8, Math.min(0.8, hitRatio));
            const bounceAngle = -Math.PI / 2 + clampedRatio * (Math.PI / 3.8); // max deflection ~±47°
            ball.vx = speed * Math.cos(bounceAngle);
            ball.vy = speed * Math.sin(bounceAngle);
            enforceMinimumVerticalSpeed(speed);
            sound.playPaddleHit();

            // When the paddle bounces the ball back, combo resets
            comboRef.current = 0;
            setCombo(0);
          }

          // Block collisions
          const blocks = blocksRef.current;
          let hitBlock = false;

          for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.destroyed) continue;

            const blockCenterX = b.x + b.width / 2;
            const blockCenterY = b.y + b.height / 2;
            const diffX = ball.x - blockCenterX;
            const diffY = ball.y - blockCenterY;
            const halfW = b.width / 2;
            const halfH = b.height / 2;

            const overlapX = halfW + ball.radius - Math.abs(diffX);
            const overlapY = halfH + ball.radius - Math.abs(diffY);

            if (overlapX > 0 && overlapY > 0) {
              b.destroyed = true;
              hitBlock = true;

              const nextDestroyedCount = destroyedCountRef.current + 1;
              destroyedCountRef.current = nextDestroyedCount;
              setDestroyedCount(nextDestroyedCount);

              // Combo and score calculation
              const newCombo = comboRef.current + 1;
              comboRef.current = newCombo;
              setCombo(newCombo);

              const pointsEarned = BASE_BLOCK_SCORE * newCombo;
              const newScore = scoreRef.current + pointsEarned;
              scoreRef.current = newScore;
              setScore(newScore);

              if (newScore > highScoreRef.current) {
                highScoreRef.current = newScore;
                setHighScore(newScore);
                try {
                  localStorage.setItem('breakout_game_highscore', newScore.toString());
                } catch {
                  // ignore
                }
              }

              // Floating score effect on canvas
              floatingScoresRef.current.push({
                id: Math.random(),
                x: b.x + b.width / 2,
                y: b.y + b.height / 2,
                text: `+${pointsEarned}`,
                combo: newCombo,
                alpha: 1,
                vy: -1.2,
              });

              spawnParticles(b.x, b.y, b.width, b.height, b.color);
              sound.playBlockHit(newCombo);

              // REQUIREMENT: 玉が水平に移動するのを防ぐ
              // Rebound in 4 directions while enforcing healthy vertical component
              if (overlapY < overlapX) {
                if (diffY < 0) {
                  // Hit top of block (e.g. from ceiling): bounce upwards
                  ball.y = b.y - ball.radius - 1;
                  // Random upward angle between -45° and -135° (avoids horizontal near -0° or -180°)
                  const randomUpwardAngle = -(Math.random() * 90 + 45) * (Math.PI / 180);
                  ball.vx = speed * Math.cos(randomUpwardAngle);
                  ball.vy = speed * Math.sin(randomUpwardAngle);
                } else {
                  // Hit bottom of block (from paddle): bounce downwards
                  ball.y = b.y + b.height + ball.radius + 1;
                  // Random downward angle between 45° and 135°
                  const randomDownwardAngle = (Math.random() * 90 + 45) * (Math.PI / 180);
                  ball.vx = speed * Math.cos(randomDownwardAngle);
                  ball.vy = speed * Math.sin(randomDownwardAngle);
                }
              } else {
                // Hit side of block: deflect away horizontally, but guarantee strong vertical angle!
                const upOrDown = Math.random() < 0.5 ? -1 : 1;
                if (diffX < 0) {
                  ball.x = b.x - ball.radius - 1;
                  // Deflect leftward with steep vertical angle (around 135° or 225°)
                  const angleDeg = (upOrDown < 0 ? -135 : 135) + (Math.random() - 0.5) * 30;
                  const rad = (angleDeg * Math.PI) / 180;
                  ball.vx = speed * Math.cos(rad);
                  ball.vy = speed * Math.sin(rad);
                } else {
                  ball.x = b.x + b.width + ball.radius + 1;
                  // Deflect rightward with steep vertical angle (around 45° or -45°)
                  const angleDeg = (upOrDown < 0 ? -45 : 45) + (Math.random() - 0.5) * 30;
                  const rad = (angleDeg * Math.PI) / 180;
                  ball.vx = speed * Math.cos(rad);
                  ball.vy = speed * Math.sin(rad);
                }
              }

              // Double guarantee against near-horizontal drift
              enforceMinimumVerticalSpeed(speed);

              // STAGE CLEAR CHECK:
              // 1面クリア -> 2面へ
              // 2面クリア -> 3面へ
              // 3面クリア -> 4面（最終面）へ
              // 4面クリア -> 完全クリア！
              if (nextDestroyedCount >= TOTAL_BLOCKS) {
                if (stageRef.current < TOTAL_STAGES) {
                  setGameState('stage_cleared');
                } else {
                  setGameState('all_cleared');
                }
                sound.playClear();
                break;
              }

              break;
            }
          }

          if (hitBlock && destroyedCountRef.current >= TOTAL_BLOCKS) {
            break;
          }

          // Fall off bottom
          if (ball.y - ball.radius > CANVAS_HEIGHT) {
            comboRef.current = 0;
            setCombo(0);

            const currentRetries = retriesLeftRef.current;
            if (currentRetries > 0) {
              const nextRetries = currentRetries - 1;
              retriesLeftRef.current = nextRetries;
              setRetriesLeft(nextRetries);
              sound.playMiss();
              resetBallOnPaddle();
              setGameState('ready');
            } else {
              sound.playGameOver();
              setGameState('gameover');
            }
            break;
          }
        }
      }

      // 3. Particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= p.decay * dt;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      // Floating Scores
      const floatingScores = floatingScoresRef.current;
      for (let i = floatingScores.length - 1; i >= 0; i--) {
        const fs = floatingScores[i];
        fs.y += fs.vy * dt;
        fs.alpha -= 0.02 * dt;
        if (fs.alpha <= 0) {
          floatingScores.splice(i, 1);
        }
      }

      // 4. Render
      renderScene(ctx);

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [resetBallOnPaddle, enforceMinimumVerticalSpeed]);

  // Drawing routine
  const renderScene = (ctx: CanvasRenderingContext2D) => {
    // Clear canvas
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Outer playfield boundary border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 20);

    // Neon glow border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 20);

    // Stage indicator in canvas top-left corner
    ctx.save();
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.fillText(`STAGE ${currentStageConfig.stage} / ${TOTAL_STAGES}`, 24, 32);
    ctx.restore();

    // Draw blocks (横5 × 縦4)
    const blocks = blocksRef.current;
    blocks.forEach((b) => {
      if (b.destroyed) return;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(b.x + 2, b.y + 3, b.width, b.height, 6);
      ctx.fill();

      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
      grad.addColorStop(0, b.borderColor);
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 6);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.roundRect(b.x + 3, b.y + 2, b.width - 6, b.height * 0.35, 3);
      ctx.fill();

      ctx.strokeStyle = b.borderColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 6);
      ctx.stroke();
    });

    // Draw particles
    particlesRef.current.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw floating score popups (enlarged to match 32px block height)
    floatingScoresRef.current.forEach((fs) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, fs.alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (fs.combo > 1) {
        ctx.font = '900 16px "Segoe UI", sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.strokeText(`${fs.combo}x COMBO!`, fs.x, fs.y - 18);
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#b45309';
        ctx.shadowBlur = 8;
        ctx.fillText(`${fs.combo}x COMBO!`, fs.x, fs.y - 18);
      }

      ctx.font = '900 30px "Segoe UI", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      const textOffsetY = fs.combo > 1 ? 10 : 0;
      ctx.strokeText(fs.text, fs.x, fs.y + textOffsetY);

      ctx.fillStyle = fs.combo > 1 ? '#fde047' : '#38bdf8';
      ctx.shadowColor = fs.combo > 1 ? '#d97706' : '#0284c7';
      ctx.shadowBlur = 10;
      ctx.fillText(fs.text, fs.x, fs.y + textOffsetY);

      ctx.restore();
    });

    // Draw paddle
    const paddle = paddleRef.current;

    // Upward holographic guide beam
    const beamGrad = ctx.createLinearGradient(0, paddle.y - 35, 0, paddle.y);
    beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    beamGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.08)');
    beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.22)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(paddle.x, paddle.y - 35, paddle.width, 35);

    // Left and right vertical guide markers
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(paddle.x, paddle.y);
    ctx.lineTo(paddle.x, paddle.y - 12);
    ctx.moveTo(paddle.x + paddle.width, paddle.y);
    ctx.lineTo(paddle.x + paddle.width, paddle.y - 12);
    ctx.stroke();

    // Paddle drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y + 4, paddle.width, paddle.height, 9);
    ctx.fill();

    // Paddle outer neon glow
    ctx.save();
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 14;

    const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    paddleGrad.addColorStop(0, '#38bdf8');
    paddleGrad.addColorStop(0.5, '#0284c7');
    paddleGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = paddleGrad;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 9);
    ctx.fill();
    ctx.restore();

    // Top reflective strip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(paddle.x + 4, paddle.y + 2, paddle.width - 8, 3.5, 2);
    ctx.fill();

    // Center target pip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(paddle.x + paddle.width / 2, paddle.y + paddle.height / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Paddle border
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 9);
    ctx.stroke();

    // Draw ball
    const ball = ballRef.current;
    ctx.save();
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const ballGrad = ctx.createRadialGradient(
      ball.x - ball.radius * 0.3,
      ball.y - ball.radius * 0.3,
      1,
      ball.x,
      ball.y,
      ball.radius
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.6, '#e0f2fe');
    ballGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Ready prompt on canvas
    if (gameStateRef.current === 'ready') {
      ctx.save();
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(`【${currentStageConfig.name}】画面をタップ または「スタート」で玉を発射！`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 120);

      // Display stage modifiers
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(currentStageConfig.modifierText, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 98);
      ctx.restore();
    }

    // Pause overlay on canvas
    if (gameStateRef.current === 'paused') {
      ctx.fillStyle = 'rgba(3, 7, 18, 0.65)';
      ctx.fillRect(10, 10, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 20);

      ctx.save();
      ctx.font = '900 32px "Segoe UI", sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#0284c7';
      ctx.shadowBlur = 15;
      ctx.fillText('一時停止中', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);

      ctx.font = '15px "Segoe UI", sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.shadowBlur = 0;
      ctx.fillText('画面をタップ または「再開」ボタンで再開', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      ctx.restore();
    }
  };

  // Move paddle based on clientX
  const updatePaddleFromClientX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const scaleX = CANVAS_WIDTH / rect.width;
    const canvasX = relativeX * scaleX;

    const paddle = paddleRef.current;
    paddle.x = Math.max(12, Math.min(CANVAS_WIDTH - 12 - paddle.width, canvasX - paddle.width / 2));
  }, []);

  // REQUIREMENT: タップの判定が厳しすぎる。もう少し長い時間のタップも許してほしい。
  // Touch handlers with relaxed timing (< 750ms) and distance threshold (< 25px)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    touchStartPos.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: performance.now(),
    };
    touchMaxMovement.current = 0;
    updatePaddleFromClientX(touch.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touchStartPos.current) {
      const dist = Math.hypot(touch.clientX - touchStartPos.current.x, touch.clientY - touchStartPos.current.y);
      if (dist > touchMaxMovement.current) {
        touchMaxMovement.current = dist;
      }
    }
    updatePaddleFromClientX(touch.clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartPos.current) {
      const elapsed = performance.now() - touchStartPos.current.time;
      const maxMove = touchMaxMovement.current;
      const curState = gameStateRef.current;

      // In non-playing states (ready, cleared, gameover), ANY touch/tap activates the next action!
      if (curState === 'ready' || curState === 'stage_cleared' || curState === 'all_cleared' || curState === 'gameover') {
        handleStartPauseToggle();
      } else if (curState === 'playing' || curState === 'paused') {
        // While in play, generous tap recognition: up to 750ms duration and up to 25px finger wobble allowed
        if (elapsed < 750 && maxMove < 25) {
          handleStartPauseToggle();
        }
      }
    }
    touchStartPos.current = null;
    touchMaxMovement.current = 0;
  };

  // Desktop click on canvas
  const handleCanvasClick = () => {
    handleStartPauseToggle();
  };

  // Start / Pause button configuration
  const getStartPauseButtonConfig = () => {
    if (gameState === 'ready') {
      return {
        label: `${currentStageConfig.name} スタート`,
        icon: <Play className="w-5 h-5 fill-current" />,
        style: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25 ring-1 ring-emerald-400/50',
      };
    }
    if (gameState === 'playing') {
      return {
        label: '一時停止',
        icon: <Pause className="w-5 h-5" />,
        style: 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600',
      };
    }
    if (gameState === 'paused') {
      return {
        label: '再開',
        icon: <Play className="w-5 h-5 fill-current" />,
        style: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20',
      };
    }
    if (gameState === 'stage_cleared') {
      return {
        label: '次の面へ進む',
        icon: <ChevronRight className="w-5 h-5" />,
        style: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 ring-1 ring-cyan-400/50',
      };
    }
    // all_cleared or gameover
    return {
      label: '最初からスタート',
      icon: <RotateCcw className="w-5 h-5" />,
      style: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25 ring-1 ring-emerald-400/50',
    };
  };

  const btnConfig = getStartPauseButtonConfig();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-3 sm:p-6 select-none font-sans">
      {/* Top Header Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                ブロック崩し
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                currentStageConfig.isFinal 
                  ? 'bg-rose-950/70 border-rose-600 text-rose-300 animate-pulse'
                  : 'bg-cyan-950/70 border-cyan-700/80 text-cyan-300'
              }`}>
                {currentStageConfig.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {currentStageConfig.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMute}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title={isMuted ? 'サウンドをオン' : 'サウンドをミュート'}
            aria-label="Sound Toggle"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>

          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
            title="遊び方・ステージ仕様"
            aria-label="Help"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="w-full max-w-5xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-5">
        {/* Playfield Canvas Container */}
        <div className="w-full lg:flex-1 max-w-[760px] flex flex-col gap-2.5">
          <div className="relative w-full rounded-2xl overflow-hidden border-2 border-slate-800/80 shadow-2xl shadow-cyan-950/40 bg-slate-950 aspect-[4/3]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleCanvasClick}
              className="w-full h-full block cursor-pointer"
            />

            {/* Stage Clear Modal (Stages 1, 2, 3) */}
            {gameState === 'stage_cleared' && (
              <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center mb-3 text-cyan-400 shadow-lg shadow-cyan-500/30">
                  <FastForward className="w-8 h-8" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-cyan-400 mb-1 tracking-tight">
                  {currentStageConfig.name} クリア！
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mb-4 text-center max-w-sm">
                  全20個のブロックを破壊しました！
                </p>

                {/* Next stage challenge preview */}
                <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 mb-5 w-80 text-center space-y-2.5">
                  <div className="text-xs text-slate-400 font-semibold">現在の獲得スコア</div>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {score.toLocaleString()} 点
                  </div>
                  
                  <div className="p-2.5 rounded-lg bg-cyan-950/50 border border-cyan-800/60 text-xs text-cyan-200 font-bold">
                    <span className="block text-[11px] text-cyan-400 mb-0.5">次ステージの予告</span>
                    {stage === 1 && '▶ 2面：パドルの幅が【3分の2（88px）】になります！'}
                    {stage === 2 && '▶ 3面：球の速度が【1.5倍】に速くなります！'}
                    {stage === 3 && '▶ 4面（最終面）：パドルの幅が【半分（66px）】になります！'}
                  </div>
                </div>

                <button
                  onClick={handleAdvanceToNextStage}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <span>次の面（{stage + 1}面）へ進む</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* All Stages Cleared Modal (Grand Victory after Stage 4) */}
            {gameState === 'all_cleared' && (
              <div className="absolute inset-0 z-30 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mb-3 text-amber-400 shadow-lg shadow-amber-500/30 animate-bounce">
                  <Trophy className="w-9 h-9" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 bg-clip-text text-transparent mb-1 tracking-tight text-center">
                  全ステージ完全制覇！
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mb-4 text-center max-w-sm">
                  お見事！最終面（4面）までの全80ブロックを全て撃破しました！
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 w-76 text-center space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 font-semibold">最終合計スコア</div>
                    <div className="text-3xl font-black text-amber-400 font-mono">
                      {score.toLocaleString()} 点
                    </div>
                    {score >= highScore && score > 0 && (
                      <div className="text-xs text-amber-300 font-bold mt-0.5">
                        🎉 新ハイスコア達成！
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-around text-xs text-slate-300">
                    <span>クリアステージ: <strong className="text-cyan-400 font-bold">全4面</strong></span>
                    <span>ハイスコア: <strong className="text-yellow-400 font-bold">{highScore.toLocaleString()}</strong></span>
                  </div>
                </div>

                <button
                  onClick={handleRestartFromStage1}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-base shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>最初からもう一度遊ぶ</span>
                </button>
              </div>
            )}

            {/* Game Over Modal */}
            {gameState === 'gameover' && (
              <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-3 text-rose-400 shadow-lg shadow-rose-500/30">
                  <span className="text-3xl font-black">✕</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-rose-400 mb-1 tracking-tight">
                  ゲームオーバー
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mb-4 text-center max-w-sm">
                  {currentStageConfig.name}で玉が通り過ぎました。
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-5 w-76 text-center space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 font-semibold">最終スコア</div>
                    <div className="text-3xl font-black text-amber-400 font-mono">
                      {score.toLocaleString()} 点
                    </div>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-around text-xs text-slate-300">
                    <span>到達ステージ: <strong className="text-rose-400 font-bold">{currentStageConfig.name}</strong></span>
                    <span>ハイスコア: <strong className="text-yellow-400 font-bold">{highScore.toLocaleString()}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRetryCurrentStage}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 shadow active:scale-95 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>この面を再挑戦</span>
                  </button>
                  <button
                    onClick={handleRestartFromStage1}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white font-bold text-sm shadow-lg shadow-rose-500/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>1面からやり直す</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Touch Swipe Track */}
          <div
            onTouchStart={(e) => updatePaddleFromClientX(e.touches[0].clientX)}
            onTouchMove={(e) => updatePaddleFromClientX(e.touches[0].clientX)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-center text-xs text-slate-400 cursor-ew-resize select-none active:bg-cyan-950/20 active:border-cyan-700/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">◀</span>
              <span>ここを指で左右にスワイプして棒を快適操作</span>
              <span className="text-cyan-400">▶</span>
            </div>
          </div>
        </div>

        {/* Right Side Panel */}
        <aside className="w-full lg:w-64 flex flex-col gap-3 shrink-0">
          {/* Current Stage Card */}
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <div>
                <span className="font-black text-sm text-cyan-200 block">
                  ステージ: {currentStageConfig.name}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  {currentStageConfig.badge}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">
                {stage} / {TOTAL_STAGES}
              </span>
            </div>
          </div>

          {/* 1. 棒の操作枠（左右ボタン） */}
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex items-center gap-2">
            <button
              onMouseDown={() => { paddleRef.current.movingLeft = true; }}
              onMouseUp={() => { paddleRef.current.movingLeft = false; }}
              onMouseLeave={() => { paddleRef.current.movingLeft = false; }}
              onTouchStart={(e) => { e.preventDefault(); paddleRef.current.movingLeft = true; }}
              onTouchEnd={(e) => { e.preventDefault(); paddleRef.current.movingLeft = false; }}
              className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-700 text-slate-100 border border-slate-700 shadow font-bold text-base transition-colors cursor-pointer select-none"
              aria-label="左へ移動"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>左</span>
            </button>
            <button
              onMouseDown={() => { paddleRef.current.movingRight = true; }}
              onMouseUp={() => { paddleRef.current.movingRight = false; }}
              onMouseLeave={() => { paddleRef.current.movingRight = false; }}
              onTouchStart={(e) => { e.preventDefault(); paddleRef.current.movingRight = true; }}
              onTouchEnd={(e) => { e.preventDefault(); paddleRef.current.movingRight = false; }}
              className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-700 text-slate-100 border border-slate-700 shadow font-bold text-base transition-colors cursor-pointer select-none"
              aria-label="右へ移動"
            >
              <span>右</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* 2. スタートボタンがある枠 */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col gap-3">
            {/* スタート・一時停止・再開 兼用ボタン */}
            <button
              onClick={handleStartPauseToggle}
              className={`w-full h-12 px-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-150 shadow-md active:scale-95 cursor-pointer ${btnConfig.style}`}
            >
              {btnConfig.icon}
              <span>{btnConfig.label}</span>
            </button>

            {/* 壊したブロックの数 */}
            <div className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-base font-bold text-slate-200 shadow-inner">
              <span>壊したブロックの数</span>
              <span className="font-mono text-cyan-400 font-bold text-base">
                {destroyedCount} / {TOTAL_BLOCKS}
              </span>
            </div>

            {/* 残り表示 */}
            <div className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-850 flex items-center justify-between text-sm">
              <span className="text-slate-400 font-medium">残り:</span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded text-sm ${
                retriesLeft === 2 ? 'text-emerald-400 bg-emerald-950/80 border border-emerald-800/50' :
                retriesLeft === 1 ? 'text-amber-400 bg-amber-950/80 border border-amber-800/50' :
                'text-rose-400 bg-rose-950/80 border border-rose-800/50'
              }`}>
                {retriesLeft} 回
              </span>
            </div>
          </div>

          {/* 3. ゲームスコアを表示する枠 */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col gap-3">
            {/* 現在のスコア */}
            <div className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-base font-bold text-slate-200 shadow-inner">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Sparkles className="w-4 h-4 text-amber-400" />
                現在のスコア
              </span>
              <span className="font-mono text-xl text-amber-400 font-black">
                {score.toLocaleString()}
              </span>
            </div>

            {/* ハイスコア */}
            <div className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-base font-bold text-slate-200 shadow-inner">
              <span className="flex items-center gap-1.5 text-yellow-300">
                <Trophy className="w-4 h-4 text-yellow-400" />
                ハイスコア
              </span>
              <span className="font-mono text-xl text-yellow-400 font-black">
                {highScore.toLocaleString()}
              </span>
            </div>

            {/* コンボ数・倍率インジケーター */}
            {combo > 1 && (
              <div className="w-full py-2 px-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/20 to-amber-500/15 border border-amber-500/40 flex items-center justify-between text-xs font-bold text-amber-300 animate-pulse">
                <span className="flex items-center gap-1">
                  <Flame className="w-4 h-4 text-orange-400 fill-current" />
                  コンボ発生中
                </span>
                <span className="font-mono text-sm text-amber-200 font-black">
                  {combo} 連続（×{combo}倍！）
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* Rules & Stage Info Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
                aria-label="閉じる"
              >
                ✕
              </button>

              <h3 className="text-xl font-black text-cyan-400 mb-3 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                全4ステージの仕様とルール
              </h3>

              {/* Stage breakdown */}
              <div className="space-y-2 mb-4">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="font-bold text-cyan-300 block mb-0.5">【1面】基本ステージ</span>
                  <span className="text-slate-400">パドル幅 132px (通常) / 球速 通常 (7.5)</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="font-bold text-purple-300 block mb-0.5">【2面】パドル縮小</span>
                  <span className="text-slate-400">パドル幅が3分の2（88px）に縮小！慎重に玉を捉えよう。</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="font-bold text-amber-300 block mb-0.5">【3面】スピードアップ</span>
                  <span className="text-slate-400">パドル幅 2/3 のまま、球の速度が1.5倍に超加速！</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="font-bold text-rose-300 block mb-0.5">【4面・最終面】極限の挑戦</span>
                  <span className="text-slate-400">パドルの幅が半分（66px）＆ 球速1.5倍！完全制覇を目指そう！</span>
                </div>
              </div>

              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside border-t border-slate-850 pt-3">
                <li>
                  <strong className="text-slate-100">水平移動の防止:</strong> 玉が真横に移動し続けてスタックしないよう、反射時に適度な縦方向の推進力が常時維持されます。
                </li>
                <li>
                  <strong className="text-slate-100">タップ判定:</strong> 長めのタップでも確実に反応するようタップ判定時間を大幅に緩和（約0.75秒までタップ受付）しています。
                </li>
                <li>
                  <strong className="text-slate-100">コンボシステム:</strong> 棒で打ち返すまで連続でブロックを壊すと得点が2倍、3倍と乗算されます。
                </li>
              </ul>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full mt-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors cursor-pointer text-sm"
              >
                了解して閉じる
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
