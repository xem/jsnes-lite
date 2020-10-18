// NES
var NES = {
  
  // Load a ROM file
  // data: ROM file read as binary string
  load_rom: data => { 
    ROM.load_rom(data);
    Mapper.load_rom();
  },

  // Resets the system
  reset: () => {
    if(NES.mmap !== null){
      Mapper.reset();
    }

    NES.cpu.reset();
    NES.ppu.reset();
    NES.papu.reset();

    NES.lastFpsTime = null;
    
    // Send reset (IRQ) interrupt
    NES.cpu.requestIrq(NES.cpu.IRQ_RESET);
  },

  frame: () => {
    NES.ppu.startFrame();
    var cycles = 0;
    var emulateSound = NES.opts.emulateSound;
    var cpu = NES.cpu;
    var ppu = NES.ppu;
    var papu = NES.papu;
    FRAMELOOP: for(;;){
      if(cpu.cyclesToHalt === 0){
        // Execute a CPU instruction
        cycles = cpu.emulate();
        if(emulateSound){
          papu.clockFrameCounter(cycles);
        }
        cycles *= 3;
      } else {
        if(cpu.cyclesToHalt > 8){
          cycles = 24;
          if(emulateSound){
            papu.clockFrameCounter(8);
          }
          cpu.cyclesToHalt -= 8;
        } else {
          cycles = cpu.cyclesToHalt * 3;
          if(emulateSound){
            papu.clockFrameCounter(cpu.cyclesToHalt);
          }
          cpu.cyclesToHalt = 0;
        }
      }

      for(; cycles > 0; cycles--){
        if(
          ppu.curX === ppu.spr0HitX &&
          ppu.f_spVisibility === 1 &&
          ppu.scanline - 21 === ppu.spr0HitY
        ){
          // Set sprite 0 hit flag:
          ppu.setStatusFlag(ppu.STATUS_SPRITE0HIT, true);
        }

        if(ppu.requestEndFrame){
          ppu.nmiCounter--;
          if(ppu.nmiCounter === 0){
            ppu.requestEndFrame = false;
            ppu.startVBlank();
            break FRAMELOOP;
          }
        }

        ppu.curX++;
        if(ppu.curX === 341){
          ppu.curX = 0;
          ppu.endScanline();
        }
      }
    }
  },
  
  init: opts => {
    NES.opts = {
      onFrame: function(){},
      onAudioSample: null,
      onStatusUpdate: function(){},
      onBatteryRamWrite: function(){},

      // FIXME: not actually used except for in PAPU
      preferredFrameRate: 60,

      emulateSound: true,
      sampleRate: 44100 // Sound sample rate in hz
    };
    if(typeof opts !== "undefined"){
      var key;
      for(key in NES.opts){
        if(typeof opts[key] !== "undefined"){
          NES.opts[key] = opts[key];
        }
      }
    }

    NES.frameTime = 1000 / NES.opts.preferredFrameRate;

    NES.ui = {
      writeFrame: NES.opts.onFrame,
      updateStatus: NES.opts.onStatusUpdate
    };
    NES.cpu = new CPU(NES);
    NES.ppu = new PPU(NES);
    NES.papu = new PAPU(NES);
    NES.mmap = null; // set in load_rom()
    NES.controllers = {
      1: new Controller(),
      2: new Controller()
    };
  }
}