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
    
    // Display
    NES.frameCtx = options.frameCanvas.getContext("2d");
    NES.vramCtx = options.vramCanvas.getContext("2d");
    NES.frameData = NES.frameCtx.getImageData(0,0,256,240);
    NES.vramData = NES.vramCtx.getImageData(0,0,512,480);
    NES.frameBuffer = new ArrayBuffer(NES.frameData.data.length);
    NES.vramBuffer = new ArrayBuffer(NES.vramData.data.length);
    NES.frameBuffer8 = new Uint8ClampedArray(NES.frameBuffer);
    NES.vramBuffer8 = new Uint8ClampedArray(NES.vramBuffer);
    NES.frameBuffer32 = new Uint32Array(NES.frameBuffer);
    NES.vramBuffer32 = new Uint32Array(NES.vramBuffer);
    
    NES.preferredFrameRate = 60;  // frames per second
    NES.frameTime = 16.67;        // ms per frame
    
    // Audio
    NES.onAudioSample = options.onAudioSample;
    NES.sampleRate = 48000;
    
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
    parse_rom(data);
    
    // Add the right ROM banks to the CPU's memory
    load_rom();
  },

  // Boot or reset the system
  reset: () => {
    
    // Reset CPU, PPU, APU
    cpu_reset();
    ppu_reset();
    APU.reset();
    
    // Send reset interrupt to the CPU
    interrupt_requested = 2;
  },

  // Render a new frame
  frame: () => {
    
    //NES.vramCtx.clearRect(0,0,512,512);
    vramCanvas.width ^= 0;
    
    var cycles;
    cpu_cycles = 0;
    endFrame = 0;
    
    // Repeatedly execute CPU instructions until the frame is fully rendered
    while(!endFrame){
      
      // Execute a CPU instruction, count elapsed CPU cycles
      cycles = emulate();
      cpu_cycles += cycles;
      //console.log("emulate");
      
      // execute 3 PPU cycles and 1 APU cycle for each CPU tick
      for(var i = 0; i < cycles; i++){
        cpu_tick();
      }
      //APU.clockFrameCounter(cycles/3);
    }
  },
  
  keydown: (controller, button) => {
    NES.controllers[controller].keydown(button);
  },

  keyup: (controller, button) => {
    NES.controllers[controller].keyup(button);
  }
}