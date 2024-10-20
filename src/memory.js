// Memory manager
// ==============

// This file handles the CPU's memory accesses
// It assumes that the memory has been initialized (see CPU_reset())
// Reading and writing at specific addresses makes the CPU able to communicate with other parts of the emulator (PPU, APU, controllers, mapper)

// Resources:
// - https://problemkaputt.de/everynes.htm#memorymaps
// - https://problemkaputt.de/everynes.htm#iomap
// - https://wiki.nesdev.com/w/index.php/cpu_memory_map

//  CPU memory map (64KB):

//  +-------------+-------+-------------------------------------------------------+
//  | Address     | Size  | Use                                                   |
//  +-------------+-------+-------------------------------------------------------+
//  | $0000-$07FF | 2KB   | 2KB internal RAM:                                     |
//  | $0000-$00FF | 256B  | - Zero page                                           |
//  | $0100-$01FF | 256B  | - Stack                                               |
//  | $0200-$07FF | 1.5KB | - General purpose                                     |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $0800-$0FFF | 2KB   | Mirror of $0000-$07FF                                 |
//  | $1000-$17FF | 2KB   | Mirror of $0000-$07FF                                 |
//  | $1800-$1FFF | 2KB   | Mirror of $0000-$07FF                                 |
//  +-------------+-------+-------------------------------------------------------+
//  | $2000-$2007 | 8B    | PPU I/O registers:                                    |
//  | 2000        | 1B    | PPU Control Register 1                   (Write-only) |
//  | 2001        | 1B    | PPU Control Register 2                   (Write-only) |
//  | 2002        | 1B    | PPU Status Register                       (Read-only) |
//  | 2003        | 1B    | SPR-RAM Address Register                 (Write-only) |
//  | 2004        | 1B    | SPR-RAM Data Register                    (Read/write) |
//  | 2005        | 1B    | PPU Background Scrolling Offset   (Write-only, twice) |
//  | 2006        | 1B    | VRAM Address Register             (Write-only, twice) |
//  | 2007        | 1B    | VRAM Read/Write Data Register            (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $2008-$3FFF | 8184B | Mirrors of $2000-$2007 (every 8 bytes)                |
//  +-------------+-------+-------------------------------------------------------+
//  | $4000-$4017 | 24B   | APU I/O registers:                                    |
//  | 4000        | 1B    | APU Channel 1 (Rectangle) Volume/Decay        (Write) |
//  | 4001        | 1B    | APU Channel 1 (Rectangle) Sweep               (Write) |
//  | 4002        | 1B    | APU Channel 1 (Rectangle) Frequency           (Write) |
//  | 4003        | 1B    | APU Channel 1 (Rectangle) Length              (Write) |
//  | 4004        | 1B    | APU Channel 2 (Rectangle) Volume/Decay        (Write) |
//  | 4005        | 1B    | APU Channel 2 (Rectangle) Sweep               (Write) |
//  | 4006        | 1B    | APU Channel 2 (Rectangle) Frequency           (Write) |
//  | 4007        | 1B    | APU Channel 2 (Rectangle) Length              (Write) |
//  | 4008        | 1B    | APU Channel 3 (Triangle) Linear Counter       (Write) |
//  | 4009        | 1B    | N/A                                                   |
//  | 400A        | 1B    | APU Channel 3 (Triangle) Frequency            (Write) |
//  | 400B        | 1B    | APU Channel 3 (Triangle) Length               (Write) |
//  | 400C        | 1B    | APU Channel 4 (Noise) Volume/Decay            (Write) |
//  | 400D        | 1B    | N/A                                                   |
//  | 400E        | 1B    | APU Channel 4 (Noise) Frequency               (Write) |
//  | 400F        | 1B    | APU Channel 4 (Noise) Length                  (Write) |
//  | 4010        | 1B    | APU Channel 5 (DMC) Play mode & DMA frequency (Write) |
//  | 4011        | 1B    | APU Channel 5 (DMC) Delta counter load        (Write) |
//  | 4012        | 1B    | APU Channel 5 (DMC) Address load              (Write) |
//  | 4013        | 1B    | APU Channel 5 (DMC) Length                    (Write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4014        | 1B    | SPR-RAM DMA Register                          (Write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4015        | 1B    | DMC/IRQ/length status/channel enable     (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | 4016        | 1B    | Joypad #1                                (Read/write) |
//  | 4017        | 1B    | Joypad #2 / APU SOFTCLK                  (Read/write) |
//  +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - -+
//  | $4018-$401F | 8B    | APU I/O test registers (disabled)                     |
//  +-------------+-------+-------------------------------------------------------+
//  | $4020-$FFFF | 48KB  | Cartridge space:                                      |
//  | $4020-$5FFF | 8160B | - Expansion ROM (some mappers add extra ROM/RAM here) |
//  | $6000-$7FFF | 8KB   | - PRG-RAM (if any)                                    |
//  | $7000-$71FF | 512B  | - trainer (if any)                                    |
//  | $8000-$BFFF | 16KB  | - PRG-ROM low page                                    |
//  | $C000-$FFFF | 16KB  | - PRG-ROM high page, including:                       |
//  | $FFFA-$FFFB | 2B    |   * NMI vector                                        |
//  | $FFFC-$FFFD | 2B    |   * Reset vector                                      |
//  | $FFFE-$FFFF | 2B    |   * IRQ/BRK vector                                    |
//  +-------------+-------+-------------------------------------------------------+


