/*
 * 멜로디 스테이지 — 브라우저 오디오(Web Audio)로 만든 소리
 * ------------------------------------------------------------
 * 음원 파일·외부 서비스 없이 소리를 그때그때 만들어 냅니다.
 * 박자 표시·판정·배경음은 모두 이 오디오 시계(ctx.currentTime) 하나를 기준으로 합니다.
 *   MelodyAudio.unlock()        첫 '시작' 버튼을 누를 때 오디오 켜기(브라우저 규칙)
 *   MelodyAudio.now()           오디오 시계(초)
 *   MelodyAudio.heardNow()      지금 귀에 들리는 소리의 시각(출력 지연을 뺀 값) — 화면 표시·판정에 씀
 *   MelodyAudio.play(name, t, opt)  소리 하나 예약
 *   MelodyAudio.beatScheduler(onBeat)  박자마다 미리(0.15초 앞서) onBeat(n, time) 호출
 */
(function () {
  'use strict';
  var ctx = null, master = null, music = null, sfx = null, noise = null, muted = false;

  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.55; music.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      var len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function ready() { return !!ctx; }
  function now() { return ctx ? ctx.currentTime : performance.now() / 1000; }
  function latency() { return ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0; }
  function heardNow() { return now() - latency(); }
  // 이벤트가 일어난 순간의 오디오 시각(이벤트 처리 지연 보정)
  function eventTime(e) {
    var lag = e && e.timeStamp ? Math.max(0, Math.min(0.1, (performance.now() - e.timeStamp) / 1000)) : 0;
    return heardNow() - lag;
  }
  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  }
  function suspend() { if (ctx && ctx.state === 'running') return ctx.suspend(); return Promise.resolve(); }
  function resume() { if (ctx && ctx.state !== 'running') return ctx.resume(); return Promise.resolve(); }

  // ---------- 소리 재료 ----------
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function env(g, t, a, peak, dec, sus, rel, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sus), t + Math.max(a + dec, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + dec, dur) + rel);
    return t + Math.max(a + dec, dur) + rel + 0.05;
  }
  function osc(type, freq, t, end, out, detune) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(end); return o;
  }
  function gain(out) { var g = ctx.createGain(); g.connect(out); return g; }
  function noiseHit(t, dur, v, out, type, freq, q) {
    var s = ctx.createBufferSource(); s.buffer = noise;
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    var g = gain(out);
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  var SOUNDS = {
    kick: function (t, v, out) {
      var g = gain(out), o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      o.connect(g); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    },
    snare: function (t, v, out) {
      noiseHit(t, 0.16, v * 0.7, out, 'bandpass', 1800, 0.8);
      var g = gain(out); env(g, t, 0.002, v * 0.4, 0.08, 0.01, 0.03, 0.01); osc('triangle', 190, t, t + 0.15, g);
    },
    hat: function (t, v, out) { noiseHit(t, 0.05, v * 0.35, out, 'highpass', 7500); },
    clap: function (t, v, out) {
      for (var i = 0; i < 3; i++) noiseHit(t + i * 0.012, 0.03, v * 0.6, out, 'bandpass', 1300, 1.2);
      noiseHit(t + 0.036, 0.16, v * 0.5, out, 'bandpass', 1200, 1);
    },
    jingle: function (t, v, out) {
      noiseHit(t, 0.12, v * 0.35, out, 'highpass', 6000);
      [2637, 3520, 4186].forEach(function (f, i) { var g = gain(out); var e = env(g, t + i * 0.015, 0.002, v * 0.08, 0.2, 0.01, 0.05, 0.01); osc('sine', f, t + i * 0.015, e, g); });
    },
    piano: function (t, v, out, o) {
      var f = mtof(o.note || 60), g = gain(out), e = env(g, t, 0.005, v * 0.35, 0.5, 0.2, 0.3, o.dur || 0.25);
      osc('triangle', f, t, e, g); var g2 = gain(out); env(g2, t, 0.005, v * 0.1, 0.25, 0.1, 0.2, 0.1); osc('sine', f * 2, t, e, g2);
    },
    pluck: function (t, v, out, o) {
      var f = mtof(o.note || 62), lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4); lp.connect(out);
      var g = gain(lp), e = env(g, t, 0.003, v * 0.3, 0.6, 0.05, 0.2, 0.2); osc('sawtooth', f, t, e, g);
    },
    horn: function (t, v, out, o) {
      var f = mtof(o.note || 64), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 5; lp.connect(out);
      var g = gain(lp), e = env(g, t, 0.04, v * 0.22, 0.1, 0.7, 0.12, o.dur || 0.28); osc('sawtooth', f, t, e, g); osc('sawtooth', f, t, e, g, 6);
    },
    reed: function (t, v, out, o) {
      var f = mtof(o.note || 67), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 3; lp.connect(out);
      var g = gain(lp), e = env(g, t, 0.03, v * 0.2, 0.1, 0.75, 0.12, o.dur || 0.28); osc('square', f, t, e, g);
    },
    bow: function (t, v, out, o) {
      var f = mtof(o.note || 69), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4; lp.connect(out);
      var g = gain(lp), e = env(g, t, 0.07, v * 0.2, 0.1, 0.8, 0.18, o.dur || 0.3);
      var s = osc('sawtooth', f, t, e, g), lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = 9; lfo.connect(lg); lg.connect(s.detune); lfo.start(t); lfo.stop(e);
    },
    chime: function (t, v, out, o) {
      var f = mtof(o.note || 72);
      [[1, 0.3], [2.76, 0.12], [5.4, 0.05]].forEach(function (p) { var g = gain(out), e = env(g, t, 0.002, v * p[1], 0.9, 0.05, 0.4, 0.2); osc('sine', f * p[0], t, e, g); });
    },
    bass: function (t, v, out, o) {
      var f = mtof(o.note || 36), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(out);
      var g = gain(lp), e = env(g, t, 0.01, v * 0.45, 0.15, 0.5, 0.08, o.dur || 0.3); osc('triangle', f, t, e, g); osc('sine', f / 2, t, e, g);
    },
    pad: function (t, v, out, o) {
      (o.notes || [60, 64, 67]).forEach(function (n) { var g = gain(out), e = env(g, t, 0.03, v * 0.07, 0.3, 0.5, 0.3, o.dur || 0.6); osc('triangle', mtof(n), t, e, g); });
    },
    // 댄스 신호음: 왼쪽(낮은 나무 소리) · 오른쪽(높은 나무 소리) · 점프(올라가는 소리) · 멈춤(딩!)
    cueLeft: function (t, v, out) { var g = gain(out), e = env(g, t, 0.002, v * 0.5, 0.09, 0.01, 0.03, 0.01); osc('sine', 660, t, e, g); osc('square', 1320, t, e, gain(g)); },
    cueRight: function (t, v, out) { var g = gain(out), e = env(g, t, 0.002, v * 0.5, 0.09, 0.01, 0.03, 0.01); osc('sine', 990, t, e, g); osc('square', 1980, t, e, gain(g)); },
    cueJump: function (t, v, out) {
      var g = gain(out), o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.18);
      o.connect(g); env(g, t, 0.005, v * 0.35, 0.18, 0.05, 0.05, 0.05); o.start(t); o.stop(t + 0.32);
    },
    cueFreeze: function (t, v, out) { SOUNDS.chime(t, v * 1.4, out, { note: 84 }); },
    count: function (t, v, out, o) { var g = gain(out), e = env(g, t, 0.002, v * 0.35, 0.12, 0.01, 0.03, 0.02); osc('square', o.high ? 1760 : 880, t, e, g); },
    good: function (t, v, out) { SOUNDS.chime(t, v * 0.7, out, { note: 88 }); },
    miss: function (t, v, out) { var g = gain(out), e = env(g, t, 0.005, v * 0.12, 0.12, 0.01, 0.03, 0.02); osc('triangle', 220, t, e, g); },
    fanfare: function (t, v, out) {
      [72, 76, 79, 84].forEach(function (n, i) { SOUNDS.horn(t + i * 0.12, v, out, { note: n, dur: i === 3 ? 0.5 : 0.1 }); });
    }
  };
  var CUE = { left: 'cueLeft', right: 'cueRight', jump: 'cueJump', freeze: 'cueFreeze' };

  function play(name, t, opt) {
    if (!ctx || !SOUNDS[name]) return;
    opt = opt || {};
    try { SOUNDS[name](Math.max(t == null ? 0 : t, ctx.currentTime), opt.vol == null ? 1 : opt.vol, opt.music ? music : sfx, opt); } catch (e) { /* 소리 하나 실패해도 게임은 계속 */ }
  }

  // ---------- 배경음(4박 한 마디, C–Am–F–G) ----------
  var CHORDS = [{ bass: 36, pad: [60, 64, 67] }, { bass: 45, pad: [57, 60, 64] }, { bass: 41, pad: [57, 60, 65] }, { bass: 43, pad: [59, 62, 67] }];
  function musicBeat(n, t, beatSec) {
    var bar = Math.floor(n / 4), b = ((n % 4) + 4) % 4, ch = CHORDS[((bar % 4) + 4) % 4];
    play('kick', t, { music: true, vol: b === 0 ? 0.9 : 0.6 });
    if (b === 1 || b === 3) play('snare', t, { music: true, vol: 0.45 });
    play('hat', t + beatSec / 2, { music: true, vol: 0.7 });
    play('bass', t, { music: true, note: ch.bass, dur: beatSec * 0.6 });
    if (b === 0) play('pad', t, { music: true, notes: ch.pad, dur: beatSec * 3 });
  }

  // 박자 예약기: 오디오 시계로 t0 부터 beatSec 간격. 0.15초 앞서 onBeat(n, time) 을 부름
  function beatScheduler(t0, beatSec, onBeat) {
    var n = 0, alive = true, timer = null;
    function tick() {
      if (!alive || !ctx) return;
      while (t0 + n * beatSec < ctx.currentTime + 0.15) {
        var t = t0 + n * beatSec;
        if (t >= ctx.currentTime - 0.02) onBeat(n, t);
        n++;
      }
    }
    tick();
    timer = setInterval(tick, 25);
    return { stop: function () { alive = false; clearInterval(timer); }, tick: tick };
  }

  window.MelodyAudio = {
    unlock: unlock, ready: ready, now: now, heardNow: heardNow, eventTime: eventTime, latency: latency,
    play: play, CUE: CUE, musicBeat: musicBeat, beatScheduler: beatScheduler,
    setMuted: setMuted, isMuted: function () { return muted; }, suspend: suspend, resume: resume,
    state: function () { return ctx ? ctx.state : 'none'; }
  };
})();
