"use strict";
class GBC_video {
  constructor(core) {
    this.core = core;
    this.sprite_ram = new Uint8Array(160);
    this.palette = [
      { r: 224, g: 248, b: 208 },
      { r: 136, g: 192, b: 112 },
      { r: 52, g: 104, b: 86 },
      { r: 8, g: 24, b: 32 },
    ];
  }
  init(is_cgb) {
    var canvas_element = document.getElementById("output");
    this.drawing_context = canvas_element.getContext("2d");
    this.image_data = this.drawing_context.getImageData(0, 0, canvas_element.width, canvas_element.height);
    this.is_cgb = is_cgb;
    var vram_length = this.is_cgb ? 0x4000 : 0x2000;
    this.vram = new Uint8Array(vram_length);
    if (this.is_cgb) {
      this.cgb_bkg_palettes = new Uint8Array(64);
      this.cgb_spr_palettes = new Uint8Array(64);
      this.bkg_palette_index = 0;
      this.bkg_palette_auto_inc = 0;
      this.spr_palette_index = 0;
      this.spr_palette_auto_inc = 0;
    }
    this.dmg_bkg_palette = [0, 3, 3, 3];
    this.dmg_spr_palettes = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    this.clear_display();
    this.update_display();
    for (var i = 0; i < vram_length; ++i) {
      this.vram[i] = 0;
    }
    for (var i = 0; i < 160; ++i) {
      this.sprite_ram[i] = 0;
    }
    for (var i = 0; i < 64 && this.is_cgb; ++i) {
      this.cgb_bkg_palettes[i] = 0xff;
      this.cgb_spr_palettes[i] = 0xff;
    }
    this.cycle_counter = 0;
    this.vram_bank = 0;
    this.dma_running = 0;
    this.dma_length_left = 0;
    this.dma_destination = 0;
    this.dma_data = [];
    this.did_lcd_interrupt = false;
    this.rendering_enabled = 1;
    this.mode = 2;
    this.current_line = 0;
    this.line_compare = 0;
    this.coincidence_flag = 0;
    this.mode0_interrupt = 0;
    this.mode1_interrupt = 0;
    this.mode2_interrupt = 0;
    this.coincidence_interrupt = 0;
    this.background_tile_table = 0x8000;
    this.background_tile_map = 0x9c00;
    this.scroll_x = 0;
    this.scroll_y = 0;
    this.window_tile_map = 0x9800;
    this.window_enabled = 0;
    this.window_x = 0;
    this.window_y = 0;
    this.sprite_height = 8;
    this.sprites_enabled = 0;
    this.background_enabled = 1;
  }
  clock(cycles) {
    if (!this.rendering_enabled) {
      this.cycle_counter = 0;
      this.current_line = 0;
      this.mode = 0;
      return 0;
    }
    this.cycle_counter += cycles;
    if (this.cycle_counter >= 114) {
      this.cycle_counter -= 114;
      this.current_line = (this.current_line + 1) % 154;
      this.did_lcd_interrupt = false;
      if (this.current_line === this.line_compare) {
        this.coincidence_flag = 1;
        if (this.coincidence_interrupt) {
          this.did_lcd_interrupt = true;
          this.core.raise_interrupt(0x48);
        }
      } else {
        this.coincidence_flag = 0;
      }
    }
    if (this.current_line < 144) {
      if (this.cycle_counter < 21) {
        if (this.mode !== 2) {
          this.mode = 2;
          if (this.mode2_interrupt && !this.did_lcd_interrupt) {
            this.did_lcd_interrupt = true;
            this.core.raise_interrupt(0x48);
          }
        }
      } else if (this.cycle_counter < 64) {
        this.mode = 3;
      } else {
        if (this.mode !== 0) {
          this.mode = 0;
          if (this.mode0_interrupt && !this.did_lcd_interrupt) {
            this.did_lcd_interrupt = true;
            this.core.raise_interrupt(0x48);
          }
          if (this.dma_running) {
            this.vram.set(
              this.dma_data.subarray(this.dma_bytes_done, this.dma_bytes_done + 0x10),
              this.dma_destination + this.vram_bank * 0x2000
            );
            this.dma_destination += 0x10;
            this.dma_bytes_done += 0x10;
            this.dma_length_left -= 0x10;
            if (this.dma_length_left === 0) {
              this.dma_running = 0;
              this.dma_length_left = 0x800;
            }
            this.dma_cycles_used = 0x10 * 2;
          }
          this.draw_line();
        }
      }
    } else {
      if (this.mode !== 1) {
        this.mode = 1;
        this.core.raise_interrupt(0x40);
        if (this.mode1_interrupt && !this.did_lcd_interrupt) {
          this.did_lcd_interrupt = true;
          this.core.raise_interrupt(0x48);
        }
        this.update_display();
      }
    }
    var temp = this.dma_cycles_used;
    this.dma_cycles_used = 0;
    return temp;
  }
  draw_line() {
    var background_buffer = [],
      sprite_buffer = [],
      background_pixels_set = [],
      background_priority = [];
    if (this.is_cgb) {
      for (var current_x = 0; current_x < 160; ++current_x) {
        background_buffer[current_x] = this.get_color_from_cgb_bkg_palette(0, 0);
      }
    } else {
      for (var current_x = 0; current_x < 160; ++current_x) {
        background_buffer[current_x] = this.palette[this.dmg_bkg_palette[0]];
      }
    }
    if (this.background_enabled || this.is_cgb) {
      for (var tile_ix = 0; tile_ix < 21; tile_ix++) {
        var tile_pos = (((this.current_line + this.scroll_y) & 0xff) >>> 3) * 0x20 + (this.scroll_x >>> 3) + tile_ix;
        if (this.scroll_x >= 0x60 && 19 - tile_ix < (this.scroll_x - 0x60) >>> 3)
          tile_pos -= 0x20;
        var tile_offset = this.vram[this.background_tile_map - 0x8000 + tile_pos];
        if (this.background_tile_table === 0x8800) {
          tile_offset = (tile_offset + 0x80) & 0xff;
        }
        var tile_bank_num = 0,
          horizontal_flip = 0,
          vertical_flip = 0,
          tile_priority = 0;
        if (this.is_cgb) {
          var tile_attrs = this.vram[this.background_tile_map - 0x8000 + 0x2000 + tile_pos],
            tile_palette = tile_attrs & 0x07;
          tile_priority = (tile_attrs >>> 7) % 2;
          horizontal_flip = (tile_attrs >>> 5) % 2;
          vertical_flip = (tile_attrs >>> 6) % 2;
          tile_bank_num = (tile_attrs >>> 3) % 2;
        }
        var tile_data_lo, tile_data_hi;
        if (vertical_flip) {
          (tile_data_lo = this.vram[tile_bank_num * 0x2000 +
            this.background_tile_table -
            0x8000 +
            tile_offset * 16 +
            (7 - ((this.current_line + this.scroll_y) & 0x07)) * 2]),
            (tile_data_hi = this.vram[tile_bank_num * 0x2000 +
              this.background_tile_table -
              0x8000 +
              tile_offset * 16 +
              (7 - ((this.current_line + this.scroll_y) & 0x07)) * 2 +
              1]);
        } else {
          (tile_data_lo = this.vram[tile_bank_num * 0x2000 +
            this.background_tile_table -
            0x8000 +
            tile_offset * 16 +
            ((this.current_line + this.scroll_y) & 0x07) * 2]),
            (tile_data_hi = this.vram[tile_bank_num * 0x2000 +
              this.background_tile_table -
              0x8000 +
              tile_offset * 16 +
              ((this.current_line + this.scroll_y) & 0x07) * 2 +
              1]);
        }
        for (var pixel = 0; pixel < 8; pixel++) {
          var color;
          if (horizontal_flip)
            color = ((tile_data_lo >>> pixel) & 1) | (((tile_data_hi >>> pixel) & 1) << 1);
          else
            color = ((tile_data_lo >>> (7 - pixel)) & 1) | (((tile_data_hi >>> (7 - pixel)) & 1) << 1);
          var line_index = tile_ix * 8 + pixel - (this.scroll_x & 0x07);
          background_pixels_set[line_index] = color !== 0;
          if (this.is_cgb) {
            background_buffer[line_index] = this.get_color_from_cgb_bkg_palette(tile_palette, color);
            if (tile_priority)
              background_priority[line_index] = color !== 0;
          } else {
            background_buffer[line_index] = this.palette[this.dmg_bkg_palette[color]];
          }
        }
      }
    }
    if (this.window_enabled) {
      if (this.window_x < 167 && this.window_y < 144 && this.window_y <= this.current_line) {
        for (var win_pixel = this.window_x - 7; win_pixel <= 166; win_pixel++) {
          if (win_pixel < 0)
            continue;
          var tile_pos = (((this.current_line - this.window_y) & 0xff) >>> 3) * 0x20 +
            ((win_pixel - this.window_x + 7) >>> 3);
          var tile_offset = this.vram[this.window_tile_map - 0x8000 + tile_pos];
          if (this.background_tile_table === 0x8800) {
            tile_offset = (tile_offset + 0x80) & 0xff;
          }
          var tile_bank_num = 0,
            horizontal_flip = 0,
            vertical_flip = 0,
            tile_priority = 0;
          if (this.is_cgb) {
            var tile_attrs = this.vram[this.window_tile_map - 0x8000 + 0x2000 + tile_pos],
              tile_palette = tile_attrs & 0x07;
            tile_priority = (tile_attrs >>> 7) % 2;
            horizontal_flip = (tile_attrs >>> 5) % 2;
            vertical_flip = (tile_attrs >>> 6) % 2;
            tile_bank_num = (tile_attrs >>> 3) % 2;
          }
          var tile_data_lo, tile_data_hi;
          if (vertical_flip) {
            (tile_data_lo = this.vram[tile_bank_num * 0x2000 +
              this.background_tile_table -
              0x8000 +
              tile_offset * 16 +
              (7 - ((this.current_line - this.window_y) & 0x07)) * 2]),
              (tile_data_hi = this.vram[tile_bank_num * 0x2000 +
                this.background_tile_table -
                0x8000 +
                tile_offset * 16 +
                (7 - ((this.current_line - this.window_y) & 0x07)) * 2 +
                1]);
          } else {
            (tile_data_lo = this.vram[tile_bank_num * 0x2000 +
              this.background_tile_table -
              0x8000 +
              tile_offset * 16 +
              ((this.current_line - this.window_y) & 0x07) * 2]),
              (tile_data_hi = this.vram[tile_bank_num * 0x2000 +
                this.background_tile_table -
                0x8000 +
                tile_offset * 16 +
                ((this.current_line - this.window_y) & 0x07) * 2 +
                1]);
          }
          var pixel_in_tile = horizontal_flip
            ? (win_pixel - this.window_x + 7) & 0x07
            : ~(win_pixel - this.window_x + 7) & 0x07;
          var color = ((tile_data_lo >>> pixel_in_tile) & 1) | (((tile_data_hi >>> pixel_in_tile) & 1) << 1);
          background_pixels_set[win_pixel] = color !== 0;
          if (this.is_cgb) {
            background_buffer[win_pixel] = this.get_color_from_cgb_bkg_palette(tile_palette, color);
            if (tile_priority)
              background_priority[win_pixel] = color !== 0;
          } else {
            background_buffer[win_pixel] = this.palette[this.dmg_bkg_palette[color]];
          }
        }
      }
    }
    if (this.sprites_enabled) {
      var sprites_on_line = 0;
      for (var sprite_num = 0; sprite_num < 40; sprite_num++) {
        if (sprites_on_line >= 10)
          break;
        var sprite_y = this.sprite_ram[sprite_num * 4],
          sprite_x = this.sprite_ram[sprite_num * 4 + 1],
          tile_number = this.sprite_ram[sprite_num * 4 + 2],
          attr_byte = this.sprite_ram[sprite_num * 4 + 3];
        if (sprite_y > 0 && sprite_y < 160 && sprite_x < 168) {
          sprite_y -= 16;
          sprite_x -= 8;
          if (this.current_line >= sprite_y && this.current_line < sprite_y + this.sprite_height) {
            sprites_on_line++;
            var sprite_priority = !((attr_byte & 0x80) >>> 7),
              vertical_flip = (attr_byte & 0x40) >>> 6,
              horizontal_flip = (attr_byte & 0x20) >>> 5,
              dmg_palette_number = (attr_byte & 0x10) >>> 4,
              tile_bank = (attr_byte & 0x08) >>> 3,
              cgb_palette = attr_byte & 0x07,
              line = this.current_line - sprite_y,
              sprite_tile_address = 0;
            if (this.sprite_height === 16) {
              sprite_tile_address = (tile_number & 0xfe) * 16;
              if (vertical_flip) {
                if (line < 8)
                  sprite_tile_address += 16 + (~line & 0x07) * 2;
                else
                  sprite_tile_address += (~(line - 8) & 0x07) * 2;
              } else
                sprite_tile_address += line * 2;
            } else {
              sprite_tile_address = tile_number * 16;
              sprite_tile_address += !vertical_flip ? line * 2 : (~line & 0x07) * 2;
            }
            if (this.is_cgb && tile_bank)
              sprite_tile_address += 0x2000;
            var tile_data_lo = this.vram[sprite_tile_address],
              tile_data_hi = this.vram[sprite_tile_address + 1];
            for (var x = sprite_x; x < sprite_x + 8; ++x) {
              var pixel_position = horizontal_flip ? x - sprite_x : 7 - (x - sprite_x);
              var color = ((tile_data_hi & (1 << pixel_position)) >>> pixel_position) << 1;
              color |= (tile_data_lo & (1 << pixel_position)) >>> pixel_position;
              if (sprite_buffer[x] === undefined &&
                ((!background_priority[x] && sprite_priority) ||
                  !background_pixels_set[x] ||
                  (this.is_cgb && !this.background_enabled))) {
                if (color !== 0) {
                  if (this.is_cgb)
                    sprite_buffer[x] = this.get_color_from_cgb_spr_palette(cgb_palette, color);
                  else
                    sprite_buffer[x] = this.palette[this.dmg_spr_palettes[dmg_palette_number][color]];
                }
              }
            }
          }
        }
      }
    }
    for (current_x = 0; current_x < 160; ++current_x) {
      this.put_pixel(current_x, this.current_line, background_buffer[current_x]);
      if (sprite_buffer[current_x]) {
        this.put_pixel(current_x, this.current_line, sprite_buffer[current_x]);
      }
    }
  }
  mem_read(address) {
    if (address >= 0xff00)
      return this.reg_read(address);
    else if (address >= 0xfe00)
      return this.sprite_ram[address - 0xfe00];
    else
      return this.vram[this.vram_bank * 0x2000 + address - 0x8000];
  }
  mem_write(address, value) {
    if (address >= 0xff00)
      this.reg_write(address, value);
    else if (address >= 0xfe00)
      this.sprite_ram[address - 0xfe00] = value;
    else
      this.vram[this.vram_bank * 0x2000 + address - 0x8000] = value;
  }
  reg_read(address) {
    if (address === 0xff40) {
      return (
        this.background_enabled |
        (this.sprites_enabled << 1) |
        ((this.sprite_height === 16) << 2) |
        ((this.background_tile_map === 0x9c00) << 3) |
        ((this.background_tile_table === 0x8000) << 4) |
        (this.window_enabled << 5) |
        ((this.window_tile_map === 0x9c00) << 6) |
        (this.rendering_enabled << 7)
      );
    } else if (address === 0xff41) {
      return (
        this.mode |
        (this.coincidence_flag << 2) |
        (this.mode0_interrupt << 3) |
        (this.mode1_interrupt << 4) |
        (this.mode2_interrupt << 5) |
        (this.coincidence_interrupt << 6)
      );
    } else if (address === 0xff42) {
      return this.scroll_y;
    } else if (address === 0xff43) {
      return this.scroll_x;
    } else if (address === 0xff44) {
      return this.current_line;
    } else if (address === 0xff45) {
      return this.line_compare;
    } else if (address === 0xff47) {
      return (
        this.dmg_bkg_palette[0] |
        (this.dmg_bkg_palette[1] << 2) |
        (this.dmg_bkg_palette[2] << 4) |
        (this.dmg_bkg_palette[3] << 6)
      );
    } else if (address === 0xff48) {
      return (
        this.dmg_spr_palettes[0][0] |
        (this.dmg_spr_palettes[0][1] << 2) |
        (this.dmg_spr_palettes[0][2] << 4) |
        (this.dmg_spr_palettes[0][3] << 6)
      );
    } else if (address === 0xff49) {
      return (
        this.dmg_spr_palettes[1][0] |
        (this.dmg_spr_palettes[1][1] << 2) |
        (this.dmg_spr_palettes[1][2] << 4) |
        (this.dmg_spr_palettes[1][3] << 6)
      );
    } else if (address === 0xff4a) {
      return this.window_y;
    } else if (address === 0xff4b) {
      return this.window_x;
    } else if (address === 0xff4f) {
      return this.vram_bank;
    } else if (address === 0xff55) {
      return (this.dma_length_left / 16 - 1) | ((this.dma_running ? 0 : 1) << 7);
    } else if (address === 0xff68) {
      return this.bkg_palette_index | (this.bkg_palette_auto_inc << 7);
    } else if (address === 0xff69) {
      return this.cgb_bkg_palettes[this.bkg_palette_index];
    } else if (address === 0xff6a) {
      return this.spr_palette_index | (this.spr_palette_auto_inc << 7);
    } else if (address === 0xff6b) {
      return this.cgb_spr_palettes[this.spr_palette_index];
    }
  }
  reg_write(address, value) {
    if (address === 0xff40) {
      this.background_enabled = value & 0x01;
      this.sprites_enabled = (value & 0x02) >>> 1;
      this.sprite_height = value & 0x04 ? 16 : 8;
      this.background_tile_map = value & 0x08 ? 0x9c00 : 0x9800;
      this.background_tile_table = value & 0x10 ? 0x8000 : 0x8800;
      this.window_enabled = (value & 0x20) >>> 5;
      this.window_tile_map = value & 0x40 ? 0x9c00 : 0x9800;
      this.rendering_enabled = (value & 0x80) >>> 7;
      if (!this.rendering_enabled) {
        this.clear_display();
        this.update_display();
      }
    } else if (address === 0xff41) {
      this.mode0_interrupt = (value & 0x08) >>> 3;
      this.mode1_interrupt = (value & 0x10) >>> 4;
      this.mode2_interrupt = (value & 0x20) >>> 5;
      this.coincidence_interrupt = (value & 0x40) >>> 6;
    } else if (address === 0xff42) {
      this.scroll_y = value;
    } else if (address === 0xff43) {
      this.scroll_x = value;
    } else if (address === 0xff45) {
      this.line_compare = value;
    } else if (address === 0xff47) {
      this.dmg_bkg_palette[0] = value & 0x03;
      this.dmg_bkg_palette[1] = (value & 0x0c) >>> 2;
      this.dmg_bkg_palette[2] = (value & 0x30) >>> 4;
      this.dmg_bkg_palette[3] = (value & 0xc0) >>> 6;
    } else if (address === 0xff48) {
      this.dmg_spr_palettes[0][0] = value & 0x03;
      this.dmg_spr_palettes[0][1] = (value & 0x0c) >>> 2;
      this.dmg_spr_palettes[0][2] = (value & 0x30) >>> 4;
      this.dmg_spr_palettes[0][3] = (value & 0xc0) >>> 6;
    } else if (address === 0xff49) {
      this.dmg_spr_palettes[1][0] = value & 0x03;
      this.dmg_spr_palettes[1][1] = (value & 0x0c) >>> 2;
      this.dmg_spr_palettes[1][2] = (value & 0x30) >>> 4;
      this.dmg_spr_palettes[1][3] = (value & 0xc0) >>> 6;
    } else if (address === 0xff4a) {
      this.window_y = value;
    } else if (address === 0xff4b) {
      this.window_x = value;
    } else if (address === 0xff4f) {
      if (this.is_cgb)
        this.vram_bank = value % 2;
    } else if (address === 0xff68) {
      this.bkg_palette_index = value & 0x7f;
      this.bkg_palette_auto_inc = value >>> 7;
    } else if (address === 0xff69) {
      this.cgb_bkg_palettes[this.bkg_palette_index] = value;
      if (this.bkg_palette_auto_inc)
        this.bkg_palette_index = (this.bkg_palette_index + 1) & 0x3f;
    } else if (address === 0xff6a) {
      this.spr_palette_index = value & 0x7f;
      this.spr_palette_auto_inc = value >>> 7;
    } else if (address === 0xff6b) {
      this.cgb_spr_palettes[this.spr_palette_index] = value;
      if (this.spr_palette_auto_inc)
        this.spr_palette_index = (this.spr_palette_index + 1) & 0x3f;
    }
  }
  do_oam_dma(operand) {
    if (typeof operand === "number") {
      this.sprite_ram = new Uint8Array(this.vram.subarray(operand, operand + 160));
    } else {
      this.sprite_ram = operand;
    }
  }
  do_vram_dma(data, destination, type) {
    if (this.is_cgb) {
      if (type) {
        this.dma_running = 1;
        this.dma_data = data;
        this.dma_destination = destination;
        this.dma_bytes_done = 0;
        this.dma_length_left = data.length;
      } else {
        if (this.dma_running) {
          this.dma_running = 0;
        } else {
          this.vram.set(data, destination + this.vram_bank * 0x2000);
          this.dma_cycles_used = (data.length / 0x10) * 2;
          this.dma_running = 0;
          this.dma_length_left = 0x800;
        }
      }
    }
  }
  update_display() {
    this.drawing_context.putImageData(this.image_data, 0, 0);
  }
  clear_display() {
    for (var y = 0; y < 144; ++y)
      for (var x = 0; x < 160; ++x)
        this.put_pixel(x, y, this.is_cgb ? { r: 255, g: 255, b: 255 } : this.palette[0]);
  }
  put_pixel(x, y, color) {
    this.image_data.data[(y * this.image_data.width + x) * 4] = color.r;
    this.image_data.data[(y * this.image_data.width + x) * 4 + 1] = color.g;
    this.image_data.data[(y * this.image_data.width + x) * 4 + 2] = color.b;
    this.image_data.data[(y * this.image_data.width + x) * 4 + 3] = 255;
  }
  get_color_from_cgb_bkg_palette(palette, color) {
    var color_word = this.cgb_bkg_palettes[palette * 8 + color * 2] |
      (this.cgb_bkg_palettes[palette * 8 + color * 2 + 1] << 8);
    return {
      r: (color_word & 0x1f) << 3,
      g: ((color_word >>> 5) & 0x1f) << 3,
      b: ((color_word >>> 10) & 0x1f) << 3,
    };
  }
  get_color_from_cgb_spr_palette(palette, color) {
    var color_word = this.cgb_spr_palettes[palette * 8 + color * 2] |
      (this.cgb_spr_palettes[palette * 8 + color * 2 + 1] << 8);
    return {
      r: (color_word & 0x1f) << 3,
      g: ((color_word >>> 5) & 0x1f) << 3,
      b: ((color_word >>> 10) & 0x1f) << 3,
    };
  }
}

