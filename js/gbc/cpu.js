"use strict";

function GBC_cpu(core)
{
   this.core = core;
   
   this.a = 0x01;
   this.b = 0x00;
   this.c = 0x00;
   this.d = 0xff;
   this.e = 0x56;
   this.h = 0x00;
   this.l = 0x0d;
   this.sp = 0xfffe;
   this.pc = 0x0100;
   this.flags = {Z:1, N:0, H:1, C:1};
   
   this.halted = false;
   this.do_delayed_di = false;
   this.do_delayed_ei = false;
   this.interrupts_enabled = false;
}

GBC_cpu.prototype.reset = function(is_gbc)
{
   if (!is_gbc)
   {
      // An initial value of 1 in the accumulator indicates that
      //  we are a "regular" Game Boy, as opposed to a Color.
      this.a = 0x01;
   }
   else
   {
      // 0x11 though means that we are a Game Boy Color.
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
   this.flags = {Z:1, N:0, H:1, C:1};
   
   this.halted = false;
   this.do_delayed_di = false;
   this.do_delayed_ei = false;
   this.interrupts_enabled = false;
};

GBC_cpu.prototype.run_instruction = function()
{
   // The register-to-register loads and ALU instructions
   //  are all so uniform that we decode them directly
   //  instead of going into the table for them.
   // This function gets the operand for all of these instructions.
   var get_operand = function(opcode)
   {
      return ((opcode & 0x07) === 0) ? this.b :
             ((opcode & 0x07) === 1) ? this.c :
             ((opcode & 0x07) === 2) ? this.d :
             ((opcode & 0x07) === 3) ? this.e :
             ((opcode & 0x07) === 4) ? this.h :
             ((opcode & 0x07) === 5) ? this.l :
             ((opcode & 0x07) === 6) ? this.core.mem_read(this.l | (this.h << 8)) : this.a;
   };

   // Check if the previous instruction was a DI or EI.
   // If so, we'll need to disable/enable interrupts after this instruction.
   var doing_delayed_di = false, doing_delayed_ei = false;
   if (this.do_delayed_di)
   {
      this.do_delayed_di = false;
      doing_delayed_di = true;
   }
   else if (this.do_delayed_ei)
   {
      this.do_delayed_ei = false;
      doing_delayed_ei = true;
   }

   if (!this.halted)
   {
      var opcode = this.core.mem_read(this.pc);
      
      this.cycle_counter = 0;
      
      // Go ahead and knock out HALT, because it breaks our LD decoding.
      if (opcode === 0x76)
         this.halted = true;
      else if ((opcode >= 0x40) && (opcode < 0x80))
      {
         // These are the basic LD instructions.
         var operand = get_operand.call(this, opcode);
         
         if (((opcode & 0x38) >>> 3) === 0)
            this.b = operand;
         else if (((opcode & 0x38) >>> 3) === 1)
            this.c = operand;
         else if (((opcode & 0x38) >>> 3) === 2)
            this.d = operand;
         else if (((opcode & 0x38) >>> 3) === 3)
            this.e = operand;
         else if (((opcode & 0x38) >>> 3) === 4)
            this.h = operand;
         else if (((opcode & 0x38) >>> 3) === 5)
            this.l = operand;
         else if (((opcode & 0x38) >>> 3) === 6)
            this.core.mem_write(this.l | (this.h << 8), operand);
         else if (((opcode & 0x38) >>> 3) === 7)
            this.a = operand;
      }
      else if ((opcode >= 0x80) && (opcode < 0xc0))
      {
         // These are the (most of) the ALU instructions.
         var operand = get_operand.call(this, opcode),
             op_array = [this.do_add, this.do_adc, this.do_sub, this.do_sbc,
                         this.do_and, this.do_xor, this.do_or, this.do_cp];
      
         op_array[(opcode & 0x38) >>> 3].call(this, operand);
      }
      else
      {
         // This isn't one of the easily decoded instructions,
         //  we'll pull it out of the table.
         var func = this.instructions[opcode];
         if (func)
            func(this);
      }

      this.pc = (this.pc + 1) & 0xffff;
      this.cycle_counter += this.cycle_counts[opcode];
   }
   
   if (this.halted && (this.core.interrupt_flags & 0x1f))
   {
      this.halted = false;
   }

   if (this.interrupts_enabled && (this.core.interrupt_flags & 0x1f))
   {
      var interrupt_func = function(address, flag)
      {
         // Acknowledge the interrupt by clearing the flag.
         this.core.interrupt_flags &= 0xff & ~flag;
         this.interrupts_enabled = false;
         this.cycle_counter += 3;
         this.push_word(this.pc);
         this.pc = address;
      };
      
      if ((this.core.interrupt_flags & 0x01) && (this.core.interrupt_enable & 0x01))
         interrupt_func.call(this, 0x40, 0x01);
      else if ((this.core.interrupt_flags & 0x02) && (this.core.interrupt_enable & 0x02))
         interrupt_func.call(this, 0x48, 0x02);
      else if ((this.core.interrupt_flags & 0x04) && (this.core.interrupt_enable & 0x04))
         interrupt_func.call(this, 0x50, 0x04);
      else if ((this.core.interrupt_flags & 0x08) && (this.core.interrupt_enable & 0x08))
         interrupt_func.call(this, 0x58, 0x08);
      else if ((this.core.interrupt_flags & 0x10) && (this.core.interrupt_enable & 0x10))
         interrupt_func.call(this, 0x60, 0x10);
   }
   
   if (doing_delayed_di)
   {
      this.interrupts_enabled = false;
   }
   else if (doing_delayed_ei)
   {
      this.interrupts_enabled = true;
   }
   
   // Always claim we ran at least one cycle,
   //  to keep our caller from looping infinitely
   //  while we're halted and there are no interrrupts.
   return this.cycle_counter ? this.cycle_counter : 1;
};

GBC_cpu.prototype.get_flags_register = function()
{
   return (this.flags.Z << 7) |
          (this.flags.N << 6) |
          (this.flags.H << 5) |
          (this.flags.C << 4);
};

GBC_cpu.prototype.set_flags_register = function(operand)
{
   this.flags.Z = (operand & 0x80) >>> 7;
   this.flags.N = (operand & 0x40) >>> 6;
   this.flags.H = (operand & 0x20) >>> 5;
   this.flags.C = (operand & 0x10) >>> 4;
};

GBC_cpu.prototype.push_word = function(operand)
{
   this.sp = (this.sp - 1) & 0xffff;
   this.core.mem_write(this.sp, (operand & 0xff00) >>> 8);
   this.sp = (this.sp - 1) & 0xffff;
   this.core.mem_write(this.sp, operand & 0x00ff);
};

GBC_cpu.prototype.pop_word = function()
{
   var retval = this.core.mem_read(this.sp) & 0xff;
   this.sp = (this.sp + 1) & 0xffff;
   retval |= this.core.mem_read(this.sp) << 8;
   this.sp = (this.sp + 1) & 0xffff;
   return retval;
};

GBC_cpu.prototype.get_signed_displacement = function(offset)
{
   if (offset & 0x80)
      offset = -((0xff & ~offset) + 1);
   
   return offset;
};

GBC_cpu.prototype.do_conditional_absolute_jump = function(condition)
{
   if (condition)
   {
      this.cycle_counter += 1;
      
      this.pc =  this.core.mem_read((this.pc + 1) & 0xffff) |
                (this.core.mem_read((this.pc + 2) & 0xffff) << 8);
      this.pc = (this.pc - 1) & 0xffff;
   }
   else
   {
      this.pc = (this.pc + 2) & 0xffff;
   }
};

GBC_cpu.prototype.do_conditional_relative_jump = function(condition)
{
   if (condition)
   {
      this.cycle_counter += 1;
      
      var offset = this.get_signed_displacement(this.core.mem_read((this.pc + 1) & 0xffff));
      this.pc = (this.pc + offset + 1) & 0xffff;
   }
   else
   {
      this.pc = (this.pc + 1) & 0xffff;
   }
};

GBC_cpu.prototype.do_conditional_call = function(condition)
{
   if (condition)
   {
      this.cycle_counter += 3;
      this.push_word((this.pc + 3) & 0xffff);
      this.pc =  this.core.mem_read((this.pc + 1) & 0xffff) |
                (this.core.mem_read((this.pc + 2) & 0xffff) << 8);
      this.pc = (this.pc - 1) & 0xffff;
   }
   else
   {
      this.pc = (this.pc + 2) & 0xffff;
   }
};

GBC_cpu.prototype.do_conditional_return = function(condition)
{
   if (condition)
   {
      this.cycle_counter += 3;
      this.pc = (this.pop_word() - 1) & 0xffff;
   }
};

GBC_cpu.prototype.do_reset = function(address)
{
   this.push_word((this.pc + 1) & 0xffff);
   this.pc = (address - 1) & 0xffff;
};

GBC_cpu.prototype.do_add = function(operand)
{
   var result = this.a + operand;
   
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.N = 0;
   this.flags.H = ((result & 0xf) < (this.a & 0xf)) ? 1 : 0;
   this.flags.C = (result > 0xff) ? 1 : 0;
   
   this.a = result & 0xff;
};

GBC_cpu.prototype.do_adc = function(operand)
{
   var result = this.a + operand + this.flags.C;
   
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.N = 0;
   this.flags.H = (((operand & 0xf) + (this.a & 0xf) + this.flags.C) >= 0x10) ? 1 : 0;
   this.flags.C = (result > 0xff) ? 1 : 0;
   
   this.a = result & 0xff;
};

GBC_cpu.prototype.do_sub = function(operand)
{
   var result = this.a - operand;
   
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.N = 1;
   this.flags.H = (((this.a & 0x0f) - (operand & 0x0f)) < 0) ? 1 : 0;
   this.flags.C = (result < 0) ? 1 : 0;
   
   this.a = result & 0xff;
};

GBC_cpu.prototype.do_sbc = function(operand)
{
   var result = this.a - operand - this.flags.C;
   
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.N = 1;
   this.flags.H = (((this.a & 0x0f) - (operand & 0x0f) - this.flags.C) < 0) ? 1 : 0;
   this.flags.C = (result < 0) ? 1 : 0;
   
   this.a = result & 0xff;
};

GBC_cpu.prototype.do_cp = function(operand)
{
   var temp = this.a;
   this.do_sub(operand);
   this.a = temp;
};

GBC_cpu.prototype.do_and = function(operand)
{
   this.a &= operand & 0xff;
   this.flags.N = 0;
   this.flags.C = 0;
   this.flags.H = 1;
   this.flags.Z = !this.a ? 1 : 0;
};

GBC_cpu.prototype.do_or = function(operand)
{
   this.a = (operand | this.a) & 0xff;
   this.flags.N = 0;
   this.flags.C = 0;
   this.flags.H = 0;
   this.flags.Z = !this.a ? 1 : 0;
};

GBC_cpu.prototype.do_xor = function(operand)
{
   this.a = (operand ^ this.a) & 0xff;
   this.flags.N = 0;
   this.flags.C = 0;
   this.flags.H = 0;
   this.flags.Z = !this.a ? 1 : 0;
};

GBC_cpu.prototype.do_inc = function(operand)
{
   var result = operand + 1;
   
   this.flags.N = 0;
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.H = ((operand & 0x0f) === 0xf) ? 1 : 0;
   
   return result & 0xff;
};

GBC_cpu.prototype.do_dec = function(operand)
{
   var result = operand - 1;
   
   this.flags.N = 1;
   this.flags.Z = !(result & 0xff) ? 1 : 0;
   this.flags.H = (((operand & 0x0f) - 1) < 0) ? 1 : 0;
   
   return result & 0xff;
};

GBC_cpu.prototype.do_hl_add = function(operand)
{
   this.flags.N = 0;
   
   var hl = this.l | (this.h << 8);
   var result = hl + operand;
   
   this.flags.C = (result & 0x10000) ? 1 : 0;
   this.flags.H = (((hl & 0xfff) + (operand & 0xfff)) & 0x1000) ? 1 : 0;
   
   this.l = result & 0xff;
   this.h = (result & 0xff00) >>> 8;
};

GBC_cpu.prototype.do_rlc = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   this.flags.C = (operand & 0x80) >>> 7;
   operand = ((operand << 1) | this.flags.C) & 0xff;
   
   this.flags.Z = !operand ? 1 : 0;
   
   return operand;
};

