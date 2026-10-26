'use strict';

// All sound is synthesized with Web Audio: no asset files to load or license.
const Sound = (() => {
  let ctx = null, master, music, sfx, echo, musicTimer = null;
  let vols = { master: 0.8, music: 0.6, sfx: 0.8, muted: false };
  let zone = 'shallows';
  let lastTap = 0;

  // D major pentatonic, as MIDI notes
  const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
  const CHORDS = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]];
  const ZONE_SHIFT = { shallows: 0, kelp: 2, trench: -5, vents: -3 };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.connect(comp);
    music = ctx.createGain(); music.connect(master);
    sfx = ctx.createGain(); sfx.connect(master);

    // Shared underwater echo: delay with a darkened feedback loop.
    echo = ctx.createDelay(1);
    echo.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200;
    echo.connect(tone); tone.connect(fb); fb.connect(echo);
    tone.connect(master);

    applyVolumes();
    startMusic();
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(vols.muted ? 0 : vols.master, t, 0.05);
    music.gain.setTargetAtTime(vols.music * 0.5, t, 0.05);
    sfx.gain.setTargetAtTime(vols.sfx, t, 0.05);
  }

  function voice({ freq, type = 'sine', at = 0, attack = 0.005, decay = 0.3, gain = 0.2, dest = sfx, send = 0, glideTo = null, glideTime = 0.1 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + glideTime);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g); g.connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(echo); }
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  function noiseSweep({ from, to, dur, gain = 0.25, type = 'bandpass', at = 0 }) {
    const t = ctx.currentTime + at;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(echo);
    src.start(t);
  }

  // ---- Soundtrack: slow pad chords with drifting bell notes --------------
  let chordIdx = 0, nextChordAt = 0, nextBellAt = 0;
  function startMusic() {
    nextChordAt = ctx.currentTime + 0.1;
    nextBellAt = ctx.currentTime + 1.5;
    clearInterval(musicTimer);
    musicTimer = setInterval(scheduleMusic, 200);
  }
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const shift = ZONE_SHIFT[zone] || 0;
    const chordLen = zone === 'trench' ? 11 : 8;
    while (nextChordAt < now + 0.5) {
      const chord = CHORDS[chordIdx % CHORDS.length];
      chord.forEach((m) => pad(hz(m + shift), nextChordAt, chordLen));
      chordIdx++;
      nextChordAt += chordLen;
    }
    while (nextBellAt < now + 0.5) {
      const top = zone === 'trench' ? 6 : SCALE.length;
      const m = SCALE[Math.floor(Math.random() * top)] + shift + 12;
      voice({ freq: hz(m), at: nextBellAt - now, attack: 0.02, decay: 2.4, gain: 0.07, dest: music, send: 0.5 });
      nextBellAt += zone === 'trench' ? 1.4 + Math.random() * 2.4 : 0.7 + Math.random() * 1.6;
    }
  }
  function pad(freq, start, len) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = zone === 'kelp' ? 1300 : zone === 'trench' ? 600 : 900;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.035, start + 2.2);
    g.gain.setValueAtTime(0.035, start + len - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len + 2);
    lp.connect(g); g.connect(music);
    [-6, 6].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start(start);
      o.stop(start + len + 2.1);
    });
  }

  // ---- Effects ------------------------------------------------------------
  const on = () => ctx && ctx.state === 'running';
  return {
    init,
    setVolumes(v) { vols = Object.assign(vols, v); applyVolumes(); },
    setZone(z) { zone = z; },
    suspend() { if (ctx) ctx.suspend(); },
    // For testing: what the audio graph is doing right now.
    status() {
      if (!ctx) return { started: false, vols: { ...vols } };
      return { started: true, state: ctx.state, master: master.gain.value, music: music.gain.value, sfx: sfx.gain.value, chords: chordIdx, vols: { ...vols } };
    },
    resume() { if (ctx) ctx.resume(); },
    tap() {
      if (!on()) return;
      const now = performance.now();
      if (now - lastTap < 25) return;
      lastTap = now;
      const f = 520 + Math.random() * 380;
      voice({ freq: f, glideTo: f * 2.1, glideTime: 0.07, decay: 0.12, gain: 0.18, send: 0.15 });
    },
    click() { if (on()) voice({ freq: 1250, decay: 0.04, gain: 0.06 }); },
    buy() {
      if (!on()) return;
      const i = 2 + Math.floor(Math.random() * 4);
      voice({ freq: hz(SCALE[i]), type: 'triangle', decay: 0.25, gain: 0.16, send: 0.25 });
      voice({ freq: hz(SCALE[i + 2]), type: 'triangle', at: 0.07, decay: 0.35, gain: 0.14, send: 0.3 });
    },
    milestone() {
      if (!on()) return;
      [0, 2, 4, 5, 7].forEach((k, n) =>
        voice({ freq: hz(SCALE[k] + 12), type: 'triangle', at: n * 0.08, decay: 0.6, gain: 0.14, send: 0.45 }));
      voice({ freq: hz(SCALE[0] - 12), at: 0, decay: 1.2, gain: 0.12 });
    },
    perk() {
      if (!on()) return;
      [9, 7, 10].forEach((k, n) => voice({ freq: hz(SCALE[k] + 12), at: n * 0.06, decay: 0.5, gain: 0.08, send: 0.6 }));
    },
    seed() {
      if (!on()) return;
      voice({ freq: 300, glideTo: 1200, glideTime: 0.35, type: 'triangle', decay: 0.5, gain: 0.14, send: 0.5 });
    },
    tide() {
      if (!on()) return;
      noiseSweep({ from: 250, to: 2400, dur: 1.6, gain: 0.35 });
      [0, 4, 7].forEach((k, n) => voice({ freq: hz(SCALE[k]), type: 'triangle', at: 0.5 + n * 0.12, decay: 1.4, gain: 0.1, send: 0.6 }));
    },
    descend() {
      if (!on()) return;
      noiseSweep({ from: 1800, to: 120, dur: 2.2, gain: 0.35, type: 'lowpass' });
      voice({ freq: 220, glideTo: 55, glideTime: 2, decay: 2.4, attack: 0.1, gain: 0.25 });
    },
  };
})();
