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
// | $3F04       | 1B    | Universal bg color replaces it except in forced blanking  |
// | $3F05-$3F07 | 3B    | Background palette 1                                      |
// | $3F08       | 1B    | Universal bg color replaces it except in forced blanking  |
// | $3F09-$3F0B | 3B    | Background palette 2                                      |
// | $3F0C       | 1B    | Universal bg color replaces it except in forced blanking  |
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
//      ---+-------------------+-------------------+
//  y=240  | idle scanline                         |
//      ---+---------------------------------------+
//  y=241  | vertical blanking (idle)              |
//         | - 20 scanlines long on NTSC consoles  |
//  y=260  | - 70 scanlines on PAL consoles        |
//      ---+-------------------------------------+-+
//  y=261  | pre-render scanline                 |*|
//  or -1 -+-------------------------------------+-+

// Globals
// -------

var
t,
o,
scanline,
dot,
PPU_mem,
OAM,
vramPixelBuffer,
V_yyy,
V_NN,
V_YYYYY,
V_XXXXX,
T_yyy,
T_NN,
T_YYYYY,
T_XXXXX,
xxx, 
scroll_x,
scroll_y,
PPUDATA_read_buffer,
PPUSTATUS_O,
PPUSTATUS_S,
PPUSTATUS_V,
latch,
PPUCTRL_V,
PPUCTRL_H,
PPUCTRL_B,
PPUCTRL_S,
PPUCTRL_I,
PPUMASK_s,
PPUMASK_b,
OAMADDR,
PPUADDR,
mirroring,
endFrame,

  
// System palette
// An array of 64 RGB colors, inspired by the 3DS VC palette, stored in AABBGGRR format.
systemPalette = (
    "777812a0090470810a00a007024040050130531000000000"+
    "bbbe70e32f08b0b50e02d04c0780900a0390880111000000"+
    "ffffb3f95f8af7fb7f67f39f3bf1d84d49f5de0333000000"+
    "ffffeafdcfcdfcfdcfbbfadfaefafebfacfbff9888000000"
  )
  .match(/.../g)
  .map(c => +("0xff" + c[0] + c[0] + c[1] + c[1] + c[2] + c[2])),

// Reset the PPU
ppu_reset = () => {

  // Reset PPU memory (64KB) and OAM memory (256b)
  PPU_mem = [];
  OAM = [];
  
  // Coordinates of the current pixel
  scanline =  // Y between 0 and 261 on NTSC (or 311 on PAL)
  dot =       // X between 0 and 340 (on scanline 261, alternate between 239 and 240 if background rendering is enabled)
  
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
  V_yyy = 
  V_NN = 
  V_YYYYY = 
  V_XXXXX = 
  
  // T: value of scroll on current scanline (T = 0yyyNNYYYYYXXXXX)
  T_yyy = 
  T_NN = 
  T_YYYYY = 
  T_XXXXX = 

  // Fine X scroll (xxx, also called w)
  xxx = 
  
  // Effective PPU scroll
  scroll_x = 
  scroll_y = 
  
  // PPU Status register
  PPUSTATUS_O =
  PPUSTATUS_S =
  PPUSTATUS_V =
  
  // PPU latch (also called w)
  // It's toggled between 0 and 1 every time PPUSCROLL or PPUADDR get written, and reset to 0 when PPUSTATUS is read
  latch = 0;

  // Reset PPUCTRL and PPUMASK registers
  set_PPUCTRL(0);
  set_PPUMASK(0);
},

// Memory access
// -------------

// Handle address mirrorings
mirrorAddress = address => {
  
  // $4000-$FFFF: mirrors of $0000-$3FFF
  address &= 0x3FFF;
  
  // $3F00-$3FFF: palettes and mirrors
  if(address > 0x3EFF){
    
    address &= 0x3F1F;

    // $3F10: mirror of $3F00
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
    
    // 1: horizontal mirroring:
    // - $2400-$27FF is a mirror of $2000-$23FF
    // - $2C00-$2FFF is a mirror of $2800-$2BFF
    
    // 2: four-screen nametable
    // There's no mirroring in this case, the address is not modified
    address &= (0x37ff + 0x400 * mirroring);
  }
  
  return address;
},