GBC_cpu.prototype.do_rrc = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   this.flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (this.flags.C << 7);
   
   this.flags.Z = !(operand & 0xff) ? 1 : 0;
   
   return operand & 0xff;
};

GBC_cpu.prototype.do_rl = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   var temp = this.flags.C;
   this.flags.C = (operand & 0x80) >>> 7;
   operand = ((operand << 1) | temp) & 0xff;
   
   this.flags.Z = !operand ? 1 : 0;

   return operand;
};

GBC_cpu.prototype.do_rr = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   var temp = this.flags.C;
   this.flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (temp << 7);
   
   this.flags.Z = !operand ? 1 : 0;

   return operand;
};

GBC_cpu.prototype.do_sla = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   this.flags.C = (operand & 0x80) >>> 7;
   operand = (operand << 1) & 0xff;
   
   this.flags.Z = !operand ? 1 : 0;
   
   return operand;
};

GBC_cpu.prototype.do_sra = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   this.flags.C = operand & 1;
   operand = ((operand >>> 1) & 0x7f) | (operand & 0x80);
   
   this.flags.Z = !operand ? 1 : 0;
   
   return operand;
};

GBC_cpu.prototype.do_swap = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   this.flags.C = 0;
   
   var low_nibble = operand & 0x0f,
       high_nibble = (operand & 0xf0) >>> 4;
       
   operand = high_nibble | (low_nibble << 4);
   
   this.flags.Z = !operand ? 1 : 0;
   
   return operand;
};

