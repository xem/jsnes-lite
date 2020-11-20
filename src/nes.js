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

    // Memory map (handled by the mapper)
    NES.mmap = null;
    
    // Controllers
    NES.controllers = {
      1: new Controller(),
      2: new Controller()
    };
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
    
    // Begin a new frame
    PPU.startFrame();
    
    // Count CPU/PPU cycles
    var cpu_cycles = 0;
    var ppu_cycles = 0;
    
    // Loop until a VBlank is detected or limit of cycles per frame exceeded
    loop: for(;;){
      
      // If CPU is not halted
      if(!CPU.halt_cycles){
        
        // Execute a CPU instruction, count remaining CPU cycles
        cpu_cycles = CPU.emulate();
        
        // Clock the APU
        APU.clockFrameCounter(cpu_cycles);
      } 
      
      // If CPU is halted for more than 8 cycles
      else if(CPU.halt_cycles > 8){
        
        // Clock the APU for 8 cycles
        APU.clockFrameCounter(8);
        
        // Advance 8 CPU cycles
        CPU.halt_cycles -= 8;
      }
      
      // If CPU is halted for 1-8 cycles
      else {
        
        // Clock the APU for the remaining number of cycles
        APU.clockFrameCounter(CPU.halt_cycles);
        
        // Un-halt the CPU
        CPU.halt_cycles = 0;
      }

      // Clock the PPU according to the number of CPU cycles executed
      // The PPU executes 3 cycles for each CPU cycle  
      for(ppu_cycles = cpu_cycles * 3; ppu_cycles > 0; ppu_cycles--){

        // Handle Sprite 0 hit
        if(PPU.curX === PPU.spr0HitX && PPU.f_spVisibility === 1 && PPU.scanline - 21 === PPU.spr0HitY){
          PPU.setStatusFlag(PPU.STATUS_SPRITE0HIT, true);
        }

        // Handle VBlank request (end of current frame)
        if(PPU.requestEndFrame){
          PPU.nmiCounter--;
          if(PPU.nmiCounter === 0){
            PPU.requestEndFrame = false;
            PPU.startVBlank();
            break loop;
          }
        }

        // The NES renders a pixel per PPU cycle
        // At the end of each scanline (340px), a new line starts
        PPU.curX++;
        if(PPU.curX > 340){
          PPU.curX = 0;
          PPU.endScanline();
        }
      }
    }
  },
  
  buttonDown: (controller, button) => {
    NES.controllers[controller].buttonDown(button);
  },

  buttonUp: (controller, button) => {
    NES.controllers[controller].buttonUp(button);
  }
}