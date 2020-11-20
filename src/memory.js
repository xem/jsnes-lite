// Memory manager
// ==============

// This file handles the CPU's memory accesses
// It assumes that the memory has been initialized (see CPU.reset())
// Reading and writing at specific addresses makes the CPU able to control other parts of the emulator (PPU, APU, controllers, mapper)

// Resources:
// - https://problemkaputt.de/everynes.htm#memorymaps
// - https://problemkaputt.de/everynes.htm#iomap
// - https://wiki.nesdev.com/w/index.php/CPU_memory_map

//  CPU memory map (64KiB):

//  +-------------+-------+-------------------------------------------------------+
//  | Address     | Size  | Use                                                   |
//  +-------------+-------+-------------------------------------------------------+
//  | $0000-$07FF | 2KiB  | 2KiB internal RAM:                                    |
//  | $0000-$000F | 16B   | - Zero page                                           |
//  | $0010-$00FF | 240B  | - Global variables                                    |
//  | $0100-$019F | 160B  | - Next VBlank's nametable data                        |
//  | $01A0-$01FF | 96B   | - Stack                                               |
//  | $0200-$02FF | 256B  | - Next VBlank's OAM data                              |
//  | $0300-$03FF | 256B  | - Sound / misc                                        |
//  | $0400-$07FF | 1024B | - Arrays / misc                                       |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $0800-$0FFF | 2KiB  | Mirror of $0000-$07FF                                 |
//  | $1000-$17FF | 2KiB  | Mirror of $0000-$07FF                                 |
//  | $1800-$1FFF | 2KiB  | Mirror of $0000-$07FF                                 |
//  +-------------+-------+-------------------------------------------------------+
//  | $2000-$2007 | 8B    | PPU I/O registers:                                    |
//  | 2000h       | 1B    | PPU Control Register 1                   (Write-only) |
//  | 2001h       | 1B    | PPU Control Register 2                   (Write-only) |
//  | 2002h       | 1B    | PPU Status Register                      (Read-only)  |
//  | 2003h       | 1B    | SPR-RAM Address Register                 (Write-only) |
//  | 2004h       | 1B    | SPR-RAM Data Register                    (Read/write) |
//  | 2005h       | 1B    | PPU Background Scrolling Offset   (Write-only, twice) |
//  | 2006h       | 1B    | VRAM Address Register             (Write-only, twice) |
//  | 2007h       | 1B    | VRAM Read/Write Data Register            (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $2008-$3FFF | 8184B | Mirrors of $2000-$2007 (every 8 bytes)                |
//  +-------------+-------+-------------------------------------------------------+
//  | $4000-$4017 | 24B   | APU I/O registers:                                    |
//  | 4000h       | 1B    | APU Channel 1 (Rectangle) Volume/Decay        (Write) |
//  | 4001h       | 1B    | APU Channel 1 (Rectangle) Sweep               (Write) |
//  | 4002h       | 1B    | APU Channel 1 (Rectangle) Frequency           (Write) |
//  | 4003h       | 1B    | APU Channel 1 (Rectangle) Length              (Write) |
//  | 4004h       | 1B    | APU Channel 2 (Rectangle) Volume/Decay        (Write) |
//  | 4005h       | 1B    | APU Channel 2 (Rectangle) Sweep               (Write) |
//  | 4006h       | 1B    | APU Channel 2 (Rectangle) Frequency           (Write) |
//  | 4007h       | 1B    | APU Channel 2 (Rectangle) Length              (Write) |
//  | 4008h       | 1B    | APU Channel 3 (Triangle) Linear Counter       (Write) |
//  | 4009h       | 1B    | N/A                                                   |
//  | 400Ah       | 1B    | APU Channel 3 (Triangle) Frequency            (Write) |
//  | 400Bh       | 1B    | APU Channel 3 (Triangle) Length               (Write) |
//  | 400Ch       | 1B    | APU Channel 4 (Noise) Volume/Decay            (Write) |
//  | 400Dh       | 1B    | N/A                                                   |
//  | 400Eh       | 1B    | APU Channel 4 (Noise) Frequency               (Write) |
//  | 400Fh       | 1B    | APU Channel 4 (Noise) Length                  (Write) |
//  | 4010h       | 1B    | APU Channel 5 (DMC) Play mode & DMA frequency (Write) |
//  | 4011h       | 1B    | APU Channel 5 (DMC) Delta counter load        (Write) |
//  | 4012h       | 1B    | APU Channel 5 (DMC) Address load              (Write) |
//  | 4013h       | 1B    | APU Channel 5 (DMC) Length                    (Write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4014h       | 1B    | SPR-RAM DMA Register                          (Write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4015h       | 1B    | DMC/IRQ/length status/channel enable     (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4016h       | 1B    | Joypad #1                                (Read/write) |
//  | 4017h       | 1B    | Joypad #2 / APU SOFTCLK                  (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $4018-$401F | 8B    | APU I/O test registers (disabled)                     |
//  +-------------+-------+-------------------------------------------------------+
//  | $4020-$FFFF | 48KiB | Cartridge space:                                      |
//  | $4020-$5FFF | 8160B | - Expansion ROM (some mappers add extra ROM/RAM here) |
//  | $6000-$7FFF | 8KiB  | - PRG-RAM (if any)                                    |
//  | $7000-$71FF | 512B  | - trainer (if any)                                    |
//  | $8000-$BFFF | 16KiB | - PRG-ROM low page                                    |
//  | $C000-$FFFF | 16KiB | - PRG-ROM high page                                   |
//  | $FFFA-$FFFB | 2B    | - NMI vector                                          |
//  | $FFFC-$FFFD | 2B    | - Reset vector                                        |
//  | $FFFE-$FFFF | 2B    | - IRQ/BRK vector                                      |
//  +-------------+-------+-------------------------------------------------------+

  
Memory = {
  
  
  // Read a 8-byte value in memory
  load: address => {
    
    // Wrap around ($0000-$FFFF)
    address &= 0xFFFF;
    
    // Handle RAM mirrors ($0000-$07FF + $0800-$1FFF)
    if(address < 0x2000){
      address &= 0x7FF;
    }
    
    // PPU registers ($2000-$2007) + mirrors ($2008-$3FFF)
    else if(address < 0x4000){
      
      // Mirroring
      address &= 0x2007;

      // $2002: PPU Status Register
      if(address == 0x2002) return PPU.readStatusRegister();

      // $2004: Sprite Memory read
      else if(address == 0x2004) return PPU.sramLoad();
      
      // $2007: VRAM read
      else if(address == 0x2007) return PPU.vramLoad();
    }
    
    // Sound and I/O registers ($4000-$401F)
    else if(address < 0x4020){
      
      // $4015: Sound channel enable, DMC Status
      if(address == 0x4015) return APU.readReg(address);

      // $4016: Joystick 1 + Strobe
      else if(address == 0x4016) return joy1Read();

      // $4017: Joystick 2 + Strobe
      else if(address == 0x4017) return joy2Read();
    }
    
    // Simply read in memory
    return CPU.mem[address] || 0;
  },

  // Write a 8-bit value in memory
  write: (address, value) => {
    
    // Wrap around ($0000-$FFFF)
    address &= 0xFFFF;
    
    // Handle RAM mirrors ($0000-$07FF + $0800-$1FFF)
    if(address < 0x2000){
      address &= 0x7FF;
    }
    
    // PPU registers ($2000-$2007) + mirrors ($2008-$3FFF)
    else if(address < 0x4000){
      
      address &= 0x2007;
      
      // $2000: PPU Control register 1 (write-only)
      if(address == 0x2000) PPU.updateControlReg1(value);

      // $2001: PPU Control register 2 (write-only)
      else if(address == 0x2001) PPU.updateControlReg2(value);

      // $2003: Set Sprite RAM address (write-only)
      else if(address == 0x2003) PPU.writeSRAMAddress(value);

      // $2004: Write to Sprite RAM
      else if(address == 0x2004) PPU.sramWrite(value);

      // $2005: Screen Scroll offsets (write-only)
      else if(address == 0x2005) PPU.scrollWrite(value);

      // $2006: Set VRAM address (write-only)
      else if(address == 0x2006) PPU.writeVRAMAddress(value);

      // $2007: Write to VRAM
      else if(address == 0x2007) PPU.vramWrite(value);
      
    }
    
    // Sound registers ($4000-$4013)
    else if(address < 0x4014){
      APU.writeReg(address, value);
    }
    
    // I/O registers ($4014-$401F)
    else if(address < 0x4020){
      
      // $4014: Sprite Memory DMA Access
      if(address == 0x4014) PPU.sramDMA(value);

      // $4015: Sound Channel Switch, DMC Status
      else if(address == 0x4015) APU.writeReg(address, value);

      // $4016: Joystick 1 + Strobe
      else if(address == 0x4016){
        if((value & 1) === 0 && (Mapper.joypadLastWrite & 1) === 1){
          Mapper.joy1StrobeState = 0;
          Mapper.joy2StrobeState = 0;
        }
        Mapper.joypadLastWrite = value;
      }

      // $4017: Sound channel frame sequencer:
      else if(address == 0x4017) APU.writeReg(address, value);
    }

    // Write to persistent RAM
    else if(address >= 0x6000 && address < 0x8000){
      NES.onBatteryRamWrite(address, value);
    }
    
    // Simply write in memory
    CPU.mem[address] = value;
  }
}