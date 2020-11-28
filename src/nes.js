// Jsnes-lite API
// ==============

// This file exposes six functions that help handle the inputs and outputs of the emulator:
// - NES.init({onFrame, onAudioSample,onBatteryRamWrite})
// - NES.load_rom(data)
// - NES.reset()
// - NES.frame()
// - NES.buttonDown(controller, button)
// - NES.buttonUp(controller, button)
var NES = {
  
  // Initialize the emulator
  init: options => {
    
    // Frame handler
    NES.onFrame = options.onFrame;
    NES.preferredFrameRate = 60;  // frames per second
    NES.frameTime = 16.67;        // ms per frame
    
    // Audio handler
    NES.onAudioSample = options.onAudioSample;
    NES.sampleRate = 44100;
    
    // Logs
    NES.onStatusUpdate = options.onStatusUpdate;
    
    // Save slot
    NES.onBatteryRamWrite = options.onBatteryRamWrite;
    
    // Controllers
    NES.controllers = {
      1: new Controller(),
      2: new Controller()
    };

    NES.cpu_cycles = 0;
    
    // Memory map (handled by the mapper)
    //NES.mmap = null;
  },
  
  // Load a ROM file
  // data: binary string
  load_rom: data => {
    
    // Parse the ROM
    ROM.load_rom(data);
    
    // Add the right ROM banks to the CPU's memory
    Mapper.load_rom();
  },

  // Boot or reset the system
  reset: () => {
    
    // Reset CPU, PPU, APU
    CPU.reset();
    PPU.reset();
    APU.reset();
    
    // Send reset (IRQ) interrupt to the CPU
    CPU.requestIrq(CPU.RESET);
  },

  // Render a new frame
  frame: () => {
    
    var cycles;
    NES.cpu_cycles = 0;
    
    // Repeatedly execute CPU instructions until the frame is rendered
    // On NTSC systems, the CPU executes a maximum of 29,781 cycles per frame,
    // equivalent to 89,342 dots rendered by the PPU (3x more)
    // On PAL, it's 33,248 for the CPU and 106,392 for the PPU (3.2x more) because VBlank is bigger
    while(NES.cpu_cycles < 29781){
      
      // Execute a CPU instruction, count elapsed CPU cycles
      cycles = CPU.emulate();
      NES.cpu_cycles += cycles;
      //console.log("emulate");
      
      // execute 3 PPU cycles and 1 APU cycle for each CPU tick
      for(var i = 0; i < cycles; i++){
        CPU.tick();
      }
    }
    PPU.drawVram();
  },
  
  buttonDown: (controller, button) => {
    NES.controllers[controller].buttonDown(button);
  },

  buttonUp: (controller, button) => {
    NES.controllers[controller].buttonUp(button);
  }
}