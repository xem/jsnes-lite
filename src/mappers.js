var Mappers = {};

Mappers[0] = {

  reset: function() {
    this.joy1StrobeState = 0;
    this.joy2StrobeState = 0;
    this.joypadLastWrite = 0;

    this.zapperFired = false;
    this.zapperX = null;
    this.zapperY = null;
  },

  write: function(address, value) {
    if (address < 0x2000) {
      // Mirroring of RAM:
      NES.cpu.mem[address & 0x7ff] = value;
    } else if (address > 0x4017) {
      NES.cpu.mem[address] = value;
      if (address >= 0x6000 && address < 0x8000) {
        // Write to persistent RAM
        NES.opts.onBatteryRamWrite(address, value);
      }
    } else if (address > 0x2007 && address < 0x4000) {
      this.regWrite(0x2000 + (address & 0x7), value);
    } else {
      this.regWrite(address, value);
    }
  },

  writelow: function(address, value) {
    if (address < 0x2000) {
      // Mirroring of RAM:
      NES.cpu.mem[address & 0x7ff] = value;
    } else if (address > 0x4017) {
      NES.cpu.mem[address] = value;
    } else if (address > 0x2007 && address < 0x4000) {
      this.regWrite(0x2000 + (address & 0x7), value);
    } else {
      this.regWrite(address, value);
    }
  },

  load: function(address) {
    // Wrap around:
    address &= 0xffff;

    // Check address range:
    if (address > 0x4017) {
      // ROM:
      return NES.cpu.mem[address];
    } else if (address >= 0x2000) {
      // I/O Ports.
      return this.regLoad(address);
    } else {
      // RAM (mirrored)
      return NES.cpu.mem[address & 0x7ff];
    }
  },

  regLoad: function(address) {
    switch (
      address >> 12 // use fourth nibble (0xF000)
    ) {
      case 0:
        break;

      case 1:
        break;

      case 2:
      // Fall through to case 3
      case 3:
        // PPU Registers
        switch (address & 0x7) {
          case 0x0:
            // 0x2000:
            // PPU Control Register 1.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return NES.cpu.mem[0x2000];

          case 0x1:
            // 0x2001:
            // PPU Control Register 2.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return NES.cpu.mem[0x2001];

          case 0x2:
            // 0x2002:
            // PPU Status Register.
            // The value is stored in
            // main memory in addition
            // to as flags in the PPU.
            // (not in the real NES)
            return NES.ppu.readStatusRegister();

          case 0x3:
            return 0;

          case 0x4:
            // 0x2004:
            // Sprite Memory read.
            return NES.ppu.sramLoad();
          case 0x5:
            return 0;

          case 0x6:
            return 0;

          case 0x7:
            // 0x2007:
            // VRAM read:
            return NES.ppu.vramLoad();
        }
        break;
      case 4:
        // Sound+Joypad registers
        switch (address - 0x4015) {
          case 0:
            // 0x4015:
            // Sound channel enable, DMC Status
            return NES.papu.readReg(address);

          case 1:
            // 0x4016:
            // Joystick 1 + Strobe
            return joy1Read();

          case 2:
            // 0x4017:
            // Joystick 2 + Strobe
            // https://wiki.nesdev.com/w/index.php/Zapper
            var w;

            if (
              this.zapperX !== null &&
              this.zapperY !== null &&
              NES.ppu.isPixelWhite(this.zapperX, this.zapperY)
            ) {
              w = 0;
            } else {
              w = 0x1 << 3;
            }

            if (this.zapperFired) {
              w |= 0x1 << 4;
            }
            return (joy2Read() | w) & 0xffff;
        }
        break;
    }
    return 0;
  },

  regWrite: function(address, value) {
    switch (address) {
      case 0x2000:
        // PPU Control register 1
        NES.cpu.mem[address] = value;
        NES.ppu.updateControlReg1(value);
        break;

      case 0x2001:
        // PPU Control register 2
        NES.cpu.mem[address] = value;
        NES.ppu.updateControlReg2(value);
        break;

      case 0x2003:
        // Set Sprite RAM address:
        NES.ppu.writeSRAMAddress(value);
        break;

      case 0x2004:
        // Write to Sprite RAM:
        NES.ppu.sramWrite(value);
        break;

      case 0x2005:
        // Screen Scroll offsets:
        NES.ppu.scrollWrite(value);
        break;

      case 0x2006:
        // Set VRAM address:
        NES.ppu.writeVRAMAddress(value);
        break;

      case 0x2007:
        // Write to VRAM:
        NES.ppu.vramWrite(value);
        break;

      case 0x4014:
        // Sprite Memory DMA Access
        NES.ppu.sramDMA(value);
        break;

      case 0x4015:
        // Sound Channel Switch, DMC Status
        NES.papu.writeReg(address, value);
        break;

      case 0x4016:
        // Joystick 1 + Strobe
        if ((value & 1) === 0 && (this.joypadLastWrite & 1) === 1) {
          this.joy1StrobeState = 0;
          this.joy2StrobeState = 0;
        }
        this.joypadLastWrite = value;
        break;

      case 0x4017:
        // Sound channel frame sequencer:
        NES.papu.writeReg(address, value);
        break;

      default:
        // Sound registers
        // console.log("write to sound reg");
        if (address >= 0x4000 && address <= 0x4017) {
          NES.papu.writeReg(address, value);
        }
    }
  },


  loadROM: function() {

    // Load PRG-ROM in CPU memory
    this.loadPRGROM();

    // Load CHR-ROM in PPU memory
    this.loadCHRROM();

    // Load Battery RAM (if present):
    //this.loadBatteryRam();

    // Send reset (IRQ) interrupt to the CPU
    NES.cpu.requestIrq(NES.cpu.IRQ_RESET);
  },

  loadPRGROM: function() {
    if (ROM.prg_rom_count > 1) {
      // Load the two first banks into memory.
      this.loadRomBank(0, 0x8000);
      this.loadRomBank(1, 0xc000);
    } else {
      // Load the one bank into both memory locations:
      this.loadRomBank(0, 0x8000);
      this.loadRomBank(0, 0xc000);
    }
  },

  loadCHRROM: function() {
    // console.log("Loading CHR ROM..");
    if (ROM.chr_rom_count > 0) {
      if (ROM.chr_rom_count === 1) {
        this.loadVromBank(0, 0x0000);
        this.loadVromBank(0, 0x1000);
      } else {
        this.loadVromBank(0, 0x0000);
        this.loadVromBank(1, 0x1000);
      }
    } else {
      //System.out.println("There aren't any CHR-ROM banks..");
    }
  },

  /*loadBatteryRam: function() {
    if (ROM.batteryRam) {
      var ram = ROM.batteryRam;
      if (ram !== null && ram.length === 0x2000) {
        // Load Battery RAM into memory:
        utils.copyArrayElements(ram, 0, NES.cpu.mem, 0x6000, 0x2000);
      }
    }
  },*/

  loadRomBank: function(bank, address) {
    // Loads a ROM bank into the specified address.
    bank %= ROM.prg_rom_count;
    //var data = ROM.rom[bank];
    //cpuMem.write(address,data,data.length);
    utils.copyArrayElements(
      ROM.prg_rom[bank],
      0,
      NES.cpu.mem,
      address,
      16384
    );
  },

  loadVromBank: function(bank, address) {
    if (ROM.chr_rom_count === 0) {
      return;
    }
    NES.ppu.triggerRendering();

    utils.copyArrayElements(
      ROM.chr_rom[bank % ROM.chr_rom_count],
      0,
      NES.ppu.vramMem,
      address,
      4096
    );

    var vromTile = ROM.chr_rom_tiles[bank % ROM.chr_rom_count];
    utils.copyArrayElements(
      vromTile,
      0,
      NES.ppu.ptTile,
      address >> 4,
      256
    );
  },

  clockIrqCounter: function() {
    // Does nothing. This is used by the MMC3 mapper.
  },

  latchAccess: function(address) {
    // Does nothing. This is used by MMC2.
  },
};