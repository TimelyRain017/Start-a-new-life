// sound.js — 打字机音效（Web Audio 现场合成，不放任何音频文件）
// 设计：一声「嗒」= 极短噪声（按键的脆）+ 一个低频包络（木头的钝），
// 每次随机微调滤波频率与音量，听起来才不像电子节拍器。
import { KEYS, readRaw, writeRaw } from './storage.js';

const KEY = KEYS.sound;

let ac = null;
let noise = null;
let muted = false;
let lastAt = 0;

muted = readRaw(KEY) === 'off';

export const isMuted = () => muted;

// 浏览器要求「用户手势后」才能出声：在第一次点击/触摸时调用
export function unlock() {
  if (muted) return null;
  try {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch {
    ac = null;
    return null;
  }
}

export function setMuted(v) {
  muted = !!v;
  writeRaw(KEY, muted ? 'off' : 'on');
  if (!muted) unlock();
}

function noiseBuffer(c) {
  if (noise) return noise;
  const n = Math.max(64, Math.floor(c.sampleRate * 0.05));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    // 尾巴衰减得快一点：像硬物敲一下，而不是「嘶——」
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  noise = buf;
  return buf;
}

// 一声打字音。force=true 时忽略节流（用于「打开声音」时试听）
export function typeTick(force = false) {
  if (muted) return;
  const c = ac || unlock();
  if (!c || c.state !== 'running') return;

  const t = performance.now();
  if (!force && t - lastAt < 42) return; // 24ms/字的流速下约两字一声，不至于糊成一片
  lastAt = t;
  if (document.hidden) return;

  try {
    const now = c.currentTime;

    // ① 脆：带通噪声，中心频率随机，模拟不同键位
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900 + Math.random() * 1900;
    bp.Q.value = 0.9;
    const g = c.createGain();
    const peak = (force ? 0.075 : 0.05) + Math.random() * 0.02;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(now);
    src.stop(now + 0.06);

    // ② 钝：很短的低频，给「木」感；音量压得很低，只在近处能听出来
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + Math.random() * 60, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.035);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(peak * 0.55, now + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(og).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch { /* 某些浏览器在后台会拒绝创建节点，静默跳过 */ }
}
