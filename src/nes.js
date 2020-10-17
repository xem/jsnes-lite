var NES = {
  fpsFrameCount: 0,
  romData: null,

  // Resets the system
  reset: function(){
    if(NES.mmap !== null){
      Mapper.reset();
    }

    NES.cpu.reset();
    NES.ppu.reset();
    NES.papu.reset();

    NES.lastFpsTime = null;
    NES.fpsFrameCount = 0;
    
    // Send reset (IRQ) interrupt
    NES.cpu.requestIrq(NES.cpu.IRQ_RESET);
  },

  frame: function(){
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
    NES.fpsFrameCount++;
  },

  buttonDown: function(controller, button){
    NES.controllers[controller].buttonDown(button);
  },

  buttonUp: function(controller, button){
    NES.controllers[controller].buttonUp(button);
  },

  zapperMove: function(x, y){
    if(!NES.mmap) return;
    Mapper.zapperX = x;
    Mapper.zapperY = y;
  },

  zapperFireDown: function(){
    if(!NES.mmap) return;
    Mapper.zapperFired = true;
  },

  zapperFireUp: function(){
    if(!NES.mmap) return;
    Mapper.zapperFired = false;
  },

  getFPS: function(){
    var now = +new Date();
    var fps = null;
    if(NES.lastFpsTime){
      fps = NES.fpsFrameCount / ((now - NES.lastFpsTime) / 1000);
    }
    NES.fpsFrameCount = 0;
    NES.lastFpsTime = now;
    return fps;
  },

  /*reloadROM: function(){
    if(NES.romData !== null){
      NES.loadROM(NES.romData);
    }
  },*/

  

  setFramerate: function(rate){
    NES.opts.preferredFrameRate = rate;
    NES.frameTime = 1000 / rate;
    NES.papu.setSampleRate(NES.opts.sampleRate, false);
  },

  /*toJSON: function(){
    return {
      romData: NES.romData,
      cpu: NES.cpu.toJSON(),
      mmap: Mapper.toJSON(),
      ppu: NES.ppu.toJSON()
    };
  },

  fromJSON: function(s){
    NES.loadROM(s.romData);
    NES.cpu.fromJSON(s.cpu);
    Mapper.fromJSON(s.mmap);
    NES.ppu.fromJSON(s.ppu);
  }*/
};

NES.init = opts => {
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
  NES.mmap = null; // set in loadROM()
  NES.controllers = {
    1: new Controller(),
    2: new Controller()
  };

  NES.ui.updateStatus("Ready to load a ROM.");

  NES.frame = NES.frame.bind(NES);
  NES.buttonDown = NES.buttonDown.bind(NES);
  NES.buttonUp = NES.buttonUp.bind(NES);
  NES.zapperMove = NES.zapperMove.bind(NES);
  NES.zapperFireDown = NES.zapperFireDown.bind(NES);
  NES.zapperFireUp = NES.zapperFireUp.bind(NES);
};