// Read a byte in memory
ppu_read = address => {
  
  // $3F04, $3F08, $3F0C: replaced by $3F00 (universal background color) except during forced blanking (TODO)
  if((address & 0xFFF3) == 0x3F00) address = 0x3F00;
    
  return PPU_mem[mirrorAddress(address)];
},

// PPU I/O registers
// -----------------

// TODO: move all this in memory.js

// The CPU can read/write at the following addresses in memory to interact with the PPU

// $2000 (write): set PPU Control Register 1 (PPUCTRL)
set_PPUCTRL = value => {
  PPUCTRL_V = (value >> 7) & 1;   // bit 7: trigger a NMI on VBlank
  //PPUCTRL_P = (value >> 6) & 1  // bit 6: external pin controlling backdrop color (ignored here)
  PPUCTRL_H = (value >> 5) & 1;   // bit 5: sprite size (0: 8x8, 1: 8x16)
  PPUCTRL_B = (value >> 4) & 1;   // bit 4: background pattern table (0: $0000, 1: $1000)
  PPUCTRL_S = (value >> 3) & 1;   // bit 3: sprite pattern table (0: $0000, 1: $1000, ignored in 8x16 mode)
  PPUCTRL_I = (value >> 2) & 1;   // bit 2: VRAM address increment after reading from PPUDATA (0: 1, 1: 32)
  T_NN = value & 0b11;            // bits 0-1: update nametable bits in scroll register T
},

// $2001 (write): set PPU Control Register 2 (PPUMASK)
set_PPUMASK = value => {
  //PPUMASK_RGB = (value >> 5) & 7; // Bits 5-7: red/green/blue emphasis on NTSC, red/blue/green on PAL (ignored here)
  PPUMASK_s = (value >> 4) & 1;     // Bit 4: show sprites
  PPUMASK_b = (value >> 3) & 1;     // Bit 3: show background
  //PPUMASK_M = (value >> 2) & 1;   // Bit 2: show sprites on leftmost 8px-wide column (ignored here)
  //PPUMASK_m = (value >> 1) & 1;   // Bit 1: show background on leftmost 8px-wide column (ignored here)
  //PPUMASK_G = value & 1;          // Bit 0: greyscale (all colors are ANDed with $30; ignored here)
},

// $2002 (read): get PPU Status Register (PPUSTATUS)
get_PPUSTATUS = () => {
  
  // Update status
  t = cpu_mem[0x2002] = 
    // 0 +                // Bits 0-4: copy of last 5 bits written to a PPU register (can be ignored)
    (PPUSTATUS_O << 5)    // Bit 5 (O): Sprite overflow (set during sprite evaluation if more than 8 sprites in next scanline, cleared at pre-render line, buggy on the NES)
    + (PPUSTATUS_S << 6)  // Bit 6 (S): Sprite 0 hit (set when an opaque pixel from sprite 0 overlaps an opaque pixel of the background if both displays are enabled, cleared at pre-render line)
    + (PPUSTATUS_V << 7); // Bit 7 (V): VBlank (set at line 241, cleared after reading PPUSTATUS and at pre-render line)
  
  // Reset PPUSCROLL/PPUADDR latch
  latch = 0;
  
  // Reset VBlank
  PPUSTATUS_V = 0;

  // Return status (without the resets)
  return t;
},

// $2003 (write): set SPR-RAM Address Register (OAMADDR)
set_OAMADDR = address => {
  OAMADDR = address;
},

// $2004h (read/write): SPR-RAM Data Register (OAMDATA, address must be set first). Not readable on Famicom
get_OAMDATA = () => {
  return OAM[OAMADDR];
},

