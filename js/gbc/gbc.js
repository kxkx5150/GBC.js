"use strict";
function GBC_emulator_core() {
  this.cpu = new GBC_cpu(this);
  this.memory = new GBC_memory(this);
  this.video = new GBC_video(this);
  this.timer = new GBC_timer(this);
  this.sound = sound;
  this.paused = false;
  this.buttons = {
    a: false,
    b: false,
    start: false,
    select: false,
    up: false,
    down: false,
    left: false,
    right: false,
  };
  this.keypad_nibble_requested = 0;
  this.interrupt_enable = 0;
  this.interrupt_flags = 0;
  this.vram_dma_source = 0;
  this.vram_dma_destination = 0;
  this.vram_dma_running = 0;
  this.speed_switch_unlocked = 0;
  this.cpu_speed = 0;
}
GBC_emulator_core.prototype.CPU_CYCLES_PER_FRAME_DMG = 17556;
GBC_emulator_core.prototype.CPU_CYCLES_PER_FRAME_CGB = 17556 * 2;
GBC_emulator_core.prototype.run_one_frame = function () {
  var cycle_counter = 0,
    cycles_per_frame = this.cpu_speed ? this.CPU_CYCLES_PER_FRAME_CGB : this.CPU_CYCLES_PER_FRAME_DMG;
  while (cycle_counter <= cycles_per_frame) {
    var new_cycles = this.cpu.run_instruction();
    soundStepCountdown -= new_cycles;
    if (soundStepCountdown < 0) {
      soundStepCountdown += soundStepClocks;
      sound.soundStep();
    }
    new_cycles += this.video.clock(new_cycles * (this.cpu_speed ? 0.5 : 1)) * (this.cpu_speed ? 2 : 1);
    this.timer.clock(new_cycles);
    cycle_counter += new_cycles;
  }
  if (!this.paused) {
    window.requestAnimationFrame(this.run_one_frame.bind(this));
  }
};
GBC_emulator_core.prototype.run = function () {
  this.cpu.reset(this.memory.cgb_game);
  this.video.init(this.memory.cgb_game);
  this.paused = false;
  window.requestAnimationFrame(this.run_one_frame.bind(this));
};
GBC_emulator_core.prototype.pause = function () {
  this.paused = true;
};
GBC_emulator_core.prototype.resume = function () {
  if (this.paused) {
    this.paused = false;
    window.requestAnimationFrame(this.run_one_frame.bind(this));
  }
};
GBC_emulator_core.prototype.set_rom = function (rom, filename) {
  this.paused = true;
  this.memory.load_rom(new Uint8Array(rom), filename);
  this.interrupt_enable = 0;
  this.interrupt_flags = 0;
  this.timer_running = 1;
};
GBC_emulator_core.prototype.hit_stop_instruction = function () {
  if (this.speed_switch_unlocked) this.cpu_speed = this.cpu_speed ? 0 : 1;
};
GBC_emulator_core.prototype.raise_interrupt = function (address) {
  if (address === 0x40) this.interrupt_flags |= 0x01;
  else if (address === 0x48) this.interrupt_flags |= 0x02;
  else if (address === 0x50) this.interrupt_flags |= 0x04;
  else if (address === 0x58) this.interrupt_flags |= 0x08;
  else if (address === 0x60) this.interrupt_flags |= 0x10;
};
GBC_emulator_core.prototype.key_down = function (event) {
  var handled_key = true;
  if (event.keyCode === 88) this.buttons.a = true;
  else if (event.keyCode === 90) this.buttons.b = true;
  else if (event.keyCode === 65) this.buttons.select = true;
  else if (event.keyCode === 83) this.buttons.start = true;
  else if (event.keyCode === 38) this.buttons.up = true;
  else if (event.keyCode === 40) this.buttons.down = true;
  else if (event.keyCode === 37) this.buttons.left = true;
  else if (event.keyCode === 39) this.buttons.right = true;
  else handled_key = false;
  if (handled_key) this.raise_interrupt(0x60);
};
GBC_emulator_core.prototype.key_up = function (event) {
  if (event.keyCode === 88) this.buttons.a = false;
  else if (event.keyCode === 90) this.buttons.b = false;
  else if (event.keyCode === 65) this.buttons.select = false;
  else if (event.keyCode === 83) this.buttons.start = false;
  else if (event.keyCode === 38) this.buttons.up = false;
  else if (event.keyCode === 40) this.buttons.down = false;
  else if (event.keyCode === 37) this.buttons.left = false;
  else if (event.keyCode === 39) this.buttons.right = false;
};
GBC_emulator_core.prototype.mem_read = function (address) {
  address &= 0xffff;
  if (address >= 0xff10 && address <= 0xff3f) {
    return sound.readMem(address);
  }
  if (address >= 0x8000 && address < 0xa000) return this.video.mem_read(address);
  else if ((address >= 0xfe00 && address < 0xfea0) || address === 0xff55 || address === 0xff4f)
    return this.video.mem_read(address);
  else if (address === 0xffff) return this.interrupt_enable;
  else if (address < 0xff00 || address >= 0xff80 || address === 0xff70)
    return this.memory.mem_read(address);
  else if (address === 0xff00) {
    if (this.keypad_nibble_requested === 0) {
      return (
        (this.buttons.a ? 0 : 1) |
        (this.buttons.b ? 0 : 2) |
        (this.buttons.select ? 0 : 4) |
        (this.buttons.start ? 0 : 8)
      );
    } else {
      return (
        (this.buttons.right ? 0 : 1) |
        (this.buttons.left ? 0 : 2) |
        (this.buttons.up ? 0 : 4) |
        (this.buttons.down ? 0 : 8)
      );
    }
  } else if (address >= 0xff04 && address <= 0xff07) return this.timer.reg_read(address);
  else if (address === 0xff0f) return this.interrupt_flags;
  else if (address === 0xff46) return 0;
  else if (address === 0xff4d) return this.speed_switch_unlocked | (this.cpu_speed << 7);
  else if (address === 0xff51 && this.memory.cgb_game && !this.vram_dma_running)
    return this.vram_dma_source >>> 8;
  else if (address === 0xff52 && this.memory.cgb_game && !this.vram_dma_running)
    return this.vram_dma_source & 0xff;
  else if (address === 0xff53 && this.memory.cgb_game && !this.vram_dma_running)
    return this.vram_dma_destination >>> 8;
  else if (address === 0xff54 && this.memory.cgb_game && !this.vram_dma_running)
    return this.vram_dma_destination & 0xff;
  else if (address >= 0xff40 && address <= 0xff4b) return this.video.mem_read(address);
  else if (address >= 0xff68 && address <= 0xff6b) return this.video.mem_read(address);
  else return 0;
};
GBC_emulator_core.prototype.mem_write = function (address, value) {
  address &= 0xffff;
  value &= 0xff;
  if (address >= 0xff10 && address <= 0xff3f) {
    sound.soundMapper(address, value);
    return;
  }
  if (address >= 0x8000 && address < 0xa000) this.video.mem_write(address, value);
  else if ((address >= 0xfe00 && address < 0xfea0) || address === 0xff4f)
    this.video.mem_write(address, value);
  else if (address === 0xffff) this.interrupt_enable = value;
  else if (address < 0xff00 || address >= 0xff80 || address === 0xff70)
    this.memory.mem_write(address, value);
  else if (address === 0xff00) this.keypad_nibble_requested = (value >>> 5) % 2;
  else if (address >= 0xff04 && address <= 0xff07) this.timer.reg_write(address, value);
  else if (address === 0xff0f) this.interrupt_flags = value;
  else if (address === 0xff46) {
    var start_address = value << 8;
    if (start_address < 0xa000 && start_address >= 0x8000) this.video.do_oam_dma(start_address);
    else this.video.do_oam_dma(this.memory.get_dma_array(start_address, 160));
  } else if (address === 0xff4d && this.memory.cgb_game) this.speed_switch_unlocked = value % 2;
  else if (address === 0xff51 && this.memory.cgb_game && !this.vram_dma_running)
    this.vram_dma_source = (this.vram_dma_source & 0xff) | (value << 8);
  else if (address === 0xff52 && this.memory.cgb_game && !this.vram_dma_running)
    this.vram_dma_source = (this.vram_dma_source & 0xff00) | (value & 0xf0);
  else if (address === 0xff53 && this.memory.cgb_game && !this.vram_dma_running)
    this.vram_dma_destination = (this.vram_dma_destination & 0xff) | ((value & 0x1f) << 8);
  else if (address === 0xff54 && this.memory.cgb_game && !this.vram_dma_running)
    this.vram_dma_destination = (this.vram_dma_destination & 0xff00) | (value & 0xf0);
  else if (address === 0xff55 && this.memory.cgb_game) {
    if (
      this.vram_dma_source > 0xdff0 ||
      (this.vram_dma_source > 0x7ff0 && this.vram_dma_source < 0xa000)
    )
      return;
    var length = ((value & 0x7f) + 1) * 16;
    this.video.do_vram_dma(
      this.memory.get_dma_array(this.vram_dma_source, length),
      this.vram_dma_destination,
      (value & 0x80) >>> 7
    );
  } else if (address >= 0xff40 && address <= 0xff4b) this.video.mem_write(address, value);
  else if (address >= 0xff68 && address <= 0xff6b) this.video.mem_write(address, value);
};