GBC_cpu.prototype.do_srl = function(operand)
{
   this.flags.N = 0;
   this.flags.H = 0;
   
   this.flags.C = operand & 1;
   operand = (operand >>> 1) & 0x7f;
   
   this.flags.Z = !operand ? 1 : 0;
   
   return operand;
};


GBC_cpu.prototype.instructions = [];

// 0x00 : NOP
GBC_cpu.prototype.instructions[0x00] = function(cpu) { };

// 0x01 : LD BC, nn
GBC_cpu.prototype.instructions[0x01] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.c = cpu.core.mem_read(cpu.pc);
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.b = cpu.core.mem_read(cpu.pc);
};

// 0x02 : LD (BC), A
GBC_cpu.prototype.instructions[0x02] = function(cpu)
{
   cpu.core.mem_write(cpu.c | (cpu.b << 8), cpu.a);
};

// 0x03 : INC BC
GBC_cpu.prototype.instructions[0x03] = function(cpu)
{
   var result = (cpu.c | (cpu.b << 8));
   result += 1;
   cpu.c = result & 0xff;
   cpu.b = (result & 0xff00) >>> 8;
};

// 0x04 : INC B
GBC_cpu.prototype.instructions[0x04] = function(cpu)
{
   cpu.b = cpu.do_inc(cpu.b);
};

// 0x05 : DEC B
GBC_cpu.prototype.instructions[0x05] = function(cpu)
{
   cpu.b = cpu.do_dec(cpu.b);
};

// 0x06 : LD B, n
GBC_cpu.prototype.instructions[0x06] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.b = cpu.core.mem_read(cpu.pc);
};

// 0x07 : RLCA
GBC_cpu.prototype.instructions[0x07] = function(cpu)
{
   cpu.a = cpu.do_rlc(cpu.a);
   cpu.flags.Z = 0;
};

// 0x08 : LD (nn), SP
GBC_cpu.prototype.instructions[0x08] = function(cpu)
{
   var address =  cpu.core.mem_read((cpu.pc + 1) & 0xffff) | 
                 (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8);
   cpu.core.mem_write(address, cpu.sp & 0xff);
   cpu.core.mem_write(((address + 1) & 0xffff), (cpu.sp & 0xff00) >>> 8);
   cpu.pc = (cpu.pc + 2) & 0xffff;
};

// 0x09 : ADD HL, BC
GBC_cpu.prototype.instructions[0x09] = function(cpu)
{
   cpu.do_hl_add(cpu.c | (cpu.b << 8));
};

// 0x0a : LD A, (BC)
GBC_cpu.prototype.instructions[0x0a] = function(cpu)
{
   cpu.a = cpu.core.mem_read(cpu.c | (cpu.b << 8));
};

// 0x0b : DEC BC
GBC_cpu.prototype.instructions[0x0b] = function(cpu)
{
   var result = (cpu.c | (cpu.b << 8));
   result -= 1;
   cpu.c = result & 0xff;
   cpu.b = (result & 0xff00) >>> 8;
};

// 0x0c : INC C
GBC_cpu.prototype.instructions[0x0c] = function(cpu)
{
   cpu.c = cpu.do_inc(cpu.c);
};

// 0x0d : DEC C
GBC_cpu.prototype.instructions[0x0d] = function(cpu)
{
   cpu.c = cpu.do_dec(cpu.c);
};

