// CPU
// ===

// Resources:
// - https://wiki.nesdev.com/w/index.php/CPU_unofficial_opcodes
// - https://wiki.nesdev.com/w/index.php/Status_flags
// - http://wiki.nesdev.com/w/index.php/CPU_interrupts
// - https://wiki.nesdev.com/w/index.php/Stack
// - https://www.masswerk.at/6502/6502_instruction_set.html
// - https://problemkaputt.de/everynes.htm#cpu65xxmicroprocessor
// - https://www.npmjs.com/package/dict-tempering
// - http://www.6502.org/tutorials/vflag.html
// - https://retrocomputing.stackexchange.com/questions/145
// - http://forum.6502.org/viewtopic.php?f=8&t=6370

var CPU = {

  // Interrupt types
  IRQ: 0,   // IRQ/BRK
  NMI: 1,   // Non-maskable
  RESET: 2, // Reset

  // Reset the CPU
  reset: () => {
    
    // CPU internal memory (64KB)
    CPU.mem = [];

    // Cycles to wait until next opcode
    CPU.halt_cycles = 0;
    
    // Interrupts
    CPU.interrupt_requested = false;
    CPU.interrupt_type = null;
  },
  
  // Clock 1 CPU cycle
  // During this time, 3 PPU cycles and 1 APU cycles take place
  tick: () => {
    PPU.tick();
    PPU.tick();
    PPU.tick();
    APU.tick();
  },

  // Emulates a single CPU instruction, returns the number of cycles
  emulate: () => {

    // Check interrupts:
    if(CPU.interrupt_requested){
      switch (CPU.interrupt_type){
        case 0: {
          // Normal IRQ:
          if(CPU.I !== 0){
            break;
          }
          op(3);
          break;
        }
        case 1: {
          // NMI:
          //console.log("nmi");
          op(1);
          break;
        }
        case 2: {
          // Reset:
          console.log("reset");
          op(2);
          break;
        }
      }
      CPU.interrupt_requested = false;
    }

    op();

    return c;
  },

  requestIrq: type => {
    if(CPU.interrupt_requested){
      if(type === CPU.IRQ){
        return;
      }
      // console.log("too fast irqs. type="+type);
    }
    CPU.interrupt_requested = true;
    CPU.interrupt_type = type;
  },

  haltCycles: cycles => {
    CPU.halt_cycles += cycles;
  },
};