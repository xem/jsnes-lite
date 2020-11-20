// CPU
// ===

var CPU = {

  // Interrupt types
  IRQ: 0,   // IRQ/BRK
  NMI: 1,   // Non-maskable
  RESET: 2, // Reset

  // Reset the CPU
  reset: () => {
    
    var i;
    
    // CPU memory map (16kb)
    CPU.mem = [];
    for(i = 0; i < 16 * 1024; i++){
      CPU.mem[i] = 0;
    }

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
          myop(3);
          break;
        }
        case 1: {
          // NMI:
          myop(1);
          break;
        }
        case 2: {
          // Reset:
          myop(2);
          break;
        }
      }
      CPU.interrupt_requested = false;
    }

    myop();

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