// 0x0e : LD C, n
GBC_cpu.prototype.instructions[0x0e] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.c = cpu.core.mem_read(cpu.pc);
};

// 0x0f : RRCA
GBC_cpu.prototype.instructions[0x0f] = function(cpu)
{
   cpu.a = cpu.do_rrc(cpu.a);
   cpu.flags.Z = 0;
};

// 0x10 : STOP
GBC_cpu.prototype.instructions[0x10] = function(cpu)
{
   cpu.core.hit_stop_instruction();
   // For some reason this instruction has an operand.
   cpu.pc = (cpu.pc + 1) & 0xffff;
};

// 0x11 : LD DE, nn
GBC_cpu.prototype.instructions[0x11] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.e = cpu.core.mem_read(cpu.pc);
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.d = cpu.core.mem_read(cpu.pc);
};

// 0x12 : LD (DE), A
GBC_cpu.prototype.instructions[0x12] = function(cpu)
{
   cpu.core.mem_write(cpu.e | (cpu.d << 8), cpu.a);
};

// 0x13 : INC DE
GBC_cpu.prototype.instructions[0x13] = function(cpu)
{
   var result = (cpu.e | (cpu.d << 8));
   result += 1;
   cpu.e = result & 0xff;
   cpu.d = (result & 0xff00) >>> 8;
};

// 0x14 : INC D
GBC_cpu.prototype.instructions[0x14] = function(cpu)
{
   cpu.d = cpu.do_inc(cpu.d);
};

// 0x15 : DEC D
GBC_cpu.prototype.instructions[0x15] = function(cpu)
{
   cpu.d = cpu.do_dec(cpu.d);
};

// 0x16 : LD D, n
GBC_cpu.prototype.instructions[0x16] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.d = cpu.core.mem_read(cpu.pc);
};

// 0x17 : RLA
GBC_cpu.prototype.instructions[0x17] = function(cpu)
{
   cpu.a = cpu.do_rl(cpu.a);
   cpu.flags.Z = 0;
};

// 0x18 : JR n
GBC_cpu.prototype.instructions[0x18] = function(cpu)
{
   var offset = cpu.get_signed_displacement(cpu.core.mem_read((cpu.pc + 1) & 0xffff));
   cpu.pc = (cpu.pc + offset + 1) & 0xffff;
};

// 0x19 : ADD HL, DE
GBC_cpu.prototype.instructions[0x19] = function(cpu)
{
   cpu.do_hl_add(cpu.e | (cpu.d << 8));
};

// 0x1a : LD A, (DE)
GBC_cpu.prototype.instructions[0x1a] = function(cpu)
{
   cpu.a = cpu.core.mem_read(cpu.e | (cpu.d << 8));
};

// 0x1b : DEC DE
GBC_cpu.prototype.instructions[0x1b] = function(cpu)
{
   var result = (cpu.e | (cpu.d << 8));
   result -= 1;
   cpu.e = result & 0xff;
   cpu.d = (result & 0xff00) >>> 8;
};

// 0x1c : INC E
GBC_cpu.prototype.instructions[0x1c] = function(cpu)
{
   cpu.e = cpu.do_inc(cpu.e);
};

// 0x1d : DEC E
GBC_cpu.prototype.instructions[0x1d] = function(cpu)
{
   cpu.e = cpu.do_dec(cpu.e);
};

// 0x1e : LD E, n
GBC_cpu.prototype.instructions[0x1e] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.e = cpu.core.mem_read(cpu.pc);
};

// 0x1f : RRA
GBC_cpu.prototype.instructions[0x1f] = function(cpu)
{
   cpu.a = cpu.do_rr(cpu.a);
   cpu.flags.Z = 0;
};

// 0x20 : JR NZ, n
GBC_cpu.prototype.instructions[0x20] = function(cpu)
{
   cpu.do_conditional_relative_jump(!cpu.flags.Z);
};

// 0x21 : LD HL, nn
GBC_cpu.prototype.instructions[0x21] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.l = cpu.core.mem_read(cpu.pc);
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.h = cpu.core.mem_read(cpu.pc);
};

// 0x22 : LD (HL+), A
GBC_cpu.prototype.instructions[0x22] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.core.mem_write(address, cpu.a);
   address += 1;
   cpu.l = address & 0xff;
   cpu.h = (address & 0xff00) >>> 8;
};

// 0x23 : INC HL
GBC_cpu.prototype.instructions[0x23] = function(cpu)
{
   var result = (cpu.l | (cpu.h << 8));
   result += 1;
   cpu.l = result & 0xff;
   cpu.h = (result & 0xff00) >>> 8;
};

// 0x24 : INC H
GBC_cpu.prototype.instructions[0x24] = function(cpu)
{
   cpu.h = cpu.do_inc(cpu.h);
};

// 0x25 : DEC H
GBC_cpu.prototype.instructions[0x25] = function(cpu)
{
   cpu.h = cpu.do_dec(cpu.h);
};

// 0x26 : LD H, n
GBC_cpu.prototype.instructions[0x26] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.h = cpu.core.mem_read(cpu.pc);
};

// 0x27 : DAA
GBC_cpu.prototype.instructions[0x27] = function(cpu)
{
   // This DAA code, like everyone else's, is ported from code posted by DParrott at
   // http://forums.nesdev.com/viewtopic.php?p=96751#p96751
   var temp = cpu.a;
   if (!cpu.flags.N)
   {
      if (cpu.flags.H || ((temp & 0xf) > 9))
         temp += 0x06;
      if (cpu.flags.C || (temp > 0x9f))
         temp += 0x60;
   }
   else
   {
      if (cpu.flags.H)
         temp = (temp - 6) & 0xff;
      if (cpu.flags.C)
         temp -= 0x60;
   }
  
   cpu.flags.H = 0;
   cpu.flags.Z = !(temp & 0xff) ? 1 : 0;
   // If there was no carry during the course of the DAA operation,
   //  the carry flag is _NOT_ cleared.
   // It is set if there was a carry, but otherwise it is left alone.
   cpu.flags.C = (temp & 0x100) ? 1 : cpu.flags.C;

   cpu.a = temp & 0xff;
};

