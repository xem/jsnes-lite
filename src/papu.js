var
frameCounter_M,
frameCounter_I,
square1timerlow,
square1timerhigh,
square1clockLengthCounter,
square1clockEnvDecay,

set_4000 = (value) => {
  // this.dutyMode = (value >> 6) & 0x3;
  square1duty = value >> 6;
  
  // this.envDecayLoopEnable = (value & 0x20) !== 0;
  // square1lengthCounterEnable = (value & 0x20) === 0;
  square1lengthhalt = (value >> 5) & 0b1;
  
  // this.envDecayDisable = (value & 0x10) !== 0;
  square1constant = (value >> 4) & 0b1;
  
  // this.envDecayRate = value & 0xf;
  square1volume = value & 0b1111;
  
  if(square1constant){
    square1masterVolume = square1volume;
  } else {
    square1masterVolume = square1envVolume;
  }
  square1updateSampleValue();
},

set_4001 = (value) => {

  // this.sweepActive = (value & 0x80) !== 0;
  square1enabled = value >> 7;

  // this.sweepCounterMax = (value >> 4) & 7;
  square1period = (value >> 4) & 0b111;

  // this.sweepMode = (value >> 3) & 1;
  square1negate = (value >> 3) & 0b1;

  // this.sweepShiftAmount = value & 7;
  square1shift = value & 0b111;
  
  square1updateSweepPeriod = true;
},

set_4002 = (value) => {
  // Programmable timer:
  // this.progTimerMax &= 0x700;
  // this.progTimerMax |= value;
  square1timerlow = value;
  square1timer = square1timerhigh << 8 + square1timerlow;
},

set_4003 = (value) => {
  
  // this.progTimerMax &= 0xff;
  // this.progTimerMax |= (value & 0x7) << 8;
  square1timerhigh = value & 0b111;
  square1timer = square1timerhigh << 8 + square1timerlow;

  if(square1enabled){
    square1lengthCounter = APU.getLengthMax(value & 0xf8);
  }

  // this.envReset = true;
  
  square1lengthload = value >> 3;
},


set_4015 = (value) => {
  //console.log(0x4015.toString(16), value.toString(16));
  
  square1setEnabled((value & 0b00001));  // Bit 0: enable square channel 1
  //APU.square2.setEnabled((value & 0b00010));  // Bit 1: enable square channel 2
                                              // Bit 2: enable triangle channel
                                              // Bit 3: enable noise channel
                                              // Bit 4: enable DMC channel
},

// $4017 (write): set APU Frame Counter
// Generates clocks for each sound channel and an optional 60Hz interrupt
set_4017 = (value) => {
  //console.log(0x4017.toString(16), value.toString(16));
  
  frameCounter_M = (value >> 7) & 0b1;  // Bit 7: Sequencer mode (0: 4-step, 1: 5-step)
  frameCounter_I = (value >> 6) & 0b1;  // Bit 6: interrupt inhibit flag
  
  APU.masterFrameCounter = 0;
  APU.frameIrqActive = false;


  if(frameCounter_M === 0){
    APU.frameIrqCounterMax = 4;
    APU.derivedFrameCounter = 4;
  } else {
    APU.frameIrqCounterMax = 5;
    APU.derivedFrameCounter = 0;
    APU.frameCounterTick();
  }
};


var CPU_FREQ_NTSC = 1789772.5; //1789772.72727272d;
// var CPU_FREQ_PAL = 1773447.4;

// APU
// ====

