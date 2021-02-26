"use strict";
class GBC_sound {
  constructor(core) {
    this.audioCtx = new AudioContext();
    this.core = core;
    this.SoundEnabled = false;
    this.FFTsize = 512;
    this.countdown = 4194304 / 256;
    this.lfsrPhase = 0;
    this.soundPrescaler1 = 0;
    this.soundPrescaler2 = 0;
    this.reverseTable = null;
    this.MEM2 = new Uint8Array(0x10000);
    this.lfsr7bit = new Float32Array(127);
    this.lfsr15bit = new Float32Array(32767);
    this.final = this.audioCtx.createChannelMerger(2);
    this.SO1 = this.audioCtx.createGain();
    this.SO2 = this.audioCtx.createGain();
    this.pulses = [];
    this.snd4bit4 = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 16384, 16384];
    this.snd4bit3 = [
      4 / 4194304,
      8 / 4194304,
      16 / 4194304,
      24 / 4194304,
      32 / 4194304,
      40 / 4194304,
      48 / 4194304,
      56 / 4194304,
    ];
    this.nodes = [
      {}, //dummy
      {
        oscillator: this.audioCtx.createOscillator(),
        freq: (f) => {
          this.nodes[1].oscillator.frequency.setValueAtTime(f, this.audioCtx.currentTime);
        },
        duty: (d) => {
          this.nodes[1].oscillator.setPeriodicWave(this.pulses[d]);
        },
        sweepTime: 0,
        sweepDir: 1,
        sweepShift: 0,
        sweepPrescaler: 0,
        freqnum: 0,
      },
      {
        oscillator: this.audioCtx.createOscillator(),
        freq: (f) => {
          this.nodes[2].oscillator.frequency.setValueAtTime(f, this.audioCtx.currentTime);
        },
        duty: (d) => {
          this.nodes[2].oscillator.setPeriodicWave(this.pulses[d]);
        },
      },
      {
        oscillator: this.audioCtx.createOscillator(),
        freq: (f) => {
          this.nodes[3].oscillator.frequency.setValueAtTime(f, this.audioCtx.currentTime);
        },
        waveChanged: true,
      },
      {
        oscillator: this.audioCtx.createScriptProcessor(2048, 1, 1),
        polySteps: (x) => {
          this.lfsrPhase = 0;
          const func = x ? this.processLFSR7bit : this.processLFSR15bit;
          this.nodes[4].oscillator.onaudioprocess = (e) => {
            func.bind(this, e)();
          };
        },
        bitPeriod: 1,
        freq: (bits4, bits3) => {
          this.nodes[4].bitPeriod = this.audioCtx.sampleRate * this.snd4bit4[bits4] * this.snd4bit3[bits3];
        },
      },
    ];
    this.reset();
    this.init();
  }
  init() {
    const audioCtx = this.audioCtx;
    this.reverseTable = new Uint32Array(this.FFTsize);
    this.createBit();
    for (var i = 1; i <= 4; i++) {
      this.nodes[i].gainNode = this.audioCtx.createGain();
      this.nodes[i].amp = function(a) {
        this.gainNode.gain.setValueAtTime(a, audioCtx.currentTime);
      };
      this.nodes[i].amp(0);
      this.nodes[i].oscillator.connect(this.nodes[i].gainNode);
      this.nodes[i].gainNode.connect(this.SO1);
      this.nodes[i].gainNode.connect(this.SO2);
      this.nodes[i].initialized = false;
      this.nodes[i].lengthEnabled = false;
      this.nodes[i].length = 0;
      this.nodes[i].env = 0;
      this.nodes[i].envSpeed = 0;
      this.nodes[i].envDirection = 0;
      this.nodes[i].envCounter = 0;
    }
    this.nodes[1].oscillator.start();
    this.nodes[2].oscillator.start();
    this.nodes[3].oscillator.start();
    this.nodes[4].oscillator.onaudioprocess = (e) => {
      this.processLFSR15bit.bind(this, e)();
    };
    this.SO1.connect(this.final, 0, 1);
    this.SO2.connect(this.final, 0, 0);
    this.final.connect(this.audioCtx.destination);
    this.audioCtx.suspend();
    this.pulses.push(this.generatePulseWave(0.125));
    this.pulses.push(this.generatePulseWave(0.25));
    this.pulses.push(this.generatePulseWave(0.5));
    this.pulses.push(this.generatePulseWave(0.75));
    this.resetSoundRegisters();
  }
  reset(){
    this.MEM2.fill(0);
    this.lfsr7bit.fill(0);
    this.lfsr15bit.fill(0);
    this.lfsrPhase = 0;
    this.soundPrescaler1 = 0;
    this.soundPrescaler2 = 0;
    this.reverseTable = null;
    this.countdown = 4194304 / 256;
    this.pulses = [];
  }
  countDown(int) {
    this.countdown -= int;
    if (this.countdown < 0) {
      this.countdown += 4194304 / 256;
      this.soundStep();
    }
  }
  processLFSR7bit(e) {
    var output = e.outputBuffer.getChannelData(0);
    var j = 1 / this.nodes[4].bitPeriod;
    for (var i = 0; i < 2048; i++) {
      this.lfsrPhase += j;
      if (this.lfsrPhase > 127) this.lfsrPhase = 0;
      output[i] = this.lfsr7bit[~~this.lfsrPhase];
    }
  }
  processLFSR15bit(e) {
    var output = e.outputBuffer.getChannelData(0);
    var j = Math.ceil(this.nodes[4].bitPeriod);
    for (var i = 0; i < 2048; i += j) {
      if (++this.lfsrPhase >= 32767) this.lfsrPhase -= 32767;
      var s = this.lfsr15bit[this.lfsrPhase];
      for (var p = j; p--; ) output[i + p] = s;
    }
  }
  createBit() {
    var limit = 1,
      bit = this.FFTsize >> 1;
    while (limit < this.FFTsize) {
      for (var i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit;
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
      this.lfsr7bit[st++] = bit / 4 - 0.125;
    } while (lfsr != start_state);
    st = 0;
    do {
      bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      this.lfsr15bit[st++] = bit / 4 - 0.125;
    } while (lfsr != start_state);
  }
  generatePulseWave(duty) {
    var res = 256;
    var real = new Float32Array(res);
    var imag = new Float32Array(res);
    real[0] = 0.5 * duty;
    for (var n = 1; n < res; n++) {
      real[n] = (0.5 * Math.sin(3.141592653589793 * n * duty)) / (1.570796326794896 * n);
    }
    return this.audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
  }
  setSound3Waveform() {
    if (!this.nodes[3].waveChanged) return;
    var i,
      real = new Float32Array(this.FFTsize),
      imag = new Float32Array(this.FFTsize),
      samples = new Float32Array(this.FFTsize);
    for (i = 0; i < 16; i++) {
      samples[32 * i + 0] = samples[32 * i + 1] = samples[32 * i + 2] = samples[32 * i + 3] = samples[
        32 * i + 4
      ] = samples[32 * i + 5] = samples[32 * i + 6] = samples[32 * i + 7] = samples[
        32 * i + 8
      ] = samples[32 * i + 9] = samples[32 * i + 10] = samples[32 * i + 11] = samples[
        32 * i + 12
      ] = samples[32 * i + 13] = samples[32 * i + 14] = samples[32 * i + 15] =
        this.MEM2[0xff30 + i] >> 4;
      samples[32 * i + 16] = samples[32 * i + 17] = samples[32 * i + 18] = samples[
        32 * i + 19
      ] = samples[32 * i + 20] = samples[32 * i + 21] = samples[32 * i + 22] = samples[
        32 * i + 23
      ] = samples[32 * i + 24] = samples[32 * i + 25] = samples[32 * i + 26] = samples[
        32 * i + 27
      ] = samples[32 * i + 28] = samples[32 * i + 29] = samples[32 * i + 30] = samples[32 * i + 31] =
        this.MEM2[0xff30 + i] & 0x0f;
    }
    for (i = 0; i < this.FFTsize; i++) {
      real[i] = samples[this.reverseTable[i]] / 4096;
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
    while (halfSize < this.FFTsize) {
      phaseShiftStepReal = Math.cos(-3.141592653589793 / halfSize);
      phaseShiftStepImag = Math.sin(-3.141592653589793 / halfSize);
      currentPhaseShiftReal = 1.0;
      currentPhaseShiftImag = 0.0;
      for (var fftStep = 0; fftStep < halfSize; fftStep++) {
        i = fftStep;
        while (i < this.FFTsize) {
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
    this.nodes[3].oscillator.setPeriodicWave(
      this.audioCtx.createPeriodicWave(real.slice(0, this.FFTsize / 2), imag.slice(0, this.FFTsize / 2), {
        disableNormalization: true,
      })
    );
    this.nodes[3].waveChanged = false;
  }
  sweepCalculate() {
    if (this.nodes[1].sweepDir) {
      this.nodes[1].freqnum += this.nodes[1].freqnum >> this.nodes[1].sweepShift;
      if (this.nodes[1].freqnum > 0x7ff) {
        this.nodes[1].initialized = false;
        this.MEM2[0xff26] &= ~(1 << 0);
        this.nodes[1].amp(0);
      } else this.nodes[1].freq(131072 / (2048 - this.nodes[1].freqnum));
    } else {
      this.nodes[1].freqnum -= this.nodes[1].freqnum >> this.nodes[1].sweepShift;
      if (this.nodes[1].freqnum < 0)
        this.nodes[1].freqnum += this.nodes[1].freqnum >> this.nodes[1].sweepShift;
      this.nodes[1].freq(131072 / (2048 - this.nodes[1].freqnum));
    }
  }
  resetSoundRegisters() {
    this.MEM2[0xff10] = 0x80;
    this.MEM2[0xff11] = 0xbf;
    this.MEM2[0xff12] = 0xf3;
    this.MEM2[0xff13] = 0;
    this.MEM2[0xff14] = 0xbf;
    this.MEM2[0xff15] = 0xff;
    this.MEM2[0xff16] = 0x3f;
    this.MEM2[0xff17] = 0x00;
    this.MEM2[0xff18] = 0;
    this.MEM2[0xff19] = 0xbf;
    this.MEM2[0xff1a] = 0x7f;
    this.MEM2[0xff1b] = 0xff;
    this.MEM2[0xff1c] = 0x9f;
    this.MEM2[0xff1d] = 0;
    this.MEM2[0xff1e] = 0xbf;
    this.MEM2[0xff1f] = 0xff;
    this.MEM2[0xff20] = 0xff;
    this.MEM2[0xff21] = 0x00;
    this.MEM2[0xff22] = 0x00;
    this.MEM2[0xff23] = 0xbf;
    this.MEM2[0xff24] = 0x77;
    this.MEM2[0xff25] = 0xf3;
    this.MEM2[0xff26] = 0xf1;
  }
  readMem(addr) {
    return this.MEM2[addr];
  }
  soundStep() {
    if (!this.SoundEnabled) return;
    if (this.nodes[1].lengthEnabled) {
      if (--this.nodes[1].length <= 0) {
        this.nodes[1].lengthEnabled = false;
        this.nodes[1].initialized = false;
        this.nodes[1].amp(0);
        this.MEM2[0xff26] &= ~(1 << 0);
      }
    }
    if (this.nodes[2].lengthEnabled) {
      if (--this.nodes[2].length <= 0) {
        this.nodes[2].lengthEnabled = false;
        this.nodes[2].initialized = false;
        this.nodes[2].amp(0);
        this.MEM2[0xff26] &= ~(1 << 1);
      }
    }
    if (this.nodes[3].lengthEnabled) {
      if (--this.nodes[3].length <= 0) {
        this.nodes[3].lengthEnabled = false;
        this.nodes[3].initialized = false;
        this.nodes[3].amp(0);
        this.MEM2[0xff26] &= ~(1 << 2);
      }
    }
    if (this.nodes[4].lengthEnabled) {
      if (--this.nodes[4].length <= 0) {
        this.nodes[4].lengthEnabled = false;
        this.nodes[4].initialized = false;
        this.nodes[4].amp(0);
        this.MEM2[0xff26] &= ~(1 << 3);
      }
    }
    if (this.soundPrescaler1++) {
      this.soundPrescaler1 = 0;
      if (this.nodes[1].initialized && this.nodes[1].sweepTime) {
        if (--this.nodes[1].sweepPrescaler < 0) {
          this.nodes[1].sweepPrescaler += this.nodes[1].sweepTime;
          this.sweepCalculate();
        }
      }
      if (this.soundPrescaler2++) {
        this.soundPrescaler2 = 0;
        for (var i of [1, 2, 4]) {
          if (this.nodes[i].initialized && this.nodes[i].envSpeed) {
            if (++this.nodes[i].envCounter == this.nodes[i].envSpeed) {
              this.nodes[i].envCounter = 0;
              this.nodes[i].env += this.nodes[i].envDirection;
              if (this.nodes[i].env <= 0) {
                this.nodes[i].env = 0;
                this.nodes[i].initialized = false;
              } else if (this.nodes[i].env >= 15) {
                this.nodes[i].env = 15;
                this.nodes[i].initialized = false;
              }
              this.nodes[i].amp(this.nodes[i].env / 15);
            }
          }
        }
      }
    }
  }
  soundMapper(addr, data) {
    if (addr == 0xff26) {
      if (data & (1 << 7)) {
        this.MEM2[0xff26] = data & (1 << 7);
        this.SoundEnabled = true;
        this.audioCtx.resume();
      } else {
        this.SoundEnabled = false;
        this.audioCtx.suspend();
        this.resetSoundRegisters();
      }
      return;
    } else if (addr >= 0xff10 && addr <= 0xff25) {
      if (!this.SoundEnabled) return;
      if (addr == 0xff10) {
        this.nodes[1].sweepTime = (data >> 4) & 0x7;
        this.nodes[1].sweepPrescaler = this.nodes[1].sweepTime;
        this.nodes[1].sweepDir = data & (1 << 3) ? 0 : 1;
        this.nodes[1].sweepShift = data & 0x7;
        this.MEM2[addr] = data & 0x80;
        return;
      } else if (addr == 0xff11) {
        this.MEM2[addr] = data;
        this.nodes[1].duty(data >> 6);
        return;
      } else if (addr == 0xff12) {
        this.MEM2[addr] = data;
        this.nodes[1].envDirection = data & (1 << 3) ? 1 : -1;
        this.nodes[1].envSpeed = data & 0x7;
        this.nodes[1].envCounter = 0;
        return;
      } else if (addr == 0xff13) {
        this.nodes[1].freqnum = ((this.MEM2[0xff14] & 0x7) << 8) + data;
        this.nodes[1].freq(131072 / (2048 - this.nodes[1].freqnum));
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff14) {
        this.nodes[1].freqnum = ((data & 0x7) << 8) + this.MEM2[0xff13];
        this.nodes[1].freq(131072 / (2048 - this.nodes[1].freqnum));
        if (data & (1 << 7)) {
          this.nodes[1].initialized = true;
          this.nodes[1].env = this.MEM2[0xff12] >> 4;
          this.nodes[1].envCounter = 0;
          this.nodes[1].amp(this.nodes[1].env / 15);
          this.nodes[1].lengthEnabled = (data & (1 << 6)) != 0;
          this.nodes[1].length = 64 - (this.MEM2[0xff11] & 0x3f);
          this.MEM2[0xff26] |= 1 << 0;
        }
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff16) {
        this.MEM2[addr] = data;
        this.nodes[2].duty(data >> 6);
        return;
      } else if (addr == 0xff17) {
        this.MEM2[addr] = data;
        this.nodes[2].envDirection = data & (1 << 3) ? 1 : -1;
        this.nodes[2].envSpeed = data & 0x7;
        this.nodes[2].envCounter = 0;
        return;
      } else if (addr == 0xff18) {
        this.nodes[2].freq(131072 / (2048 - (((this.MEM2[0xff19] & 0x7) << 8) + data)));
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff19) {
        this.nodes[2].freq(131072 / (2048 - (((data & 0x7) << 8) + this.MEM2[0xff18])));
        if (data & (1 << 7)) {
          this.nodes[2].initialized = true;
          this.nodes[2].env = this.MEM2[0xff17] >> 4;
          this.nodes[2].envCounter = 0;
          this.nodes[2].amp(this.nodes[2].env / 15);
          this.nodes[2].lengthEnabled = (data & (1 << 6)) != 0;
          this.nodes[2].length = 64 - (this.MEM2[0xff16] & 0x3f);
          this.MEM2[0xff26] |= 1 << 1;
        }
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff1a) {
        if (data & (1 << 7)) {
          this.nodes[3].initialized = true;
          this.setSound3Waveform();
        } else {
          this.nodes[3].initialized = false;
          this.nodes[3].amp(0);
        }
        return;
      } else if (addr == 0xff1b) {
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff1c) {
        if (this.nodes[3].initialized) this.nodes[3].amp([0, 0.5, 0.25, 0.125][(data >> 5) & 0x3]);
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff1d) {
        this.nodes[3].freq(65536 / (2048 - (((this.MEM2[0xff1e] & 0x7) << 8) + data)));
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff1e) {
        this.nodes[3].freq(65536 / (2048 - (((data & 0x7) << 8) + this.MEM2[0xff1d])));
        if (data & (1 << 7)) {
          this.nodes[3].initialized = true;
          this.nodes[3].amp([0, 0.5, 0.25, 0.15][(this.MEM2[0xff1c] >> 5) & 0x3]);
          this.nodes[3].lengthEnabled = (data & (1 << 6)) != 0;
          this.nodes[3].length = 256 - this.MEM2[0xff1b];
          this.MEM2[0xff26] |= 1 << 2;
        }
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff20) {
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff21) {
        this.MEM2[addr] = data;
        this.nodes[4].envDirection = data & (1 << 3) ? 1 : -1;
        this.nodes[4].envSpeed = data & 0x7;
        this.nodes[4].envCounter = 0;
        return;
      } else if (addr == 0xff22) {
        this.nodes[4].freq(data >> 4, data & 0x7);
        this.nodes[4].polySteps(data & (1 << 3));
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff23) {
        this.nodes[4].initialized = true;
        this.nodes[4].env = this.MEM2[0xff21] >> 4;
        this.nodes[4].envCounter = 0;
        this.nodes[4].amp(this.nodes[4].env / 15);
        this.nodes[4].length = 64 - (this.MEM2[0xff20] & 0x3f);
        this.MEM2[0xff26] |= 1 << 3;
        this.nodes[4].lengthEnabled = (data & (1 << 6)) != 0;
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff24) {
        this.SO2.gain.setValueAtTime(((data >> 4) & 0x7) / 7, this.audioCtx.currentTime);
        this.SO1.gain.setValueAtTime((data & 0x7) / 7, this.audioCtx.currentTime);
        this.MEM2[addr] = data;
        return;
      } else if (addr == 0xff25) {
        var con = (this.MEM2[0xff25] ^ data) & data;
        var dis = (this.MEM2[0xff25] ^ data) & ~data;
        for (var i = 0; i < 4; i++) {
          if (con & (1 << i)) this.nodes[i + 1].gainNode.connect(this.SO1);
          if (dis & (1 << i)) {
            try {
              this.nodes[i + 1].gainNode.disconnect(this.SO1);
            } catch (error) {
              // console.log(this.nodes[i + 1].gainNode);
            }
          }
          if (con & (1 << (4 + i))) this.nodes[i + 1].gainNode.connect(this.SO2);
          if (dis & (1 << (4 + i))) {
            try {
              this.nodes[i + 1].gainNode.disconnect(this.SO2);
            } catch (error) {
              // console.log(this.nodes[i + 1].gainNode);
            }
          }
        }
        this.MEM2[addr] = data;
        return;
      }
      return;
    } else if (addr >= 0xff30 && addr <= 0xff3f) this.nodes[3].waveChanged = true;
  }
}