// 0x28 : JR Z, n
GBC_cpu.prototype.instructions[0x28] = function(cpu)
{
   cpu.do_conditional_relative_jump(!!cpu.flags.Z);
};

// 0x29 : ADD HL, HL
GBC_cpu.prototype.instructions[0x29] = function(cpu)
{
   cpu.do_hl_add(cpu.l | (cpu.h << 8));
};

// 0x2a : LD A, (HL+)
GBC_cpu.prototype.instructions[0x2a] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.a = cpu.core.mem_read(address);
   address += 1;
   cpu.l = address & 0xff;
   cpu.h = (address & 0xff00) >>> 8;
};

// 0x2b : DEC HL
GBC_cpu.prototype.instructions[0x2b] = function(cpu)
{
   var result = (cpu.l | (cpu.h << 8));
   result -= 1;
   cpu.l = result & 0xff;
   cpu.h = (result & 0xff00) >>> 8;
};

// 0x2c : INC L
GBC_cpu.prototype.instructions[0x2c] = function(cpu)
{
   cpu.l = cpu.do_inc(cpu.l);
};

// 0x2d : DEC L
GBC_cpu.prototype.instructions[0x2d] = function(cpu)
{
   cpu.l = cpu.do_dec(cpu.l);
};

// 0x2e : LD L, n
GBC_cpu.prototype.instructions[0x2e] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.l = cpu.core.mem_read(cpu.pc);
};

// 0x2f : CPL
GBC_cpu.prototype.instructions[0x2f] = function(cpu)
{
   cpu.flags.N = 1;
   cpu.flags.H = 1;
   cpu.a = (~cpu.a) & 0xff;
};

// 0x30 : JR NC, n
GBC_cpu.prototype.instructions[0x30] = function(cpu)
{
   cpu.do_conditional_relative_jump(!cpu.flags.C);
};

// 0x31 : LD SP, nn
GBC_cpu.prototype.instructions[0x31] = function(cpu)
{
   cpu.sp = cpu.core.mem_read((cpu.pc + 1) & 0xffff) | (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8);
   cpu.pc = (cpu.pc + 2) & 0xffff;
};

// 0x32 : LD (HL-), A
GBC_cpu.prototype.instructions[0x32] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.core.mem_write(address, cpu.a);
   address -= 1;
   cpu.l = address & 0xff;
   cpu.h = (address & 0xff00) >>> 8;
};

// 0x33 : INC SP
GBC_cpu.prototype.instructions[0x33] = function(cpu)
{
   cpu.sp = (cpu.sp + 1) & 0xffff;
};

// 0x34 : INC (HL)
GBC_cpu.prototype.instructions[0x34] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.core.mem_write(address, cpu.do_inc(cpu.core.mem_read(address)));
};

// 0x35 : DEC (HL)
GBC_cpu.prototype.instructions[0x35] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.core.mem_write(address, cpu.do_dec(cpu.core.mem_read(address)));
};

// 0x36 : LD (HL), n
GBC_cpu.prototype.instructions[0x36] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.core.mem_write(cpu.l | (cpu.h << 8), cpu.core.mem_read(cpu.pc));
};

// 0x37 : SCF
GBC_cpu.prototype.instructions[0x37] = function(cpu)
{
   cpu.flags.N = 0;
   cpu.flags.H = 0;
   cpu.flags.C = 1;
};

// 0x38 : JR C, n
GBC_cpu.prototype.instructions[0x38] = function(cpu)
{
   cpu.do_conditional_relative_jump(!!cpu.flags.C);
};

// 0x39 : ADD HL, SP
GBC_cpu.prototype.instructions[0x39] = function(cpu)
{
   cpu.do_hl_add(cpu.sp);
};

// 0x3a : LD A, (HL-)
GBC_cpu.prototype.instructions[0x3a] = function(cpu)
{
   var address = cpu.l | (cpu.h << 8);
   cpu.a = cpu.core.mem_read(address);
   address -= 1;
   cpu.l = address & 0xff;
   cpu.h = (address & 0xff00) >>> 8;
};

// 0x3b : DEC SP
GBC_cpu.prototype.instructions[0x3b] = function(cpu)
{
   cpu.sp = (cpu.sp - 1) & 0xffff;
};

// 0x3c : INC A
GBC_cpu.prototype.instructions[0x3c] = function(cpu)
{
   cpu.a = cpu.do_inc(cpu.a);
};

// 0x3d : DEC A
GBC_cpu.prototype.instructions[0x3d] = function(cpu)
{
   cpu.a = cpu.do_dec(cpu.a);
};

// 0x3e : LD A, n
GBC_cpu.prototype.instructions[0x3e] = function(cpu)
{
   cpu.a = cpu.core.mem_read((cpu.pc + 1) & 0xffff);
   cpu.pc = (cpu.pc + 1) & 0xffff;
};

// 0x3f : CCF
GBC_cpu.prototype.instructions[0x3f] = function(cpu)
{
   cpu.flags.N = 0;
   cpu.flags.H = 0;
   cpu.flags.C = cpu.flags.C ? 0 : 1;
};

// 0xc0 : RET NZ
GBC_cpu.prototype.instructions[0xc0] = function(cpu)
{
   cpu.do_conditional_return(!cpu.flags.Z);
};

// 0xc1 : POP BC
GBC_cpu.prototype.instructions[0xc1] = function(cpu)
{
   var result = cpu.pop_word();
   cpu.c = result & 0xff;
   cpu.b = (result & 0xff00) >>> 8;
};