set_OAMDATA = value => {
  OAM[OAMADDR] = value;
  OAMADDR++;
  OAMADDR %= 0x100;
},

// $2005 (write twice: vertical, then horizontal): PPU Background Scrolling Offset (PPUSCROLL)
set_PPUSCROLL = value => {

  // Latch equals 1: second write, update vertical scroll
  // If value is between 240 and 255, it becomes negative (-16 to -1) and the rendering gets glitchy (ignored here)
  if(latch){
    
    // Update Y bits of scroll register T (YYYYYyyy = value)
    T_YYYYY = value >> 3;
    T_yyy = value & 0b111;
  }
  
  // Latch equals 0: first write, update horizontal scroll
  else {
    
    // Update X bits of scroll register T (XXXXXxxx = value)
    T_XXXXX = value >> 3;
    xxx = value & 0b111;
  }
  
  // Toggle latch
  latch ^= 1;
},

// $2006 (write twice): VRAM Address Register (PPUADDR)
set_PPUADDR = value => {
  
  // Latch equals 1: second write, set low byte of address and update X and Y scrolling
  if(latch) {
    
    PPUADDR += value;
    
    // Update X and Y bits of scroll register T (YYYXXXXX)
    T_YYYYY += (value >> 5); // read the three low bits of YYYYY
    T_XXXXX = value & 0b11111;
    
    // Copy T in V, containing the scroll values to be used in the next scanline
    V_yyy = T_yyy;
    V_YYYYY = T_YYYYY;
    V_XXXXX = T_XXXXX;
    V_NN = T_NN;
  }
  // Latch equals 0: first write, set high byte of address and update Y scrolling
  else {
    
    PPUADDR = value << 8;
    
    // Update Y bits of scroll register T (00yyNNYY)
    T_yyy = (value >> 4) & 0b11;   // only bits 0 and 1 of yyy are set. Bit 2 is corrupted to 0
    T_NN = (value >> 2) & 0b11;
    T_YYYYY = (value & 0b11) << 3; // read the two high bits of YYYYY
  }
  
  // Toggle latch
  latch ^= 1;
},

// $2007h (read/write): VRAM Data Register (PPUDATA, an address must be set using PPUADDR before accessing this)

// Write
set_PPUDATA = value => {
  PPU_mem[mirrorAddress(PPUADDR)] = value;
  
  // increment address (1 or 32 depending on bit 2 of PPUCTRL)
  PPUADDR += PPUCTRL_I ? 32 : 1;
},

// Read
get_PPUDATA = () => {
  
  // PPUADDR between $0000 and $3EFF: buffered read
  // Each read fills a 1-byte buffer and returns the value previously stored in that buffer
  if(PPUADDR <= 0x3F00){
    t = PPUDATA_read_buffer;
    PPUDATA_read_buffer = ppu_read(PPUADDR);
  }
  
  // PPUADDR higher than $3EFF: direct read
  else {
    t = ppu_read(PPUADDR);
  }
  
  // increment address (1 or 32 depending on bit 2 of PPUCTRL)
  PPUADDR += PPUCTRL_I === 1 ? 32 : 1; 
  
  return t;
},