var APU = {
  frameIrqCounter: null,
  frameIrqCounterMax: 4,
  //initCounter: 2048,
  //channelEnableValue: null,
  sampleRate: 44100,
  lengthLookup: null,
  dmcFreqLookup: null,
  noiseWavelengthLookup: null,
  square_table: null,
  tnd_table: null,
  //frameIrqEnabled: false,
  frameIrqActive: null,
  frameClockNow: null,
  startedPlaying: false,
  recordOutput: false,
  //initingHardware: false,
  masterFrameCounter: null,
  derivedFrameCounter: null,
  countSequence: null,
  sampleTimer: null,
  frameTime: null,
  sampleTimerMax: null,
  sampleCount: null,
  triValue: 0,
  smpSquare1: null,
  smpSquare2: null,
  smpTriangle: null,
  smpDmc: null,
  accCount: null,
  prevSampleL: 0,
  prevSampleR: 0,
  smpAccumL: 0,
  smpAccumR: 0,
  dacRange: 0,
  dcValue: 0,
  masterVolume: 256,
  stereoPosLSquare1: null,
  stereoPosLSquare2: null,
  stereoPosLTriangle: null,
  stereoPosLNoise: null,
  stereoPosLDMC: null,
  stereoPosRSquare1: null,
  stereoPosRSquare2: null,
  stereoPosRTriangle: null,
  stereoPosRNoise: null,
  stereoPosRDMC: null,
  extraCycles: null,
  maxSample: null,
  minSample: null,
  panning: [80, 170, 100, 150, 128],
  
  reset: () => {
    APU.sampleRate = NES.sampleRate;
    APU.sampleTimerMax = Math.floor(
      (1024.0 * CPU_FREQ_NTSC * NES.preferredFrameRate) /
        (APU.sampleRate * 60.0)
    );

    APU.frameTime = Math.floor(
      (14915.0 * NES.preferredFrameRate) / 60.0
    );
    
    square1 = new ChannelSquare(this, true);
    APU.square2 = new ChannelSquare(this, false);
  
    APU.setPanning(APU.panning);
    APU.initLengthLookup();
    //APU.initDmcFrequencyLookup();
    //APU.initNoiseWavelengthLookup();
    APU.initDACtables();
  
    // Init sound registers:
    for(var i = 0; i < 0x14; i++){
      if(i === 0x10){
        APU.writeReg(0x4010, 0x10);
      } else {
        APU.writeReg(0x4000 + i, 0);
      }
    }

    APU.sampleTimer = 0;

    //APU.updateChannelEnable(0);
    APU.masterFrameCounter = 0;
    APU.derivedFrameCounter = 0;
    //frameCounter_M = 0;
    APU.sampleCount = 0;
    //APU.initCounter = 2048;
    APU.frameIrqEnabled = false;
    //APU.initingHardware = false;

    APU.resetCounter();

    square1reset();
    //APU.square2.reset();

    APU.accCount = 0;
    APU.smpSquare1 = 0;
    //APU.smpSquare2 = 0;

    APU.frameIrqEnabled = false;
    APU.frameIrqCounterMax = 4;

    //APU.channelEnableValue = 0xff;
    APU.startedPlaying = false;
    APU.prevSampleL = 0;
    APU.prevSampleR = 0;
    APU.smpAccumL = 0;
    APU.smpAccumR = 0;

    APU.maxSample = -500000;
    APU.minSample = 500000;
  },

  // Clock one APU cycle
  // The APU has some events happening 120Hz or 240hz (NTSC) / 96 or 192Hz (PAL)
  // Every 14,915 CPU cycles, the 120Hz counter increases, and the 240Hz counter increases twice
  tick: () => {
    // TODO
  },
  
  // eslint-disable-next-line no-unused-vars
  readReg: address => {
    // Read 0x4015:
    var tmp = 0;
    tmp |= square1getLengthStatus();
    //tmp |= APU.square2.getLengthStatus() << 1;
    tmp |= (APU.frameIrqActive && !frameCounter_I ? 1 : 0) << 6;

    APU.frameIrqActive = false;
    APU.dmc.irqGenerated = false;

    return tmp & 0xffff;
  },

  writeReg: (address, value) => {
    if(address >= 0x4000 && address < 0x4004){
      // Square Wave 1 Control
      //square1writeReg(address, value);
      // console.log("Square Write");
    } else if(address >= 0x4004 && address < 0x4008){
      // Square 2 Control
      //APU.square2.writeReg(address, value);
    }
  },

  resetCounter: () => {
    if(frameCounter_M === 0){
      APU.derivedFrameCounter = 4;
    } else {
      APU.derivedFrameCounter = 0;
    }
  },

  // Clocks the frame counter. It should be clocked at
  // twice the cpu speed, so the cycles will be
  // divided by 2 for those counters that are
  // clocked at cpu speed.
  clockFrameCounter: nCycles => {
    /*if(APU.initCounter > 0){
      if(APU.initingHardware){
        APU.initCounter -= nCycles;
        if(APU.initCounter <= 0){
          APU.initingHardware = false;
        }
        return;
      }
    }*/

    // Don't process ticks beyond next sampling:
    nCycles += APU.extraCycles;
    var maxCycles = APU.sampleTimerMax - APU.sampleTimer;
    if(nCycles << 10 > maxCycles){
      APU.extraCycles = ((nCycles << 10) - maxCycles) >> 10;
      nCycles -= APU.extraCycles;
    } else {
      APU.extraCycles = 0;
    }

    var square1 = square1;
    //var square2 = APU.square2;


    // Clock Square channel 1 Prog timer:
    square1progTimerCount -= nCycles;
    if(square1progTimerCount <= 0){
      square1progTimerCount += (square1timer + 1) << 1;

      square1squareCounter++;
      square1squareCounter &= 0x7;
      square1updateSampleValue();
    }

    // Clock Square channel 2 Prog timer:
    /*square2.progTimerCount -= nCycles;
    if(square2.progTimerCount <= 0){
      square2.progTimerCount += (square2.progTimerMax + 1) << 1;

      square2.squareCounter++;
      square2.squareCounter &= 0x7;
      square2.updateSampleValue();
    }*/

    // Clock noise channel Prog timer:
    var acc_c = nCycles;

    // Frame IRQ handling:
    if(!frameCounter_I && APU.frameIrqActive){
      /*if(!interrupt_requested)*/ interrupt_requested = 3;
    }

    // Clock frame counter at double CPU speed:
    APU.masterFrameCounter += nCycles << 1;
    if(APU.masterFrameCounter >= APU.frameTime){
      // 240Hz tick:
      APU.masterFrameCounter -= APU.frameTime;
      APU.frameCounterTick();
    }

    // Accumulate sample value:
    APU.accSample(nCycles);

    // Clock sample timer:
    APU.sampleTimer += nCycles << 10;
    if(APU.sampleTimer >= APU.sampleTimerMax){
      // Sample channels:
      APU.sample();
      APU.sampleTimer -= APU.sampleTimerMax;
    }
  },

  accSample: cycles => {
    

    // Now sample normally:
    if(cycles === 2){
      APU.smpSquare1 += square1sampleValue << 1;
      //APU.smpSquare2 += APU.square2.sampleValue << 1;
      APU.accCount += 2;
    } else if(cycles === 4){
      APU.smpSquare1 += square1sampleValue << 2;
      //APU.smpSquare2 += APU.square2.sampleValue << 2;
      APU.accCount += 4;
    } else {
      APU.smpSquare1 += cycles * square1sampleValue;
      //APU.smpSquare2 += cycles * APU.square2.sampleValue;
      APU.accCount += cycles;
    }
  },

  frameCounterTick: () => {
    APU.derivedFrameCounter++;
    if(APU.derivedFrameCounter >= APU.frameIrqCounterMax){
      APU.derivedFrameCounter = 0;
    }

    if(APU.derivedFrameCounter === 1 || APU.derivedFrameCounter === 3){
      // Clock length & sweep:
      square1clockLengthCounter();
      //APU.square2.clockLengthCounter();
      square1clockSweep();
      //APU.square2.clockSweep();
    }

    if(APU.derivedFrameCounter >= 0 && APU.derivedFrameCounter < 4){
      // Clock linear & decay:
      square1clockEnvDecay();
      //APU.square2.clockEnvDecay();
    }

    if(APU.derivedFrameCounter === 3 && frameCounter_M === 0){
      // Enable IRQ:
      APU.frameIrqActive = true;
    }

    // End of 240Hz tick
  },

  // Samples the channels, mixes the output together, then writes to buffer.
  sample: () => {
    var sq_index, tnd_index;

    if(APU.accCount > 0){
      APU.smpSquare1 <<= 4;
      APU.smpSquare1 = Math.floor(APU.smpSquare1 / APU.accCount);

      //APU.smpSquare2 <<= 4;
      //APU.smpSquare2 = Math.floor(APU.smpSquare2 / APU.accCount);

      APU.accCount = 0;
    } else {
      APU.smpSquare1 = square1sampleValue << 4;
      //APU.smpSquare2 = APU.square2.sampleValue << 4;
    }

    // Stereo sound.

    // Left channel:
    sq_index =
      (APU.smpSquare1 * APU.stereoPosLSquare1 +
        0);/*APU.smpSquare2 * APU.stereoPosLSquare2) >>
      8*/
    tnd_index = 0;
    if(sq_index >= APU.square_table.length){
      sq_index = APU.square_table.length - 1;
    }
    if(tnd_index >= APU.tnd_table.length){
      tnd_index = APU.tnd_table.length - 1;
    }
    var sampleValueL =
      APU.square_table[sq_index] + APU.tnd_table[tnd_index] - APU.dcValue;

    // Right channel:
    sq_index =
      (APU.smpSquare1 * APU.stereoPosRSquare1 +
        0);/*APU.smpSquare2 * APU.stereoPosRSquare2) >>
      8*/
    tnd_index = 0;
    if(sq_index >= APU.square_table.length){
      sq_index = APU.square_table.length - 1;
    }
    if(tnd_index >= APU.tnd_table.length){
      tnd_index = APU.tnd_table.length - 1;
    }
    var sampleValueR =
      APU.square_table[sq_index] + APU.tnd_table[tnd_index] - APU.dcValue;

    // Remove DC from left channel:
    var smpDiffL = sampleValueL - APU.prevSampleL;
    APU.prevSampleL += smpDiffL;
    APU.smpAccumL += smpDiffL - (APU.smpAccumL >> 10);
    sampleValueL = APU.smpAccumL;

    // Remove DC from right channel:
    var smpDiffR = sampleValueR - APU.prevSampleR;
    APU.prevSampleR += smpDiffR;
    APU.smpAccumR += smpDiffR - (APU.smpAccumR >> 10);
    sampleValueR = APU.smpAccumR;

    // Write:
    if(sampleValueL > APU.maxSample){
      APU.maxSample = sampleValueL;
    }
    if(sampleValueL < APU.minSample){
      APU.minSample = sampleValueL;
    }

    if(NES.onAudioSample){
      NES.onAudioSample(sampleValueL / 32768, sampleValueR / 32768);
    }

    // Reset sampled values:
    APU.smpSquare1 = 0;
    //APU.smpSquare2 = 0;
  },

  getLengthMax: value => {
    return APU.lengthLookup[value >> 3];
  },

  setPanning: pos => {
    for(var i = 0; i < 5; i++){
      APU.panning[i] = pos[i];
    }
    APU.updateStereoPos();
  },

  setMasterVolume: value => {
    if(value < 0){
      value = 0;
    }
    if(value > 256){
      value = 256;
    }
    APU.masterVolume = value;
    APU.updateStereoPos();
  },

  updateStereoPos: () => {
    APU.stereoPosLSquare1 = (APU.panning[0] * APU.masterVolume) >> 8;
    APU.stereoPosLSquare2 = (APU.panning[1] * APU.masterVolume) >> 8;

    APU.stereoPosRSquare1 = APU.masterVolume - APU.stereoPosLSquare1;
    //APU.stereoPosRSquare2 = APU.masterVolume - APU.stereoPosLSquare2;
  },

  initLengthLookup: () => {
    // prettier-ignore
    APU.lengthLookup = [
            0x0A, 0xFE,
            0x14, 0x02,
            0x28, 0x04,
            0x50, 0x06,
            0xA0, 0x08,
            0x3C, 0x0A,
            0x0E, 0x0C,
            0x1A, 0x0E,
            0x0C, 0x10,
            0x18, 0x12,
            0x30, 0x14,
            0x60, 0x16,
            0xC0, 0x18,
            0x48, 0x1A,
            0x10, 0x1C,
            0x20, 0x1E
        ];
  },

  initDACtables: () => {
    var value, ival, i;
    var max_sqr = 0;
    var max_tnd = 0;

    APU.square_table = new Array(32 * 16);
    APU.tnd_table = new Array(204 * 16);

    for(i = 0; i < 32 * 16; i++){
      value = 95.52 / (8128.0 / (i / 16.0) + 100.0);
      value *= 0.98411;
      value *= 50000.0;
      ival = Math.floor(value);

      APU.square_table[i] = ival;
      if(ival > max_sqr){
        max_sqr = ival;
      }
    }

    for(i = 0; i < 204 * 16; i++){
      value = 163.67 / (24329.0 / (i / 16.0) + 100.0);
      value *= 0.98411;
      value *= 50000.0;
      ival = Math.floor(value);

      APU.tnd_table[i] = ival;
      if(ival > max_tnd){
        max_tnd = ival;
      }
    }

    APU.dacRange = max_sqr + max_tnd;
    APU.dcValue = APU.dacRange / 2;
  }
};