// 0xc2 : JP NZ, nn
GBC_cpu.prototype.instructions[0xc2] = function(cpu)
{
   cpu.do_conditional_absolute_jump(!cpu.flags.Z);
};

// 0xc3 : JP nn
GBC_cpu.prototype.instructions[0xc3] = function(cpu)
{
   cpu.pc =  cpu.core.mem_read((cpu.pc + 1) & 0xffff) |
            (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8);
   cpu.pc = (cpu.pc - 1) & 0xffff;
};

// 0xc4 : CALL NZ, nn
GBC_cpu.prototype.instructions[0xc4] = function(cpu)
{
   cpu.do_conditional_call(!cpu.flags.Z);
};

// 0xc5 : PUSH BC
GBC_cpu.prototype.instructions[0xc5] = function(cpu)
{
   cpu.push_word(cpu.c | (cpu.b << 8));
};

// 0xc6 : ADD n
GBC_cpu.prototype.instructions[0xc6] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_add(cpu.core.mem_read(cpu.pc));
};

// 0xc7 : RST 00h
GBC_cpu.prototype.instructions[0xc7] = function(cpu)
{
   cpu.do_reset(0x00);
};

// 0xc8 : RET Z
GBC_cpu.prototype.instructions[0xc8] = function(cpu)
{
   cpu.do_conditional_return(!!cpu.flags.Z);
};

// 0xc9 : RET
GBC_cpu.prototype.instructions[0xc9] = function(cpu)
{
   cpu.pc = (cpu.pop_word() - 1) & 0xffff;
};

// 0xca : JP Z, nn
GBC_cpu.prototype.instructions[0xca] = function(cpu)
{
   cpu.do_conditional_absolute_jump(!!cpu.flags.Z);
};
   
// 0xcb : Prefix
GBC_cpu.prototype.instructions[0xcb] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   var opcode = cpu.core.mem_read(cpu.pc),
       bit_number = (opcode & 0x38) >>> 3,
       reg_code = opcode & 0x07;
   
   if (opcode < 0x40)
   {
      // Shift/rotate instruction of some kind.
      var inst_funcs = [cpu.do_rlc, cpu.do_rrc, cpu.do_rl, cpu.do_rr,
                        cpu.do_sla, cpu.do_sra, cpu.do_swap, cpu.do_srl];
      
      if (reg_code === 0)
         cpu.b = inst_funcs[bit_number].call(cpu, cpu.b);
      else if (reg_code === 1)
         cpu.c = inst_funcs[bit_number].call(cpu, cpu.c);
      else if (reg_code === 2)
         cpu.d = inst_funcs[bit_number].call(cpu, cpu.d);
      else if (reg_code === 3)
         cpu.e = inst_funcs[bit_number].call(cpu, cpu.e);
      else if (reg_code === 4)
         cpu.h = inst_funcs[bit_number].call(cpu, cpu.h);
      else if (reg_code === 5)
         cpu.l = inst_funcs[bit_number].call(cpu, cpu.l);
      else if (reg_code === 6)
      {
         cpu.core.mem_write(cpu.l | (cpu.h << 8),
                            inst_funcs[bit_number].call(cpu, cpu.core.mem_read(cpu.l | (cpu.h << 8))));
         cpu.cycle_counter += 2;
      }
      else if (reg_code === 7)
         cpu.a = inst_funcs[bit_number].call(cpu, cpu.a);
   }
   else if (opcode < 0x80)
   {
      // BIT
      if (reg_code === 0)
         cpu.flags.Z = !(cpu.b & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 1)
         cpu.flags.Z = !(cpu.c & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 2)
         cpu.flags.Z = !(cpu.d & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 3)
         cpu.flags.Z = !(cpu.e & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 4)
         cpu.flags.Z = !(cpu.h & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 5)
         cpu.flags.Z = !(cpu.l & (1 << bit_number)) ? 1 : 0;
      else if (reg_code === 6)
      {
         cpu.flags.Z = !((cpu.core.mem_read(cpu.l | (cpu.h << 8))) & (1 << bit_number)) ? 1 : 0;
         cpu.cycle_counter += 1;
      }
      else if (reg_code === 7)
         cpu.flags.Z = !(cpu.a & (1 << bit_number)) ? 1 : 0;
         
      cpu.flags.N = 0;
      cpu.flags.H = 1;
   }
   else if (opcode < 0xc0)
   {
      // RES
      if (reg_code === 0)
         cpu.b = (cpu.b & (0xff & ~(1 << bit_number)));
      else if (reg_code === 1)
         cpu.c = (cpu.c & (0xff & ~(1 << bit_number)));
      else if (reg_code === 2)
         cpu.d = (cpu.d & (0xff & ~(1 << bit_number)));
      else if (reg_code === 3)
         cpu.e = (cpu.e & (0xff & ~(1 << bit_number)));
      else if (reg_code === 4)
         cpu.h = (cpu.h & (0xff & ~(1 << bit_number)));
      else if (reg_code === 5)
         cpu.l = (cpu.l & (0xff & ~(1 << bit_number)));
      else if (reg_code === 6)
      {
         cpu.core.mem_write(cpu.l | (cpu.h << 8),
                            cpu.core.mem_read(cpu.l | (cpu.h << 8)) & (0xff & ~(1 << bit_number)));
         cpu.cycle_counter += 2;
      }
      else if (reg_code === 7)
         cpu.a = (cpu.a & (0xff & ~(1 << bit_number)));
   }
   else
   {
      // SET
      if (reg_code === 0)
         cpu.b = (cpu.b | (0xff & (1 << bit_number)));
      else if (reg_code === 1)
         cpu.c = (cpu.c | (0xff & (1 << bit_number)));
      else if (reg_code === 2)
         cpu.d = (cpu.d | (0xff & (1 << bit_number)));
      else if (reg_code === 3)
         cpu.e = (cpu.e | (0xff & (1 << bit_number)));
      else if (reg_code === 4)
         cpu.h = (cpu.h | (0xff & (1 << bit_number)));
      else if (reg_code === 5)
         cpu.l = (cpu.l | (0xff & (1 << bit_number)));
      else if (reg_code === 6)
      {
         cpu.core.mem_write(cpu.l | (cpu.h << 8),
                            cpu.core.mem_read(cpu.l | (cpu.h << 8)) | (0xff & (1 << bit_number)));
         cpu.cycle_counter += 2;
      }
      else if (reg_code === 7)
         cpu.a = (cpu.a | (0xff & (1 << bit_number)));
   }

   cpu.cycle_counter += 2;
};

