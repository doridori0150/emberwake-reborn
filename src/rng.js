/* 분리된 난수 흐름과 선택적 주사위 판정.
   - 흐름(map/loot/draw/dice/ai)마다 uint32 상태를 저장하여 저장·복원 시 결과가 재현된다.
   - 미리보기(bounds/chance)는 RNG를 소비하지 않는다.
   - 주사위식 파서는 참조 프로젝트 dice-rules.js 의 검증된 형식(NdS*K+B)을 따른다. */
(function (g) {
  'use strict';
  const ER = (g.ER = g.ER || {});
  const STREAMS = ['map', 'loot', 'draw', 'dice', 'ai'];

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function seedStreams(seed) {
    const s = {};
    for (const n of STREAMS) s[n] = hash(seed + ':' + n) || 1;
    return s;
  }
  // mulberry32: 상태 객체의 해당 흐름만 전진시킨다.
  function next(state, stream) {
    if (!(stream in state)) throw new Error('알 수 없는 난수 흐름: ' + stream);
    let t = (state[stream] = (state[stream] + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (state, stream, n) => Math.floor(next(state, stream) * n);
  const pick = (state, stream, list) => list[int(state, stream, list.length)];
  function shuffle(state, stream, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(state, stream, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parse(expr) {
    if (typeof expr === 'number') {
      if (!Number.isSafeInteger(expr)) throw new TypeError('고정값 오류');
      return { formula: String(expr), count: 0, sides: 1, mul: 1, mod: expr };
    }
    if (typeof expr !== 'string' || expr.length > 40) throw new TypeError('주사위식 오류');
    const s = expr.replace(/\s+/g, '').toLowerCase();
    if (/^-?\d+$/.test(s)) return parse(Number(s));
    const m = /^(\d+)d(\d+)(?:\*(\d+))?([+-]\d+)?$/.exec(s);
    if (!m) throw new TypeError('지원 형식: 정수 또는 NdS*K+B');
    const count = +m[1],
      sides = +m[2],
      mul = +(m[3] ?? 1),
      mod = +(m[4] ?? 0);
    if (count < 1 || count > 8 || sides < 1 || sides > 100 || mul < 1 || mul > 1000) throw new TypeError('주사위식 범위 초과');
    return { formula: s, count, sides, mul, mod };
  }
  // mode: normal | advantage(두 번 굴려 높은 값) | steady(각 주사위를 평균 올림값으로 고정)
  function bounds(expr, opt = {}) {
    const p = parse(expr),
      b = opt.bonus || 0;
    if (opt.mode === 'steady') {
      const v = p.count * Math.ceil((p.sides + 1) / 2) * p.mul + p.mod + b;
      return { min: v, max: v, fixed: true };
    }
    return { min: p.count * p.mul + p.mod + b, max: p.count * p.sides * p.mul + p.mod + b, fixed: p.count === 0 || p.sides === 1 };
  }
  function roll(expr, state, opt = {}) {
    const p = parse(expr),
      b = opt.bonus || 0,
      mode = opt.mode || 'normal',
      rng = bounds(expr, opt);
    if (mode === 'steady') return { formula: p.formula, total: rng.min, rolls: [], candidates: [rng.min], mode, fixed: true };
    const tries = rng.fixed || mode === 'normal' ? 1 : 2,
      cands = [];
    for (let t = 0; t < tries; t++) {
      const rolls = [];
      // 1면 주사위(1d1*20 등)는 난수 상태를 소비하지 않는다.
      for (let i = 0; i < p.count; i++) rolls.push(p.sides === 1 ? 1 : 1 + int(state, 'dice', p.sides));
      cands.push({ rolls, total: rolls.reduce((a, c) => a + c, 0) * p.mul + p.mod + b });
    }
    const best = cands.reduce((a, c) => (c.total > a.total ? c : a));
    return { formula: p.formula, total: best.total, rolls: best.rolls, candidates: cands.map(c => c.total), mode, fixed: rng.fixed };
  }
  function chance(expr, dc, opt = {}) {
    const p = parse(expr),
      b = opt.bonus || 0;
    if (opt.mode === 'steady') return bounds(expr, opt).min >= dc ? 1 : 0;
    let sums = new Map([[0, 1]]);
    for (let i = 0; i < p.count; i++) {
      const nx = new Map();
      for (const [s, w] of sums) for (let f = 1; f <= p.sides; f++) nx.set(s + f, (nx.get(s + f) || 0) + w / p.sides);
      sums = nx;
    }
    let pr = 0;
    for (const [s, w] of sums) if (s * p.mul + p.mod + b >= dc) pr += w;
    pr = Math.round(Math.max(0, Math.min(1, pr)) * 1e9) / 1e9;
    return opt.mode === 'advantage' ? 1 - (1 - pr) ** 2 : pr;
  }
  ER.rng = { STREAMS, hash, seedStreams, next, int, pick, shuffle };
  ER.dice = { parse, bounds, roll, chance };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