// $4014: (write): copy a 256-byte page of CPU memory into the OAM memory (OAMDMA)
set_OAMDMA = value => {
  for(var i = OAMADDR; i < 256; i++){
    OAM[i] = cpu_mem[value * 0x100 + i];;
  }
  
  // Consume 513 CPU cycles
  // (or 514 cycles when the current CPU cycle is odd. Ignored here)
  for(i = 0; i < 513; i++){
    cpu_tick();
  }
  
  NES.haltCycles(513)
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
drawVramScanline = y => {
  
  var i, j, X, Y, nametable, bits, pixel;
  
  // Reset pixel buffer
  vramPixelBuffer = [];

  // Y tile coordinate (0-60)
  Y = ~~(y / 8); 

  // For each tile of the scanline (X tile coordinate between 0 and 64):
  for(X = 64; X--;){
    
    // Get the nametable address in PPU memory:
    // $2000-$23BF: top left screen
    // $2400-$27BF: top right screen
    // $2800-$2BBF: bottom left screen
    // $2C00-$2FBF: bottom right screen
    nametable = 0x2000 + (0x800 * (Y > 29 ? 1 : 0)) + (0x400 * (X > 31 ? 1 : 0));
    
    // Get the attribute table address in PPU memory:
    // $23C0-$23FF: top left screen
    // $27C0-$27FF: top right screen
    // $2BC0-$2BFF: bottom left screen
    // $2FC0-$2FFF: bottom right screen
    // attributetable = nametable + 0x3C0;
    
    // Get the attribute byte for the group including the current tile:
    // attribute_X = (X % 32) >> 2; // 0-7
    // attribute_Y = (Y % 30) >> 2; // 0-7
    // attribute = ppu_read(attributetable + attribute_Y * 8 + attribute_X);
    
    // Get the attribute's 2-bit value for the current title:
    // bits_X = ((X % 32) >> 1) & 1; // 0-1
    // bits_Y = ((Y % 30) >> 1) & 1; // 0-1
    // bits = ((attribute >> (4 * bits_Y + 2 * bits_X)) & 0b11); // 0-3
    
    // Golfed here:
    bits = (
      ppu_read(nametable + 0x3C0 + ((Y % 30) >> 2) * 8 + ((X % 32) >> 2))
      >> 
      (
        4 * (((Y % 30) >> 1) & 1)
        + 
        2 * (((X % 32) >> 1) & 1)
      )
    ) & 0b11;

    // Get the subpalette represented by these bits:
    // Background palette is stored at $3F00-$3F0F (16 colors, 4 subpalette of 4 colors)
    // The values stored in the palettes are indexes of the 64 system colors (systemPalette)
    // The first color of each subpalette is ignored (*), the value at $3F00 (universal background color) is used instead
    // (*) during forced blanking (background & sprites disabled), if PPUADDR points to a subpalette's color 0, this color is used as universal background color (TODO)
    colors = [
      systemPalette[ppu_read(0x3F00 + bits * 4)],  // universal background color
      systemPalette[ppu_read(0x3F00 + bits * 4 + 1)],  // color 1 of current subpalette
      systemPalette[ppu_read(0x3F00 + bits * 4 + 2)],  // color 2 of current subpalette
      systemPalette[ppu_read(0x3F00 + bits * 4 + 3)],  // color 3 of current subpalette
    ];
    
    // Get the tile's address:
    // The bit B of PPUCTRL tells if the tile's graphics are stored in the first or second CHR-ROM bank ($0000-$0FFF or $1000-$1FFF)
    // The tile's index within the current CHR-ROM bank is stored in the nametable
    // tile = PPUCTRL_B * 0x1000 + ppu_read(nametable + (Y % 30) * 32 + (X % 32))
    
    // Get the pixels values:
    // The pixels of each tile are encoded on 2 bits
    // The value of a pixel (0-3) corresponds to a color from the current subpalette
    // Each tile is stored on 16 bytes, the first 8 bytes represent the "high bit" of each pixel, and the last 8 bytes the "low bit"
    
    // Let x and y be the coordinates of the pixels to draw inside the current tile (x = 0-7, y = 0-7)
    y %= 8;
    for(x = 8; x--;){
      
      // The current line of 8 pixels is encoded on 2 bytes:
      // byte1 = ppu_read(tile * 16 + y);
      // byte2 = ppu_read(tile * 16 + y + 8);
      
      // And the current pixel's value is encoded as:
      // pixel = ((byte2 >> (7 - x)) & 1) * 2 + ((byte1 >> (7 - x)) & 1);
      
      // If the pixel's value is 0, the pixel is considered transparent and the universal background color is rendered
      // But if it's opaque (non-zero), its color is stored in the current line's pixel buffer
      // This buffer will be useful to render the sprites either in the front or behind the background tiles
      
      // Golfed here:
      t = PPUCTRL_B * 0x1000 + ppu_read(nametable + (Y % 30) * 32 + (X % 32)) * 16 + y;
      if(pixel = ((ppu_read(t + 8) >> (7 - x)) & 1) * 2 + ((ppu_read(t) >> (7 - x)) & 1)){
        vramPixelBuffer[X * 8 + x] = colors[pixel];
      }
      
      // Debug: Render the pixel on the VRAM visualizer
      //NES.vramBuffer32[(Y * 8 + y) * 512 + (X * 8 + x)] = systemPalette[ppu_read(0x3F00 + bits * 4 + pixel)];
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
drawScanline = y => {
  
  var i, x, scanlineSprites, spriteScanlineAddress, bits, pixel;

  // Find which sprites are present in the current scanline:
  // Reset the list
  scanlineSprites = [];
  colors = [];
  
  // Loop on all the sprites
  for(i = 0; i < 64; i++){
    
    // If the current scanline is between the top of the sprite and its bottom (8px or 16px lower, depending on bit H of PPUCTRL)
    if(y >= OAM[i * 4] && y < OAM[i * 4] + (PPUCTRL_H ? 16 : 8)){
      
      // If more than 8 sprites are found, set overflow flag (bit 0 of PPUSTATUS) and stop checking
      if(scanlineSprites.length == 8) {
        PPUSTATUS_O = 1;
        break;
      }
      
      // Else, the sprite is visible in the current scanline. Add it to the list
      scanlineSprites.push(i);
      
      // Retrieve the sprite's subpalette (bits 0-1 of byte 2 of sprite i in OAM memory)
      bits = OAM[i * 4 + 2] & 0b11;
      colors.push([
        0,                                              // transparent
        systemPalette[PPU_mem[0x3F10 + bits * 4 + 1]],  // color 1 of current subpalette
        systemPalette[PPU_mem[0x3F10 + bits * 4 + 2]],  // color 2 of current subpalette
        systemPalette[PPU_mem[0x3F10 + bits * 4 + 3]],  // color 3 of current subpalette
      ]);
    }
  }
  
  // Draw the scanline's pixels:
  for(x = 256; x--;){
    
    // Draw background tiles if background rendering is enabled
    // Use universal background color if no background tile is present
    // X and Y scrolling are applied when fetching the pixels values inside vramBuffer32
    if(PPUMASK_b){
      NES.frameBuffer32[y * 256 + x] = vramPixelBuffer[(x + scroll_x) % 512] || systemPalette[ppu_read(mirrorAddress(0x3F00))];
    }
    
    // Then, for each sprite from back to front:
    for(i = scanlineSprites.length - 1; i >= 0; i--){
      
      // If this sprite is present at this pixel (if x is between the left column and right column of the sprite)
      if(x >= OAM[scanlineSprites[i] * 4 + 3] && x < OAM[scanlineSprites[i] * 4 + 3] + 8){
        
        // Retrieve the address of the current sprite's scanline in CHR-ROM:
        t = scanlineSprites[i] * 4;
        o = OAM[t];
        spriteScanlineAddress =
        
          // CHR-ROM bank
          (
            PPUCTRL_H
            
            // 8*16
            ? (OAM[t + 1] & 1)
            
            // 8*8
            : PPUCTRL_S
          ) * 0x1000
          
          // Tile
          + (OAM[t + 1] & (0xFF - PPUCTRL_H)) * 16
          
          // Scanline
          + (OAM[t + 2] & 0b10000000
            
            // Y flip
            ? (7 - y + o + 8 * ((y < o + 8 && PPUCTRL_H) + PPUCTRL_H))

            // No Y flip
            : (8 + y - o - 8 * (y < o + 8))
          );

        // Get pixel position within the sprite scanline
        t = x - OAM[scanlineSprites[i] * 4 + 3];
        
        // Handle horizontal flip
        o = (OAM[scanlineSprites[i] * 4 + 2] & 0b1000000) ? t : 7 - t;
        
        // Get current pixel value, and check if it's opaque (value: 1, 2 or 3)
        if(pixel = ((ppu_read(spriteScanlineAddress + 8) >> o) & 1) * 2 + ((ppu_read(spriteScanlineAddress) >> o) & 1)){
          
          // If sprite rendering is enabled, draw it on the current frame
          // But if priority bit is 1 and background rendering is enabled: let the background tile's pixel displayed on top if it's opaque
          // Temp hack: don't show sprite 0 behind background if its priority bit is set
          // (I don't know why yet, but if I don't do that, Excitebike shows a black sprite that shouldn't be there above the HUD)
          if((!((OAM[scanlineSprites[i] * 4 + 2] & 0b100000) && (vramPixelBuffer[(x + scroll_x) % 512] || scanlineSprites[i] == 0)) && PPUMASK_s && PPUMASK_b)){
            NES.frameBuffer32[y * 256 + x] = colors[i][pixel];
          }
          
          // Sprite 0 hit detection
          if(scanlineSprites[i] === 0 && !PPUSTATUS_S && vramPixelBuffer[(x + scroll_x) % 512] && PPUMASK_s && PPUMASK_b){
            PPUSTATUS_S = 1;
          }
        }
      }
    }
  }
},

// Clock
// -----

// Clock one PPU cycle
ppu_tick = () => {
  
  dot++;
  
  // The PPU renders one dot (one pixel) per cycle
  // At the end of each scanline (341 dots), a new scanline starts
  // The screen is complete when 240 scanlines are rendered
  if(dot > 340){

    dot = 0;
    scanline++;
    
    // Update scroll
    V_XXXXX = T_XXXXX;
    V_NN = (V_NN & 0b10) + (T_NN & 0b01);
    
    // Visible scanlines (0-239)
    if(scanline < 240){
      //drawVramScanline(((scanline + scroll_y) % 480) + 240); // Debug
      drawVramScanline((scanline + scroll_y) % 480);
      drawScanline(scanline);
      
      // Update scroll
      scroll_x = (V_NN & 0b1) * 256 + V_XXXXX * 8 + xxx;
      
      // Debug
      //NES.vramCtx.fillStyle = "pink";
      //NES.vramCtx.rect(scroll_x - 2, (scanline + scroll_y - 2) % 480, (scanline == 0 || scanline == 239) ? 256 : 4, 4);
      //NES.vramCtx.rect((scroll_x - 2 + 256) % 512, (scanline + scroll_y - 2) % 480, 4, 4);
    }
    
    // VBlank starts at scanline 241 (a NMI interrupt is triggered, and the frame is displayed on the canvas)
    else if(scanline == 240){
      
      // VBlank flag
      PPUSTATUS_V = 1;
      
      // Send NMI interrupt to the CPU
      interrupt_requested = 1;
      
      // Output frameBuffer on canvas
      NES.frameData.data.set(NES.frameBuffer8);
      NES.frameCtx.putImageData(NES.frameData, 0, 0);
    
      // Debug (VRAM view)
      //NES.vramData.data.set(NES.vramBuffer8);
      //NES.vramCtx.putImageData(NES.vramData, 0, 0);
      //if(PPUMASK_b){
      //  NES.vramCtx.fill();
      //}
    }
    
    // VBlank ends at the pre-render scanline, and PPUSTATUS is reset
    else if(scanline == 260){
      PPUSTATUS_O =
      PPUSTATUS_S =
      PPUSTATUS_V = 0;
    }
    
    // When the pre-render scanline is completed, a new frame starts
    else if(scanline == 261){
      scanline = -1;
      endFrame = 1;
      
      // Update scroll
      V_YYYYY = T_YYYYY;
      V_yyy = T_yyy;
      V_NN = (V_NN & 0b01) + (T_NN & 0b10);
      scroll_y = (V_NN >> 1) * 240 + V_YYYYY * 8 + V_yyy;
    }
  }
}