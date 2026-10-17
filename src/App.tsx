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
  ArrowRight
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
const PADDLE_WIDTH = 128;
const PADDLE_HEIGHT = 16;
const PADDLE_SPEED = 9;
const MAX_RETRIES = 2; // 玉の発射し直しは２回

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

const ROW_COLORS = [
  { fill: '#f43f5e', border: '#fda4af', name: 'ローズ' },    // Row 0: Red / Rose
  { fill: '#f97316', border: '#fdba74', name: 'オレンジ' },  // Row 1: Orange
  { fill: '#10b981', border: '#6ee7b7', name: 'グリーン' },  // Row 2: Emerald Green
  { fill: '#06b6d4', border: '#67e8f9', name: 'シアン' },    // Row 3: Electric Cyan
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Game states:
  // 'ready': ball resting on paddle, waiting for start button
  // 'playing': ball in motion
  // 'paused': game paused
  // 'cleared': all 20 blocks broken
  // 'gameover': ball dropped during 2nd retry
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'paused' | 'cleared' | 'gameover'>('ready');
  const [retriesLeft, setRetriesLeft] = useState<number>(MAX_RETRIES); // 2, 1, 0
  const [destroyedCount, setDestroyedCount] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Mutable game simulation refs
  const paddleRef = useRef({
    x: (CANVAS_WIDTH - PADDLE_WIDTH) / 2,
    y: CANVAS_HEIGHT - 45,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    speed: PADDLE_SPEED,
    movingLeft: false,
    movingRight: false,
  });

  const ballRef = useRef({
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 45 - BALL_RADIUS,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
  });

  const blocksRef = useRef<Block[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameId = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const retriesLeftRef = useRef(retriesLeft);
  retriesLeftRef.current = retriesLeft;
  const destroyedCountRef = useRef(destroyedCount);
  destroyedCountRef.current = destroyedCount;

  // Initialize blocks: 横5 × 縦4 = 20 blocks
  // Blocks are positioned at the top of the canvas, with ample ceiling space above
  const createBlocks = useCallback((): Block[] => {
    const blocks: Block[] = [];
    const marginX = 60;
    const startY = 56; // 56px from top, leaves comfortable ceiling gap for bounces
    const gapX = 14;
    const gapY = 14;
    const totalGapX = gapX * (COLS - 1);
    const availableWidth = CANVAS_WIDTH - marginX * 2 - totalGapX;
    const blockWidth = Math.floor(availableWidth / COLS); // slightly elongated horizontal block (~124px)
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
    // Randomized launch angle upwards (roughly within ±15 degrees from straight up)
    const angleJitter = (Math.random() - 0.5) * 0.5;
    const launchAngle = -Math.PI / 2 + angleJitter;
    ballRef.current.vx = BALL_SPEED * Math.cos(launchAngle);
    ballRef.current.vy = BALL_SPEED * Math.sin(launchAngle);
    sound.playLaunch();
    setGameState('playing');
  }, []);

  // Start button action
  const handleStartButton = useCallback(() => {
    if (gameState === 'ready') {
      launchBall();
    } else if (gameState === 'paused') {
      setGameState('playing');
    } else if (gameState === 'cleared' || gameState === 'gameover') {
      // Restart game
      blocksRef.current = createBlocks();
      particlesRef.current = [];
      setDestroyedCount(0);
      setRetriesLeft(MAX_RETRIES);
      paddleRef.current.x = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
      resetBallOnPaddle();
      launchBall();
    }
  }, [gameState, launchBall, createBlocks, resetBallOnPaddle]);

  // Pause button action
  const handlePauseButton = useCallback(() => {
    if (gameState === 'playing') {
      setGameState('paused');
    } else if (gameState === 'paused') {
      setGameState('playing');
    }
  }, [gameState]);

  // Reset game to ready state
  const handleResetGame = useCallback(() => {
    blocksRef.current = createBlocks();
    particlesRef.current = [];
    setDestroyedCount(0);
    setRetriesLeft(MAX_RETRIES);
    paddleRef.current.x = (CANVAS_WIDTH - PADDLE_WIDTH) / 2;
    resetBallOnPaddle();
    setGameState('ready');
  }, [createBlocks, resetBallOnPaddle]);

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

  // Keyboard controls: Left and Right arrow keys
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
        if (gameStateRef.current === 'ready') {
          launchBall();
        } else if (gameStateRef.current === 'playing') {
          setGameState('paused');
        } else if (gameStateRef.current === 'paused') {
          setGameState('playing');
        }
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
  }, [launchBall]);

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
        const steps = 2; // Sub-stepping for collision precision
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
          // Ball bounces off ceiling and heads downwards
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
          }

          // Block collisions:
          // REQUIREMENT:
          // 1. ブロックに玉が当たると壊れる
          // 2. 跳ね返る方向はランダム
          // 3. 天井から跳ね返った玉がブロックに当たっても跳ね返るようにする
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

            // Penetration depths
            const overlapX = halfW + ball.radius - Math.abs(diffX);
            const overlapY = halfH + ball.radius - Math.abs(diffY);

            // Check if ball intersects with block
            if (overlapX > 0 && overlapY > 0) {
              b.destroyed = true;
              hitBlock = true;

              const nextDestroyedCount = destroyedCountRef.current + 1;
              destroyedCountRef.current = nextDestroyedCount;
              setDestroyedCount(nextDestroyedCount);

              spawnParticles(b.x, b.y, b.width, b.height, b.color);
              sound.playBlockHit(nextDestroyedCount);

              // Determine collision side and rebound in a randomized direction away from hit face
              if (overlapY < overlapX) {
                // Vertical collision: Top face or Bottom face
                if (diffY < 0) {
                  // HIT TOP OF BLOCK:
                  // For example, ball bounced off the ceiling and is descending onto block!
                  // Reposition above block and bounce UPWARDS in a randomized angle (vy < 0)
                  ball.y = b.y - ball.radius - 1;
                  // Upward random angle between -35° and -145°
                  const randomUpwardAngle = -(Math.random() * 110 + 35) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomUpwardAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomUpwardAngle); // vy is negative (< 0)
                } else {
                  // HIT BOTTOM OF BLOCK:
                  // Ball ascending from paddle and hits bottom of block
                  // Reposition below block and bounce DOWNWARDS in a randomized angle (vy > 0)
                  ball.y = b.y + b.height + ball.radius + 1;
                  // Downward random angle between 35° and 145°
                  const randomDownwardAngle = (Math.random() * 110 + 35) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomDownwardAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomDownwardAngle); // vy is positive (> 0)
                }
              } else {
                // Horizontal collision: Left face or Right face
                if (diffX < 0) {
                  // HIT LEFT SIDE:
                  ball.x = b.x - ball.radius - 1;
                  // Bounce leftward with random angle
                  const randomLeftAngle = (Math.random() * 110 + 125) * (Math.PI / 180);
                  ball.vx = BALL_SPEED * Math.cos(randomLeftAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomLeftAngle);
                } else {
                  // HIT RIGHT SIDE:
                  ball.x = b.x + b.width + ball.radius + 1;
                  // Bounce rightward with random angle
                  const randomRightAngle = ((Math.random() * 110 - 55) * Math.PI) / 180;
                  ball.vx = BALL_SPEED * Math.cos(randomRightAngle);
                  ball.vy = BALL_SPEED * Math.sin(randomRightAngle);
                }
              }

              // Check game clear
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

          // Miss paddle at bottom:
          // "玉が棒に当たらず下に通り過ぎたら、もう一度玉を発射できる。"
          // "玉の発射し直しは２回。"
          // "発射し直し２回目のゲーム中に棒に当たらず玉が下に通り過ぎたらゲームオーバー。"
          if (ball.y - ball.radius > CANVAS_HEIGHT) {
            const currentRetries = retriesLeftRef.current;
            if (currentRetries > 0) {
              const nextRetries = currentRetries - 1;
              retriesLeftRef.current = nextRetries;
              setRetriesLeft(nextRetries);
              sound.playMiss();
              resetBallOnPaddle();
              setGameState('ready');
            } else {
              // Failed during 2nd retry -> Game Over
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

    // Grid lines
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

    // Neon playfield boundary glow
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 20);

    // Draw blocks (横5 × 縦4)
    const blocks = blocksRef.current;
    blocks.forEach((b) => {
      if (b.destroyed) return;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(b.x + 2, b.y + 3, b.width, b.height, 6);
      ctx.fill();

      // Block body gradient
      const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.height);
      grad.addColorStop(0, b.borderColor);
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 6);
      ctx.fill();

      // Highlight sheen
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.roundRect(b.x + 3, b.y + 2, b.width - 6, b.height * 0.35, 3);
      ctx.fill();

      // Border stroke
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

    // Draw paddle (棒)
    const paddle = paddleRef.current;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y + 3, paddle.width, paddle.height, 8);
    ctx.fill();

    const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    paddleGrad.addColorStop(0, '#38bdf8');
    paddleGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = paddleGrad;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
    ctx.fill();

    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.roundRect(paddle.x + 8, paddle.y + 2, paddle.width - 16, 3, 2);
    ctx.fill();

    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
    ctx.stroke();

    // Draw ball (玉)
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
      ctx.fillText('「スタート」または [スペースキー] で玉を発射！', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 90);
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
      ctx.fillText('「再開」ボタンまたは [スペースキー] で再開', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      ctx.restore();
    }
  };

  // Touch controls for paddle
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const clientX = touch.clientX - rect.left;
    const scaleX = CANVAS_WIDTH / rect.width;
    const canvasX = clientX * scaleX;

    const paddle = paddleRef.current;
    paddle.x = Math.max(12, Math.min(CANVAS_WIDTH - 12 - paddle.width, canvasX - paddle.width / 2));
  };

  const getStartButtonLabel = () => {
    if (gameState === 'ready') return 'スタート';
    if (gameState === 'paused') return '再開';
    if (gameState === 'cleared' || gameState === 'gameover') return 'スタート';
    return 'ゲーム中';
  };

  const getPauseButtonLabel = () => {
    if (gameState === 'paused') return '再開';
    return '一時停止';
  };

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

      {/* 
        Main Layout:
        - Canvas on the left
        - REQUIREMENT: 
          1. 「スタートボタンなどの表示を、ブロックと重ならないように配置する」
          2. 「スタートボタン、一時停止ボタン、壊したブロックの数を画面の右上に縦に並べて表示する」
          3. 「『壊したブロックの数』のフォントをスタートや一時停止と同じ大きさにする」
        The control panel is situated on the top-right of the screen alongside the canvas,
        completely separated so it NEVER overlaps with any blocks!
      */}
      <main className="w-full max-w-5xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-5">
        {/* Playfield Canvas Container */}
        <div className="relative w-full lg:flex-1 max-w-[760px] rounded-2xl overflow-hidden border-2 border-slate-800/80 shadow-2xl shadow-cyan-950/40 bg-slate-950 aspect-[4/3]">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onTouchMove={handleTouchMove}
            className="w-full h-full block cursor-default"
          />

          {/* Game Clear Overlay Modal */}
          {gameState === 'cleared' && (
            <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-4 text-emerald-400 shadow-lg shadow-emerald-500/30">
                <Trophy className="w-8 h-8" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-emerald-400 mb-2 tracking-tight">
                ゲームクリア！
              </h2>
              <p className="text-slate-300 text-sm sm:text-base mb-6 text-center max-w-sm">
                お見事！すべてのブロック（20個）を見事に破壊しました！
              </p>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 w-64 text-center">
                <div className="text-sm text-slate-400 font-semibold mb-1">壊したブロックの数</div>
                <div className="text-2xl font-black text-cyan-400 font-mono">
                  {destroyedCount} / {TOTAL_BLOCKS}
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  発射し直し残り: <strong className="text-emerald-400">{retriesLeft}回</strong>
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
              <h2 className="text-3xl sm:text-4xl font-black text-rose-400 mb-2 tracking-tight">
                ゲームオーバー
              </h2>
              <p className="text-slate-300 text-sm sm:text-base mb-6 text-center max-w-sm">
                発射し直し2回目のゲーム中に玉が通り過ぎました。
              </p>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 w-64 text-center">
                <div className="text-sm text-slate-400 font-semibold mb-1">壊したブロックの数</div>
                <div className="text-2xl font-black text-cyan-400 font-mono">
                  {destroyedCount} / {TOTAL_BLOCKS}
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

        {/* 
          画面の右上に縦に並べて表示する操作・状態パネル:
          - ブロックと一切重ならないように配置
          - 1. スタートボタン
          - 2. 一時停止ボタン
          - 3. 壊したブロックの数（フォントサイズはスタートや一時停止と同じ大きさ: text-base font-bold）
        */}
        <aside className="w-full lg:w-64 flex flex-col gap-3 shrink-0">
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col gap-3">
            {/* 1. スタートボタン */}
            <button
              onClick={handleStartButton}
              disabled={gameState === 'playing'}
              className={`w-full h-12 px-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-150 shadow-md ${
                gameState === 'playing'
                  ? 'bg-slate-800/60 text-slate-500 border border-slate-700/40 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25 active:scale-95 cursor-pointer ring-1 ring-emerald-400/50'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{getStartButtonLabel()}</span>
            </button>

            {/* 2. 一時停止ボタン */}
            <button
              onClick={handlePauseButton}
              disabled={gameState === 'ready' || gameState === 'cleared' || gameState === 'gameover'}
              className={`w-full h-12 px-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-150 ${
                gameState === 'ready' || gameState === 'cleared' || gameState === 'gameover'
                  ? 'bg-slate-800/40 text-slate-600 border border-slate-800 cursor-not-allowed'
                  : gameState === 'paused'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 active:scale-95 cursor-pointer'
              }`}
            >
              <Pause className="w-5 h-5" />
              <span>{getPauseButtonLabel()}</span>
            </button>

            {/* 
              3. 壊したブロックの数:
              フォントサイズをスタートや一時停止ボタンと同じ大きさ（text-base font-bold）に設定
            */}
            <div className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-base font-bold text-slate-200 shadow-inner">
              <span>壊したブロックの数</span>
              <span className="font-mono text-cyan-400 font-bold text-base">
                {destroyedCount} / {TOTAL_BLOCKS}
              </span>
            </div>

            {/* 発射し直し残り表示 */}
            <div className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-850 flex items-center justify-between text-sm">
              <span className="text-slate-400 font-medium">発射し直し残り:</span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded text-sm ${
                retriesLeft === 2 ? 'text-emerald-400 bg-emerald-950/80 border border-emerald-800/50' :
                retriesLeft === 1 ? 'text-amber-400 bg-amber-950/80 border border-amber-800/50' :
                'text-rose-400 bg-rose-950/80 border border-rose-800/50'
              }`}>
                {retriesLeft} 回
              </span>
            </div>
          </div>

          {/* Quick Controls Card */}
          <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>棒の操作方法</span>
              <span className="text-[11px] text-slate-500">キーボード / ボタン</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-200 font-mono text-xs">
                <ArrowLeft className="w-3 h-3" /> 左キー
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-200 font-mono text-xs">
                <ArrowRight className="w-3 h-3" /> 右キー
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              ※ [A] / [D] キーや [スペースキー]（発射・一時停止）も使えます。
            </p>
          </div>

          {/* On-screen touch buttons for mobile/tablet users */}
          <div className="flex items-center gap-2">
            <button
              onMouseDown={() => { paddleRef.current.movingLeft = true; }}
              onMouseUp={() => { paddleRef.current.movingLeft = false; }}
              onMouseLeave={() => { paddleRef.current.movingLeft = false; }}
              onTouchStart={(e) => { e.preventDefault(); paddleRef.current.movingLeft = true; }}
              onTouchEnd={(e) => { e.preventDefault(); paddleRef.current.movingLeft = false; }}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-700 text-slate-200 border border-slate-700 shadow font-bold text-sm transition-colors cursor-pointer select-none"
              title="左へ移動"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>左へ</span>
            </button>
            <button
              onMouseDown={() => { paddleRef.current.movingRight = true; }}
              onMouseUp={() => { paddleRef.current.movingRight = false; }}
              onMouseLeave={() => { paddleRef.current.movingRight = false; }}
              onTouchStart={(e) => { e.preventDefault(); paddleRef.current.movingRight = true; }}
              onTouchEnd={(e) => { e.preventDefault(); paddleRef.current.movingRight = false; }}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-700 text-slate-200 border border-slate-700 shadow font-bold text-sm transition-colors cursor-pointer select-none"
              title="右へ移動"
            >
              <span>右へ</span>
              <ArrowRight className="w-4 h-4" />
            </button>
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
                  <strong className="text-slate-100">画面右上の表示:</strong> 「スタートボタン」「一時停止ボタン」「壊したブロックの数」がブロックと重ならないよう右上に配置されています。
                </li>
                <li>
                  <strong className="text-slate-100">棒の操作:</strong> 画面下の棒は、<span className="text-cyan-300 font-bold">左キー</span>で左、<span className="text-cyan-300 font-bold">右キー</span>で右に移動できます。
                </li>
                <li>
                  <strong className="text-slate-100">玉の発射:</strong> 発射できる玉は１つだけ。最初は棒の上にあり、スタートボタンを押すと真上に発射されます。
                </li>
                <li>
                  <strong className="text-slate-100">ランダム跳ね返り:</strong> ブロックに当たると、跳ね返る方向がランダムに変化します。
                </li>
                <li>
                  <strong className="text-slate-100">壁と天井の跳ね返り:</strong> 玉は左右の壁と天井でも跳ね返ります。天井から跳ね返って落ちてきた玉がブロックの上面に当たっても、きちんと上方向に跳ね返ります。
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