dutyLookup = [
  0, 1, 0, 0, 0, 0, 0, 0,
  0, 1, 1, 0, 0, 0, 0, 0,
  0, 1, 1, 1, 1, 0, 0, 0,
  1, 0, 0, 1, 1, 1, 1, 1
];

    
var ChannelSquare = function(papu, square1){
  this.papu = papu;

  //this.sqr1 = square1;
  square1enabled = null;
  //square1lengthCounterEnable = null;
  square1enabled = null;
  square1constant = null;
  square1lengthhalt = null;
  square1envReset = null;
  square1sweepCarry = null;
  square1updateSweepPeriod = null;

  square1progTimerCount = null;
  square1timer = null;
  square1lengthCounter = null;
  square1squareCounter = null;
  square1sweepCounter = null;
  square1period = null;
  square1negate = null;
  square1shift = null;
  square1volume = null;
  square1envDecayCounter = null;
  square1envVolume = null;
  square1masterVolume = null;
  square1dutyMode = null;
  square1sweepResult = null;
  square1sampleValue = null;
  square1vol = null;

  square1reset();
};

ChannelSquare.prototype = {

  writeReg: function(address, value){
    var addrAdd = square1sqr1 ? 0 : 4;
    if(address === 0x4000 + addrAdd){
      /*// Volume/Envelope decay:
      square1constant = (value & 0x10) !== 0;
      square1volume = value & 0xf;
      square1lengthhalt = (value & 0x20) !== 0;
      square1duty = (value >> 6) & 0x3;
      square1lengthCounterEnable = (value & 0x20) === 0;
      if(square1constant){
        square1masterVolume = square1volume;
      } else {
        square1masterVolume = square1envVolume;
      }
      this.updateSampleValue();*/
    } else if(address === 0x4001 + addrAdd){
      //Sweep:
      // square1enabled = (value & 0x80) !== 0;
      // square1period = (value >> 4) & 7;
      // square1negate = (value >> 3) & 1;
      // square1shift = value & 7;
      // this.updateSweepPeriod = true;
    } else if(address === 0x4002 + addrAdd){
      //Programmable timer:
      // square1timer &= 0x700;
      // square1timer |= value;
    } else if(address === 0x4003 + addrAdd){
      // Programmable timer, length counter
      // this.progTimerMax &= 0xff;
      // this.progTimerMax |= (value & 0x7) << 8;

      // if(square1timer){
        // square1lengthCounter = APU.getLengthMax(value & 0xf8);
      // }

      // this.envReset = true;
    }
  },

  
};

