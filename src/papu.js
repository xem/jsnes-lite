var CPU_FREQ_NTSC = 1789772.5; //1789772.72727272d;
// var CPU_FREQ_PAL = 1773447.4;

// APU
// ====

var APU = {
  frameIrqCounter: null,
  frameIrqCounterMax: 4,
  initCounter: 2048,
  channelEnableValue: null,
  sampleRate: 44100,
  lengthLookup: null,
  dmcFreqLookup: null,
  noiseWavelengthLookup: null,
  square_table: null,
  tnd_table: null,
  frameIrqEnabled: false,
  frameIrqActive: null,
  frameClockNow: null,
  startedPlaying: false,
  recordOutput: false,
  initingHardware: false,
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
    
    APU.square1 = new ChannelSquare(this, true);
    APU.square2 = new ChannelSquare(this, false);
    APU.triangle = new ChannelTriangle(this);
    APU.noise = new ChannelNoise(this);
    APU.dmc = new ChannelDM(this);
  
    APU.setPanning(APU.panning);
    APU.initLengthLookup();
    APU.initDmcFrequencyLookup();
    APU.initNoiseWavelengthLookup();
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

    APU.updateChannelEnable(0);
    APU.masterFrameCounter = 0;
    APU.derivedFrameCounter = 0;
    APU.countSequence = 0;
    APU.sampleCount = 0;
    APU.initCounter = 2048;
    APU.frameIrqEnabled = false;
    APU.initingHardware = false;

    APU.resetCounter();

    APU.square1.reset();
    APU.square2.reset();
    APU.triangle.reset();
    APU.noise.reset();
    APU.dmc.reset();

    APU.accCount = 0;
    APU.smpSquare1 = 0;
    APU.smpSquare2 = 0;
    APU.smpTriangle = 0;
    APU.smpDmc = 0;

    APU.frameIrqEnabled = false;
    APU.frameIrqCounterMax = 4;

    APU.channelEnableValue = 0xff;
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
    tmp |= APU.square1.getLengthStatus();
    tmp |= APU.square2.getLengthStatus() << 1;
    tmp |= APU.triangle.getLengthStatus() << 2;
    tmp |= APU.noise.getLengthStatus() << 3;
    tmp |= APU.dmc.getLengthStatus() << 4;
    tmp |= (APU.frameIrqActive && APU.frameIrqEnabled ? 1 : 0) << 6;
    tmp |= APU.dmc.getIrqStatus() << 7;

    APU.frameIrqActive = false;
    APU.dmc.irqGenerated = false;

    return tmp & 0xffff;
  },

  writeReg: (address, value) => {
    if(address >= 0x4000 && address < 0x4004){
      // Square Wave 1 Control
      APU.square1.writeReg(address, value);
      // console.log("Square Write");
    } else if(address >= 0x4004 && address < 0x4008){
      // Square 2 Control
      APU.square2.writeReg(address, value);
    } else if(address >= 0x4008 && address < 0x400c){
      // Triangle Control
      APU.triangle.writeReg(address, value);
    } else if(address >= 0x400c && address <= 0x400f){
      // Noise Control
      APU.noise.writeReg(address, value);
    } else if(address === 0x4010){
      // DMC Play mode & DMA frequency
      APU.dmc.writeReg(address, value);
    } else if(address === 0x4011){
      // DMC Delta Counter
      APU.dmc.writeReg(address, value);
    } else if(address === 0x4012){
      // DMC Play code starting address
      APU.dmc.writeReg(address, value);
    } else if(address === 0x4013){
      // DMC Play code length
      APU.dmc.writeReg(address, value);
    } else if(address === 0x4015){
      // Channel enable
      APU.updateChannelEnable(value);

      if(value !== 0 && APU.initCounter > 0){
        // Start hardware initialization
        APU.initingHardware = true;
      }

      // DMC/IRQ Status
      APU.dmc.writeReg(address, value);
    } else if(address === 0x4017){
      // Frame counter control
      APU.countSequence = (value >> 7) & 1;
      APU.masterFrameCounter = 0;
      APU.frameIrqActive = false;

      if(((value >> 6) & 0x1) === 0){
        APU.frameIrqEnabled = true;
      } else {
        APU.frameIrqEnabled = false;
      }

      if(APU.countSequence === 0){
        // NTSC:
        APU.frameIrqCounterMax = 4;
        APU.derivedFrameCounter = 4;
      } else {
        // PAL:
        APU.frameIrqCounterMax = 5;
        APU.derivedFrameCounter = 0;
        APU.frameCounterTick();
      }
    }
  },

  resetCounter: () => {
    if(APU.countSequence === 0){
      APU.derivedFrameCounter = 4;
    } else {
      APU.derivedFrameCounter = 0;
    }
  },

  // Updates channel enable status.
  // This is done on writes to the
  // channel enable register (0x4015),
  // and when the user enables/disables channels
  // in the GUI.
  updateChannelEnable: value => {
    APU.channelEnableValue = value & 0xffff;
    APU.square1.setEnabled((value & 1) !== 0);
    APU.square2.setEnabled((value & 2) !== 0);
    APU.triangle.setEnabled((value & 4) !== 0);
    APU.noise.setEnabled((value & 8) !== 0);
    APU.dmc.setEnabled((value & 16) !== 0);
  },

  // Clocks the frame counter. It should be clocked at
  // twice the cpu speed, so the cycles will be
  // divided by 2 for those counters that are
  // clocked at cpu speed.
  clockFrameCounter: nCycles => {
    if(APU.initCounter > 0){
      if(APU.initingHardware){
        APU.initCounter -= nCycles;
        if(APU.initCounter <= 0){
          APU.initingHardware = false;
        }
        return;
      }
    }

    // Don't process ticks beyond next sampling:
    nCycles += APU.extraCycles;
    var maxCycles = APU.sampleTimerMax - APU.sampleTimer;
    if(nCycles << 10 > maxCycles){
      APU.extraCycles = ((nCycles << 10) - maxCycles) >> 10;
      nCycles -= APU.extraCycles;
    } else {
      APU.extraCycles = 0;
    }

    var dmc = APU.dmc;
    var triangle = APU.triangle;
    var square1 = APU.square1;
    var square2 = APU.square2;
    var noise = APU.noise;

    // Clock DMC:
    if(dmc.isEnabled){
      dmc.shiftCounter -= nCycles << 3;
      while (dmc.shiftCounter <= 0 && dmc.dmaFrequency > 0){
        dmc.shiftCounter += dmc.dmaFrequency;
        dmc.clockDmc();
      }
    }

    // Clock Triangle channel Prog timer:
    if(triangle.progTimerMax > 0){
      triangle.progTimerCount -= nCycles;
      while (triangle.progTimerCount <= 0){
        triangle.progTimerCount += triangle.progTimerMax + 1;
        if(triangle.linearCounter > 0 && triangle.lengthCounter > 0){
          triangle.triangleCounter++;
          triangle.triangleCounter &= 0x1f;

          if(triangle.isEnabled){
            if(triangle.triangleCounter >= 0x10){
              // Normal value.
              triangle.sampleValue = triangle.triangleCounter & 0xf;
            } else {
              // Inverted value.
              triangle.sampleValue = 0xf - (triangle.triangleCounter & 0xf);
            }
            triangle.sampleValue <<= 4;
          }
        }
      }
    }

    // Clock Square channel 1 Prog timer:
    square1.progTimerCount -= nCycles;
    if(square1.progTimerCount <= 0){
      square1.progTimerCount += (square1.progTimerMax + 1) << 1;

      square1.squareCounter++;
      square1.squareCounter &= 0x7;
      square1.updateSampleValue();
    }

    // Clock Square channel 2 Prog timer:
    square2.progTimerCount -= nCycles;
    if(square2.progTimerCount <= 0){
      square2.progTimerCount += (square2.progTimerMax + 1) << 1;

      square2.squareCounter++;
      square2.squareCounter &= 0x7;
      square2.updateSampleValue();
    }

    // Clock noise channel Prog timer:
    var acc_c = nCycles;
    if(noise.progTimerCount - acc_c > 0){
      // Do all cycles at once:
      noise.progTimerCount -= acc_c;
      noise.accCount += acc_c;
      noise.accValue += acc_c * noise.sampleValue;
    } else {
      // Slow-step:
      while (acc_c-- > 0){
        if(--noise.progTimerCount <= 0 && noise.progTimerMax > 0){
          // Update noise shift register:
          noise.shiftReg <<= 1;
          noise.tmp =
            ((noise.shiftReg << (noise.randomMode === 0 ? 1 : 6)) ^
              noise.shiftReg) &
            0x8000;
          if(noise.tmp !== 0){
            // Sample value must be 0.
            noise.shiftReg |= 0x01;
            noise.randomBit = 0;
            noise.sampleValue = 0;
          } else {
            // Find sample value:
            noise.randomBit = 1;
            if(noise.isEnabled && noise.lengthCounter > 0){
              noise.sampleValue = noise.masterVolume;
            } else {
              noise.sampleValue = 0;
            }
          }

          noise.progTimerCount += noise.progTimerMax;
        }

        noise.accValue += noise.sampleValue;
        noise.accCount++;
      }
    }

    // Frame IRQ handling:
    if(APU.frameIrqEnabled && APU.frameIrqActive){
      CPU.requestIrq(CPU.IRQ);
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
    // Special treatment for triangle channel - need to interpolate.
    if(APU.triangle.sampleCondition){
      APU.triValue = Math.floor(
        (APU.triangle.progTimerCount << 4) / (APU.triangle.progTimerMax + 1)
      );
      if(APU.triValue > 16){
        APU.triValue = 16;
      }
      if(APU.triangle.triangleCounter >= 16){
        APU.triValue = 16 - APU.triValue;
      }

      // Add non-interpolated sample value:
      APU.triValue += APU.triangle.sampleValue;
    }

    // Now sample normally:
    if(cycles === 2){
      APU.smpTriangle += APU.triValue << 1;
      APU.smpDmc += APU.dmc.sample << 1;
      APU.smpSquare1 += APU.square1.sampleValue << 1;
      APU.smpSquare2 += APU.square2.sampleValue << 1;
      APU.accCount += 2;
    } else if(cycles === 4){
      APU.smpTriangle += APU.triValue << 2;
      APU.smpDmc += APU.dmc.sample << 2;
      APU.smpSquare1 += APU.square1.sampleValue << 2;
      APU.smpSquare2 += APU.square2.sampleValue << 2;
      APU.accCount += 4;
    } else {
      APU.smpTriangle += cycles * APU.triValue;
      APU.smpDmc += cycles * APU.dmc.sample;
      APU.smpSquare1 += cycles * APU.square1.sampleValue;
      APU.smpSquare2 += cycles * APU.square2.sampleValue;
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
      APU.triangle.clockLengthCounter();
      APU.square1.clockLengthCounter();
      APU.square2.clockLengthCounter();
      APU.noise.clockLengthCounter();
      APU.square1.clockSweep();
      APU.square2.clockSweep();
    }

    if(APU.derivedFrameCounter >= 0 && APU.derivedFrameCounter < 4){
      // Clock linear & decay:
      APU.square1.clockEnvDecay();
      APU.square2.clockEnvDecay();
      APU.noise.clockEnvDecay();
      APU.triangle.clockLinearCounter();
    }

    if(APU.derivedFrameCounter === 3 && APU.countSequence === 0){
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

      APU.smpSquare2 <<= 4;
      APU.smpSquare2 = Math.floor(APU.smpSquare2 / APU.accCount);

      APU.smpTriangle = Math.floor(APU.smpTriangle / APU.accCount);

      APU.smpDmc <<= 4;
      APU.smpDmc = Math.floor(APU.smpDmc / APU.accCount);

      APU.accCount = 0;
    } else {
      APU.smpSquare1 = APU.square1.sampleValue << 4;
      APU.smpSquare2 = APU.square2.sampleValue << 4;
      APU.smpTriangle = APU.triangle.sampleValue;
      APU.smpDmc = APU.dmc.sample << 4;
    }

    var smpNoise = Math.floor((APU.noise.accValue << 4) / APU.noise.accCount);
    APU.noise.accValue = smpNoise >> 4;
    APU.noise.accCount = 1;

    // Stereo sound.

    // Left channel:
    sq_index =
      (APU.smpSquare1 * APU.stereoPosLSquare1 +
        APU.smpSquare2 * APU.stereoPosLSquare2) >>
      8;
    tnd_index =
      (3 * APU.smpTriangle * APU.stereoPosLTriangle +
        (smpNoise << 1) * APU.stereoPosLNoise +
        APU.smpDmc * APU.stereoPosLDMC) >>
      8;
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
        APU.smpSquare2 * APU.stereoPosRSquare2) >>
      8;
    tnd_index =
      (3 * APU.smpTriangle * APU.stereoPosRTriangle +
        (smpNoise << 1) * APU.stereoPosRNoise +
        APU.smpDmc * APU.stereoPosRDMC) >>
      8;
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
    APU.smpSquare2 = 0;
    APU.smpTriangle = 0;
    APU.smpDmc = 0;
  },

  getLengthMax: value => {
    return APU.lengthLookup[value >> 3];
  },

  getDmcFrequency: value => {
    if(value >= 0 && value < 0x10){
      return APU.dmcFreqLookup[value];
    }
    return 0;
  },

  getNoiseWaveLength: value => {
    if(value >= 0 && value < 0x10){
      return APU.noiseWavelengthLookup[value];
    }
    return 0;
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
    APU.stereoPosLTriangle = (APU.panning[2] * APU.masterVolume) >> 8;
    APU.stereoPosLNoise = (APU.panning[3] * APU.masterVolume) >> 8;
    APU.stereoPosLDMC = (APU.panning[4] * APU.masterVolume) >> 8;

    APU.stereoPosRSquare1 = APU.masterVolume - APU.stereoPosLSquare1;
    APU.stereoPosRSquare2 = APU.masterVolume - APU.stereoPosLSquare2;
    APU.stereoPosRTriangle = APU.masterVolume - APU.stereoPosLTriangle;
    APU.stereoPosRNoise = APU.masterVolume - APU.stereoPosLNoise;
    APU.stereoPosRDMC = APU.masterVolume - APU.stereoPosLDMC;
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

  initDmcFrequencyLookup: () => {
    APU.dmcFreqLookup = new Array(16);

    APU.dmcFreqLookup[0x0] = 0xd60;
    APU.dmcFreqLookup[0x1] = 0xbe0;
    APU.dmcFreqLookup[0x2] = 0xaa0;
    APU.dmcFreqLookup[0x3] = 0xa00;
    APU.dmcFreqLookup[0x4] = 0x8f0;
    APU.dmcFreqLookup[0x5] = 0x7f0;
    APU.dmcFreqLookup[0x6] = 0x710;
    APU.dmcFreqLookup[0x7] = 0x6b0;
    APU.dmcFreqLookup[0x8] = 0x5f0;
    APU.dmcFreqLookup[0x9] = 0x500;
    APU.dmcFreqLookup[0xa] = 0x470;
    APU.dmcFreqLookup[0xb] = 0x400;
    APU.dmcFreqLookup[0xc] = 0x350;
    APU.dmcFreqLookup[0xd] = 0x2a0;
    APU.dmcFreqLookup[0xe] = 0x240;
    APU.dmcFreqLookup[0xf] = 0x1b0;
    //for(int i=0;i<16;i++)dmcFreqLookup[i]/=8;
  },

  initNoiseWavelengthLookup: () => {
    APU.noiseWavelengthLookup = new Array(16);

    APU.noiseWavelengthLookup[0x0] = 0x004;
    APU.noiseWavelengthLookup[0x1] = 0x008;
    APU.noiseWavelengthLookup[0x2] = 0x010;
    APU.noiseWavelengthLookup[0x3] = 0x020;
    APU.noiseWavelengthLookup[0x4] = 0x040;
    APU.noiseWavelengthLookup[0x5] = 0x060;
    APU.noiseWavelengthLookup[0x6] = 0x080;
    APU.noiseWavelengthLookup[0x7] = 0x0a0;
    APU.noiseWavelengthLookup[0x8] = 0x0ca;
    APU.noiseWavelengthLookup[0x9] = 0x0fe;
    APU.noiseWavelengthLookup[0xa] = 0x17c;
    APU.noiseWavelengthLookup[0xb] = 0x1fc;
    APU.noiseWavelengthLookup[0xc] = 0x2fa;
    APU.noiseWavelengthLookup[0xd] = 0x3f8;
    APU.noiseWavelengthLookup[0xe] = 0x7f2;
    APU.noiseWavelengthLookup[0xf] = 0xfe4;
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

var ChannelDM = function(papu){
  this.papu = papu;

  this.MODE_NORMAL = 0;
  this.MODE_LOOP = 1;
  this.MODE_IRQ = 2;

  this.isEnabled = null;
  this.hasSample = null;
  this.irqGenerated = false;

  this.playMode = null;
  this.dmaFrequency = null;
  this.dmaCounter = null;
  this.deltaCounter = null;
  this.playStartAddress = null;
  this.playAddress = null;
  this.playLength = null;
  this.playLengthCounter = null;
  this.shiftCounter = null;
  this.reg4012 = null;
  this.reg4013 = null;
  this.sample = null;
  this.dacLsb = null;
  this.data = null;

  this.reset();
};

ChannelDM.prototype = {
  clockDmc: function(){
    // Only alter DAC value if the sample buffer has data:
    if(this.hasSample){
      if((this.data & 1) === 0){
        // Decrement delta:
        if(this.deltaCounter > 0){
          this.deltaCounter--;
        }
      } else {
        // Increment delta:
        if(this.deltaCounter < 63){
          this.deltaCounter++;
        }
      }

      // Update sample value:
      this.sample = this.isEnabled ? (this.deltaCounter << 1) + this.dacLsb : 0;

      // Update shift register:
      this.data >>= 1;
    }

    this.dmaCounter--;
    if(this.dmaCounter <= 0){
      // No more sample bits.
      this.hasSample = false;
      this.endOfSample();
      this.dmaCounter = 8;
    }

    if(this.irqGenerated){
      CPU.requestIrq(CPU.IRQ);
    }
  },

  endOfSample: function(){
    if(this.playLengthCounter === 0 && this.playMode === this.MODE_LOOP){
      // Start from beginning of sample:
      this.playAddress = this.playStartAddress;
      this.playLengthCounter = this.playLength;
    }

    if(this.playLengthCounter > 0){
      // Fetch next sample:
      this.nextSample();

      if(this.playLengthCounter === 0){
        // Last byte of sample fetched, generate IRQ:
        if(this.playMode === this.MODE_IRQ){
          // Generate IRQ:
          this.irqGenerated = true;
        }
      }
    }
  },

  nextSample: function(){
    // Fetch byte:
    this.data = CPU.load(this.playAddress);
    CPU.haltCycles(4);

    this.playLengthCounter--;
    this.playAddress++;
    if(this.playAddress > 0xffff){
      this.playAddress = 0x8000;
    }

    this.hasSample = true;
  },

  writeReg: function(address, value){
    if(address === 0x4010){
      // Play mode, DMA Frequency
      if(value >> 6 === 0){
        this.playMode = this.MODE_NORMAL;
      } else if(((value >> 6) & 1) === 1){
        this.playMode = this.MODE_LOOP;
      } else if(value >> 6 === 2){
        this.playMode = this.MODE_IRQ;
      }

      if((value & 0x80) === 0){
        this.irqGenerated = false;
      }

      this.dmaFrequency = APU.getDmcFrequency(value & 0xf);
    } else if(address === 0x4011){
      // Delta counter load register:
      this.deltaCounter = (value >> 1) & 63;
      this.dacLsb = value & 1;
      this.sample = (this.deltaCounter << 1) + this.dacLsb; // update sample value
    } else if(address === 0x4012){
      // DMA address load register
      this.playStartAddress = (value << 6) | 0x0c000;
      this.playAddress = this.playStartAddress;
      this.reg4012 = value;
    } else if(address === 0x4013){
      // Length of play code
      this.playLength = (value << 4) + 1;
      this.playLengthCounter = this.playLength;
      this.reg4013 = value;
    } else if(address === 0x4015){
      // DMC/IRQ Status
      if(((value >> 4) & 1) === 0){
        // Disable:
        this.playLengthCounter = 0;
      } else {
        // Restart:
        this.playAddress = this.playStartAddress;
        this.playLengthCounter = this.playLength;
      }
      this.irqGenerated = false;
    }
  },

  setEnabled: function(value){
    if(!this.isEnabled && value){
      this.playLengthCounter = this.playLength;
    }
    this.isEnabled = value;
  },

  getLengthStatus: function(){
    return this.playLengthCounter === 0 || !this.isEnabled ? 0 : 1;
  },

  getIrqStatus: function(){
    return this.irqGenerated ? 1 : 0;
  },

  reset: function(){
    this.isEnabled = false;
    this.irqGenerated = false;
    this.playMode = this.MODE_NORMAL;
    this.dmaFrequency = 0;
    this.dmaCounter = 0;
    this.deltaCounter = 0;
    this.playStartAddress = 0;
    this.playAddress = 0;
    this.playLength = 0;
    this.playLengthCounter = 0;
    this.sample = 0;
    this.dacLsb = 0;
    this.shiftCounter = 0;
    this.reg4012 = 0;
    this.reg4013 = 0;
    this.data = 0;
  }
};

var ChannelNoise = function(papu){
  this.papu = papu;

  this.isEnabled = null;
  this.envDecayDisable = null;
  this.envDecayLoopEnable = null;
  this.lengthCounterEnable = null;
  this.envReset = null;
  this.shiftNow = null;

  this.lengthCounter = null;
  this.progTimerCount = null;
  this.progTimerMax = null;
  this.envDecayRate = null;
  this.envDecayCounter = null;
  this.envVolume = null;
  this.masterVolume = null;
  this.shiftReg = 1 << 14;
  this.randomBit = null;
  this.randomMode = null;
  this.sampleValue = null;
  this.accValue = 0;
  this.accCount = 1;
  this.tmp = null;

  this.reset();
};

ChannelNoise.prototype = {
  reset: function(){
    this.progTimerCount = 0;
    this.progTimerMax = 0;
    this.isEnabled = false;
    this.lengthCounter = 0;
    this.lengthCounterEnable = false;
    this.envDecayDisable = false;
    this.envDecayLoopEnable = false;
    this.shiftNow = false;
    this.envDecayRate = 0;
    this.envDecayCounter = 0;
    this.envVolume = 0;
    this.masterVolume = 0;
    this.shiftReg = 1;
    this.randomBit = 0;
    this.randomMode = 0;
    this.sampleValue = 0;
    this.tmp = 0;
  },

  clockLengthCounter: function(){
    if(this.lengthCounterEnable && this.lengthCounter > 0){
      this.lengthCounter--;
      if(this.lengthCounter === 0){
        this.updateSampleValue();
      }
    }
  },

  clockEnvDecay: function(){
    if(this.envReset){
      // Reset envelope:
      this.envReset = false;
      this.envDecayCounter = this.envDecayRate + 1;
      this.envVolume = 0xf;
    } else if(--this.envDecayCounter <= 0){
      // Normal handling:
      this.envDecayCounter = this.envDecayRate + 1;
      if(this.envVolume > 0){
        this.envVolume--;
      } else {
        this.envVolume = this.envDecayLoopEnable ? 0xf : 0;
      }
    }
    if(this.envDecayDisable){
      this.masterVolume = this.envDecayRate;
    } else {
      this.masterVolume = this.envVolume;
    }
    this.updateSampleValue();
  },

  updateSampleValue: function(){
    if(this.isEnabled && this.lengthCounter > 0){
      this.sampleValue = this.randomBit * this.masterVolume;
    }
  },

  writeReg: function(address, value){
    if(address === 0x400c){
      // Volume/Envelope decay:
      this.envDecayDisable = (value & 0x10) !== 0;
      this.envDecayRate = value & 0xf;
      this.envDecayLoopEnable = (value & 0x20) !== 0;
      this.lengthCounterEnable = (value & 0x20) === 0;
      if(this.envDecayDisable){
        this.masterVolume = this.envDecayRate;
      } else {
        this.masterVolume = this.envVolume;
      }
    } else if(address === 0x400e){
      // Programmable timer:
      this.progTimerMax = APU.getNoiseWaveLength(value & 0xf);
      this.randomMode = value >> 7;
    } else if(address === 0x400f){
      // Length counter
      this.lengthCounter = APU.getLengthMax(value & 248);
      this.envReset = true;
    }
    // Update:
    //updateSampleValue();
  },

  setEnabled: function(value){
    this.isEnabled = value;
    if(!value){
      this.lengthCounter = 0;
    }
    this.updateSampleValue();
  },

  getLengthStatus: function(){
    return this.lengthCounter === 0 || !this.isEnabled ? 0 : 1;
  }
};

var ChannelSquare = function(papu, square1){
  this.papu = papu;

  // prettier-ignore
  this.dutyLookup = [
         0, 1, 0, 0, 0, 0, 0, 0,
         0, 1, 1, 0, 0, 0, 0, 0,
         0, 1, 1, 1, 1, 0, 0, 0,
         1, 0, 0, 1, 1, 1, 1, 1
    ];
  // prettier-ignore
  this.impLookup = [
         1,-1, 0, 0, 0, 0, 0, 0,
         1, 0,-1, 0, 0, 0, 0, 0,
         1, 0, 0, 0,-1, 0, 0, 0,
        -1, 0, 1, 0, 0, 0, 0, 0
    ];

  this.sqr1 = square1;
  this.isEnabled = null;
  this.lengthCounterEnable = null;
  this.sweepActive = null;
  this.envDecayDisable = null;
  this.envDecayLoopEnable = null;
  this.envReset = null;
  this.sweepCarry = null;
  this.updateSweepPeriod = null;

  this.progTimerCount = null;
  this.progTimerMax = null;
  this.lengthCounter = null;
  this.squareCounter = null;
  this.sweepCounter = null;
  this.sweepCounterMax = null;
  this.sweepMode = null;
  this.sweepShiftAmount = null;
  this.envDecayRate = null;
  this.envDecayCounter = null;
  this.envVolume = null;
  this.masterVolume = null;
  this.dutyMode = null;
  this.sweepResult = null;
  this.sampleValue = null;
  this.vol = null;

  this.reset();
};

ChannelSquare.prototype = {
  reset: function(){
    this.progTimerCount = 0;
    this.progTimerMax = 0;
    this.lengthCounter = 0;
    this.squareCounter = 0;
    this.sweepCounter = 0;
    this.sweepCounterMax = 0;
    this.sweepMode = 0;
    this.sweepShiftAmount = 0;
    this.envDecayRate = 0;
    this.envDecayCounter = 0;
    this.envVolume = 0;
    this.masterVolume = 0;
    this.dutyMode = 0;
    this.vol = 0;

    this.isEnabled = false;
    this.lengthCounterEnable = false;
    this.sweepActive = false;
    this.sweepCarry = false;
    this.envDecayDisable = false;
    this.envDecayLoopEnable = false;
  },

  clockLengthCounter: function(){
    if(this.lengthCounterEnable && this.lengthCounter > 0){
      this.lengthCounter--;
      if(this.lengthCounter === 0){
        this.updateSampleValue();
      }
    }
  },

  clockEnvDecay: function(){
    if(this.envReset){
      // Reset envelope:
      this.envReset = false;
      this.envDecayCounter = this.envDecayRate + 1;
      this.envVolume = 0xf;
    } else if(--this.envDecayCounter <= 0){
      // Normal handling:
      this.envDecayCounter = this.envDecayRate + 1;
      if(this.envVolume > 0){
        this.envVolume--;
      } else {
        this.envVolume = this.envDecayLoopEnable ? 0xf : 0;
      }
    }

    if(this.envDecayDisable){
      this.masterVolume = this.envDecayRate;
    } else {
      this.masterVolume = this.envVolume;
    }
    this.updateSampleValue();
  },

  clockSweep: function(){
    if(--this.sweepCounter <= 0){
      this.sweepCounter = this.sweepCounterMax + 1;
      if(
        this.sweepActive &&
        this.sweepShiftAmount > 0 &&
        this.progTimerMax > 7
      ){
        // Calculate result from shifter:
        this.sweepCarry = false;
        if(this.sweepMode === 0){
          this.progTimerMax += this.progTimerMax >> this.sweepShiftAmount;
          if(this.progTimerMax > 4095){
            this.progTimerMax = 4095;
            this.sweepCarry = true;
          }
        } else {
          this.progTimerMax =
            this.progTimerMax -
            ((this.progTimerMax >> this.sweepShiftAmount) -
              (this.sqr1 ? 1 : 0));
        }
      }
    }

    if(this.updateSweepPeriod){
      this.updateSweepPeriod = false;
      this.sweepCounter = this.sweepCounterMax + 1;
    }
  },

  updateSampleValue: function(){
    if(this.isEnabled && this.lengthCounter > 0 && this.progTimerMax > 7){
      if(
        this.sweepMode === 0 &&
        this.progTimerMax + (this.progTimerMax >> this.sweepShiftAmount) > 4095
      ){
        //if(this.sweepCarry){
        this.sampleValue = 0;
      } else {
        this.sampleValue =
          this.masterVolume *
          this.dutyLookup[(this.dutyMode << 3) + this.squareCounter];
      }
    } else {
      this.sampleValue = 0;
    }
  },

  writeReg: function(address, value){
    var addrAdd = this.sqr1 ? 0 : 4;
    if(address === 0x4000 + addrAdd){
      // Volume/Envelope decay:
      this.envDecayDisable = (value & 0x10) !== 0;
      this.envDecayRate = value & 0xf;
      this.envDecayLoopEnable = (value & 0x20) !== 0;
      this.dutyMode = (value >> 6) & 0x3;
      this.lengthCounterEnable = (value & 0x20) === 0;
      if(this.envDecayDisable){
        this.masterVolume = this.envDecayRate;
      } else {
        this.masterVolume = this.envVolume;
      }
      this.updateSampleValue();
    } else if(address === 0x4001 + addrAdd){
      // Sweep:
      this.sweepActive = (value & 0x80) !== 0;
      this.sweepCounterMax = (value >> 4) & 7;
      this.sweepMode = (value >> 3) & 1;
      this.sweepShiftAmount = value & 7;
      this.updateSweepPeriod = true;
    } else if(address === 0x4002 + addrAdd){
      // Programmable timer:
      this.progTimerMax &= 0x700;
      this.progTimerMax |= value;
    } else if(address === 0x4003 + addrAdd){
      // Programmable timer, length counter
      this.progTimerMax &= 0xff;
      this.progTimerMax |= (value & 0x7) << 8;

      if(this.isEnabled){
        this.lengthCounter = APU.getLengthMax(value & 0xf8);
      }

      this.envReset = true;
    }
  },

  setEnabled: function(value){
    this.isEnabled = value;
    if(!value){
      this.lengthCounter = 0;
    }
    this.updateSampleValue();
  },

  getLengthStatus: function(){
    return this.lengthCounter === 0 || !this.isEnabled ? 0 : 1;
  }
};

var ChannelTriangle = function(papu){
  this.papu = papu;

  this.isEnabled = null;
  this.sampleCondition = null;
  this.lengthCounterEnable = null;
  this.lcHalt = null;
  this.lcControl = null;

  this.progTimerCount = null;
  this.progTimerMax = null;
  this.triangleCounter = null;
  this.lengthCounter = null;
  this.linearCounter = null;
  this.lcLoadValue = null;
  this.sampleValue = null;
  this.tmp = null;

  this.reset();
};

ChannelTriangle.prototype = {
  reset: function(){
    this.progTimerCount = 0;
    this.progTimerMax = 0;
    this.triangleCounter = 0;
    this.isEnabled = false;
    this.sampleCondition = false;
    this.lengthCounter = 0;
    this.lengthCounterEnable = false;
    this.linearCounter = 0;
    this.lcLoadValue = 0;
    this.lcHalt = true;
    this.lcControl = false;
    this.tmp = 0;
    this.sampleValue = 0xf;
  },

  clockLengthCounter: function(){
    if(this.lengthCounterEnable && this.lengthCounter > 0){
      this.lengthCounter--;
      if(this.lengthCounter === 0){
        this.updateSampleCondition();
      }
    }
  },

  clockLinearCounter: function(){
    if(this.lcHalt){
      // Load:
      this.linearCounter = this.lcLoadValue;
      this.updateSampleCondition();
    } else if(this.linearCounter > 0){
      // Decrement:
      this.linearCounter--;
      this.updateSampleCondition();
    }
    if(!this.lcControl){
      // Clear halt flag:
      this.lcHalt = false;
    }
  },

  getLengthStatus: function(){
    return this.lengthCounter === 0 || !this.isEnabled ? 0 : 1;
  },

  // eslint-disable-next-line no-unused-vars
  readReg: function(address){
    return 0;
  },

  writeReg: function(address, value){
    if(address === 0x4008){
      // New values for linear counter:
      this.lcControl = (value & 0x80) !== 0;
      this.lcLoadValue = value & 0x7f;

      // Length counter enable:
      this.lengthCounterEnable = !this.lcControl;
    } else if(address === 0x400a){
      // Programmable timer:
      this.progTimerMax &= 0x700;
      this.progTimerMax |= value;
    } else if(address === 0x400b){
      // Programmable timer, length counter
      this.progTimerMax &= 0xff;
      this.progTimerMax |= (value & 0x07) << 8;
      this.lengthCounter = APU.getLengthMax(value & 0xf8);
      this.lcHalt = true;
    }

    this.updateSampleCondition();
  },

  clockProgrammableTimer: function(nCycles){
    if(this.progTimerMax > 0){
      this.progTimerCount += nCycles;
      while (
        this.progTimerMax > 0 &&
        this.progTimerCount >= this.progTimerMax
      ){
        this.progTimerCount -= this.progTimerMax;
        if(
          this.isEnabled &&
          this.lengthCounter > 0 &&
          this.linearCounter > 0
        ){
          this.clockTriangleGenerator();
        }
      }
    }
  },

  clockTriangleGenerator: function(){
    this.triangleCounter++;
    this.triangleCounter &= 0x1f;
  },

  setEnabled: function(value){
    this.isEnabled = value;
    if(!value){
      this.lengthCounter = 0;
    }
    this.updateSampleCondition();
  },

  updateSampleCondition: function(){
    this.sampleCondition =
      this.isEnabled &&
      this.progTimerMax > 7 &&
      this.linearCounter > 0 &&
      this.lengthCounter > 0;
  }
};