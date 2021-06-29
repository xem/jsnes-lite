// PPU
// ===

// Resources:
// - https://wiki.nesdev.com/w/index.php/PPU (+ subpages)
// - https://problemkaputt.de/everynes.htm#pictureprocessingunitppu
// - https://austinmorlan.com/posts/nes_rendering_overview/
// - https://www.gridbugs.org/zelda-screen-transitions-are-undefined-behaviour/
// - https://www.youtube.com/watch?v=wfrNnwJrujw
// - https://gist.githubusercontent.com/adamveld12/d0398717145a2c8dedab/raw/750246a2b4ee4bb722c2b5bb5e6ba997cdf74661/spec.md
// - https://emulation.gametechwiki.com/index.php/Famicom_Color_Palette
// - http://forums.nesdev.com/viewtopic.php?t=19259
// - http://forums.nesdev.com/viewtopic.php?t=8214
// - https://www.youtube.com/watch?v=wt73KPS_23w

// PPU memory map (64KB):

// +-------------+-------+-----------------------------------------------------------+
// | Address     | Size  | Use                                                       |
// +-------------+-------+-----------------------------------------------------------+
// | $0000-$1FFF | 8KB   | Cartridge space (CHR-ROM or CHR-RAM):                     |
// | $0000-$0FFF | 4KB   | Pattern Table 0 (256 tiles) "left page"                   |
// | $1000-$1FFF | 4KB   | Pattern Table 1 (256 tiles) "right page"                  |
// +-------------+-------+-----------------------------------------------------------+
// | $2000-$2FFF | 4KB   | VRAM (2KB in the NES, 2KB in the cartridge or mirrored):  |
// | $2000-$23BF | 960B  | Name Table 0                                              |
// | $23C0-$23FF | 24B   | Attribute Table 0                                         |
// | $2400-$27BF | 960B  | Name Table 1                                              |
// | $27C0-$27FF | 24B   | Attribute Table 1                                         |
// | $2800-$2BBF | 960B  | Name Table 2                                              |
// | $2BC0-$2BFF | 24B   | Attribute Table 2                                         |
// | $2C00-$2FBF | 960B  | Name Table 3                                              |
// | $2FC0-$2FFF | 24B   | Attribute Table 3                                         |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -+
// | $3000-$3EFF | 3840B | Mirror of $2000-$2EFF (never used by the PPU)             |
// +-------------+-------+-----------------------------------------------------------+
// | $3F00-$3F1F | 32B   | Palettes:                                                 |
// | $3F00       | 1B    | Universal background color                                |
// | $3F01-$3F03 | 3B    | Background palette 0                                      |
// | $3F04       | 1B    | Used by Background palette 1 only during forced blanking  |
// | $3F05-$3F07 | 3B    | Background palette 1                                      |
// | $3F08       | 1B    | Used by background palette 2 only during forced blanking  |
// | $3F09-$3F0B | 3B    | Background palette 2                                      |
// | $3F0C       | 1B    | Used by background palette 3 only during forced blanking  |
// | $3F0D-$3F0F | 3B    | Background palette 3                                      |
// | $3F10       | 1B    | Mirror of $3F00                                           |
// | $3F11-$3F13 | 3B    | Sprite palette 0                                          |
// | $3F14       | 1B    | N/A (mirror of $3F04)                                     |
// | $3F15-$3F17 | 3B    | Sprite palette 1                                          |
// | $3F18       | 1B    | N/A (mirror of $3F08)                                     |
// | $3F19-$3F1B | 3B    | Sprite palette 2                                          |
// | $3F1C       | 1B    | N/A (mirror of $3F0C)                                     |
// | $3F1D-$3F1F | 3B    | Sprite palette 3                                          |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -+
// | $3F20-$3FFF | 224B  | Mirrors of $3F00-$3F1F                                    |
// +-------------+-------+-----------------------------------------------------------+
// | $4000-$FFFF | 48KB  | Mirrors of $0000-$3FFF                                    |
// +-------------+-------+-----------------------------------------------------------+

// OAM Memory (256 bytes):

// +-------------+-------+-----------------------------------------------------------+
// | Address     | Size  | Use                                                       |
// +-------------+-------+-----------------------------------------------------------+
// | $00-$FF     | 256B  | Sprites properties (4 bytes for each)                     |
// +-------------+-------+-----------------------------------------------------------+