square1updateSampleValue = function(){
  if(square1timer && square1lengthCounter > 0 && square1timer > 7){
    if(
      square1negate === 0 &&
      square1timer + (square1timer >> square1shift) > 4095
    ){
      //if(this.sweepCarry){
      square1sampleValue = 0;
    } else {
      square1sampleValue =
        square1masterVolume *
        dutyLookup[(square1duty << 3) + square1squareCounter];
    }
  } else {
    square1sampleValue = 0;
  }
};

square1reset = function(){
  square1progTimerCount = 0;
  square1timer = 0;
  square1lengthCounter = 0;
  square1squareCounter = 0;
  square1sweepCounter = 0;
  square1period = 0;
  square1negate = 0;
  square1shift = 0;
  square1volume = 0;
  square1envDecayCounter = 0;
  square1envVolume = 0;
  square1masterVolume = 0;
  square1dutyMode = 0;
  square1vol = 0;

  square1timer = false;
  //square1lengthCounterEnable = false;
  square1enabled = false;
  square1sweepCarry = false;
  square1constant = false;
  square1lengthhalt = false;
};



square1clockLengthCounter = function(){
  if(!square1lengthhalt && square1lengthCounter > 0){
    square1lengthCounter--;
    if(square1lengthCounter === 0){
      square1updateSampleValue();
    }
  }
};

