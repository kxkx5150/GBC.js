"use strict";
const audioCtx = new AudioContext();
const sound = {
  MEM2: new Uint8Array(0x10000),
  SoundEnabled: false,
  FFTsize: 512,
  lfsrPhase: 0,
  soundPrescaler1: 0,
  soundPrescaler2: 0,
  reverseTable: null,
  soundStepClocks:4194304 / 256,
  soundStepCountdown:4194304 / 256,
  lfsr7bit: new Float32Array(127),
  lfsr15bit: new Float32Array(32767),
  final: audioCtx.createChannelMerger(2),
  SO1: audioCtx.createGain(),
  SO2: audioCtx.createGain(),
  pulses: [],
  snd4bit4: [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 16384, 16384],
  snd4bit3: [
    4 / 4194304,
    8 / 4194304,
    16 / 4194304,
    24 / 4194304,
    32 / 4194304,
    40 / 4194304,
    48 / 4194304,
    56 / 4194304,
  ],
  countDown(int){
    sound.soundStepCountdown -= int;
    if (sound.soundStepCountdown < 0) {
      sound.soundStepCountdown += sound.soundStepClocks;
      sound.soundStep();
    }
  },
  start(){
    for (var i = 1; i <= 4; i++) {
      sound[i].gainNode = audioCtx.createGain();
      sound[i].amp = function (a) {
        this.gainNode.gain.setValueAtTime(a, audioCtx.currentTime);
      };
      sound[i].amp(0);
      sound[i].oscillator.connect(sound[i].gainNode);
      sound[i].gainNode.connect(sound.SO1);
      sound[i].gainNode.connect(sound.SO2);
      sound[i].initialized = false;
      sound[i].lengthEnabled = false;
      sound[i].length = 0;
      sound[i].env = 0;
      sound[i].envSpeed = 0;
      sound[i].envDirection = 0;
      sound[i].envCounter = 0;
    }
    sound[1].oscillator.start();
    sound[2].oscillator.start();
    sound[3].oscillator.start();
    sound[4].oscillator.onaudioprocess = sound.processLFSR15bit;
    sound.SO1.connect(sound.final, 0, 1);
    sound.SO2.connect(sound.final, 0, 0);
    sound.final.connect(audioCtx.destination);
    audioCtx.suspend();
    sound.reverseTable = new Uint32Array(sound.FFTsize);
    sound.createBit();
    sound.pulses.push(sound.generatePulseWave(0.125));
    sound.pulses.push(sound.generatePulseWave(0.25));
    sound.pulses.push(sound.generatePulseWave(0.5));
    sound.pulses.push(sound.generatePulseWave(0.75));
    sound.resetSoundRegisters();
  },
  processLFSR7bit(e) {
    var output = e.outputBuffer.getChannelData(0);
    var j = 1 / sound[4].bitPeriod;
    for (var i = 0; i < 2048; i++) {
      sound.lfsrPhase += j;
      if (sound.lfsrPhase > 127) sound.lfsrPhase = 0;
      output[i] = sound.lfsr7bit[~~sound.lfsrPhase];
    }
  },
  processLFSR15bit(e) {
    var output = e.outputBuffer.getChannelData(0);
    var j = Math.ceil(sound[4].bitPeriod);
    for (var i = 0; i < 2048; i += j) {
      if (++sound.lfsrPhase >= 32767) sound.lfsrPhase -= 32767;
      var s = sound.lfsr15bit[sound.lfsrPhase];
      for (var p = j; p--; ) output[i + p] = s;
    }
  },
  createBit() {
    var limit = 1,
      bit = sound.FFTsize >> 1;
    while (limit < sound.FFTsize) {
      for (var i = 0; i < limit; i++) {
        sound.reverseTable[i + limit] = sound.reverseTable[i] + bit;
      }
      limit = limit << 1;
      bit = bit >> 1;
    }
    var start_state = 127;
    var lfsr = start_state;
    var st = 0;
    do {
      bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 6);
      sound.lfsr7bit[st++] = bit / 4 - 0.125;
    } while (lfsr != start_state);
    st = 0;
    do {
      bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      sound.lfsr15bit[st++] = bit / 4 - 0.125;
    } while (lfsr != start_state);
  },
  generatePulseWave(duty) {
    var res = 256;
    var real = new Float32Array(res);
    var imag = new Float32Array(res);
    real[0] = 0.5 * duty;
    for (var n = 1; n < res; n++) {
      real[n] = (0.5 * Math.sin(3.141592653589793 * n * duty)) / (1.570796326794896 * n);
    }
    return audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
  },
  soundMapper(addr, data) {
    if (addr == 0xff26) {
      if (data & (1 << 7)) {
        sound.MEM2[0xff26] = data & (1 << 7);
        sound.SoundEnabled = true;
        audioCtx.resume();
      } else {
        sound.SoundEnabled = false;
        audioCtx.suspend();
        sound.resetSoundRegisters();
      }
      return;
    }
    if (addr >= 0xff10 && addr <= 0xff25) {
      if (!sound.SoundEnabled) return;
      if (addr == 0xff10) {
        sound[1].sweepTime = (data >> 4) & 0x7;
        sound[1].sweepPrescaler = sound[1].sweepTime;
        sound[1].sweepDir = data & (1 << 3) ? 0 : 1;
        sound[1].sweepShift = data & 0x7;
        sound.MEM2[addr] = data & 0x80;
        return;
      }
      if (addr == 0xff11) {
        sound.MEM2[addr] = data;
        sound[1].duty(data >> 6);
        return;
      }
      if (addr == 0xff12) {
        sound.MEM2[addr] = data;
        sound[1].envDirection = data & (1 << 3) ? 1 : -1;
        sound[1].envSpeed = data & 0x7;
        sound[1].envCounter = 0;
        return;
      }
      if (addr == 0xff13) {
        sound[1].freqnum = ((sound.MEM2[0xff14] & 0x7) << 8) + data;
        sound[1].freq(131072 / (2048 - sound[1].freqnum));
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff14) {
        sound[1].freqnum = ((data & 0x7) << 8) + sound.MEM2[0xff13];
        sound[1].freq(131072 / (2048 - sound[1].freqnum));
        if (data & (1 << 7)) {
          sound[1].initialized = true;
          sound[1].env = sound.MEM2[0xff12] >> 4;
          sound[1].envCounter = 0;
          sound[1].amp(sound[1].env / 15);
          sound[1].lengthEnabled = (data & (1 << 6)) != 0;
          sound[1].length = 64 - (sound.MEM2[0xff11] & 0x3f);
          sound.MEM2[0xff26] |= 1 << 0;
        }
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff16) {
        sound.MEM2[addr] = data;
        sound[2].duty(data >> 6);
        return;
      }
      if (addr == 0xff17) {
        sound.MEM2[addr] = data;
        sound[2].envDirection = data & (1 << 3) ? 1 : -1;
        sound[2].envSpeed = data & 0x7;
        sound[2].envCounter = 0;
        return;
      }
      if (addr == 0xff18) {
        sound[2].freq(131072 / (2048 - (((sound.MEM2[0xff19] & 0x7) << 8) + data)));
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff19) {
        sound[2].freq(131072 / (2048 - (((data & 0x7) << 8) + sound.MEM2[0xff18])));
        if (data & (1 << 7)) {
          sound[2].initialized = true;
          sound[2].env = sound.MEM2[0xff17] >> 4;
          sound[2].envCounter = 0;
          sound[2].amp(sound[2].env / 15);
          sound[2].lengthEnabled = (data & (1 << 6)) != 0;
          sound[2].length = 64 - (sound.MEM2[0xff16] & 0x3f);
          sound.MEM2[0xff26] |= 1 << 1;
        }
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff1a) {
        if (data & (1 << 7)) {
          sound[3].initialized = true;
          sound.setSound3Waveform();
        } else {
          sound[3].initialized = false;
          sound[3].amp(0);
        }
        return;
      }
      if (addr == 0xff1b) {
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff1c) {
        if (sound[3].initialized) sound[3].amp([0, 0.5, 0.25, 0.125][(data >> 5) & 0x3]);
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff1d) {
        sound[3].freq(65536 / (2048 - (((sound.MEM2[0xff1e] & 0x7) << 8) + data)));
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff1e) {
        sound[3].freq(65536 / (2048 - (((data & 0x7) << 8) + sound.MEM2[0xff1d])));
        if (data & (1 << 7)) {
          sound[3].initialized = true;
          sound[3].amp([0, 0.5, 0.25, 0.15][(sound.MEM2[0xff1c] >> 5) & 0x3]);
          sound[3].lengthEnabled = (data & (1 << 6)) != 0;
          sound[3].length = 256 - sound.MEM2[0xff1b];
          sound.MEM2[0xff26] |= 1 << 2;
        }
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff20) {
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff21) {
        sound.MEM2[addr] = data;
        sound[4].envDirection = data & (1 << 3) ? 1 : -1;
        sound[4].envSpeed = data & 0x7;
        sound[4].envCounter = 0;
        return;
      }
      if (addr == 0xff22) {
        sound[4].freq(data >> 4, data & 0x7);
        sound[4].polySteps(data & (1 << 3));
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff23) {
        sound[4].initialized = true;
        sound[4].env = sound.MEM2[0xff21] >> 4;
        sound[4].envCounter = 0;
        sound[4].amp(sound[4].env / 15);
        sound[4].length = 64 - (sound.MEM2[0xff20] & 0x3f);
        sound.MEM2[0xff26] |= 1 << 3;
        sound[4].lengthEnabled = (data & (1 << 6)) != 0;
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff24) {
        sound.SO2.gain.setValueAtTime(((data >> 4) & 0x7) / 7, audioCtx.currentTime);
        sound.SO1.gain.setValueAtTime((data & 0x7) / 7, audioCtx.currentTime);
        sound.MEM2[addr] = data;
        return;
      }
      if (addr == 0xff25) {
        var con = (sound.MEM2[0xff25] ^ data) & data;
        var dis = (sound.MEM2[0xff25] ^ data) & ~data;
        for (var i = 0; i < 4; i++) {
          if (con & (1 << i))sound[i + 1].gainNode.connect(sound.SO1);
          if (dis & (1 << i)) {
            try {
              sound[i + 1].gainNode.disconnect(sound.SO1);
            } catch (error) { 
              console.log(sound[i + 1].gainNode);
            }
          }
          if (con & (1 << (4 + i)))sound[i + 1].gainNode.connect(sound.SO2);
          if (dis & (1 << (4 + i))){
            try {
              sound[i + 1].gainNode.disconnect(sound.SO2);
            } catch (error) { 
              console.log(sound[i + 1].gainNode);
            }
          }
        }
        sound.MEM2[addr] = data;
        return;
      }
      return;
    }
    if (addr >= 0xff30 && addr <= 0xff3f) sound[3].waveChanged = true;
  },
  setSound3Waveform() {
    if (!sound[3].waveChanged) return;
    var i,
      real = new Float32Array(sound.FFTsize),
      imag = new Float32Array(sound.FFTsize),
      samples = new Float32Array(sound.FFTsize);
    for (i = 0; i < 16; i++) {
      samples[32 * i + 0] = samples[32 * i + 1] = samples[32 * i + 2] = samples[32 * i + 3] = samples[
        32 * i + 4
      ] = samples[32 * i + 5] = samples[32 * i + 6] = samples[32 * i + 7] = samples[
        32 * i + 8
      ] = samples[32 * i + 9] = samples[32 * i + 10] = samples[32 * i + 11] = samples[
        32 * i + 12
      ] = samples[32 * i + 13] = samples[32 * i + 14] = samples[32 * i + 15] =
        sound.MEM2[0xff30 + i] >> 4;
      samples[32 * i + 16] = samples[32 * i + 17] = samples[32 * i + 18] = samples[
        32 * i + 19
      ] = samples[32 * i + 20] = samples[32 * i + 21] = samples[32 * i + 22] = samples[
        32 * i + 23
      ] = samples[32 * i + 24] = samples[32 * i + 25] = samples[32 * i + 26] = samples[
        32 * i + 27
      ] = samples[32 * i + 28] = samples[32 * i + 29] = samples[32 * i + 30] = samples[32 * i + 31] =
        sound.MEM2[0xff30 + i] & 0x0f;
    }
    for (i = 0; i < sound.FFTsize; i++) {
      real[i] = samples[sound.reverseTable[i]] / 4096;
      imag[i] = 0;
    }
    var halfSize = 1,
      phaseShiftStepReal,
      phaseShiftStepImag,
      currentPhaseShiftReal,
      currentPhaseShiftImag,
      off,
      tr,
      ti,
      tmpReal;
    while (halfSize < sound.FFTsize) {
      phaseShiftStepReal = Math.cos(-3.141592653589793 / halfSize);
      phaseShiftStepImag = Math.sin(-3.141592653589793 / halfSize);
      currentPhaseShiftReal = 1.0;
      currentPhaseShiftImag = 0.0;
      for (var fftStep = 0; fftStep < halfSize; fftStep++) {
        i = fftStep;
        while (i < sound.FFTsize) {
          off = i + halfSize;
          tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
          ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];
          real[off] = real[i] - tr;
          imag[off] = imag[i] - ti;
          real[i] += tr;
          imag[i] += ti;
          i += halfSize << 1;
        }
        tmpReal = currentPhaseShiftReal;
        currentPhaseShiftReal =
          tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
        currentPhaseShiftImag =
          tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
      }
      halfSize = halfSize << 1;
    }
    sound[3].oscillator.setPeriodicWave(
      audioCtx.createPeriodicWave(real.slice(0, sound.FFTsize / 2), imag.slice(0, sound.FFTsize / 2), {
        disableNormalization: true,
      })
    );
    sound[3].waveChanged = false;
  },
  resetSoundRegisters() {
    sound.MEM2[0xff10] = 0x80;
    sound.MEM2[0xff11] = 0xbf;
    sound.MEM2[0xff12] = 0xf3;
    sound.MEM2[0xff13] = 0;
    sound.MEM2[0xff14] = 0xbf;
    sound.MEM2[0xff15] = 0xff;
    sound.MEM2[0xff16] = 0x3f;
    sound.MEM2[0xff17] = 0x00;
    sound.MEM2[0xff18] = 0;
    sound.MEM2[0xff19] = 0xbf;
    sound.MEM2[0xff1a] = 0x7f;
    sound.MEM2[0xff1b] = 0xff;
    sound.MEM2[0xff1c] = 0x9f;
    sound.MEM2[0xff1d] = 0;
    sound.MEM2[0xff1e] = 0xbf;
    sound.MEM2[0xff1f] = 0xff;
    sound.MEM2[0xff20] = 0xff;
    sound.MEM2[0xff21] = 0x00;
    sound.MEM2[0xff22] = 0x00;
    sound.MEM2[0xff23] = 0xbf;
    sound.MEM2[0xff24] = 0x77;
    sound.MEM2[0xff25] = 0xf3;
    sound.MEM2[0xff26] = 0xf1;
  },
  readMem(addr){
    return sound.MEM2[addr];
  },
  soundStep() {
    if (!sound.SoundEnabled) return;
    if (sound[1].lengthEnabled) {
      if (--sound[1].length <= 0) {
        sound[1].lengthEnabled = false;
        sound[1].initialized = false;
        sound[1].amp(0);
        sound.MEM2[0xff26] &= ~(1 << 0);
      }
    }
    if (sound[2].lengthEnabled) {
      if (--sound[2].length <= 0) {
        sound[2].lengthEnabled = false;
        sound[2].initialized = false;
        sound[2].amp(0);
        sound.MEM2[0xff26] &= ~(1 << 1);
      }
    }
    if (sound[3].lengthEnabled) {
      if (--sound[3].length <= 0) {
        sound[3].lengthEnabled = false;
        sound[3].initialized = false;
        sound[3].amp(0);
        sound.MEM2[0xff26] &= ~(1 << 2);
      }
    }
    if (sound[4].lengthEnabled) {
      if (--sound[4].length <= 0) {
        sound[4].lengthEnabled = false;
        sound[4].initialized = false;
        sound[4].amp(0);
        sound.MEM2[0xff26] &= ~(1 << 3);
      }
    }
    if (sound.soundPrescaler1++) {
      sound.soundPrescaler1 = 0;
      if (sound[1].initialized && sound[1].sweepTime) {
        if (--sound[1].sweepPrescaler < 0) {
          sound[1].sweepPrescaler += sound[1].sweepTime;
          sound.sweepCalculate();
        }
      }
      if (sound.soundPrescaler2++) {
        sound.soundPrescaler2 = 0;
        for (var i of [1, 2, 4]) {
          if (sound[i].initialized && sound[i].envSpeed) {
            if (++sound[i].envCounter == sound[i].envSpeed) {
              sound[i].envCounter = 0;
              sound[i].env += sound[i].envDirection;
              if (sound[i].env <= 0) {
                sound[i].env = 0;
                sound[i].initialized = false;
              } else if (sound[i].env >= 15) {
                sound[i].env = 15;
                sound[i].initialized = false;
              }
              sound[i].amp(sound[i].env / 15);
            }
          }
        }
      }
    }
  },
  sweepCalculate() {
    if (sound[1].sweepDir) {
      sound[1].freqnum += sound[1].freqnum >> sound[1].sweepShift;
      if (sound[1].freqnum > 0x7ff) {
        sound[1].initialized = false;
        sound.MEM2[0xff26] &= ~(1 << 0);
        sound[1].amp(0);
      } else sound[1].freq(131072 / (2048 - sound[1].freqnum));
    } else {
      sound[1].freqnum -= sound[1].freqnum >> sound[1].sweepShift;
      if (sound[1].freqnum < 0) sound[1].freqnum += sound[1].freqnum >> sound[1].sweepShift;
      sound[1].freq(131072 / (2048 - sound[1].freqnum));
    }
  },
  1: {
    oscillator: audioCtx.createOscillator(),
    freq: function (f) {
      sound[1].oscillator.frequency.setValueAtTime(f, audioCtx.currentTime);
    },
    duty: function (d) {
      sound[1].oscillator.setPeriodicWave(sound.pulses[d]);
    },
    sweepTime: 0,
    sweepDir: 1,
    sweepShift: 0,
    sweepPrescaler: 0,
    freqnum: 0,
  },
  2: {
    oscillator: audioCtx.createOscillator(),
    freq: function (f) {
      sound[2].oscillator.frequency.setValueAtTime(f, audioCtx.currentTime);
    },
    duty: function (d) {
      sound[2].oscillator.setPeriodicWave(sound.pulses[d]);
    },
  },
  3: {
    oscillator: audioCtx.createOscillator(),
    freq: function (f) {
      sound[3].oscillator.frequency.setValueAtTime(f, audioCtx.currentTime);
    },
    waveChanged: true,
  },
  4: {
    oscillator: audioCtx.createScriptProcessor(2048, 1, 1),
    polySteps: function (x) {
      sound.lfsrPhase = 0;
      sound[4].oscillator.onaudioprocess = x ? sound.processLFSR7bit : sound.processLFSR15bit;
    },
    bitPeriod: 1,
    freq: function (bits4, bits3) {
      sound[4].bitPeriod = audioCtx.sampleRate * sound.snd4bit4[bits4] * sound.snd4bit3[bits3];
    },
  },
};
sound.start();