// 0xcc : CALL Z, nn
GBC_cpu.prototype.instructions[0xcc] = function(cpu)
{
   cpu.do_conditional_call(!!cpu.flags.Z);
};

// 0xcd : CALL nn
GBC_cpu.prototype.instructions[0xcd] = function(cpu)
{
   cpu.push_word((cpu.pc + 3) & 0xffff);
   cpu.pc =  cpu.core.mem_read((cpu.pc + 1) & 0xffff) |
            (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8);
   cpu.pc = (cpu.pc - 1) & 0xffff;
};

// 0xce : ADC n
GBC_cpu.prototype.instructions[0xce] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_adc(cpu.core.mem_read(cpu.pc));
};

// 0xcf : RST 08h
GBC_cpu.prototype.instructions[0xcf] = function(cpu)
{
   cpu.do_reset(0x08);
};

// 0xd0 : RET NC
GBC_cpu.prototype.instructions[0xd0] = function(cpu)
{
   cpu.do_conditional_return(!cpu.flags.C);
};

// 0xd1 : POP DE
GBC_cpu.prototype.instructions[0xd1] = function(cpu)
{
   var result = cpu.pop_word();
   cpu.e = result & 0xff;
   cpu.d = (result & 0xff00) >>> 8;
};

// 0xd2 : JP NC, nn
GBC_cpu.prototype.instructions[0xd2] = function(cpu)
{
   cpu.do_conditional_absolute_jump(!cpu.flags.C);
};

// 0xd4 : CALL NC, nn
GBC_cpu.prototype.instructions[0xd4] = function(cpu)
{
   cpu.do_conditional_call(!cpu.flags.C);
};

// 0xd5 : PUSH DE
GBC_cpu.prototype.instructions[0xd5] = function(cpu)
{
   cpu.push_word(cpu.e | (cpu.d << 8));
};

// 0xd6 : SUB n
GBC_cpu.prototype.instructions[0xd6] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_sub(cpu.core.mem_read(cpu.pc));
};

// 0xd7 : RST 10h
GBC_cpu.prototype.instructions[0xd7] = function(cpu)
{
   cpu.do_reset(0x10);
};

// 0xd8 : RET C
GBC_cpu.prototype.instructions[0xd8] = function(cpu)
{
   cpu.do_conditional_return(!!cpu.flags.C);
};

// 0xd9 : RETI
GBC_cpu.prototype.instructions[0xd9] = function(cpu)
{
   cpu.pc = (cpu.pop_word() - 1) & 0xffff;
   cpu.interrupts_enabled = true;
};

// 0xda : JP C, nn
GBC_cpu.prototype.instructions[0xda] = function(cpu)
{
   cpu.do_conditional_absolute_jump(!!cpu.flags.C);
};

// 0xdc : CALL C, nn
GBC_cpu.prototype.instructions[0xdc] = function(cpu)
{
   cpu.do_conditional_call(!!cpu.flags.C);
};

// 0xde : SBC n
GBC_cpu.prototype.instructions[0xde] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_sbc(cpu.core.mem_read(cpu.pc));
};

// 0xdf : RST 18h
GBC_cpu.prototype.instructions[0xdf] = function(cpu)
{
   cpu.do_reset(0x18);
};

// 0xe0 : LDH (n), A
GBC_cpu.prototype.instructions[0xe0] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.core.mem_write(0xff00 | cpu.core.mem_read(cpu.pc), cpu.a);
};

// 0xe1 : POP HL
GBC_cpu.prototype.instructions[0xe1] = function(cpu)
{
   var result = cpu.pop_word();
   cpu.l = result & 0xff;
   cpu.h = (result & 0xff00) >>> 8;
};

// 0xe2 : LD (C), A
GBC_cpu.prototype.instructions[0xe2] = function(cpu)
{
   cpu.core.mem_write(0xff00 | cpu.c, cpu.a);
};

// 0xe5 : PUSH HL
GBC_cpu.prototype.instructions[0xe5] = function(cpu)
{
   cpu.push_word(cpu.l | (cpu.h << 8));
};

// 0xe6 : AND n
GBC_cpu.prototype.instructions[0xe6] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_and(cpu.core.mem_read(cpu.pc));
};

// 0xe7 : RST 20h
GBC_cpu.prototype.instructions[0xe7] = function(cpu)
{
   cpu.do_reset(0x20);
};

// 0xe8 : ADD SP, n
GBC_cpu.prototype.instructions[0xe8] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   
   var operand = cpu.get_signed_displacement(cpu.core.mem_read(cpu.pc)),
       result = (cpu.sp + operand) & 0xffff;

   cpu.flags.C = ((result & 0xff) < (cpu.sp & 0xff)) ? 1 : 0;
   cpu.flags.H = ((result & 0xf) < (cpu.sp & 0xf)) ? 1 : 0;
   cpu.flags.N = 0;
   cpu.flags.Z = 0;
   
   cpu.sp = result;
};