// Read a 8-byte value in memory
memory_read = address => {
  
  // Wrap around ($0000-$FFFF)
  address &= 0xFFFF;
  
  // Handle RAM mirrors ($0000-$07FF + $0800-$1FFF)
  if(address < 0x2000) address &= 0x7FF;
  
  // PPU registers ($2000-$2007) + mirrors ($2008-$3FFF)
  else if(address < 0x4000){
    
    // Mirroring
    address &= 0x2007;

    // $2002: PPU Status Register
    if(address == 0x2002) return get_PPUSTATUS(); 

    // $2004: Sprite Memory read
    else if(address == 0x2004) return get_OAMDATA(); 
    
    // $2007: VRAM read
    else if(address == 0x2007) return get_PPUDATA(); 
  }
  
  // Sound and I/O registers ($4000-$401F)
  else if(address < 0x4020){
    
    // $4015: Sound channel enable, DMC Status
    if(address == 0x4015){
      return get_4015();
    }

    // $4016: Joystick 1 + Strobe
    else if(address == 0x4016) return joy1Read();

    // $4017: Joystick 2 + Strobe
    else if(address == 0x4017) return joy2Read();
  }
  
  // PRG-ROM
  else if(address >= 0x8000 && address < 0xC000){
    return NES.prg[NES.prg_0_bank][address - 0x8000];
  }
  else if(address >= 0xC000){
    return NES.prg[NES.prg_1_bank][address - 0xC000];
  }
  
  // Simply read in memory
  return cpu_mem[address] || 0;
},

// Write a 8-bit value in memory
memory_write = (address, value) => {
  
  // Wrap around ($0000-$FFFF)
  address &= 0xFFFF;
  
  // Handle RAM mirrors ($0000-$07FF + $0800-$1FFF)
  if(address < 0x2000) address &= 0x7FF;
  
  // PPU registers ($2000-$2007) + mirrors ($2008-$3FFF)
  else if(address < 0x4000){
    
    address &= 0x2007;
    
    // $2000: PPU Control register 1 (write-only)
    if(address == 0x2000) set_PPUCTRL(value);

    // $2001: PPU Control register 2 (write-only)
    else if(address == 0x2001) set_PPUMASK(value);

    // $2003: Set Sprite RAM address (write-only)
    else if(address == 0x2003) set_OAMADDR(value);

    // $2004: Write to Sprite RAM
    else if(address == 0x2004) set_OAMDATA(value);

    // $2005: Screen Scroll offsets (write-only)
    else if(address == 0x2005) set_PPUSCROLL(value);

    // $2006: Set VRAM address (write-only)
    else if(address == 0x2006) set_PPUADDR(value);

    // $2007: Write to VRAM
    else if(address == 0x2007) set_PPUDATA(value);
  }
  
  // APU registers ($4000-$4013)
  else if(address < 0x4014) {
    //APU.storeRegister(address, value);
    //APU.writeReg(address, value);

    if(address == 0x4000) set_4000(value);
    if(address == 0x4001) set_4001(value);
    if(address == 0x4002) set_4002(value);
    if(address == 0x4003) set_4003(value);
    
    /*
    if(address == 0x4004) set_4004(value);
    if(address == 0x4005) set_4005(value);
    if(address == 0x4006) set_4006(value);
    if(address == 0x4007) set_4007(value);
    
    if(address == 0x4008) set_4008(value);
    if(address == 0x400a) set_400a(value);
    if(address == 0x400b) set_400b(value);
    
    if(address == 0x400c) set_400c(value);
    if(address == 0x400e) set_400e(value);
    if(address == 0x400f) set_400f(value);
    
    if(address == 0x4010) set_4010(value);
    if(address == 0x4011) set_4011(value);
    if(address == 0x4012) set_4012(value);
    if(address == 0x4013) set_4013(value);*/
  }
  
  // I/O registers ($4014-$401F)
  else if(address < 0x4020){
    
    // $4014: Sprite Memory DMA Access
    if(address == 0x4014) set_OAMDMA(value);

    // $4015: Sound Channel Switch, DMC Status
    else if(address == 0x4015) {
      set_4015(value);
    }

    // $4016: Joystick 1 + Strobe
    else if(address == 0x4016){
      if((value & 1) === 0 && (joypadLastWrite & 1) === 1){
        joy1StrobeState = 0;
        joy2StrobeState = 0;
      }
      joypadLastWrite = value;
    }

    // $4017: Sound channel frame sequencer:
    else if(address == 0x4017){
      set_4017(value);
    }
  }

  // Write to persistent RAM (save slot)
  else if(address >= 0x6000 && address < 0x8000) NES.onBatteryRamWrite(address, value);
  
  // Simply write in memory, if not in PRG-ROM (necessary?)
  if(address < 0x8000){
    cpu_mem[address] = value;
  }
  
  // Inform the Mapper that a write has been made in memory
  mapper_write(address, value);
}