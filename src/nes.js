// Jsnes-lite API
// ==============

// This file exposes six functions that help handle the inputs and outputs of the emulator:
// - NES.start({rom, save, frame, vram, audio})
// - NES.reset()
// - NES.frame()
// - NES.buttonDown(controller, button)
// - NES.buttonUp(controller, button)
var NES = {
  
  // Emulator globals
  loop: null,
  fps: 60,
  frameTime: 1000 / 60,
  cpu_cycles: 0,
  
  // ROM globals
  mapper: 0,
  mirroring: 0,
  prg: [],
  chr: [],
  
  // Graphics globals
  frameCtx: null,
  vramCtx: null,
  frameData: null,
  vramData: null,
  frameBuffer: null,
  vramBuffer: null,
  frameBuffer8: null,
  vramBuffer8: null,
  frameBuffer32: null,
  vramBuffer32: null,
  
  // Audio globals
  leftSamples: [],
  rightSamples: [],
  currentSample: 0,
  sampleRate: 44100,
  cyclesToHalt: 0,
  
  // Controllers globals
  controllers: null,
  
  // Mapper globals
  prg_0_bank: 0,
  prg_1_bank: 1,
  chr_bank: 0,
  mirroring_backup: 0,
  
  // Init the emulator with the rom (binary string), optional save file, and the 2 canvases
  init: ({rom, save, frame, vram}) => {

    // Reset emulator
    NES.reset();
    
    // Parse ROM
    NES.parse(rom);
    
    // Load ROM's content in memory according to current mapper
    NES.load();
    
    // Init display
    NES.frameCtx = frame.getContext("2d");
    NES.frameData = NES.frameCtx.getImageData(0, 0, 256, 240);
    NES.frameBuffer = new ArrayBuffer(256 * 240 * 4);
    NES.vramBuffer = new ArrayBuffer(512 * 480 * 4);
    NES.frameBuffer8 = new Uint8Array(NES.frameBuffer);
    NES.frameBuffer32 = new Uint32Array(NES.frameBuffer);
    if(vram){
      NES.vramCtx = vram.getContext("2d");
      NES.vramData = NES.vramCtx.getImageData(0, 0, 512, 480);
      NES.vramBuffer32 = new Uint32Array(NES.vramBuffer);
      NES.vramBuffer8 = new Uint8Array(NES.vramBuffer);
    }
    
    // Init controllers
    NES.controllers = {
      1: new Controller(),
      2: new Controller()
    };
    
    // Controller #1 keys listeners
    onkeydown = onkeyup = e => {
      NES[e.type](
        1,
        {
          37: Controller.BUTTON_LEFT,
          38: Controller.BUTTON_UP,
          39: Controller.BUTTON_RIGHT,
          40: Controller.BUTTON_DOWN,
          88: Controller.BUTTON_A, // X = A
          67: Controller.BUTTON_B, // C = B
          27: Controller.BUTTON_SELECT, // Esc = Select
          13: Controller.BUTTON_START   // Enter = Start
        }[e.keyCode]
      )
    }
  },
  
  // Play
  play: () => {
    NES.loop = setInterval(NES.frame, NES.frameTime);
  },
  
  // Pause
  pause: () => {
    clearInterval(NES.loop);
  },

  // Reset
  reset: () => {
    
    // Stop 60 fps loop (if any)
    NES.pause();
    
    // Reset CPU, PPU, APU
    cpu_reset();
    ppu_reset();
    apu_reset();
    
    // Send reset interrupt to the CPU
    interrupt_requested = 2;
    
    NES.cyclesToHalt = 0;
    
    //NES.cpu_cycles = 0;
  },

  // Render a new frame
  frame: () => {
    
    vramCanvas.width ^= 0;
    
    var cycles;
    totalCycles = 0;
    endFrame = 0;
    
    // Repeatedly execute CPU instructions until the frame is fully rendered
    while(!endFrame){
      //if (NES.cyclesToHalt === 0) {
        cycles = emulate();
      //  APU.clockFrameCounter(cycles);
      //} else {
      //  APU.clockFrameCounter(Math.min(NES.cyclesToHalt, 8));
      //  NES.cyclesToHalt -= Math.min(NES.cyclesToHalt, 8);
      //}

      for (i = cycles; i--;) {
        cpu_tick();
      }
    }
  },
  
  keydown: (controller, button) => {
    NES.controllers[controller].keydown(button);
  },

  keyup: (controller, button) => {
    NES.controllers[controller].keyup(button);
  },
  
  //haltCycles: (cycles) => {
  //  NES.cyclesToHalt += cycles;
  //}
}