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

var
cpu_mem,
interrupt_requested,
clk = 0,

// Reset the CPU
cpu_reset = () => {
    
  // CPU internal memory (64KB)
  cpu_mem = [];
},

// Clock 1 CPU cycle
// During this time, 3 PPU cycles and 1 APU cycle take place
cpu_tick = () => {
  //console.log(clk++);
  ppu_tick();
  ppu_tick();
  ppu_tick();
  //apu_tick();
},

// Emulates a single CPU instruction or interrupt, returns the number of cycles
emulate = () => {

  // Execute the requested interrupt, if any
  if(interrupt_requested){
    
    // 1: NMI
    // 2: Reset
    // 3: IRQ
    op(interrupt_requested);
    
    // Reset interrupt requested flag
    interrupt_requested = 0;
  }

  // Or execute next instruction
  else {
    op();
  }
  
  // Return the number of cycles spent
  return c;
}