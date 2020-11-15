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

  regWrite: (address, value) => {
    switch (address){
      case 0x2000:
        // PPU Control register 1
        CPU.mem[address] = value;
        PPU.updateControlReg1(value);
        break;

      case 0x2001:
        // PPU Control register 2
        CPU.mem[address] = value;
        PPU.updateControlReg2(value);
        break;

      case 0x2003:
        // Set Sprite RAM address:
        PPU.writeSRAMAddress(value);
        break;

      case 0x2004:
        // Write to Sprite RAM:
        PPU.sramWrite(value);
        break;

      case 0x2005:
        // Screen Scroll offsets:
        PPU.scrollWrite(value);
        break;

      case 0x2006:
        // Set VRAM address:
        PPU.writeVRAMAddress(value);
        break;

      case 0x2007:
        // Write to VRAM:
        PPU.vramWrite(value);
        break;

      case 0x4014:
        // Sprite Memory DMA Access
        PPU.sramDMA(value);
        break;

      case 0x4015:
        // Sound Channel Switch, DMC Status
        APU.writeReg(address, value);
        break;

      case 0x4016:
        // Joystick 1 + Strobe
        if((value & 1) === 0 && (Mapper.joypadLastWrite & 1) === 1){
          Mapper.joy1StrobeState = 0;
          Mapper.joy2StrobeState = 0;
        }
        Mapper.joypadLastWrite = value;
        break;

      case 0x4017:
        // Sound channel frame sequencer:
        APU.writeReg(address, value);
        break;

      default:
        // Sound registers
        // console.log("write to sound reg");
        if(address >= 0x4000 && address <= 0x4017){
          APU.writeReg(address, value);
        }
    }
  },

  regLoad:  address => {
    switch (
      address >> 12 // use fourth nibble (0xF000)
    ){
      case 0:
        break;

      case 1:
        break;

      case 2:
      // Fall through to case 3
      case 3:
        // PPU Registers
        switch (address & 0x7){
          case 0x0:
            // 0x2000:
            // PPU Control Register 1.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return CPU.mem[0x2000];

          case 0x1:
            // 0x2001:
            // PPU Control Register 2.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return CPU.mem[0x2001];

          case 0x2:
            // 0x2002:
            // PPU Status Register.
            // The value is stored in
            // main memory in addition
            // to as flags in the PPU.
            // (not in the real NES)
            return PPU.readStatusRegister();

          case 0x3:
            return 0;

          case 0x4:
            // 0x2004:
            // Sprite Memory read.
            return PPU.sramLoad();
          case 0x5:
            return 0;

          case 0x6:
            return 0;

          case 0x7:
            // 0x2007:
            // VRAM read:
            return PPU.vramLoad();
        }
        break;
      case 4:
        // Sound+Joypad registers
        switch (address - 0x4015){
          case 0:
            // 0x4015:
            // Sound channel enable, DMC Status
            return APU.readReg(address);

          case 1:
            // 0x4016:
            // Joystick 1 + Strobe
            return joy1Read();

          case 2:
            // 0x4017:
            // Joystick 2 + Strobe
            // https://wiki.nesdev.com/w/index.php/Zapper
            var w;

            if(
              Mapper.zapperX !== null &&
              Mapper.zapperY !== null &&
              PPU.isPixelWhite(Mapper.zapperX, Mapper.zapperY)
            ){
              w = 0;
            } else {
              w = 0x1 << 3;
            }

            if(Mapper.zapperFired){
              w |= 0x1 << 4;
            }
            return (joy2Read() | w) & 0xffff;
        }
        break;
    }
    return 0;
  },

  // Handle 8-bit writes in CPU memory
  write: (address, value) => {
    if(address < 0x2000){
      // Mirroring of RAM:
      CPU.mem[address & 0x7ff] = value;
    } else if(address > 0x4017){
      CPU.mem[address] = value;
      if(address >= 0x6000 && address < 0x8000){
        // Write to persistent RAM
        NES.onBatteryRamWrite(address, value);
      }
    } else if(address > 0x2007 && address < 0x4000){
      CPU.regWrite(0x2000 + (address & 0x7), value);
    } else {
      CPU.regWrite(address, value);
    }
  },

  // Handle 8-bit reads from CPU memory
  load: address => {
    // Wrap around:
    address &= 0xffff;

    // Check address range:
    if(address > 0x4017){
      // ROM:
      return CPU.mem[address];
    } else if(address >= 0x2000){
      // I/O Ports.
      return CPU.regLoad(address);
    } else {
      // RAM (mirrored)
      return CPU.mem[address & 0x7ff];
    }
  }
};