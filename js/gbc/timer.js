"use strict";
class GBC_timer {
  constructor(core) {
    this.core = core;
    this.div_ticks = 0;
    this.tima_ticks = 0;
    this.div_reg = 0;
    this.tima_reg = 0;
    this.modulo_reg = 0;
    this.timer_speed = 0;
    this.timer_running = 0;
  }
  clock(cycles) {
    this.div_ticks -= cycles;
    while (this.div_ticks <= 0) {
      this.div_reg = (this.div_reg + 1) & 0xff;
      this.div_ticks += 64;
    }
    if (this.timer_running) {
      this.tima_ticks -= cycles;
      while (this.tima_ticks <= 0) {
        this.tima_reg++;
        if (this.tima_reg > 0xff) {
          this.tima_reg = this.modulo_reg;
          this.core.raise_interrupt(0x50);
        }
        this.tima_ticks +=
          this.timer_speed === 0 ? 256 : this.timer_speed === 1 ? 4 : this.timer_speed === 2 ? 16 : 64;
      }
    }
  }
  reg_read(address) {
    if (address === 0xff04) return this.div_reg;
    else if (address === 0xff05) return this.tima_reg;
    else if (address === 0xff06) return this.modulo_reg;
    else if (address === 0xff07) return this.timer_speed | (this.timer_running << 2);
  }
  reg_write(address, value) {
    if (address === 0xff04) this.div_reg = 0;
    else if (address === 0xff05) this.tima_reg = value;
    else if (address === 0xff06) this.modulo_reg = value;
    else if (address === 0xff07) {
      this.timer_running = (value & 0x04) >>> 2;
      this.timer_speed = value & 0x03;
    }
  }
  reset(){
    this.div_ticks = 0;
    this.tima_ticks = 0;
    this.div_reg = 0;
    this.tima_reg = 0;
    this.modulo_reg = 0;
    this.timer_speed = 0;
    this.timer_running = 0;
  }
}
