"use strict";
class GBC_emulator_core {
  constructor() {
    this.paused = false;
    this.interrupt_enable = 0;
    this.interrupt_flags = 0;
    this.vram_dma_source = 0;
    this.vram_dma_destination = 0;
    this.vram_dma_running = 0;
    this.speed_switch_unlocked = 0;
    this.cpu_speed = 0;
    this.timerID = null;
    this.keypad_nibble_requested = 0;
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
    this.mem = new GBC_memory(this);
    this.cpu = new GBC_cpu(this, this.mem);
    this.video = new GBC_video(this);
    this.timer = new GBC_timer(this);
    this.sound = new GBC_sound(this);
    this.gamepad = new GBC_gamepad(this);

  }
  startTimer(){
    cancelAnimationFrame(this.timerID)
    this.timerID = requestAnimationFrame(this.cycle.bind(this));
  }
  run() {
    this.cpu.reset(this.mem.cgb_game);
    this.video.init(this.mem.cgb_game);
    this.paused = false;
    this.startTimer();
  }
  cycle() {
    var cycle_counter = 0,
      cycles_per_frame = this.cpu_speed ? 17556 * 2 : 17556;
    this.gamepad.updateGamepad();
    while (cycle_counter <= cycles_per_frame) {
      var new_cycles = this.cpu.run_instruction();
      this.sound.countDown(new_cycles);
      new_cycles += this.video.clock(new_cycles * (this.cpu_speed ? 0.5 : 1)) * (this.cpu_speed ? 2 : 1);
      this.timer.clock(new_cycles);
      cycle_counter += new_cycles;
    }
    if (!this.paused) {
      this.startTimer();
    }
  }
  reset(){
    cancelAnimationFrame(this.timerID)
    this.interrupt_enable = 0;
    this.interrupt_flags = 0;
    this.vram_dma_source = 0;
    this.vram_dma_destination = 0;
    this.vram_dma_running = 0;
    this.speed_switch_unlocked = 0;
    this.cpu_speed = 0;
    this.keypad_nibble_requested = 0;
    this.mem.reset();
    this.cpu.reset();
    this.timer.reset();
    this.sound.reset();
  }
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.paused) {
      this.paused = false;
      this.startTimer();
    }
  }
  set_rom(rom, filename) {
    this.paused = true;
    this.mem.load_rom(new Uint8Array(rom), filename);
    this.interrupt_enable = 0;
    this.interrupt_flags = 0;
    this.timer_running = 1;
    this.run();
  }
  hit_stop_instruction() {
    if (this.speed_switch_unlocked)
      this.cpu_speed = this.cpu_speed ? 0 : 1;
  }
  raise_interrupt(address) {
    if (address === 0x40)
      this.interrupt_flags |= 0x01;
    else if (address === 0x48)
      this.interrupt_flags |= 0x02;
    else if (address === 0x50)
      this.interrupt_flags |= 0x04;
    else if (address === 0x58)
      this.interrupt_flags |= 0x08;
    else if (address === 0x60)
      this.interrupt_flags |= 0x10;
  }
  key_down(event) {
    var handled_key = true;
    if (event.keyCode === 65)
      this.buttons.a = true;
    else if (event.keyCode === 90)
      this.buttons.b = true;
    else if (event.keyCode === 16)
      this.buttons.select = true;
    else if (event.keyCode === 13)
      this.buttons.start = true;
    else if (event.keyCode === 38)
      this.buttons.up = true;
    else if (event.keyCode === 40)
      this.buttons.down = true;
    else if (event.keyCode === 37)
      this.buttons.left = true;
    else if (event.keyCode === 39)
      this.buttons.right = true;
    else
      handled_key = false;
    if (handled_key)
      this.raise_interrupt(0x60);
  }
  key_up(event) {
    if (event.keyCode === 65)
      this.buttons.a = false;
    else if (event.keyCode === 90)
      this.buttons.b = false;
    else if (event.keyCode === 16)
      this.buttons.select = false;
    else if (event.keyCode === 13)
      this.buttons.start = false;
    else if (event.keyCode === 38)
      this.buttons.up = false;
    else if (event.keyCode === 40)
      this.buttons.down = false;
    else if (event.keyCode === 37)
      this.buttons.left = false;
    else if (event.keyCode === 39)
      this.buttons.right = false;
  }
}