square1clockEnvDecay = function(){
  if(square1envReset){
    // Reset envelope:
    square1envReset = false;
    square1envDecayCounter = square1volume + 1;
    square1envVolume = 0xf;
  } else if(--square1envDecayCounter <= 0){
    // Normal handling:
    square1envDecayCounter = square1volume + 1;
    if(square1envVolume > 0){
      square1envVolume--;
    } else {
      square1envVolume = square1lengthhalt ? 0xf : 0;
    }
  }

  if(square1constant){
    square1masterVolume = square1volume;
  } else {
    square1masterVolume = square1envVolume;
  }
  square1updateSampleValue();
};

square1clockSweep = function(){
  if(--square1sweepCounter <= 0){
    square1sweepCounter = square1period + 1;
    if(
      square1enabled &&
      square1shift > 0 &&
      square1timer > 7
    ){
      // Calculate result from shifter:
      square1sweepCarry = false;
      if(square1negate === 0){
        square1timer += square1timer >> square1shift;
        if(square1timer > 4095){
          square1timer = 4095;
          square1sweepCarry = true;
        }
      } else {
        square1timer =
          square1timer -
          ((square1timer >> square1shift) -
            (square1sqr1 ? 1 : 0));
      }
    }
  }

  if(square1updateSweepPeriod){
    square1updateSweepPeriod = false;
    square1sweepCounter = square1period + 1;
  }
};


square1setEnabled = function(value){
  square1timer = value;
  if(!value){
    square1lengthCounter = 0;
  }
  square1updateSampleValue();
};

square1getLengthStatus = function(){
  return square1lengthCounter === 0 || !square1timer ? 0 : 1;
};