// 0xe9 : JP (HL)
GBC_cpu.prototype.instructions[0xe9] = function(cpu)
{
   cpu.pc = cpu.l | (cpu.h << 8);
   cpu.pc = (cpu.pc - 1) & 0xffff;
};

// 0xea : LD (nn), A
GBC_cpu.prototype.instructions[0xea] = function(cpu)
{
   cpu.core.mem_write(cpu.core.mem_read((cpu.pc + 1) & 0xffff) | 
                      (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8), cpu.a);
   cpu.pc = (cpu.pc + 2) & 0xffff;
};

// 0xee : XOR n
GBC_cpu.prototype.instructions[0xee] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_xor(cpu.core.mem_read(cpu.pc));
};

// 0xef : RST 28h
GBC_cpu.prototype.instructions[0xef] = function(cpu)
{
   cpu.do_reset(0x28);
};

// 0xf0 : LDH A, (n)
GBC_cpu.prototype.instructions[0xf0] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.a = cpu.core.mem_read(0xff00 | cpu.core.mem_read(cpu.pc));
};

// 0xf1 : POP AF
GBC_cpu.prototype.instructions[0xf1] = function(cpu)
{
   var result = cpu.pop_word();
   cpu.set_flags_register(result & 0xff);
   cpu.a = (result & 0xff00) >>> 8;
};

// 0xf2 : LD A, (C)
GBC_cpu.prototype.instructions[0xf2] = function(cpu)
{
   cpu.a = cpu.core.mem_read(0xff00 | cpu.c);
};

// 0xf3 : DI
GBC_cpu.prototype.instructions[0xf3] = function(cpu)
{
   // DI takes effect after the next instruction, not immediately.
   cpu.do_delayed_di = true;
};

// 0xf5 : PUSH AF
GBC_cpu.prototype.instructions[0xf5] = function(cpu)
{
   cpu.push_word(cpu.get_flags_register() | (cpu.a << 8));
};

// 0xf6 : OR n
GBC_cpu.prototype.instructions[0xf6] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_or(cpu.core.mem_read(cpu.pc));
};

// 0xf7 : RST 30h
GBC_cpu.prototype.instructions[0xf7] = function(cpu)
{
   cpu.do_reset(0x30);
};

// 0xf8 : LD HL, SP+n
GBC_cpu.prototype.instructions[0xf8] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;

   var operand = cpu.get_signed_displacement(cpu.core.mem_read(cpu.pc)),
       result = cpu.sp + operand;
   
   cpu.l = result & 0xff;
   cpu.h = (result & 0xff00) >>> 8;
   
   cpu.flags.C = ((result & 0xff) < (cpu.sp & 0xff)) ? 1 : 0;
   cpu.flags.H = ((result & 0xf) < (cpu.sp & 0xf)) ? 1 : 0;
   cpu.flags.Z = 0;
   cpu.flags.N = 0;
};

// 0xf9 : LD SP, HL
GBC_cpu.prototype.instructions[0xf9] = function(cpu)
{
   cpu.sp = cpu.l | (cpu.h << 8);
};

// 0xfa : LD A, (nn)
GBC_cpu.prototype.instructions[0xfa] = function(cpu)
{
   cpu.a = cpu.core.mem_read(cpu.core.mem_read((cpu.pc + 1) & 0xffff) | 
                             (cpu.core.mem_read((cpu.pc + 2) & 0xffff) << 8));
   cpu.pc = (cpu.pc + 2) & 0xffff;
};

// 0xfb : EI
GBC_cpu.prototype.instructions[0xfb] = function(cpu)
{
   // EI takes effect after the next instruction, not immediately.
   cpu.do_delayed_ei = true;
};

// 0xfe : CP n
GBC_cpu.prototype.instructions[0xfe] = function(cpu)
{
   cpu.pc = (cpu.pc + 1) & 0xffff;
   cpu.do_cp(cpu.core.mem_read(cpu.pc));
};

// 0xff : RST 38h
GBC_cpu.prototype.instructions[0xff] = function(cpu)
{
   cpu.do_reset(0x38);
};

GBC_cpu.prototype.instructions[0xd3] =
GBC_cpu.prototype.instructions[0xdb] =
GBC_cpu.prototype.instructions[0xdd] =
GBC_cpu.prototype.instructions[0xe3] =
GBC_cpu.prototype.instructions[0xe4] =
GBC_cpu.prototype.instructions[0xeb] =
GBC_cpu.prototype.instructions[0xec] =
GBC_cpu.prototype.instructions[0xed] =
GBC_cpu.prototype.instructions[0xf4] =
GBC_cpu.prototype.instructions[0xfc] =
GBC_cpu.prototype.instructions[0xfd] =
   function(cpu) { console.log("Undefined opcode"); };

GBC_cpu.prototype.cycle_counts = [
   1, 3, 2, 2, 1, 1, 2, 1, 5, 2, 2, 2, 1, 1, 2, 1,
   1, 3, 2, 2, 1, 1, 2, 1, 3, 2, 2, 2, 1, 1, 2, 1,
   2, 3, 2, 2, 1, 1, 2, 1, 2, 2, 2, 2, 1, 1, 2, 1,
   2, 3, 2, 2, 3, 3, 3, 1, 2, 2, 2, 2, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   2, 2, 2, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
   2, 3, 3, 4, 3, 4, 2, 4, 2, 4, 3, 0, 3, 6, 2, 4,
   2, 3, 3, 0, 3, 4, 2, 4, 2, 4, 3, 0, 3, 0, 2, 4,
   3, 3, 2, 0, 0, 4, 2, 4, 4, 1, 4, 0, 0, 0, 2, 4,
   3, 3, 2, 1, 0, 4, 2, 4, 3, 2, 4, 1, 0, 0, 2, 4
];
