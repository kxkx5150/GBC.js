"use strict";
class GBC_cpu {
  constructor(core,mem) {
    this.core = core;
    this.mem = mem;
    this.a = 0x01;
    this.b = 0x00;
    this.c = 0x00;
    this.d = 0xff;
    this.e = 0x56;
    this.h = 0x00;
    this.l = 0x0d;
    this.sp = 0xfffe;
    this.pc = 0x0100;
    this.flags = { Z: 1, N: 0, H: 1, C: 1 };
    this.halted = false;
    this.do_delayed_di = false;
    this.do_delayed_ei = false;
    this.interrupts_enabled = false;
    this.cycle_counts = [
      1,
      3,
      2,
      2,
      1,
      1,
      2,
      1,
      5,
      2,
      2,
      2,
      1,
      1,
      2,
      1,
      1,
      3,
      2,
      2,
      1,
      1,
      2,
      1,
      3,
      2,
      2,
      2,
      1,
      1,
      2,
      1,
      2,
      3,
      2,
      2,
      1,
      1,
      2,
      1,
      2,
      2,
      2,
      2,
      1,
      1,
      2,
      1,
      2,
      3,
      2,
      2,
      3,
      3,
      3,
      1,
      2,
      2,
      2,
      2,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      2,
      2,
      2,
      2,
      2,
      2,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      1,
      2,
      3,
      3,
      4,
      3,
      4,
      2,
      4,
      2,
      4,
      3,
      0,
      3,
      6,
      2,
      4,
      2,
      3,
      3,
      0,
      3,
      4,
      2,
      4,
      2,
      4,
      3,
      0,
      3,
      0,
      2,
      4,
      3,
      3,
      2,
      0,
      0,
      4,
      2,
      4,
      4,
      1,
      4,
      0,
      0,
      0,
      2,
      4,
      3,
      3,
      2,
      1,
      0,
      4,
      2,
      4,
      3,
      2,
      4,
      1,
      0,
      0,
      2,
      4,
    ];
  }
  reset(is_gbc) {
    if (!is_gbc) {
      this.a = 0x01;
    } else {
      this.a = 0x11;
    }
    this.b = 0x00;
    this.c = 0x00;
    this.d = 0xff;
    this.e = 0x56;
    this.h = 0x00;
    this.l = 0x0d;
    this.sp = 0xfffe;
    this.pc = 0x0100;
    this.flags = { Z: 1, N: 0, H: 1, C: 1 };
    this.halted = false;
    this.do_delayed_di = false;
    this.do_delayed_ei = false;
    this.interrupts_enabled = false;
  }
  run_instruction() {
    var get_operand = function (opcode) {
      return (opcode & 0x07) === 0
        ? this.b
        : (opcode & 0x07) === 1
        ? this.c
        : (opcode & 0x07) === 2
        ? this.d
        : (opcode & 0x07) === 3
        ? this.e
        : (opcode & 0x07) === 4
        ? this.h
        : (opcode & 0x07) === 5
        ? this.l
        : (opcode & 0x07) === 6
        ? this.mem.mem_read(this.l | (this.h << 8))
        : this.a;
    };
    var doing_delayed_di = false,
      doing_delayed_ei = false;
    if (this.do_delayed_di) {
      this.do_delayed_di = false;
      doing_delayed_di = true;
    } else if (this.do_delayed_ei) {
      this.do_delayed_ei = false;
      doing_delayed_ei = true;
    }
    if (!this.halted) {
      var opcode = this.mem.mem_read(this.pc);
      this.cycle_counter = 0;
      if (opcode === 0x76) this.halted = true;
      else if (opcode >= 0x40 && opcode < 0x80) {
        var operand = get_operand.call(this, opcode);
        if ((opcode & 0x38) >>> 3 === 0) this.b = operand;
        else if ((opcode & 0x38) >>> 3 === 1) this.c = operand;
        else if ((opcode & 0x38) >>> 3 === 2) this.d = operand;
        else if ((opcode & 0x38) >>> 3 === 3) this.e = operand;
        else if ((opcode & 0x38) >>> 3 === 4) this.h = operand;
        else if ((opcode & 0x38) >>> 3 === 5) this.l = operand;
        else if ((opcode & 0x38) >>> 3 === 6) this.mem.mem_write(this.l | (this.h << 8), operand);
        else if ((opcode & 0x38) >>> 3 === 7) this.a = operand;
      } else if (opcode >= 0x80 && opcode < 0xc0) {
        var operand = get_operand.call(this, opcode),
          op_array = [
            this.do_add,
            this.do_adc,
            this.do_sub,
            this.do_sbc,
            this.do_and,
            this.do_xor,
            this.do_or,
            this.do_cp,
          ];
        op_array[(opcode & 0x38) >>> 3].call(this, operand);
      } else {
        this.execInstruction(opcode);
      }
      this.pc = (this.pc + 1) & 0xffff;
      this.cycle_counter += this.cycle_counts[opcode];
    }
    if (this.halted && this.core.interrupt_flags & 0x1f) {
      this.halted = false;
    }
    if (this.interrupts_enabled && this.core.interrupt_flags & 0x1f) {
      var interrupt_func = function (address, flag) {
        this.core.interrupt_flags &= 0xff & ~flag;
        this.interrupts_enabled = false;
        this.cycle_counter += 3;
        this.push_word(this.pc);
        this.pc = address;
      };
      if (this.core.interrupt_flags & 0x01 && this.core.interrupt_enable & 0x01)
        interrupt_func.call(this, 0x40, 0x01);
      else if (this.core.interrupt_flags & 0x02 && this.core.interrupt_enable & 0x02)
        interrupt_func.call(this, 0x48, 0x02);
      else if (this.core.interrupt_flags & 0x04 && this.core.interrupt_enable & 0x04)
        interrupt_func.call(this, 0x50, 0x04);
      else if (this.core.interrupt_flags & 0x08 && this.core.interrupt_enable & 0x08)
        interrupt_func.call(this, 0x58, 0x08);
      else if (this.core.interrupt_flags & 0x10 && this.core.interrupt_enable & 0x10)
        interrupt_func.call(this, 0x60, 0x10);
    }
    if (doing_delayed_di) {
      this.interrupts_enabled = false;
    } else if (doing_delayed_ei) {
      this.interrupts_enabled = true;
    }
    return this.cycle_counter ? this.cycle_counter : 1;
  }
  get_flags_register() {
    return (this.flags.Z << 7) | (this.flags.N << 6) | (this.flags.H << 5) | (this.flags.C << 4);
  }
  set_flags_register(operand) {
    this.flags.Z = (operand & 0x80) >>> 7;
    this.flags.N = (operand & 0x40) >>> 6;
    this.flags.H = (operand & 0x20) >>> 5;
    this.flags.C = (operand & 0x10) >>> 4;
  }
  push_word(operand) {
    this.sp = (this.sp - 1) & 0xffff;
    this.mem.mem_write(this.sp, (operand & 0xff00) >>> 8);
    this.sp = (this.sp - 1) & 0xffff;
    this.mem.mem_write(this.sp, operand & 0x00ff);
  }
  pop_word() {
    var retval = this.mem.mem_read(this.sp) & 0xff;
    this.sp = (this.sp + 1) & 0xffff;
    retval |= this.mem.mem_read(this.sp) << 8;
    this.sp = (this.sp + 1) & 0xffff;
    return retval;
  }
  get_signed_displacement(offset) {
    if (offset & 0x80) offset = -((0xff & ~offset) + 1);
    return offset;
  }
  do_conditional_absolute_jump(condition) {
    if (condition) {
      this.cycle_counter += 1;
      this.pc =
        this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
      this.pc = (this.pc - 1) & 0xffff;
    } else {
      this.pc = (this.pc + 2) & 0xffff;
    }
  }
  do_conditional_relative_jump(condition) {
    if (condition) {
      this.cycle_counter += 1;
      var offset = this.get_signed_displacement(this.mem.mem_read((this.pc + 1) & 0xffff));
      this.pc = (this.pc + offset + 1) & 0xffff;
    } else {
      this.pc = (this.pc + 1) & 0xffff;
    }
  }
  do_conditional_call(condition) {
    if (condition) {
      this.cycle_counter += 3;
      this.push_word((this.pc + 3) & 0xffff);
      this.pc =
        this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
      this.pc = (this.pc - 1) & 0xffff;
    } else {
      this.pc = (this.pc + 2) & 0xffff;
    }
  }
  do_conditional_return(condition) {
    if (condition) {
      this.cycle_counter += 3;
      this.pc = (this.pop_word() - 1) & 0xffff;
    }
  }
  do_reset(address) {
    this.push_word((this.pc + 1) & 0xffff);
    this.pc = (address - 1) & 0xffff;
  }
  do_add(operand) {
    var result = this.a + operand;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.N = 0;
    this.flags.H = (result & 0xf) < (this.a & 0xf) ? 1 : 0;
    this.flags.C = result > 0xff ? 1 : 0;
    this.a = result & 0xff;
  }
  do_adc(operand) {
    var result = this.a + operand + this.flags.C;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.N = 0;
    this.flags.H = (operand & 0xf) + (this.a & 0xf) + this.flags.C >= 0x10 ? 1 : 0;
    this.flags.C = result > 0xff ? 1 : 0;
    this.a = result & 0xff;
  }
  do_sub(operand) {
    var result = this.a - operand;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.N = 1;
    this.flags.H = (this.a & 0x0f) - (operand & 0x0f) < 0 ? 1 : 0;
    this.flags.C = result < 0 ? 1 : 0;
    this.a = result & 0xff;
  }
  do_sbc(operand) {
    var result = this.a - operand - this.flags.C;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.N = 1;
    this.flags.H = (this.a & 0x0f) - (operand & 0x0f) - this.flags.C < 0 ? 1 : 0;
    this.flags.C = result < 0 ? 1 : 0;
    this.a = result & 0xff;
  }
  do_cp(operand) {
    var temp = this.a;
    this.do_sub(operand);
    this.a = temp;
  }
  do_and(operand) {
    this.a &= operand & 0xff;
    this.flags.N = 0;
    this.flags.C = 0;
    this.flags.H = 1;
    this.flags.Z = !this.a ? 1 : 0;
  }
  do_or(operand) {
    this.a = (operand | this.a) & 0xff;
    this.flags.N = 0;
    this.flags.C = 0;
    this.flags.H = 0;
    this.flags.Z = !this.a ? 1 : 0;
  }
  do_xor(operand) {
    this.a = (operand ^ this.a) & 0xff;
    this.flags.N = 0;
    this.flags.C = 0;
    this.flags.H = 0;
    this.flags.Z = !this.a ? 1 : 0;
  }
  do_inc(operand) {
    var result = operand + 1;
    this.flags.N = 0;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.H = (operand & 0x0f) === 0xf ? 1 : 0;
    return result & 0xff;
  }
  do_dec(operand) {
    var result = operand - 1;
    this.flags.N = 1;
    this.flags.Z = !(result & 0xff) ? 1 : 0;
    this.flags.H = (operand & 0x0f) - 1 < 0 ? 1 : 0;
    return result & 0xff;
  }
  do_hl_add(operand) {
    this.flags.N = 0;
    var hl = this.l | (this.h << 8);
    var result = hl + operand;
    this.flags.C = result & 0x10000 ? 1 : 0;
    this.flags.H = ((hl & 0xfff) + (operand & 0xfff)) & 0x1000 ? 1 : 0;
    this.l = result & 0xff;
    this.h = (result & 0xff00) >>> 8;
  }
  do_rlc(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = (operand & 0x80) >>> 7;
    operand = ((operand << 1) | this.flags.C) & 0xff;
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_rrc(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = operand & 1;
    operand = ((operand >>> 1) & 0x7f) | (this.flags.C << 7);
    this.flags.Z = !(operand & 0xff) ? 1 : 0;
    return operand & 0xff;
  }
  do_rl(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    var temp = this.flags.C;
    this.flags.C = (operand & 0x80) >>> 7;
    operand = ((operand << 1) | temp) & 0xff;
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_rr(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    var temp = this.flags.C;
    this.flags.C = operand & 1;
    operand = ((operand >>> 1) & 0x7f) | (temp << 7);
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_sla(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = (operand & 0x80) >>> 7;
    operand = (operand << 1) & 0xff;
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_sra(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = operand & 1;
    operand = ((operand >>> 1) & 0x7f) | (operand & 0x80);
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_swap(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = 0;
    var low_nibble = operand & 0x0f,
      high_nibble = (operand & 0xf0) >>> 4;
    operand = high_nibble | (low_nibble << 4);
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  do_srl(operand) {
    this.flags.N = 0;
    this.flags.H = 0;
    this.flags.C = operand & 1;
    operand = (operand >>> 1) & 0x7f;
    this.flags.Z = !operand ? 1 : 0;
    return operand;
  }
  execInstruction(_opcode) {
    switch (_opcode) {
      case 0x00: {
        break;
      }
      case 0x01: {
        this.pc = (this.pc + 1) & 0xffff;
        this.c = this.mem.mem_read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        this.b = this.mem.mem_read(this.pc);
        break;
      }
      case 0x02: {
        this.mem.mem_write(this.c | (this.b << 8), this.a);
        break;
      }
      case 0x03: {
        var result = this.c | (this.b << 8);
        result += 1;
        this.c = result & 0xff;
        this.b = (result & 0xff00) >>> 8;
        break;
      }
      case 0x04: {
        this.b = this.do_inc(this.b);
        break;
      }
      case 0x05: {
        this.b = this.do_dec(this.b);
        break;
      }
      case 0x06: {
        this.pc = (this.pc + 1) & 0xffff;
        this.b = this.mem.mem_read(this.pc);
        break;
      }
      case 0x07: {
        this.a = this.do_rlc(this.a);
        this.flags.Z = 0;
        break;
      }
      case 0x08: {
        var address =
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
        this.mem.mem_write(address, this.sp & 0xff);
        this.mem.mem_write((address + 1) & 0xffff, (this.sp & 0xff00) >>> 8);
        this.pc = (this.pc + 2) & 0xffff;
        break;
      }
      case 0x09: {
        this.do_hl_add(this.c | (this.b << 8));
        break;
      }
      case 0x0a: {
        this.a = this.mem.mem_read(this.c | (this.b << 8));
        break;
      }
      case 0x0b: {
        var result = this.c | (this.b << 8);
        result -= 1;
        this.c = result & 0xff;
        this.b = (result & 0xff00) >>> 8;
        break;
      }
      case 0x0c: {
        this.c = this.do_inc(this.c);
        break;
      }
      case 0x0d: {
        this.c = this.do_dec(this.c);
        break;
      }
      case 0x0e: {
        this.pc = (this.pc + 1) & 0xffff;
        this.c = this.mem.mem_read(this.pc);
        break;
      }
      case 0x0f: {
        this.a = this.do_rrc(this.a);
        this.flags.Z = 0;
        break;
      }
      case 0x10: {
        this.core.hit_stop_instruction();
        this.pc = (this.pc + 1) & 0xffff;
        break;
      }
      case 0x11: {
        this.pc = (this.pc + 1) & 0xffff;
        this.e = this.mem.mem_read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        this.d = this.mem.mem_read(this.pc);
        break;
      }
      case 0x12: {
        this.mem.mem_write(this.e | (this.d << 8), this.a);
        break;
      }
      case 0x13: {
        var result = this.e | (this.d << 8);
        result += 1;
        this.e = result & 0xff;
        this.d = (result & 0xff00) >>> 8;
        break;
      }
      case 0x14: {
        this.d = this.do_inc(this.d);
        break;
      }
      case 0x15: {
        this.d = this.do_dec(this.d);
        break;
      }
      case 0x16: {
        this.pc = (this.pc + 1) & 0xffff;
        this.d = this.mem.mem_read(this.pc);
        break;
      }
      case 0x17: {
        this.a = this.do_rl(this.a);
        this.flags.Z = 0;
        break;
      }
      case 0x18: {
        var offset = this.get_signed_displacement(this.mem.mem_read((this.pc + 1) & 0xffff));
        this.pc = (this.pc + offset + 1) & 0xffff;
        break;
      }
      case 0x19: {
        this.do_hl_add(this.e | (this.d << 8));
        break;
      }
      case 0x1a: {
        this.a = this.mem.mem_read(this.e | (this.d << 8));
        break;
      }
      case 0x1b: {
        var result = this.e | (this.d << 8);
        result -= 1;
        this.e = result & 0xff;
        this.d = (result & 0xff00) >>> 8;
        break;
      }
      case 0x1c: {
        this.e = this.do_inc(this.e);
        break;
      }
      case 0x1d: {
        this.e = this.do_dec(this.e);
        break;
      }
      case 0x1e: {
        this.pc = (this.pc + 1) & 0xffff;
        this.e = this.mem.mem_read(this.pc);
        break;
      }
      case 0x1f: {
        this.a = this.do_rr(this.a);
        this.flags.Z = 0;
        break;
      }
      case 0x20: {
        this.do_conditional_relative_jump(!this.flags.Z);
        break;
      }
      case 0x21: {
        this.pc = (this.pc + 1) & 0xffff;
        this.l = this.mem.mem_read(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        this.h = this.mem.mem_read(this.pc);
        break;
      }
      case 0x22: {
        var address = this.l | (this.h << 8);
        this.mem.mem_write(address, this.a);
        address += 1;
        this.l = address & 0xff;
        this.h = (address & 0xff00) >>> 8;
        break;
      }
      case 0x23: {
        var result = this.l | (this.h << 8);
        result += 1;
        this.l = result & 0xff;
        this.h = (result & 0xff00) >>> 8;
        break;
      }
      case 0x24: {
        this.h = this.do_inc(this.h);
        break;
      }
      case 0x25: {
        this.h = this.do_dec(this.h);
        break;
      }
      case 0x26: {
        this.pc = (this.pc + 1) & 0xffff;
        this.h = this.mem.mem_read(this.pc);
        break;
      }
      case 0x27: {
        var temp = this.a;
        if (!this.flags.N) {
          if (this.flags.H || (temp & 0xf) > 9) temp += 0x06;
          if (this.flags.C || temp > 0x9f) temp += 0x60;
        } else {
          if (this.flags.H) temp = (temp - 6) & 0xff;
          if (this.flags.C) temp -= 0x60;
        }
        this.flags.H = 0;
        this.flags.Z = !(temp & 0xff) ? 1 : 0;
        this.flags.C = temp & 0x100 ? 1 : this.flags.C;
        this.a = temp & 0xff;
        break;
      }
      case 0x28: {
        this.do_conditional_relative_jump(!!this.flags.Z);
        break;
      }
      case 0x29: {
        this.do_hl_add(this.l | (this.h << 8));
        break;
      }
      case 0x2a: {
        var address = this.l | (this.h << 8);
        this.a = this.mem.mem_read(address);
        address += 1;
        this.l = address & 0xff;
        this.h = (address & 0xff00) >>> 8;
        break;
      }
      case 0x2b: {
        var result = this.l | (this.h << 8);
        result -= 1;
        this.l = result & 0xff;
        this.h = (result & 0xff00) >>> 8;
        break;
      }
      case 0x2c: {
        this.l = this.do_inc(this.l);
        break;
      }
      case 0x2d: {
        this.l = this.do_dec(this.l);
        break;
      }
      case 0x2e: {
        this.pc = (this.pc + 1) & 0xffff;
        this.l = this.mem.mem_read(this.pc);
        break;
      }
      case 0x2f: {
        this.flags.N = 1;
        this.flags.H = 1;
        this.a = ~this.a & 0xff;
        break;
      }
      case 0x30: {
        this.do_conditional_relative_jump(!this.flags.C);
        break;
      }
      case 0x31: {
        this.sp =
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
        this.pc = (this.pc + 2) & 0xffff;
        break;
      }
      case 0x32: {
        var address = this.l | (this.h << 8);
        this.mem.mem_write(address, this.a);
        address -= 1;
        this.l = address & 0xff;
        this.h = (address & 0xff00) >>> 8;
        break;
      }
      case 0x33: {
        this.sp = (this.sp + 1) & 0xffff;
        break;
      }
      case 0x34: {
        var address = this.l | (this.h << 8);
        this.mem.mem_write(address, this.do_inc(this.mem.mem_read(address)));
        break;
      }
      case 0x35: {
        var address = this.l | (this.h << 8);
        this.mem.mem_write(address, this.do_dec(this.mem.mem_read(address)));
        break;
      }
      case 0x36: {
        this.pc = (this.pc + 1) & 0xffff;
        this.mem.mem_write(this.l | (this.h << 8), this.mem.mem_read(this.pc));
        break;
      }
      case 0x37: {
        this.flags.N = 0;
        this.flags.H = 0;
        this.flags.C = 1;
        break;
      }
      case 0x38: {
        this.do_conditional_relative_jump(!!this.flags.C);
        break;
      }
      case 0x39: {
        this.do_hl_add(this.sp);
        break;
      }
      case 0x3a: {
        var address = this.l | (this.h << 8);
        this.a = this.mem.mem_read(address);
        address -= 1;
        this.l = address & 0xff;
        this.h = (address & 0xff00) >>> 8;
        break;
      }
      case 0x3b: {
        this.sp = (this.sp - 1) & 0xffff;
        break;
      }
      case 0x3c: {
        this.a = this.do_inc(this.a);
        break;
      }
      case 0x3d: {
        this.a = this.do_dec(this.a);
        break;
      }
      case 0x3e: {
        this.a = this.mem.mem_read((this.pc + 1) & 0xffff);
        this.pc = (this.pc + 1) & 0xffff;
        break;
      }
      case 0x3f: {
        this.flags.N = 0;
        this.flags.H = 0;
        this.flags.C = this.flags.C ? 0 : 1;
        break;
      }
      case 0xc0: {
        this.do_conditional_return(!this.flags.Z);
        break;
      }
      case 0xc1: {
        var result = this.pop_word();
        this.c = result & 0xff;
        this.b = (result & 0xff00) >>> 8;
        break;
      }
      case 0xc2: {
        this.do_conditional_absolute_jump(!this.flags.Z);
        break;
      }
      case 0xc3: {
        this.pc =
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
        this.pc = (this.pc - 1) & 0xffff;
        break;
      }
      case 0xc4: {
        this.do_conditional_call(!this.flags.Z);
        break;
      }
      case 0xc5: {
        this.push_word(this.c | (this.b << 8));
        break;
      }
      case 0xc6: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_add(this.mem.mem_read(this.pc));
        break;
      }
      case 0xc7: {
        this.do_reset(0x00);
        break;
      }
      case 0xc8: {
        this.do_conditional_return(!!this.flags.Z);
        break;
      }
      case 0xc9: {
        this.pc = (this.pop_word() - 1) & 0xffff;
        break;
      }
      case 0xca: {
        this.do_conditional_absolute_jump(!!this.flags.Z);
        break;
      }
      case 0xcb: {
        this.pc = (this.pc + 1) & 0xffff;
        var opcode = this.mem.mem_read(this.pc),
          bit_number = (opcode & 0x38) >>> 3,
          reg_code = opcode & 0x07;
        if (opcode < 0x40) {
          var inst_funcs = [
            this.do_rlc,
            this.do_rrc,
            this.do_rl,
            this.do_rr,
            this.do_sla,
            this.do_sra,
            this.do_swap,
            this.do_srl,
          ];
          if (reg_code === 0) this.b = inst_funcs[bit_number].call(this, this.b);
          else if (reg_code === 1) this.c = inst_funcs[bit_number].call(this, this.c);
          else if (reg_code === 2) this.d = inst_funcs[bit_number].call(this, this.d);
          else if (reg_code === 3) this.e = inst_funcs[bit_number].call(this, this.e);
          else if (reg_code === 4) this.h = inst_funcs[bit_number].call(this, this.h);
          else if (reg_code === 5) this.l = inst_funcs[bit_number].call(this, this.l);
          else if (reg_code === 6) {
            this.mem.mem_write(
              this.l | (this.h << 8),
              inst_funcs[bit_number].call(this, this.mem.mem_read(this.l | (this.h << 8)))
            );
            this.cycle_counter += 2;
          } else if (reg_code === 7) this.a = inst_funcs[bit_number].call(this, this.a);
        } else if (opcode < 0x80) {
          if (reg_code === 0) this.flags.Z = !(this.b & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 1) this.flags.Z = !(this.c & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 2) this.flags.Z = !(this.d & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 3) this.flags.Z = !(this.e & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 4) this.flags.Z = !(this.h & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 5) this.flags.Z = !(this.l & (1 << bit_number)) ? 1 : 0;
          else if (reg_code === 6) {
            this.flags.Z = !(this.mem.mem_read(this.l | (this.h << 8)) & (1 << bit_number)) ? 1 : 0;
            this.cycle_counter += 1;
          } else if (reg_code === 7) this.flags.Z = !(this.a & (1 << bit_number)) ? 1 : 0;
          this.flags.N = 0;
          this.flags.H = 1;
        } else if (opcode < 0xc0) {
          if (reg_code === 0) this.b = this.b & (0xff & ~(1 << bit_number));
          else if (reg_code === 1) this.c = this.c & (0xff & ~(1 << bit_number));
          else if (reg_code === 2) this.d = this.d & (0xff & ~(1 << bit_number));
          else if (reg_code === 3) this.e = this.e & (0xff & ~(1 << bit_number));
          else if (reg_code === 4) this.h = this.h & (0xff & ~(1 << bit_number));
          else if (reg_code === 5) this.l = this.l & (0xff & ~(1 << bit_number));
          else if (reg_code === 6) {
            this.mem.mem_write(
              this.l | (this.h << 8),
              this.mem.mem_read(this.l | (this.h << 8)) & (0xff & ~(1 << bit_number))
            );
            this.cycle_counter += 2;
          } else if (reg_code === 7) this.a = this.a & (0xff & ~(1 << bit_number));
        } else {
          if (reg_code === 0) this.b = this.b | (0xff & (1 << bit_number));
          else if (reg_code === 1) this.c = this.c | (0xff & (1 << bit_number));
          else if (reg_code === 2) this.d = this.d | (0xff & (1 << bit_number));
          else if (reg_code === 3) this.e = this.e | (0xff & (1 << bit_number));
          else if (reg_code === 4) this.h = this.h | (0xff & (1 << bit_number));
          else if (reg_code === 5) this.l = this.l | (0xff & (1 << bit_number));
          else if (reg_code === 6) {
            this.mem.mem_write(
              this.l | (this.h << 8),
              this.mem.mem_read(this.l | (this.h << 8)) | (0xff & (1 << bit_number))
            );
            this.cycle_counter += 2;
          } else if (reg_code === 7) this.a = this.a | (0xff & (1 << bit_number));
        }
        this.cycle_counter += 2;
        break;
      }
      case 0xcc: {
        this.do_conditional_call(!!this.flags.Z);
        break;
      }
      case 0xcd: {
        this.push_word((this.pc + 3) & 0xffff);
        this.pc =
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8);
        this.pc = (this.pc - 1) & 0xffff;
        break;
      }
      case 0xce: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_adc(this.mem.mem_read(this.pc));
        break;
      }
      case 0xcf: {
        this.do_reset(0x08);
        break;
      }
      case 0xd0: {
        this.do_conditional_return(!this.flags.C);
        break;
      }
      case 0xd1: {
        var result = this.pop_word();
        this.e = result & 0xff;
        this.d = (result & 0xff00) >>> 8;
        break;
      }
      case 0xd2: {
        this.do_conditional_absolute_jump(!this.flags.C);
        break;
      }
      case 0xd4: {
        this.do_conditional_call(!this.flags.C);
        break;
      }
      case 0xd5: {
        this.push_word(this.e | (this.d << 8));
        break;
      }
      case 0xd6: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_sub(this.mem.mem_read(this.pc));
        break;
      }
      case 0xd7: {
        this.do_reset(0x10);
        break;
      }
      case 0xd8: {
        this.do_conditional_return(!!this.flags.C);
        break;
      }
      case 0xd9: {
        this.pc = (this.pop_word() - 1) & 0xffff;
        this.interrupts_enabled = true;
        break;
      }
      case 0xda: {
        this.do_conditional_absolute_jump(!!this.flags.C);
        break;
      }
      case 0xdc: {
        this.do_conditional_call(!!this.flags.C);
        break;
      }
      case 0xde: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_sbc(this.mem.mem_read(this.pc));
        break;
      }
      case 0xdf: {
        this.do_reset(0x18);
        break;
      }
      case 0xe0: {
        this.pc = (this.pc + 1) & 0xffff;
        this.mem.mem_write(0xff00 | this.mem.mem_read(this.pc), this.a);
        break;
      }
      case 0xe1: {
        var result = this.pop_word();
        this.l = result & 0xff;
        this.h = (result & 0xff00) >>> 8;
        break;
      }
      case 0xe2: {
        this.mem.mem_write(0xff00 | this.c, this.a);
        break;
      }
      case 0xe5: {
        this.push_word(this.l | (this.h << 8));
        break;
      }
      case 0xe6: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_and(this.mem.mem_read(this.pc));
        break;
      }
      case 0xe7: {
        this.do_reset(0x20);
        break;
      }
      case 0xe8: {
        this.pc = (this.pc + 1) & 0xffff;
        var operand = this.get_signed_displacement(this.mem.mem_read(this.pc)),
          result = (this.sp + operand) & 0xffff;
        this.flags.C = (result & 0xff) < (this.sp & 0xff) ? 1 : 0;
        this.flags.H = (result & 0xf) < (this.sp & 0xf) ? 1 : 0;
        this.flags.N = 0;
        this.flags.Z = 0;
        this.sp = result;
        break;
      }
      case 0xe9: {
        this.pc = this.l | (this.h << 8);
        this.pc = (this.pc - 1) & 0xffff;
        break;
      }
      case 0xea: {
        this.mem.mem_write(
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8),
          this.a
        );
        this.pc = (this.pc + 2) & 0xffff;
        break;
      }
      case 0xee: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_xor(this.mem.mem_read(this.pc));
        break;
      }
      case 0xef: {
        this.do_reset(0x28);
        break;
      }
      case 0xf0: {
        this.pc = (this.pc + 1) & 0xffff;
        this.a = this.mem.mem_read(0xff00 | this.mem.mem_read(this.pc));
        break;
      }
      case 0xf1: {
        var result = this.pop_word();
        this.set_flags_register(result & 0xff);
        this.a = (result & 0xff00) >>> 8;
        break;
      }
      case 0xf2: {
        this.a = this.mem.mem_read(0xff00 | this.c);
        break;
      }
      case 0xf3: {
        this.do_delayed_di = true;
        break;
      }
      case 0xf5: {
        this.push_word(this.get_flags_register() | (this.a << 8));
        break;
      }
      case 0xf6: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_or(this.mem.mem_read(this.pc));
        break;
      }
      case 0xf7: {
        this.do_reset(0x30);
        break;
      }
      case 0xf8: {
        this.pc = (this.pc + 1) & 0xffff;
        var operand = this.get_signed_displacement(this.mem.mem_read(this.pc)),
          result = this.sp + operand;
        this.l = result & 0xff;
        this.h = (result & 0xff00) >>> 8;
        this.flags.C = (result & 0xff) < (this.sp & 0xff) ? 1 : 0;
        this.flags.H = (result & 0xf) < (this.sp & 0xf) ? 1 : 0;
        this.flags.Z = 0;
        this.flags.N = 0;
        break;
      }
      case 0xf9: {
        this.sp = this.l | (this.h << 8);
        break;
      }
      case 0xfa: {
        this.a = this.mem.mem_read(
          this.mem.mem_read((this.pc + 1) & 0xffff) | (this.mem.mem_read((this.pc + 2) & 0xffff) << 8)
        );
        this.pc = (this.pc + 2) & 0xffff;
        break;
      }
      case 0xfb: {
        this.do_delayed_ei = true;
        break;
      }
      case 0xfe: {
        this.pc = (this.pc + 1) & 0xffff;
        this.do_cp(this.mem.mem_read(this.pc));
        break;
      }
      case 0xff: {
        this.do_reset(0x38);
        break;
      }
    }
  }
}
