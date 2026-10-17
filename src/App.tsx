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
  Flame
} from 'lucide-react';
import { sound } from './utils/audio';

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const COLS = 5;
const ROWS = 4;
const TOTAL_BLOCKS = COLS * ROWS; // 20 blocks
const BALL_SPEED = 7.5;
const BALL_RADIUS = 9;
const PADDLE_WIDTH = 132;
const PADDLE_HEIGHT = 18;
const PADDLE_SPEED = 9;
const PADDLE_Y = CANVAS_HEIGHT - 70;
const MAX_RETRIES = 2; // 玉の発射し直しは２回
const BASE_BLOCK_SCORE = 100; // ブロックの基本得点

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

const ROW_COLORS = [
  { fill: '#f43f5e', border: '#fda4af', name: 'ローズ' },    // Row 0: Red / Rose
  { fill: '#f97316', border: '#fdba74', name: 'オレンジ' },  // Row 1: Orange
  { fill: '#10b981', border: '#6ee7b7', name: 'グリーン' },  // Row 2: Emerald Green
  { fill: '#06b6d4', border: '#67e8f9', name: 'シアン' },    // Row 3: Electric Cyan
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game states:
  // 'ready': ball resting on paddle, waiting to start
  // 'playing': ball in motion
  // 'paused': game paused
  // 'cleared': all 20 blocks broken
  // 'gameover': ball dropped during 2nd retry
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'paused' | 'cleared' | 'gameover'>('ready');
  const [retriesLeft, setRetriesLeft] = useState<number>(MAX_RETRIES); // 2, 1, 0
  const [destroyedCount, setDestroyedCount] = useState<number>(0);
  
  // Scoring system states
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

  // Mutable game simulation refs
  const paddleRef = useRef({
    x: (CANVAS_WIDTH - PADDLE_WIDTH) / 2,
    y: PADDLE_Y,
    width: PADDLE_WIDTH,
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

  // Touch tracking to distinguish tap from swipe
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwiping = useRef(false);

  // Initialize blocks: 横5 × 縦4 = 20 blocks
  const createBlocks = useCallback((): Block[] => {
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
        const colorSet = ROW_COLORS[r];
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

  // Launch the ball upwards
  const launchBall = useCallback(() => {
    const angleJitter = (Math.random() - 0.5) * 0.5;
    const launchAngle = -Math.PI / 2 + angleJitter;
    ballRef.current.vx = BALL_SPEED * Math.cos(launchAngle);
    ballRef.current.vy = BALL_SPEED * Math.sin(launchAngle);
    sound.playLaunch();
    setGameState('playing');
  }, []);

  // Reset game to fresh state
  const handleResetGame = useCallback(() => {
    blocksRef.current = createBlocks();
    particlesRef.current = [];
    floatingScoresRef.current = [];
    setDestroyedCount(0);
    setRetriesLeft(MAX_RETRIES);
    setScore(0);
    scoreRef.current = 0;
    setCombo(0);
    comboRef.current = 0;
    paddleRef.current.x = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
    resetBallOnPaddle();
    setGameState('ready');
  }, [createBlocks, resetBallOnPaddle]);

  // Combined Start & Pause Toggle
  const handleStartPauseToggle = useCallback(() => {
    const current = gameStateRef.current;
    if (current === 'ready') {
      launchBall();
    } else if (current === 'playing') {
      setGameState('paused');
    } else if (current === 'paused') {
      setGameState('playing');
    } else if (current === 'cleared' || current === 'gameover') {
      // Start a new game
      handleResetGame();
      launchBall();
    }
  }, [launchBall, handleResetGame]);

  // Toggle sound mute
  const handleToggleMute = () => {
    const nextMuted = sound.toggleMute();
    setIsMuted(nextMuted);
  };

  // Setup initial blocks on mount
  useEffect(() => {
    blocksRef.current = createBlocks();
    resetBallOnPaddle();
  }, [createBlocks, resetBallOnPaddle]);

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
        const steps = 2;
        const subDt = dt / steps;

        for (let step = 0; step < steps; step++) {
          ball.x += ball.vx * subDt;
          ball.y += ball.vy * subDt;

          // Wall collision: Left wall
          if (ball.x - ball.radius <= 12) {
            ball.x = 12 + ball.radius;
            ball.vx = Math.abs(ball.vx);
            sound.playWallHit();
          }
          // Wall collision: Right wall
          else if (ball.x + ball.radius >= CANVAS_WIDTH - 12) {
            ball.x = CANVAS_WIDTH - 12 - ball.radius;
            ball.vx = -Math.abs(ball.vx);
            sound.playWallHit();
          }

          // Wall collision: Ceiling (Top wall)
          if (ball.y - ball.radius <= 12) {
            ball.y = 12 + ball.radius;
            ball.vy = Math.abs(ball.vy);
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
            const clampedRatio = Math.max(-0.9, Math.min(0.9, hitRatio));
            const bounceAngle = -Math.PI / 2 + clampedRatio * (Math.PI / 3);
            ball.vx = BALL_SPEED * Math.cos(bounceAngle);
            ball.vy = BALL_SPEED * Math.sin(bounceAngle);
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

              // REQUIREMENT:
              // "ブロックを壊した際にコンボ数に応じて得点が加算される。
              //  ２つ目のブロックは２倍、３つ目のブロックは３倍、という具合に得点をつける。"
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

              // 4-direction collision rebound
              if (overlapY < overlapX) {
                if (diffY < 0) {
                  // Hit top of block (e.g. from ceiling): bounce upwards
                  ball.y = b.y - ball.radius - 1;
                  const randomUpwardAngle = -(Math.random() * 110 + 35) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomUpwardAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomUpwardAngle);
                } else {
                  // Hit bottom of block (from paddle): bounce downwards
                  ball.y = b.y + b.height + ball.radius + 1;
                  const randomDownwardAngle = (Math.random() * 110 + 35) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomDownwardAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomDownwardAngle);
                }
              } else {
                if (diffX < 0) {
                  ball.x = b.x - ball.radius - 1;
                  const randomLeftAngle = (Math.random() * 110 + 125) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomLeftAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomLeftAngle);
                } else {
                  ball.x = b.x + b.width + ball.radius + 1;
                  const randomRightAngle = ((Math.random() * 110 - 55) * Math.PI) / 180;
                  ball.vx = BALL_SPEED * Math.cos(randomRightAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomRightAngle);
                }
              }

              if (nextDestroyedCount >= TOTAL_BLOCKS) {
                setGameState('cleared');
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
  }, [resetBallOnPaddle]);

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

    // Draw floating score popups (REQUIREMENT: キャンバス上のポップアップ演出の文字をブロックと同じくらいに大きくする)
    floatingScoresRef.current.forEach((fs) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, fs.alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (fs.combo > 1) {
        // Combo label
        ctx.font = '900 16px "Segoe UI", sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.strokeText(`${fs.combo}x COMBO!`, fs.x, fs.y - 18);
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#b45309';
        ctx.shadowBlur = 8;
        ctx.fillText(`${fs.combo}x COMBO!`, fs.x, fs.y - 18);
      }

      // Main score number: 30px font matches the 32px block height!
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
    ctx.roundRect(paddle.x + 6, paddle.y + 2, paddle.width - 12, 3.5, 2);
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
      ctx.fillText('画面をタップ または「スタート」で玉を発射！', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 120);
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

  // Touch handlers on canvas
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    touchStartPos.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: performance.now(),
    };
    isSwiping.current = false;
    updatePaddleFromClientX(touch.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touchStartPos.current) {
      const dist = Math.hypot(touch.clientX - touchStartPos.current.x, touch.clientY - touchStartPos.current.y);
      if (dist > 8) {
        isSwiping.current = true;
      }
    }
    updatePaddleFromClientX(touch.clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartPos.current) {
      const elapsed = performance.now() - touchStartPos.current.time;
      if (!isSwiping.current && elapsed < 350) {
        handleStartPauseToggle();
      }
    }
    touchStartPos.current = null;
    isSwiping.current = false;
  };

  // Desktop click on canvas
  const handleCanvasClick = () => {
    handleStartPauseToggle();
  };

  // Start / Pause button configuration
  const getStartPauseButtonConfig = () => {
    if (gameState === 'ready') {
      return {
        label: 'スタート',
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
    // cleared or gameover
    return {
      label: 'スタート',
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
            <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              ブロック崩し
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">横５×縦４ クラシック・アーケード</p>
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
            title="遊び方・ルール"
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

            {/* Game Clear Overlay Modal */}
            {gameState === 'cleared' && (
              <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-4 text-emerald-400 shadow-lg shadow-emerald-500/30">
                  <Trophy className="w-8 h-8" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-emerald-400 mb-1 tracking-tight">
                  ゲームクリア！
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mb-5 text-center max-w-sm">
                  お見事！すべてのブロック（20個）を見事に破壊しました！
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 w-72 text-center space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 font-semibold">獲得スコア</div>
                    <div className="text-3xl font-black text-amber-400 font-mono">
                      {score.toLocaleString()} 点
                    </div>
                    {score >= highScore && score > 0 && (
                      <div className="text-xs text-amber-300 font-bold mt-0.5">
                        🎉 ハイスコア達成！
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-around text-xs text-slate-300">
                    <span>壊したブロック: <strong className="text-cyan-400 font-bold">{destroyedCount}個</strong></span>
                    <span>残り: <strong className="text-emerald-400 font-bold">{retriesLeft}回</strong></span>
                  </div>
                </div>

                <button
                  onClick={handleResetGame}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-base shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>もう一度遊ぶ</span>
                </button>
              </div>
            )}

            {/* Game Over Overlay Modal */}
            {gameState === 'gameover' && (
              <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-4 text-rose-400 shadow-lg shadow-rose-500/30">
                  <span className="text-3xl font-black">✕</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-rose-400 mb-1 tracking-tight">
                  ゲームオーバー
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mb-5 text-center max-w-sm">
                  発射し直し2回目のゲーム中に玉が通り過ぎました。
                </p>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 w-72 text-center space-y-2">
                  <div>
                    <div className="text-xs text-slate-400 font-semibold">最終スコア</div>
                    <div className="text-3xl font-black text-amber-400 font-mono">
                      {score.toLocaleString()} 点
                    </div>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex items-center justify-around text-xs text-slate-300">
                    <span>壊したブロック: <strong className="text-cyan-400 font-bold">{destroyedCount} / {TOTAL_BLOCKS}</strong></span>
                    <span>ハイスコア: <strong className="text-yellow-400 font-bold">{highScore.toLocaleString()}</strong></span>
                  </div>
                </div>

                <button
                  onClick={handleResetGame}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 text-white font-bold text-base shadow-lg shadow-rose-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>リトライする</span>
                </button>
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

        {/* 
          Right Side Panel:
          1. 棒の操作枠（左右操作キー）
          2. スタートボタンがある枠（スタート／一時停止ボタン, 壊したブロックの数, 発射し直し残り）
          3. ゲームスコアを表示する枠（現在のスコア, ハイスコア, コンボ数）
             ※ スタートボタンがある枠の下に配置
        */}
        <aside className="w-full lg:w-64 flex flex-col gap-3 shrink-0">
          {/* 1. 棒の操作枠 */}
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

          {/* 
            3. ゲームスコアを表示する枠（スタートボタンがある枠の下に配置）
            - 現在のスコア
            - ハイスコア
            - コンボ倍率表示
          */}
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

            {/* コンボ数・倍率インジケーター（連続ヒット時に表示） */}
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

        {/* Rules & Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
                aria-label="閉じる"
              >
                ✕
              </button>

              <h3 className="text-xl font-black text-cyan-400 mb-3 flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                ゲームのルールと仕様
              </h3>

              <ul className="text-sm text-slate-300 space-y-2.5 list-disc list-inside">
                <li>
                  <strong className="text-slate-100">ブロック:</strong> 横５×縦４（計20個）。少し横長のブロックで、玉が当たると壊れます。
                </li>
                <li>
                  <strong className="text-slate-100">スコア＆コンボシステム:</strong> 1個目は100点、連続で壊すと2個目は2倍（200点）、3個目は3倍（300点）…とコンボ倍率が上昇します！（棒で打ち返すとリセット）
                </li>
                <li>
                  <strong className="text-slate-100">スタートと一時停止:</strong> 画面をタップするか、「スタート／一時停止」ボタンを押すことで発射と一時停止の切り替えができます。
                </li>
                <li>
                  <strong className="text-slate-100">棒の操作:</strong> 左右の操作ボタン、画面下部のスワイプバー、またはキーボードの<span className="text-cyan-300 font-bold">左キー／右キー</span>で快適に棒を動かせます。
                </li>
                <li>
                  <strong className="text-slate-100">ランダム跳ね返り:</strong> ブロックに当たると、跳ね返る方向がランダムに変化します。
                </li>
                <li>
                  <strong className="text-slate-100">壁と天井の跳ね返り:</strong> 玉は左右の壁と天井でも跳ね返り、天井から落ちてきた玉がブロックの上面に当たってもきちんと跳ね返ります。
                </li>
                <li>
                  <strong className="text-slate-100">発射し直しとゲームオーバー:</strong> 玉が下に通り過ぎると、<span className="text-amber-300 font-bold">２回まで発射し直し</span>ができます。発射し直し２回目のプレイ中に玉が下に通り過ぎるとゲームオーバーになります。
                </li>
                <li>
                  <strong className="text-slate-100">クリア条件:</strong> すべてのブロック（20個）を壊すとゲームクリアです！
                </li>
              </ul>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full mt-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors cursor-pointer"
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
