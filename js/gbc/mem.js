"use strict";
class GBC_memory {
  constructor(core) {
    this.core = core;
    this.zero_page = new Uint8Array(0x7f);
    this.mappers = {
      no_mapper: function (mem) {
        return {
          mem_read: function (address) {
            return mem.cartridge_rom[address];
          },
          mem_write: function (address, value) {},
        };
      },
      mbc1: function (mem) {
        var cart_ram_enabled = false,
          rom_bank = 1,
          ram_bank = 0,
          mode = 0;
        return {
          mem_read: function (address) {
            if (address < 0x4000) return mem.cartridge_rom[address];
            else if (address < 0x8000) return mem.cartridge_rom[rom_bank * 0x4000 + address - 0x4000];
            else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks) {
                if (mode) return mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000];
                else return mem.cartridge_ram[address - 0xa000];
              }
            }
          },
          mem_write: function (address, value) {
            if (address < 0x2000) {
              cart_ram_enabled = (value & 0xa) === 0xa;
            } else if (address < 0x4000) {
              value = value === 0 ? 1 : value;
              if (!mode) rom_bank = ((rom_bank & 0x60) | (value & 0x1f)) % mem.num_rom_banks;
              else rom_bank = (value & 0x1f) % mem.num_rom_banks;
            } else if (address < 0x6000) {
              if (!mode) rom_bank = ((rom_bank & 0x1f) | ((value & 0x03) << 5)) % mem.num_rom_banks;
              else ram_bank = (value & 0x03) % mem.num_ram_banks;
            } else if (address < 0x8000) {
              mode = value % 2;
            } else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks && cart_ram_enabled) {
                if (mode) mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000] = value;
                else mem.cartridge_ram[address - 0xa000] = value;
              }
              if (mem.is_battery_backed) mem.write_save_file();
            }
          },
        };
      },
      mbc2: function (mem) {
        var cart_ram_enabled = false,
          rom_bank = 1;
        var cart_ram = new Uint8Array(0x0200);
        return {
          mem_read: function (address) {
            if (address < 0x4000) return mem.cartridge_rom[address];
            else if (address < 0x8000) return mem.cartridge_rom[rom_bank * 0x4000 + address - 0x4000];
            else if (address >= 0xa000 && address < 0xa200) return cart_ram[address - 0xa000];
          },
          mem_write: function (address, value) {
            if (address < 0x2000) {
              if (!(address & 0x0100)) cart_ram_enabled = (value & 0xf) === 0xa;
            } else if (address < 0x4000) {
              value = value === 0 ? 1 : value;
              if (address & 0x0100) rom_bank = value & 0x0f & (mem.num_rom_banks - 1);
            } else if (address >= 0xa000 && address < 0xa200) {
              if (cart_ram_enabled) cart_ram[address - 0xa000] = value & 0x0f;
            }
          },
        };
      },
      mbc3: function (mem) {
        var cart_ram_enabled = false,
          rom_bank = 1,
          ram_bank = 0;
        return {
          mem_read: function (address) {
            if (address < 0x4000) return mem.cartridge_rom[address];
            else if (address < 0x8000) return mem.cartridge_rom[rom_bank * 0x4000 + address - 0x4000];
            else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks && cart_ram_enabled && ram_bank <= 3)
                return mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000];
              else if (ram_bank === 0x08) return new Date().getSeconds();
              else if (ram_bank === 0x09) return new Date().getMinutes();
              else if (ram_bank === 0x0a) return new Date().getHours();
              else return 0;
            }
          },
          mem_write: function (address, value) {
            if (address < 0x2000) cart_ram_enabled = (value & 0xa) === 0xa;
            else if (address < 0x4000) {
              value = value === 0 ? 1 : value;
              rom_bank = value & 0x7f & (mem.num_rom_banks - 1);
            } else if (address < 0x6000) ram_bank = value;
            else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks && cart_ram_enabled && ram_bank <= 3)
                mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000] = value;
              if (mem.is_battery_backed) mem.write_save_file();
            }
          },
        };
      },
      mbc5: function (mem) {
        var cart_ram_enabled = false,
          rom_bank = 1,
          ram_bank = 0;
        return {
          mem_read: function (address) {
            if (address < 0x4000) return mem.cartridge_rom[address];
            else if (address < 0x8000) return mem.cartridge_rom[rom_bank * 0x4000 + address - 0x4000];
            else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks && cart_ram_enabled)
                return mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000];
              else return 0xff;
            }
          },
          mem_write: function (address, value) {
            if (address < 0x2000) cart_ram_enabled = (value & 0xa) === 0xa;
            else if (address < 0x3000) rom_bank = (rom_bank & 0x100) | value;
            else if (address < 0x4000) rom_bank = (rom_bank & 0xff) | (value % 2 << 8);
            else if (address < 0x6000) ram_bank = value & 0x0f;
            else if (address >= 0xa000 && address < 0xc000) {
              if (mem.num_ram_banks && cart_ram_enabled)
                mem.cartridge_ram[ram_bank * 0x2000 + address - 0xa000] = value;
              if (mem.is_battery_backed) mem.write_save_file();
            }
          },
        };
      },
    };
  }
  load_rom(rom_array, filename) {
    if (this.save_timeout) clearTimeout(this.save_timeout);
    var cartridge_type = rom_array[0x147];
    this.is_battery_backed =
      cartridge_type === 3 ||
      cartridge_type === 6 ||
      cartridge_type === 9 ||
      cartridge_type === 13 ||
      cartridge_type === 15 ||
      cartridge_type === 16 ||
      cartridge_type === 19 ||
      cartridge_type === 23 ||
      cartridge_type === 27 ||
      cartridge_type === 30 ||
      cartridge_type === 255;
    if (cartridge_type === 0) this.mapper = this.mappers.no_mapper(this);
    else if (cartridge_type === 1 || cartridge_type === 2 || cartridge_type === 3)
      this.mapper = this.mappers.mbc1(this);
    else if (cartridge_type === 5 || cartridge_type === 6) this.mapper = this.mappers.mbc2(this);
    else if (
      cartridge_type === 15 ||
      cartridge_type === 16 ||
      cartridge_type === 17 ||
      cartridge_type === 18 ||
      cartridge_type === 19
    )
      this.mapper = this.mappers.mbc3(this);
    else if (
      cartridge_type === 25 ||
      cartridge_type === 26 ||
      cartridge_type === 27 ||
      cartridge_type === 28 ||
      cartridge_type === 29 ||
      cartridge_type === 30
    )
      this.mapper = this.mappers.mbc5(this);
    else throw "Unknown cartridge type.";
    this.cgb_game = rom_array[0x143] === 0x80 || rom_array[0x143] === 0xc0;
    if (this.cgb_game) this.working_ram = new Uint8Array(0x8000);
    else this.working_ram = new Uint8Array(0x2000);
    this.wram_bank = 1;
    this.num_rom_banks =
      rom_array[0x148] === 0
        ? 2
        : rom_array[0x148] === 1
        ? 4
        : rom_array[0x148] === 2
        ? 8
        : rom_array[0x148] === 3
        ? 16
        : rom_array[0x148] === 4
        ? 32
        : rom_array[0x148] === 5
        ? 64
        : rom_array[0x148] === 6
        ? 128
        : rom_array[0x148] === 0x52
        ? 72
        : rom_array[0x148] === 0x53
        ? 80
        : rom_array[0x148] === 0x54
        ? 96
        : 2;
    this.ram_size = rom_array[0x149];
    this.num_ram_banks =
      this.ram_size === 0
        ? 0
        : this.ram_size === 1
        ? 1
        : this.ram_size === 2
        ? 1
        : this.ram_size === 3
        ? 4
        : this.ram_size === 4
        ? 16
        : 0;
    this.cartridge_rom = new Uint8Array(rom_array);
    if (this.num_ram_banks) {
      this.cartridge_ram = new Uint8Array(this.num_ram_banks * 0x2000);
      if (this.is_battery_backed && this.detect_local_storage()) {
        this.save_key = filename;
        let save_data = window.localStorage.getItem(this.save_key);
        if (save_data !== null) {
          let buf = new ArrayBuffer(save_data.length);
          let bufView = new Uint8Array(buf);
          for (let i = 0; i < save_data.length; i++) {
            bufView[i] = save_data.charCodeAt(i);
          }
          this.cartridge_ram = new Uint8Array(buf);
        }
      }
    }
  }
  detect_local_storage() {
    try {
      let storage = window.localStorage,
        x = "__storage_test__";
      storage.setItem(x, x);
      storage.removeItem(x);
      return true;
    } catch (e) {
      return false;
    }
  }
  write_save_file() {
    if (this.save_key && !this.save_timeout) {
      this.save_timeout = window.setTimeout(
        function () {
          let binary = "";
          for (let i in this.cartridge_ram) {
            binary += String.fromCharCode(this.cartridge_ram[i]);
          }
          window.localStorage.setItem(this.save_key, binary);
          delete this.save_timeout;
        }.bind(this),
        1000
      );
    }
  }
  mem_read(address) {
    address &= 0xffff;

    if (address === 0xffff) return this.core.interrupt_enable;
    else if (address === 0xff0f) return this.core.interrupt_flags;
    else if (address === 0xff46) return 0;
    else if (address === 0xff4d) return this.core.speed_switch_unlocked | (this.core.cpu_speed << 7);
    else if (address === 0xff51 && this.cgb_game && !this.core.vram_dma_running)
      return this.core.vram_dma_source >>> 8;
    else if (address === 0xff52 && this.cgb_game && !this.core.vram_dma_running)
      return this.core.vram_dma_source & 0xff;
    else if (address === 0xff53 && this.cgb_game && !this.core.vram_dma_running)
      return this.core.vram_dma_destination >>> 8;
    else if (address === 0xff54 && this.cgb_game && !this.core.vram_dma_running)
      return this.core.vram_dma_destination & 0xff;
    else if (address === 0xff00) {
      if (this.core.keypad_nibble_requested & 0x10) {
        return (
          (this.core.buttons.a ? 0 : 1) |
          (this.core.buttons.b ? 0 : 2) |
          (this.core.buttons.select ? 0 : 4) |
          (this.core.buttons.start ? 0 : 8)
        );
      } else if (this.core.keypad_nibble_requested & 0x20) {
        return (
          (this.core.buttons.right ? 0 : 1) |
          (this.core.buttons.left ? 0 : 2) |
          (this.core.buttons.up ? 0 : 4) |
          (this.core.buttons.down ? 0 : 8)
        );
      } else {
        return 0xFF;
      }
    } else if (address === 0xff70) {
      return this.wram_bank;
    } else if (address < 0x8000) {
      return this.mapper.mem_read(address);
    } else if (address >= 0x8000 && address < 0xa000) {
      return this.core.video.mem_read(address);
    } else if (address < 0xc000) {
      if (this.ram_size === 1) address &= 0xe7ff;
      return this.mapper.mem_read(address);
    } else if (address < 0xd000) {
      return this.working_ram[address - 0xc000];
    } else if (address < 0xe000) {
      return this.working_ram[this.wram_bank * 0x1000 + address - 0xd000];
    } else if (address < 0xfe00) {
      return this.mem_read(address - 0x2000);
    } else if ((address >= 0xfe00 && address < 0xfea0) || address === 0xff55 || address === 0xff4f) {
      return this.core.video.mem_read(address);
    } else if (address >= 0xff04 && address <= 0xff07) {
      return this.core.timer.reg_read(address);
    } else if (address >= 0xff10 && address <= 0xff26) {
      return this.core.sound.readMem(address);
    } else if (address >= 0xff30 && address <= 0xff3f) {
      return this.core.sound.readMem(address);
    } else if (address >= 0xff40 && address <= 0xff4b) {
      return this.core.video.mem_read(address);
    } else if (address >= 0xff68 && address <= 0xff6b) {
      return this.core.video.mem_read(address);
    } else if (address >= 0xff80) {
      return this.zero_page[address & 0x007f];
    }
    return 0;
  }
  mem_write(address, value) {
    address &= 0xffff;
    value &= 0xff;
    if (address === 0xffff) this.core.interrupt_enable = value;
    else if (address === 0xff00) this.core.keypad_nibble_requested = value;
    else if (address === 0xff0f) this.core.interrupt_flags = value;
    else if (address === 0xff46) {
      var start_address = value << 8;
      if (start_address < 0xa000 && start_address >= 0x8000) this.core.video.do_oam_dma(start_address);
      else this.core.video.do_oam_dma(this.get_dma_array(start_address, 160));
    } else if (address === 0xff4d && this.cgb_game) this.core.speed_switch_unlocked = value % 2;
    else if (address === 0xff51 && this.cgb_game && !this.core.vram_dma_running)
      this.core.vram_dma_source = (this.core.vram_dma_source & 0xff) | (value << 8);
    else if (address === 0xff52 && this.cgb_game && !this.core.vram_dma_running)
      this.core.vram_dma_source = (this.core.vram_dma_source & 0xff00) | (value & 0xf0);
    else if (address === 0xff53 && this.cgb_game && !this.core.vram_dma_running)
      this.core.vram_dma_destination = (this.core.vram_dma_destination & 0xff) | ((value & 0x1f) << 8);
    else if (address === 0xff54 && this.cgb_game && !this.core.vram_dma_running)
      this.core.vram_dma_destination = (this.core.vram_dma_destination & 0xff00) | (value & 0xf0);
    else if (address === 0xff55 && this.cgb_game) {
      if (
        this.core.vram_dma_source > 0xdff0 ||
        (this.core.vram_dma_source > 0x7ff0 && this.core.vram_dma_source < 0xa000)
      )
        return;

      var length = ((value & 0x7f) + 1) * 16;
      this.core.video.do_vram_dma(
        this.get_dma_array(this.core.vram_dma_source, length),
        this.core.vram_dma_destination,
        (value & 0x80) >>> 7
      );
    } else if (address === 0xff70) {
      if (this.cgb_game) this.wram_bank = value % 8 || 1;
    } else if (address < 0x8000) {
      this.mapper.mem_write(address, value);
    } else if (address >= 0x8000 && address < 0xa000) {
      this.core.video.mem_write(address, value);
    } else if (address < 0xc000) {
      if (this.ram_size === 1) address &= 0xe7ff;
      this.mapper.mem_write(address, value);
    } else if (address < 0xd000) {
      this.working_ram[address - 0xc000] = value;
    } else if (address < 0xe000) {
      this.working_ram[this.wram_bank * 0x1000 + address - 0xd000] = value;
    } else if (address < 0xfe00) {
      this.mem_write(address - 0x2000, value);
    } else if ((address >= 0xfe00 && address < 0xfea0) || address === 0xff4f) {
      this.core.video.mem_write(address, value);
    } else if (address >= 0xff04 && address <= 0xff07) {
      this.core.timer.reg_write(address, value);
    } else if (address >= 0xff10 && address <= 0xff26) {
      this.core.sound.soundMapper(address, value);
    } else if (address >= 0xff30 && address <= 0xff3f) {
      this.core.sound.nodes[3].waveChanged = true;
      this.core.sound.MEM2[address] = value;
    } else if (address >= 0xff40 && address <= 0xff4b) {
      this.core.video.mem_write(address, value);
    } else if (address >= 0xff68 && address <= 0xff6b) {
      this.core.video.mem_write(address, value);
    } else if (address >= 0xff80) {
      this.zero_page[address & 0x007f] = value;
    }
  }
  get_dma_array(start_address, length) {
    var new_array = new Uint8Array(length);
    for (var i = 0; i < length; ++i) new_array[i] = this.mem_read(start_address + i);
    return new_array;
  }
  reset() {
    this.zero_page = new Uint8Array(0x7f);
  }
}