// Rendering beam for each frame (one pixel for each PPU tick):

//         x=0                 x=256               x=340
//      ---+-------------------+-------------------+
//  y=0    | visible area      | Horizontal blank  |
//         | (this is rendered | (prepare sprites  |
//  y=239  | on the screen)    | for the next      |
//  y=239  |                   | scanline)         |
//      ---+-------------------+-------------------|
//  y=240  | idle scanline                         |
//      ---+---------------------------------------|
//  y=241  | vertical blanking (idle)              |
//         | - 20 scanlines long on NTSC consoles  |
//  y=260  | - 70 scanlines on PAL consoles        |
//      ---+-------------------------------------+-+
//  y=261  | pre-render scanline                 |*|
//  or -1 -+-------------------------------------+-+

// Globals
// -------

var t = 0;  // temp var
var o = 0;  // temp var

var PPU = {
  
  // System palette
  // An array of 64 RGB colors, inspired by the 3DS VC palette, stored in AABBGGRR format.
  systemPalette: (
      "777812a0090470810a00a007"+
      "024040050130531000000000"+
      "bbbe70e32f08b0b50e02d04c"+
      "0780900a0390880111000000"+
      "ffffb3f95f8af7fb7f67f39f"+
      "3bf1d84d49f5de0333000000"+
      "ffffeafdcfcdfcfdcfbbfadf"+
      "aefafebfacfbff9888000000"
    )
    .replace(/./g,"$&$&").match(/....../g).map(c=>eval("0xff"+c)),        // shorter
    // .match(/.../g).map(c=>eval("0xff"+c[0]+c[0]+c[1]+c[1]+c[2]+c[2])), // longer but may compress better

  // Reset the PPU
  reset: () => {
    
    // Coordinates of the current pixel
    PPU.scanline = 0; // Y between 0 and 261 on NTSC (or 311 on PAL)
    PPU.dot = 0;      // X between 0 and 340 (on scanline 261, alternate between 239 and 240 if background rendering is enabled)

    // Reset PPU memory (64KB) and OAM memory (256b)
    PPU.mem = [];
    PPU.OAM = [];
    
    // Background pixel buffer for current scanline (to handle sprite priority)
    PPU.vramPixelBuffer = [];
    
    // PPU scrolling is handled via two 15-bit registers called V and T
    // In these registers:
    // - bits 0-4 (XXXXX) represent the coarse X scrolling
    // - bits 5-9 (YYYYY) represent the coarse Y scrolling
    // - bits 10-11 (NN) represent the nametable where the scrolling starts
    // - bits 12-14 (yyy) represent the fine Y scrolling
    // The fine X scrolling (xxx) is stored separately
    // The effective X scrolling is equal to: (NN & 0b1) * 256 + XXXXX * 8 + xxx
    // The effective Y scrolling is equal to: (NN >> 1) * 240 + YYYYY * 8 + yyy
    
    // V: value of scroll on the next scanline (V = 0yyyNNYYYYYXXXXX)
    PPU.V_yyy = 0;
    PPU.V_NN = 0;
    PPU.V_YYYYY = 0;
    PPU.V_XXXXX = 0;
    
    // T: value of scroll on current scanline (T = 0yyyNNYYYYYXXXXX)
    PPU.T_yyy = 0;
    PPU.T_NN = 0;
    PPU.T_YYYYY = 0;
    PPU.T_XXXXX = 0;

    // Fine X scroll (xxx, also called w)
    PPU.xxx = 0; 
    
    // Effective PPU scroll
    PPU.scroll_x = 0;
    PPU.scroll_y = 0;

    // PPUDATA register buffer
    // When the CPU requests one byte from the PPU memory by reading the PPUDATA register,
    // the byte is placed in a 1-byte buffer, and the value previously stored in this buffer is returned
    // so the CPU will receive the requested byte the next time it reads PPUDATA
    PPU.PPUDATA_read_buffer = 0;
    
    // PPU Status register
    PPU.PPUSTATUS_O =
    PPU.PPUSTATUS_S =
    PPU.PPUSTATUS_V = 0;

    // PPUCTRL and PPUMASK registers
    PPU.set_PPUCTRL(0);
    PPU.set_PPUMASK(0);
    
    // PPU latch (also called w)
    // It's toggled between 0 and 1 every time PPUSCROLL or PPUADDR get written, and reset to 0 when PPUSTATUS is read
    PPU.latch = 0;
  },
  
  // Memory access
  // -------------
  
  // Handle address mirrorings
  mirrorAddress: address => {
    
    // $4000-$FFFF: mirrors of $0000-$3FFF
    address &= 0x3FFF;
    
    // $3F00-$3FFF: palettes and mirrors
    if(address > 0x3EFF){
      
      address &= 0x3F1F;

      // $3F10: mirror of $3F00 (universal background color)
      if(address == 0x3F10) address = 0x3F00;
    }
    
    // $3000-$3EFF: mirror of $2000-$2EFF (RAM)
    else if(address > 0x2FFF){
      address -= 0x1000;
    }
    
    // $2000-$2FFF: RAM (name tables + attributes tables)
    else if(address > 0x1FFF){
      
      // 0: vertical mirroring:
      // - $2800-$2BFF is a mirror of $2000-$23FF
      // - $2C00-$2FFF is a mirror of $2400-$27FF
      if(PPU.nametable_mirroring == 0){
        address &= 0x37ff;
      }
      
      // 1: horizontal mirroring:
      // - $2400-$27FF is a mirror of $2000-$23FF
      // - $2C00-$2FFF is a mirror of $2800-$2BFF
      else if(PPU.nametable_mirroring == 1){
        address &= 0x3bff;
      }
      
      // 2: four-screen nametable
      // There's no mirroring in this case, the address is not modified
    }
    
    return address;
  },
  
  // Read a byte in from memory
  load: address => {
    return PPU.mem[PPU.mirrorAddress(address)];
  },

  // Write a byte in memory
  write: (address, value) => {
    PPU.mem[PPU.mirrorAddress(address)] = value;
  },
  
  // CPU I/O registers
  // -----------------
  
  // The CPU can read/write at the following addresses in memory to interact with the PPU
  
  // $2000 (write): set PPU Control Register 1 (PPUCTRL)
  set_PPUCTRL: value => {
    PPU.PPUCTRL_V = (value >> 7) & 1; // bit 7: trigger a NMI on VBlank
                                      // bit 6: ignored (external pin)
    PPU.PPUCTRL_H = (value >> 5) & 1; // bit 5: sprite size (0: 8x8, 1: 8x16)
    PPU.PPUCTRL_B = (value >> 4) & 1; // bit 4: background pattern table (0: $0000, 1: $1000)
    PPU.PPUCTRL_S = (value >> 3) & 1; // bit 3: sprite pattern table (0: $0000, 1: $1000, ignored in 8x16 mode)
    PPU.PPUCTRL_I = (value >> 2) & 1; // bit 2: VRAM address increment after reading from PPUDATA (0: 1, 1: 32)
    PPU.T_NN = value & 0b11;          // bits 0-1: update nametable bits in scroll register T
  },
  
  // $2001 (write): set PPU Control Register 2 (PPUMASK)
  set_PPUMASK: value => {
    PPU.PPUMASK_RGB = (value >> 5) & 7; // Bits 5-7: red/green/blue emphasis on NTSC, red/blue/green on PAL (ignored here)
    PPU.PPUMASK_s = (value >> 4) & 1;   // Bit 4: show sprites
    PPU.PPUMASK_b = (value >> 3) & 1;   // Bit 3: show background
    PPU.PPUMASK_M = (value >> 2) & 1;   // Bit 2: show sprites on leftmost 8px-wide column (ignored here)
    PPU.PPUMASK_m = (value >> 1) & 1;   // Bit 1: show background on leftmost 8px-wide column (ignored here)
    PPU.PPUMASK_G = value & 1;          // Bit 0: greyscale (all colors are ANDed with $30; ignored here)
  },
  
  // $2002 (read): get PPU Status Register (PPUSTATUS)
  get_PPUSTATUS: () => {
    
    // Update status
    t = CPU.mem[0x2002] = 
      0                         // Bits 0-4: copy of last 5 bits written to a PPU register (can be ignored)
      + (PPU.PPUSTATUS_O << 5)  // Bit 5 (O): Sprite overflow (set during sprite evaluation if more than 8 sprites in next scanline, cleared at pre-render line, buggy on the NES)
      + (PPU.PPUSTATUS_S << 6)  // Bit 6 (S): Sprite 0 hit (set when an opaque pixel from sprite 0 overlaps an opaque pixel of the background if both displays are enabled, cleared at pre-render line)
      + (PPU.PPUSTATUS_V << 7); // Bit 7 (V): VBlank (set at line 241, cleared after reading PPUSTATUS and at pre-render line)
    
    // Reset PPUSCROLL/PPUADDR latch
    PPU.latch = 0;
    
    // Reset VBlank
    PPU.PPUSTATUS_V = 0;

    // Return status (without the resets)
    return t;
  },
  
  // $2003 (write): set SPR-RAM Address Register (OAMADDR)
  set_OAMADDR: address => {
    PPU.OAMADDR = address;
  },
  
  // $2004h (read/write): SPR-RAM Data Register (OAMDATA, address must be set first). Not readable on Famicom
  get_OAMDATA: () => {
    return PPU.OAM[PPU.OAMADDR];
  },

  set_OAMDATA: value => {
    PPU.OAM[PPU.OAMADDR] = value;
    PPU.OAMADDR++;
    PPU.OAMADDR %= 0x100;
  },
  
  // $2005 (write twice: vertical, then horizontal): PPU Background Scrolling Offset (PPUSCROLL)
  set_PPUSCROLL: value => {

    // Latch equals 0: first write, update horizontal scroll
    if(PPU.latch == 0){
      
      // Update X bits of scroll register T (XXXXXxxx = value)
      PPU.T_XXXXX = value >> 3;
      PPU.xxx = value & 0b111;
    }
    
    // Latch equals 1: second write, update vertical scroll
    // If value is between 240 and 255, it becomes negative (-16 to -1) and the rendering is glitchy (ignored here)
    else {
      
      // Update Y bits of scroll register T (YYYYYyyy = value)
      PPU.T_YYYYY = value >> 3;
      PPU.T_yyy = value & 0b111;
    }
    
    // Toggle latch
    PPU.latch ^= 1;
  },
  
  // $2006 (write twice): VRAM Address Register (PPUADDR)
  set_PPUADDR: value => {
    
    // Latch 0: first write, set high byte of address and update Y scrolling
    if(PPU.latch == 0){
      
      PPU.PPUADDR = value << 8;
      
      // Update Y bits of scroll register T (00yyNNYY)
      PPU.T_yyy = (value >> 4) & 0b11; // only bits 1 and 2 of yyy are set. Bit 3 is corrupted to 0
      PPU.T_NN = (value >> 2) & 0b11;
      PPU.T_YYYYY = (value & 0b11) << 3; // read the two high bits of YYYYY
    } 
    
    // Latch 1: second write, set low byte of address and update X and Y scrolling
    else {
      
      PPU.PPUADDR += value;
      
      // Update X and Y bits of scroll register T (YYYXXXXX)
      PPU.T_YYYYY += (value >> 5); // read the three low bits of YYYYY
      PPU.T_XXXXX = value & 0b11111;
      
      // Copy T in V, containing the scroll values to be used in the next scanline
      PPU.V_yyy = PPU.T_yyy;
      PPU.V_YYYYY = PPU.T_YYYYY;
      PPU.V_XXXXX = PPU.T_XXXXX;
      PPU.V_NN = PPU.T_NN;
    }
    
    // Toggle latch
    PPU.latch ^= 1;
  },
  
  // $2007h (read/write): VRAM Data Register (PPUDATA, an address must be set using PPUADDR before accessing this)
  
  // Write
  set_PPUDATA: value => {
    PPU.write(PPU.PPUADDR, value);
    PPU.PPUADDR += PPU.PPUCTRL_I ? 32 : 1; // increment address (1 or 32 depending on bit 2 of PPUCTRL)
  },
  
  // Read
  get_PPUDATA: () => {
    
    // PPUADDR between $0000 and $3EFF: buffered read
    // Each read fills a 1-byte buffer and returns the value previously stored in that buffer
    if(PPU.PPUADDR <= 0x3F00){
      t = PPU.PPUDATA_read_buffer;
      PPU.PPUDATA_read_buffer = PPU.load(PPU.PPUADDR);
    }
    
    // PPUADDR higher than $3EFF: direct read
    else {
      t = PPU.load(PPU.PPUADDR);
    }
    
    PPU.PPUADDR += PPU.PPUCTRL_I === 1 ? 32 : 1; // increment address (1 or 32 depending on bit 2 of PPUCTRL)
    return t;
  },

  // $4014: (write): copy a 256-byte page of CPU memory into the OAM memory (OAMDMA)
  set_OAMDMA: value => {
    for(var i = PPU.OAMADDR; i < 256; i++){
      PPU.OAM[i] = CPU.mem[value * 0x100 + i];;
    }
    
    // Consume 513 CPU cycles
    // (or 514 cycles when the current CPU cycle is odd. Ignored here)
    for(i = 0; i < 513; i++){
      CPU.tick();
    }
  },
  
  // Rendering
  // ---------
  
  // Background:
  // The data stored in VRAM represents a 512*480px background, separated in four 256*240px screens
  // Each screen can contain 32*30 tiles, and each tile measures 8*8px and can use a 4-color palette
  // For each screen, a nametable in VRAM tells which tiles to draw, and an attribute table tells which palettes to use
  // Attributes hold four 2-bit values, each of these values indicates which background subpalette to use for a given tile
  //
  // Attribute table for a given nametable (8*8 attributes):
  //
  //        0  1  2  3  4  5  6  7
  //      +--+--+--+--+--+--+--+--+
  // 2xC0 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xC8 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xD0 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xD8 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xE0 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xE8 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xF0 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  // 2xF8 |  |  |  |  |  |  |  |  |
  //      +--+--+--+--+--+--+--+--+
  //
  //  One attribute:    /    \  
  //                  /       \
  //                /          \
  //              /             \
  //            /                \
  //
  //           bits 0-1   bits 2-3
  //          +-------------------+
  //          |  Tile   |  Tile   |
  //          |         |         |
  //          |  X, Y   |  X+1, Y |
  //          |---------+---------|
  //          |  Tile   |   Tile  |
  //          |         |         |
  //          |  X, Y+1 | X+1,Y+1 |
  //          +-------------------+
  //           bits 4-5   bits 6-7
  //
  //
  // Render one line of the VRAM visualizer and fill a buffer with all the non-transparent pixels
  // The line number (y) is a value vetween 0 and 480
  drawVramScanline: y => {
    
    var i, j, X, Y, nametable, bits, colors, pixel;
    
    // Reset pixel buffer
    PPU.vramPixelBuffer = [];

    // Y tile coordinate (0-60)
    Y = ~~(y/8); 

    // For each tile of the scanline (X tile coordinate between 0 and 64):
    for(X = 0; X < 64; X++){
      
      // Get the nametable address in PPU memory:
      // $2000-$23BF: top left screen
      // $2400-$27BF: top right screen
      // $2800-$2BBF: bottom left screen
      // $2C00-$2FBF: bottom right screen
      nametable = 0x2000 + (0x800 * (Y > 29)) + (0x400 * (X > 31));
      
      // Get the attribute table address in PPU memory:
      // $23C0-$23FF: top left screen
      // $27C0-$27FF: top right screen
      // $2BC0-$2BFF: bottom left screen
      // $2FC0-$2FFF: bottom right screen
      // attributetable = nametable + 0x3C0;
      
      // Get the attribute byte for the group including the current tile:
      // attribute_X = (X%32) >> 2; // 0-7
      // attribute_Y = (Y%30) >> 2; // 0-7
      // attribute = PPU.load(attributetable + attribute_Y * 8 + attribute_X);
      
      // Get the attribute's 2-bit value for the current title:
      // bits_X = ((X % 32) >> 1) & 1; // 0-1
      // bits_Y = ((Y % 30) >> 1) & 1; // 0-1
      // bits = ((attribute >> (4 * bits_Y + 2 * bits_X)) & 0b11); // 0-3
      
      // Golfed here:
      bits = (
        PPU.load(nametable + 0x3C0 + ((Y%30) >> 2) * 8 + ((X%32) >> 2))
        >> 
        (
          4 * (((Y % 30) >> 1) & 1)
          + 
          2 * (((X % 32) >> 1) & 1)
        )
      ) & 0b11;

      // Get the subpalette represented by these bits:
      // Background palette is stored at $3F00-$3F0F (16 colors, 4 subpalette of 4 colors)
      // The values stored in the palettes are indexes of the 64 system colors (PPU.systemPalette)
      // The first color of each subpalette is ignored (*), the value at $3F00 (universal background color) is used instead
      // (*) during forced blanking (background & sprites disabled), if PPUADDR points to a subpalette's color 0, this color is used as universal background color (ignored here)
      colors = [
        PPU.systemPalette[PPU.mem[0x3F00]],                 // universal background color
        PPU.systemPalette[PPU.mem[0x3F00 + bits * 4 + 1]],  // color 1 of current subpalette
        PPU.systemPalette[PPU.mem[0x3F00 + bits * 4 + 2]],  // color 2 of current subpalette
        PPU.systemPalette[PPU.mem[0x3F00 + bits * 4 + 3]],  // color 3 of current subpalette
      ];
      
      // Get the tile's address:
      // The bit B of PPUCTRL tells if the tile's graphics are stored in the first or second CHR-ROM bank ($0000-$0FFF or $1000-$1FFF)
      // The tile's index within the current CHR-ROM bank is stored in the nametable
      // tile = PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable + (Y % 30) * 32 + (X % 32))
      
      // Get the pixels values:
      // The pixels of each tile are encoded on 2 bits
      // The value of a pixel (0-3) corresponds to a color from the current subpalette
      // Each tile is stored on 16 bytes, the first 8 bytes represent the "high bit" of each pixel, and the last 8 bytes the "low bit"
      
      // Let x and y be the coordinates of the pixels to draw inside the current tile (x = 0-7, y = 0-7)
      y %= 8;
      for(x = 0; x < 8; x++){
        
        // The current line of 8 pixels is encoded on 2 bytes:
        // byte1 = PPU.load(tile * 16 + y);
        // byte2 = PPU.load(tile * 16 + y + 8);
        
        // And the current pixel's value is encoded as:
        // pixel = ((byte2 >> (7 - x)) & 1) * 2 + ((byte1 >> (7 - x)) & 1);
        
        // If the pixel's value is 0, the pixel is considered transparent and the universal background color is rendered
        // But if it's opaque (non-zero), its color is stored in the current line's pixel buffer
        // This buffer will be useful to render the sprites either in the front or behind the background tiles
        
        // Golfed here:
        t = PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable+(Y % 30) * 32 + (X % 32)) * 16 + y;
        if(pixel = ((PPU.load(t + 8) >> (7 - x)) & 1) * 2 + ((PPU.load(t) >> (7 - x)) & 1)){
          PPU.vramPixelBuffer[X * 8 + x] = colors[pixel];
        }
        
        // Render the pixel on the VRAM visualizer
        NES.vramBuffer32[(Y * 8 + y) * 512 + (X * 8 + x)] = colors[pixel];
      }
    }
  },
  
  // Screen:
  // Backround rendering and sprite rendering can be enabled or disabled using bits b and s of PPUMASK
  // Background pixels are stored in a buffer using drawVramScanline()
  // Up to 64 sprites can be drawn on screen, either on the foreground or behind the background tiles
  // Sprites are drawn from front to back (sprite 0 to sprite 63) and can overlap
  // A background sprite can overlap a foreground sprite, in that case it behaves like a clipping mask (ex: SMB's mushroom coming out of a question block)
  // Sprites can measure 8*8px or 8*16px (if bit H of PPUCTRL is set)
  // If 8*16px sprites are enabled, two consecutive tiles from the CHR-ROM are drawn on screen (the first one on top, the second one on bottom) with the same palette
  // Contrary to background tiles:
  // - sprites tiles use a dedicated sprite color palette ($3F10-$3F1F), divided in 4 subpalettes
  // - the first color of each subpalette is always "transparent"
  // - sprites can be flipped horizontally and/or vertically
  // As soon as an opaque pixel of the sprite 0 overlaps an opaque pixel of the background, a "sprite 0 hit" is detected (bit S of PPUSTATUS is set)
  
  // Each sprite is encoded on 4 bytes in the OAM memory:
  // Byte 0: Y coordinate
  // Byte 1: 
  //  * 8x8 mode: tile index in current tile bank
  //  * 8x16 mode: bit 0 = tile bank / bits 1-7 = top tile index
  // Byte 2:
  //  * bits 0-1: palette (4-7)
  //  * bits 2-4: always 0
  //  * bit 5: priority (0: in front of the background, 1: behind the background)
  //  * bit 6: X flip
  //  * bit 7: Y flip
  // Byte 3: X coordinate
  
  // Render one final scanline on screen (background + sprites):
  // The scanline number (y) is a value vetween 0 and 240
  drawScanline: y => {
    
    var i, x, scanlineSprites, spriteScanlineAddress, bits, colors;

    // Find which sprites are present in the current scanline:
    // Reset the list
    scanlineSprites = [];
    
    // Loop on all the sprites
    for(i = 0; i < 64; i++){
      
      // If the current scanline is between the top of the sprite and its bottom (8px or 16px lower, depending on bit H of PPUCTRL)
      if(y >= PPU.OAM[i * 4] && y < PPU.OAM[i * 4] + (PPU.PPUCTRL_H ? 16 : 8)){
        
        // If more than 8 sprites are found, set overflow flag (bit 0 of PPUSTATUS) and stop checking
        if(scanlineSprites.length == 8) {
          PPU.PPUSTATUS_O = 1;
          break;
        }
        
        // Else, the sprite is visible in the current scanline. Add it to the list
        scanlineSprites.push(i);
      }
    }
    
    // Draw the scanline's pixels:
    for(x = 0; x < 256; x++){
      
      // Draw background tiles if background rendering is enabled
      // X and Y scrolling are applied when fetching the pixels values inside vramBuffer32
      if(PPU.PPUMASK_b){
        NES.frameBuffer32[y * 256 + x] = NES.vramBuffer32[((y + PPU.scroll_y) % 480) * 512 + (x + PPU.scroll_x) % 512];
      }
      
      // Then, for each sprite from back to front:
      for(i = scanlineSprites.length - 1; i >= 0; i--){
        
        // If this sprite is present at this pixel (if x is between the left column and right column of the sprite)
        if(x >= PPU.OAM[scanlineSprites[i] *4 + 3] && x < PPU.OAM[scanlineSprites[i] * 4 + 3] + 8){
          
          // Retrieve the sprite's subpalette (bits 0-1 of byte 2 of sprite i in OAM memory)
          bits = PPU.OAM[scanlineSprites[i] * 4 + 2] & 0b11;
          colors = [
            ,                                                   // transparent
            PPU.systemPalette[PPU.mem[0x3F10 + bits * 4 + 1]],  // color 1 of current subpalette
            PPU.systemPalette[PPU.mem[0x3F10 + bits * 4 + 2]],  // color 2 of current subpalette
            PPU.systemPalette[PPU.mem[0x3F10 + bits * 4 + 3]],  // color 3 of current subpalette
          ];
          
          // Retrieve the address of the current sprite's scanline in CHR-ROM:
          t = scanlineSprites[i] * 4;
          o = PPU.OAM[t];
          spriteScanlineAddress =
          
            // CHR-ROM bank
            (
              PPU.PPUCTRL_H
              
              // 8*16
              ? (PPU.OAM[t + 1] & 1)
              
              // 8*8
              : PPU.PPUCTRL_S
            ) * 0x1000
            
            // Tile
            + (PPU.OAM[t + 1] & (0xFF - PPU.PPUCTRL_H)) * 16
            
            // Scanline
            + (PPU.OAM[t + 2] & 0b10000000
              
              // Y flip
              ? (7 - y + o + 8 * ((y < o + 8 && PPU.PPUCTRL_H) + PPU.PPUCTRL_H))

              // No Y flip
              : (8 + y - o - 8 * (y < o + 8))
            );

          // Get pixel position within the sprite scanline
          t = x - PPU.OAM[scanlineSprites[i] * 4 + 3];
          
          // Handle horizontal flip
          o = (PPU.OAM[scanlineSprites[i] * 4 + 2] & 0b1000000) ? t : 7 - t;
          
          // Get current pixel value, and check if it's opaque (value: 1, 2 or 3)
          if(pixel = ((PPU.load(spriteScanlineAddress + 8) >> o) & 1) * 2 + ((PPU.load(spriteScanlineAddress) >> o) & 1)){
            
            // If sprite rendering is enabled, draw it on the current frame
            // But if priority bit is 1 and background rendering is enabled: let the background tile's pixel displayed on top if it's opaque
            if(PPU.PPUMASK_s && !((PPU.OAM[scanlineSprites[i] * 4 + 2] & 0b100000) && PPU.vramPixelBuffer[x+PPU.scroll_x] && PPU.PPUMASK_b)){
              NES.frameBuffer32[y * 256 + x] = colors[pixel];
            }
            
            // Sprite 0 hit detection
            if(scanlineSprites[i] === 0 && !PPU.PPUSTATUS_S && pixel && PPU.vramPixelBuffer[x] && PPU.PPUMASK_s && PPU.PPUMASK_b){
              PPU.PPUSTATUS_S = 1;
            }
          }
        }
      }
    }
  },
  
  // Clock
  // -----
  
  // Clock one PPU cycle
  tick: () => {
    
    PPU.dot++;
    
    // The PPU renders one dot (one pixel) per cycle
    // At the end of each scanline (341 dots), a new scanline starts
    // The screen is complete when 240 scanlines are rendered
    if(PPU.dot > 341){
      PPU.dot = 0;
      PPU.scanline++;
      
      // Update scroll
      PPU.V_XXXXX = PPU.T_XXXXX;
      PPU.V_NN = (PPU.V_NN & 0b10) + (PPU.T_NN & 0b01);
      
      // Visible scanlines
      if(PPU.scanline < 241){
        PPU.drawVramScanline((PPU.scanline+PPU.scroll_y) % 480 - 1);
        PPU.drawVramScanline(((PPU.scanline+PPU.scroll_y) % 480 - 1) + 240);
        PPU.drawScanline(PPU.scanline - 1);
        
        // Update scroll
        PPU.scroll_x = (PPU.V_NN & 0b1) * 256 + PPU.V_XXXXX * 8 + PPU.xxx;
        
        // Debug
        //NES.vramCtx.fillStyle = "pink";
        //NES.vramCtx.rect(PPU.scroll_x -3, (PPU.scanline + PPU.scroll_y-3) % 480, (PPU.scanline == 1 || PPU.scanline == 240) ? 256 : 6, 6);
        //NES.vramCtx.rect((PPU.scroll_x - 3 + 256) % 512, (PPU.scanline + PPU.scroll_y - 3) % 480, 6, 6);
      }
      
      // VBlank starts at scanline 241 (a NMI interrupt is triggered, and the frame is displayed on the canvas)
      else if(PPU.scanline == 241){
        
        // VBlank + NMI
        PPU.PPUSTATUS_V = 1;
        CPU.requestIrq(CPU.NMI);
        
        // Output frameBuffer on canvas
        NES.frameData.data.set(NES.frameBuffer8);
        NES.frameCtx.putImageData(NES.frameData, 0, 0);
      
        // Debug (VRAM view)
        //NES.vramData.data.set(NES.vramBuffer8);
        //NES.vramCtx.putImageData(NES.vramData, 0, 0);
        //if(PPU.PPUMASK_b){
        //  NES.vramCtx.fill();
        //}
      }
      
      // VBlank ends at the pre-render scanline, and PPUSTATUS is reset
      else if(PPU.scanline == 261){
        PPU.PPUSTATUS_O =
        PPU.PPUSTATUS_S =
        PPU.PPUSTATUS_V = 0;
      }
      
      // When the pre-render scanline is completed, a new frame starts
      else if(PPU.scanline == 262){
        PPU.scanline = 0;
        PPU.endFrame = 1;
        
        // Update scroll
        PPU.V_YYYYY = PPU.T_YYYYY;
        PPU.V_yyy = PPU.T_yyy;
        PPU.V_NN = (PPU.V_NN & 0b01) + (PPU.T_NN & 0b10);
        PPU.scroll_y = (PPU.V_NN >> 1) * 240 + PPU.V_YYYYY * 8 + PPU.V_yyy;
      }
    }
  },
};
