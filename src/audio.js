/* 합성 효과음(WebAudio). 외부 음원 파일 없음. 첫 입력 이후에만 소리가 난다. */
(function (g) {
  'use strict';
  const ER = g.ER; let ctx = null, enabled = true;
  const SOUNDS = { step: [180, 0.03, 'triangle', 0.03], slash: [520, 0.09, 'sawtooth', 0.06], skill: [700, 0.16, 'sine', 0.07], enemy: [150, 0.1, 'square', 0.05], hit: [110, 0.08, 'square', 0.07], block: [900, 0.05, 'triangle', 0.05], heal: [660, 0.2, 'sine', 0.05], die: [80, 0.25, 'sawtooth', 0.06], alert: [980, 0.12, 'square', 0.05], loot: [1200, 0.08, 'sine', 0.05], blast: [60, 0.3, 'sawtooth', 0.08], ui: [440, 0.04, 'sine', 0.03], build: [330, 0.35, 'triangle', 0.07] };
  function play(name) {
    if (!enabled) return; const s = SOUNDS[name]; if (!s) return;
    try { ctx = ctx || new (g.AudioContext || g.webkitAudioContext)(); if (ctx.state === 'suspended') return; const o = ctx.createOscillator(), v = ctx.createGain(), t = ctx.currentTime; o.type = s[2]; o.frequency.setValueAtTime(s[0], t); o.frequency.exponentialRampToValueAtTime(Math.max(40, s[0] * (name === 'heal' || name === 'loot' || name === 'build' ? 1.6 : 0.6)), t + s[1]); v.gain.setValueAtTime(s[3], t); v.gain.exponentialRampToValueAtTime(0.0001, t + s[1]); o.connect(v).connect(ctx.destination); o.start(t); o.stop(t + s[1] + 0.02); } catch { /* 소리는 없어도 된다 */ }
  }
  function unlock() { try { ctx = ctx || new (g.AudioContext || g.webkitAudioContext)(); ctx.resume(); } catch { /* 무시 */ } }
  ER.audio = { play, unlock, setEnabled: v => { enabled = !!v; }, enabled: () => enabled };
})(typeof globalThis !== 'undefined' ? globalThis : this);
