'use strict';

// All sound is synthesized with Web Audio: no asset files to load or license.
const Sound = (() => {
  let ctx = null, master, music, sfx, echo, musicTimer = null;
  let vols = { master: 0.8, music: 0.6, sfx: 0.8, muted: false };
  let zone = 'shallows';
  let musicStyle = 'zone';   // 'zone' follows the current zone, or a theme id below
  let sfxStyle = 'bubbles';  // bubbles | crystal | retro
  let lastTap = 0;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---- Soundtrack themes --------------------------------------------------
  // Each theme: chord progression (MIDI), melody scale, pad sound, and optional rhythm.
  const THEMES = {
    reef: {
      name: 'Sunlit reef',
      chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]],
      scale: [74, 76, 78, 81, 83, 86, 88, 90], pad: 'triangle', lp: 900, chordLen: 8, bell: [0.7, 1.6], bellWave: 'sine',
    },
    kelp: {
      name: 'Kelp sway',
      chords: [[50, 57, 60, 65], [52, 59, 62, 67], [53, 60, 64, 69], [55, 62, 65, 71]],
      scale: [74, 76, 77, 79, 81, 83, 84, 86], pad: 'sine', lp: 1400, chordLen: 6.4, bell: [1.2, 2.2], bellWave: 'triangle',
      pluck: 0.4, // gentle eighth-note arpeggio
    },
    trench: {
      name: 'Deep dark',
      chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]],
      scale: [69, 71, 72, 74, 76, 77], pad: 'sawtooth', lp: 480, chordLen: 12, bell: [1.8, 3.6], bellWave: 'sine',
      drone: 33,
    },
    ember: {
      name: 'Ashfall',
      chords: [[40, 47, 52, 53], [41, 48, 53, 57], [43, 50, 53, 58], [41, 48, 52, 53]],
      scale: [76, 77, 79, 81, 83, 84, 86], pad: 'sawtooth', lp: 700, chordLen: 8, bell: [1.4, 2.8], bellWave: 'triangle',
      heartbeat: 0.85,
    },
    box: {
      name: 'Music box',
      chords: [], scale: [72, 74, 76, 79, 81, 84, 86, 88, 91], pad: 'sine', lp: 1, chordLen: 8, bell: [0.32, 0.32], bellWave: 'sine',
      lullaby: true,
    },
  };
  const ZONE_THEME = { shallows: 'reef', kelp: 'kelp', trench: 'trench', ember: 'ember' };
  const theme = () => THEMES[musicStyle === 'zone' ? (ZONE_THEME[zone] || 'reef') : musicStyle] || THEMES.reef;

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

  // Sound-effect styles reshape every effect voice the same way.
  function fx(o) {
    if (sfxStyle === 'retro') return voice({ ...o, type: 'square', gain: o.gain * 0.45, decay: o.decay * 0.6, send: 0 });
    if (sfxStyle === 'crystal') return voice({ ...o, type: 'sine', freq: o.freq * 2, glideTo: o.glideTo && o.glideTo * 2, decay: o.decay * 1.6, send: (o.send || 0) + 0.3 });
    return voice(o);
  }

  function noiseSweep({ from, to, dur, gain = 0.25, type = 'bandpass', at = 0 }) {
    if (sfxStyle === 'retro') { fx({ freq: from / 2, glideTo: to / 2, glideTime: dur, decay: dur, gain: 0.2 }); return; }
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

  // ---- Soundtrack scheduler ------------------------------------------------
  let chordIdx = 0, nextChordAt = 0, nextBellAt = 0, nextPulseAt = 0, step = 0;
  function startMusic() {
    nextChordAt = ctx.currentTime + 0.1;
    nextBellAt = ctx.currentTime + 1.5;
    nextPulseAt = ctx.currentTime + 0.5;
    clearInterval(musicTimer);
    musicTimer = setInterval(scheduleMusic, 150);
  }
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const th = theme();
    while (nextChordAt < now + 0.5) {
      if (th.chords.length) {
        const chord = th.chords[chordIdx % th.chords.length];
        chord.forEach((m) => pad(hz(m), nextChordAt, th.chordLen, th));
        if (th.drone) pad(hz(th.drone), nextChordAt, th.chordLen, th, 0.05);
      }
      chordIdx++;
      nextChordAt += th.chordLen;
    }
    while (nextBellAt < now + 0.5) {
      let m;
      if (th.lullaby) {
        // A looping music-box tune
        const tune = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 2, 0];
        m = th.scale[tune[step++ % tune.length]];
      } else m = th.scale[Math.floor(Math.random() * th.scale.length)];
      voice({ freq: hz(m), type: th.bellWave, at: nextBellAt - now, attack: 0.02, decay: th.lullaby ? 1.2 : 2.4, gain: th.lullaby ? 0.06 : 0.07, dest: music, send: 0.5 });
      nextBellAt += th.bell[0] + Math.random() * (th.bell[1] - th.bell[0]);
    }
    // Rhythm layers: kelp plucks, the ember heartbeat
    const beat = th.pluck || th.heartbeat;
    while (beat && nextPulseAt < now + 0.5) {
      const at = nextPulseAt - now;
      if (th.pluck) {
        const chord = th.chords[(chordIdx + th.chords.length - 1) % th.chords.length];
        const m = chord[step % chord.length] + 12;
        voice({ freq: hz(m), type: 'triangle', at, attack: 0.005, decay: 0.25, gain: 0.03, dest: music, send: 0.3 });
        step++;
      } else {
        voice({ freq: 110, glideTo: 42, glideTime: 0.18, type: 'sine', at, attack: 0.005, decay: 0.3, gain: 0.12, dest: music });
        voice({ freq: 100, glideTo: 40, glideTime: 0.15, type: 'sine', at: at + 0.22, attack: 0.005, decay: 0.25, gain: 0.07, dest: music });
      }
      nextPulseAt += beat;
    }
    if (!beat) nextPulseAt = now + 0.5;
  }
  function pad(freq, start, len, th, level = 0.035) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = th.lp;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + 2.2);
    g.gain.setValueAtTime(level, start + len - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len + 2);
    lp.connect(g); g.connect(music);
    [-6, 6].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = th.pad;
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(lp);
      o.start(start);
      o.stop(start + len + 2.1);
    });
  }
  // Switch themes quickly instead of waiting for the current chord to finish.
  function retheme() {
    if (!ctx) return;
    nextChordAt = Math.min(nextChordAt, ctx.currentTime + 0.3);
    step = 0;
  }

  // ---- Effects ------------------------------------------------------------
  const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
  const on = () => ctx && ctx.state === 'running';
  return {
    init,
    THEMES,
    setVolumes(v) { vols = Object.assign(vols, v); applyVolumes(); },
    setZone(z) { if (z !== zone) { zone = z; if (musicStyle === 'zone') retheme(); } },
    setMusicStyle(s) { if (s !== musicStyle) { musicStyle = s; retheme(); } },
    setSfxStyle(s) { sfxStyle = s; },
    suspend() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
    // For testing: what the audio graph is doing right now.
    status() {
      if (!ctx) return { started: false, vols: { ...vols }, theme: theme().name, sfxStyle };
      return { started: true, state: ctx.state, master: master.gain.value, music: music.gain.value, sfx: sfx.gain.value, chords: chordIdx, vols: { ...vols }, theme: theme().name, sfxStyle };
    },
    tap() {
      if (!on()) return;
      const now = performance.now();
      if (now - lastTap < 25) return;
      lastTap = now;
      const f = 520 + Math.random() * 380;
      fx({ freq: f, glideTo: f * 2.1, glideTime: 0.07, decay: 0.12, gain: 0.18, send: 0.15 });
    },
    click() { if (on()) fx({ freq: 1250, decay: 0.04, gain: 0.06 }); },
    buy() {
      if (!on()) return;
      const i = 2 + Math.floor(Math.random() * 4);
      fx({ freq: hz(SCALE[i]), type: 'triangle', decay: 0.25, gain: 0.16, send: 0.25 });
      fx({ freq: hz(SCALE[i + 2]), type: 'triangle', at: 0.07, decay: 0.35, gain: 0.14, send: 0.3 });
    },
    milestone() {
      if (!on()) return;
      [0, 2, 4, 5, 7].forEach((k, n) =>
        fx({ freq: hz(SCALE[k] + 12), type: 'triangle', at: n * 0.08, decay: 0.6, gain: 0.14, send: 0.45 }));
      fx({ freq: hz(SCALE[0] - 12), at: 0, decay: 1.2, gain: 0.12 });
    },
    perk() {
      if (!on()) return;
      [9, 7, 10].forEach((k, n) => fx({ freq: hz(SCALE[k] + 12), at: n * 0.06, decay: 0.5, gain: 0.08, send: 0.6 }));
    },
    seed() {
      if (!on()) return;
      fx({ freq: 300, glideTo: 1200, glideTime: 0.35, type: 'triangle', decay: 0.5, gain: 0.14, send: 0.5 });
    },
    tide() {
      if (!on()) return;
      noiseSweep({ from: 250, to: 2400, dur: 1.6, gain: 0.35 });
      [0, 4, 7].forEach((k, n) => fx({ freq: hz(SCALE[k]), type: 'triangle', at: 0.5 + n * 0.12, decay: 1.4, gain: 0.1, send: 0.6 }));
    },
    descend() {
      if (!on()) return;
      noiseSweep({ from: 1800, to: 120, dur: 2.2, gain: 0.35, type: 'lowpass' });
      fx({ freq: 220, glideTo: 55, glideTime: 2, decay: 2.4, attack: 0.1, gain: 0.25 });
    },
  };
})();
