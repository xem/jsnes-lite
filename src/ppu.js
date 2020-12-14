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

// PPU memory map (64KiB):

// +-------------+-------+-----------------------------------------------------------+
// | Address     | Size  | Use                                                       |
// +-------------+-------+-----------------------------------------------------------+
// | $0000-$1FFF | 8KiB  | Cartridge space (CHR-ROM or CHR-RAM):                     |
// | $0000-$0FFF | 4KiB  | Pattern Table 0 (256 tiles) "left page"                   |
// | $1000-$1FFF | 4KiB  | Pattern Table 1 (256 tiles) "right page"                  |
// +-------------+-------+-----------------------------------------------------------+
// | $2000-$2FFF | 4KiB  | VRAM (2KiB in the NES, 2KiB in the cartridge or mirrored):|
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
// | $4000-$FFFF | 48kiB | Mirrors of $0000-$3FFF                                    |
// +-------------+-------+-----------------------------------------------------------+

// OAM Memory (256 bytes):

// +-------------+-------+-----------------------------------------------------------+
// | Address     | Size  | Use                                                       |
// +-------------+-------+-----------------------------------------------------------+
// | $00-$FF     | 256B  | Sprites properties (4 bytes for each)                     |
// +-------------+-------+-----------------------------------------------------------+

// Each PPU cycle advances the rendering by one pixel on a 341 * 262px grid
  
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
//         | 20 scanlines long on NTSC consoles    |
//  y=260  | 70 scanlines on PAL consoles          |
//      ---+-----------------------------------+---+
//  y=261  | pre-render scanline               | * |
//  or -1 -+-----------------------------------+---+

// (*) When background rendering is enabled, the pre-render scanline alternates between 340 and 341 pixels at each frame

// NB:
// - Writes on registers PPUCTRL, PPUMASK, PPUSCROLL, PPUADDR are ignored during the 29,658 first CPU clocks after reset on NTSC
// - PPU writes are ignored 33,132 cycles after power up and reset on PAL

var PPU = {
  
  // System palette (64 RGB colors, decoded in AABBGGRR format)
  systemPalette: "666134124214414413412421441341241142144000000000aaa38a34a53a93aa38a34a53a938a34a33a53a9000000000fff6be67e96ed6ee6be67e96ed6be67e66e96ed555000000fffcefccfdcffcffcefccfdcffcefccfccfdcffbbb000000".match(/.../g).map(c=>parseInt("ff"+c[2]+c[2]+c[1]+c[1]+c[0]+c[0], 16)),
  
  // PPU settings
  // ------------

  // Reset PPU
  reset: () => {
    var i;
    
    // Screen coordinates
    PPU.scanline = 0;
    PPU.dot = 0;

    // Reset PPU memory and OAM
    PPU.mem = [];
    PPU.OAM = [];
    
    // VRAM pixel buffer for current scanline (to handle sprite priority)
    PPU.vramPixelBuffer = [];

    for(i = 0; i < 0x3FFF; i++){
      PPU.mem[i] = 0;
    }
    
    for(i = 0; i < 0x100; i++){
      PPU.OAM[i] = 0;
    }
    
    // PPU Status register
    PPU.PPUSTATUS_low = 0;
    PPU.PPUSTATUS_O = 0;
    PPU.PPUSTATUS_S = 0;
    PPU.PPUSTATUS_V = 0;

    // PPU Ctrl and Mask registers
    PPU.set_PPUCTRL(0);
    PPU.set_PPUMASK(0);

    // PPU Data register buffer
    PPU.PPUDATA_read_buffer = 0;
  },
  
  // Set nametable mirroring
  setMirroring: mirroring => {
    if(mirroring != PPU.nametable_mirroring){
      
      // Render previous scanlines
      PPU.render();

      PPU.nametable_mirroring = mirroring;
    }
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
      
      // 2: four-screen nametable (no mirroring)
    }
    
    return address;
  },
  
  // Read a byte in from memory
  load: address => {
    //console.log("load",PPU.mirrorAddress(address).toString(16).padStart(2,0),PPU.mem[PPU.mirrorAddress(address)].toString(16).padStart(2,0))
    //console.log("load", address.toString(16), PPU.mem[PPU.mirrorAddress(address)].toString(16));
    return PPU.mem[PPU.mirrorAddress(address)];
  },

  // Write a byte in memory
  write: (address, value) => {
    //console.log("write", address.toString(16), value.toString(16));
    address = PPU.mirrorAddress(address);
    PPU.mem[address] = value;
  },
  
  /*drawVram: () => {
    for(var X = 0; X < 64; X++){
      for(var Y = 0; Y < 60; Y++){
        
        // Name table address
        var nametable = 0x2000 + (0x800 * (Y > 29)) + (0x400 * (X > 31));
    
        // Attribute table coordinates
        var X2 = (X%32) >> 2; // [pixels 0-255 / 256-511 => tiles 0-32 => attributes 0-7]
        var Y2 = (Y%30) >> 2; // [pixels 0-239 / 240-480 => tiles 0-30 => attributes 0-7]
        var attribute = PPU.load(nametable + 0x3C0 + Y2 * 8 + X2);
        
        // Coordinates of the 2x2 tiles subgroup inside the 4x4 tiles group represented by this attribute byte
        var X3 = ((X%32) >> 1) & 1; // [pixels 0-31 / 32-63 / ... => tiles 0-3 / 4-7 / ... => coordinates 0-1]
        var Y3 = ((Y%30) >> 1) & 1; // [pixels 0-31 / 32-63 / ... => tiles 0-3 / 4-7 / ... => coordinates 0-1]
        
        // Take the 2 bits representing this subgroup in the attribute byte
        var bits = ((attribute >> (4*Y3 + 2*X3)) & 0b11);
        
        // Subpalette represented by these bits
        // TODO: use first color of subpalette at index 0 during forced blanking
        var colors = [
          PPU.systemPalette[PPU.load(0x3F00)],
          PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 1)],
          PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 2)],
          PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 3)],
        ];
        
        var byte1, byte2, pixel;
        for(var i = 0; i < 8; i++){
          byte1 = PPU.load(PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable+(Y%30)*32+(X%32)) * 16 + i);
          byte2 = PPU.load(PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable+(Y%30)*32+(X%32)) * 16 + i + 8); 
          for(var j = 0; j < 8; j++){
            
            // Pixel value
            pixel = ((byte2 >> (7 - j)) & 1) * 2 + ((byte1 >> (7 - j)) & 1);
            NES.vramBuffer32[(Y*8+i)*512+(X*8+j)] = colors[pixel];
          }
        }
      }
    }
  },*/
  
  // Render one line of the VRAM visualizer (background)
  // And fill a buffer with the opaque pixels
  drawVramScanline: y => {
    
    //console.log(y);
    
    var i, j, X, Y;

    // Y tile coordinate
    Y = ~~(y/8); 

    // For each tile of the scanline
    for(X = 0; X < 64; X++){
      
      // Name table address
      var nametable = 0x2000 + (0x800 * (Y > 29)) + (0x400 * (X > 31));
      
      // Attribute table coordinates
      var X2 = (X%32) >> 2; // pixels 0-255 / 256-511 => tiles 0-32 => attributes 0-7
      var Y2 = (Y%30) >> 2; // pixels 0-239 / 240-480 => tiles 0-30 => attributes 0-7
      var attribute = PPU.load(nametable + 0x3C0 + Y2 * 8 + X2);
      
      // Coordinates of the 2x2 tiles subgroup inside the 4x4 tiles group represented by this attribute byte
      var X3 = ((X%32) >> 1) & 1; // [pixels 0-31 / 32-63 / ... => tiles 0-3 / 4-7 / ... => coordinates 0-1]
      var Y3 = ((Y%30) >> 1) & 1; // [pixels 0-31 / 32-63 / ... => tiles 0-3 / 4-7 / ... => coordinates 0-1]
      
      // Take the 2 bits representing this subgroup in the attribute byte
      var bits = ((attribute >> (4*Y3 + 2*X3)) & 0b11);
      
      // Subpalette represented by these bits
      // TODO: use first color of subpalette at index 0 during forced blanking
      var colors = [
        PPU.systemPalette[PPU.load(0x3F00)],
        PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 1)],
        PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 2)],
        PPU.systemPalette[PPU.load(0x3F00 + bits * 4 + 3)],
      ];
      
      var byte1, byte2, pixel;
      
      // Draw a line of each background tile
      for(i = 0; i < 8; i++){
        j = y % 8;
        byte1 = PPU.load(PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable+(Y%30)*32+(X%32)) * 16 + j);
        byte2 = PPU.load(PPU.PPUCTRL_B * 0x1000 + PPU.load(nametable+(Y%30)*32+(X%32)) * 16 + j + 8); 
          
        // Pixel value
        pixel = ((byte2 >> (7 - i)) & 1) * 2 + ((byte1 >> (7 - i)) & 1);
        NES.vramBuffer32[(Y*8+j)*512+(X*8+i)] = colors[pixel];
        if(pixel){
          PPU.vramPixelBuffer[X*8+i] = colors[pixel];
        }
      }
    }
  },
  
  // Render one final scanline on screen (background + sprites)
  drawScanline: y => {

    var i, x, spriteScanlineAddress, bits, colors;

    // Sprites are drawn from front (0) to back (63) and can overlap.
    // They are encoded on 4 bytes in the OAM memory:
    // - Byte 0: Y coordinate
    // - Byte 1: 8x8 mode: tile index in current tile bank, 8x16 mode: bit 0 = tile bank / bits 1-7 = top tile index
    // - Byte 2: bits 0-1: palette (4-7) / bits 2-4: always 0 / bit 5: priority / bit 6: X flip / bit 7: Y flip
    // - Byte 3: X coordinate
    // A sprite can be either in the foreground or behind the background (if the priority bit is set)
    // NB: if a sprite is behind the background and overlaps another sprite that is in the froreground, the other sprite will still be hidden by it
    
    
    // TODO: sprite 0 hit
    
    // Find the sprites present in this scanline
    var scanlineSprites = [];
    for(i = 0; i < 64; i++){
      if(y >= PPU.OAM[i*4] && y < PPU.OAM[i*4] + (PPU.PPUCTRL_H ? 16 : 8)){
        scanlineSprites.push(i);
      }
    }
    
    // Set overflow flag if more than 8 sprites are present
    if(scanlineSprites.length > 8) {
      PPU.PPUSTATUS_O = 1;
    }
    
    // Draw the scanline's pixels:
    // - For each pixel, draw the sprite with the highest priority among the first 8
    // - If the frontmost sprite is behind the background, draw a background tile pixel on top of it
    for(x = 0; x < 256; x++){
      
      // Draw background tiles      
      NES.frameBuffer32[y*256+x] = NES.vramBuffer32[((y+PPU.scroll_y)%480)*512+(x+PPU.scroll_x)%512];
      
      // For each sprite
      for(i = Math.min(7, scanlineSprites.length-1); i >= 0; i--){
        
        // Retrieve the sprite's subpalette
        bits = PPU.OAM[scanlineSprites[i]*4+2]&0b11;
        colors = [
          ,
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 1)],
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 2)],
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 3)],
        ];
        
        // If this sprite is present at this pixel
        if(x >= PPU.OAM[scanlineSprites[i]*4+3] && x < PPU.OAM[scanlineSprites[i]*4+3] + 8){
          
          // Decode the current sprite scanline:
          // Vertical flip
          if(PPU.OAM[scanlineSprites[i]*4+2] & 0b10000000){
            spriteScanlineAddress = PPU.PPUCTRL_S * 0x1000 + PPU.OAM[scanlineSprites[i]*4+1] * 16 + (y - (8 - PPU.OAM[scanlineSprites[i]*4]));
          }
          
          // No flip
          else {
            spriteScanlineAddress = PPU.PPUCTRL_S * 0x1000 + PPU.OAM[scanlineSprites[i]*4+1] * 16 + (y - PPU.OAM[scanlineSprites[i]*4]);
          }
          
          byte1 = PPU.load(spriteScanlineAddress);
          byte2 = PPU.load(spriteScanlineAddress + 8);
          
          // Decode current pixel:
          // Horizontal flip
          if(PPU.OAM[scanlineSprites[i]*4+2] & 0b1000000){
            pixel = ((byte2 >> ((x - PPU.OAM[scanlineSprites[i]*4+3]))) & 1) * 2 + ((byte1 >> ((x - PPU.OAM[scanlineSprites[i]*4+3]))) & 1);
          }
          
          // No flip
          else{
            pixel = ((byte2 >> (7 - (x - PPU.OAM[scanlineSprites[i]*4+3]))) & 1) * 2 + ((byte1 >> (7 - (x - PPU.OAM[scanlineSprites[i]*4+3]))) & 1);
          }
          
          // 0: transparent pixel / 1-3: colored pixel
          if(pixel){
            
            NES.frameBuffer32[y*256+x] = colors[pixel];
            
            // If priority bit is 1: draw current background tile pixel on top of sprite (if any)
            if((PPU.OAM[scanlineSprites[i]*4+2] & 0b100000) && NES.frameBuffer32[y*256+x]){
              NES.frameBuffer32[y*256+x] = PPU.vramPixelBuffer[x] 
            }
          }
        }
      }
    }
    
    //console.log(Y);
    
    // Background: copy pixels from VRAM visualizer
    //for(var X = 0; X < 256; X++){
    //  NES.frameBuffer32[Y*256+X] = NES.vramBuffer32[((Y+PPU.scroll_y)%480)*512+(X+PPU.scroll_x)%512];
    //}

  },
  
  // CPU registers
  // -------------
  
  // $2000 (write): set PPU Control Register 1 (PPUCTRL)
  set_PPUCTRL: value => {
    
    //console.log("PPUCTRL",value.toString(2).padStart(8,0));
    
    // Render previous scanlines
    PPU.render();

    PPU.PPUCTRL_V = (value >> 7) & 1; // bit 7: trigger a NMI on VBlank
                                      // bit 6: ignored (external pin)
    PPU.PPUCTRL_H = (value >> 5) & 1; // bit 5: sprite size (0: 8x8, 1: 8x16)
    PPU.PPUCTRL_B = (value >> 4) & 1; // bit 4: background pattern table (0: $0000, 1: $1000)
    PPU.PPUCTRL_S = (value >> 3) & 1; // bit 3: sprite pattern table (0: $0000, 1: $1000, ignored in 8x16 mode)
    PPU.PPUCTRL_I = (value >> 2) & 1; // bit 2: VRAM address increment after reading from PPUDATA (0: 1, 1: 32)
    PPU.PPUCTRL_N = value & 3;        // bits 0-1: nametable address ($2000 + $400 * N)
    PPU.PPUCTRL_Y = (value >> 1) & 1; // Bit 1: adds 240 to Y scroll position if set
    PPU.PPUCTRL_X = value & 1;        // Bit 0: adds 256 to X scroll position if set
  },
  
  // $2001 (write): set PPU Control Register 2 (PPUMASK)
  set_PPUMASK: value => {
    
    //console.log("PPUMASK",value.toString(2).padStart(8,0));
    
    // Render previous scanlines
    PPU.render();
    
    PPU.PPUMASK_RGB = (value >> 5) & 7; // Bits 5-7: red/green/blue emphasis
    PPU.PPUMASK_s = (value >> 4) & 1;   // Bit 4: show sprites
    PPU.PPUMASK_b = (value >> 3) & 1;   // Bit 3: show background
    PPU.PPUMASK_M = (value >> 2) & 1;   // Bit 2: show sprites on leftmost 8px-wide column 
    PPU.PPUMASK_m = (value >> 1) & 1;   // Bit 1: show background on leftmost 8px-wide column
    PPU.PPUMASK_G = value & 1;          // Bit 0: greyscale (all colors are ANDed with $30)
    //PPU.updatePalettes();
  },
  
  // $2002 (read): get PPU Status Register (PPUSTATUS)
  // Bits 0-4: copy of last 5 bits written to a PPU register
  // Bit 5 (O): Sprite overflow
  // - set during sprite evaluation if more than 8 sprites in next scanline
  // - cleared on pre-render line
  // - it's buggy on the NES
  // Bit 6 (S): Sprite 0 hit
  // - set when a non-zero pixel from sprite 0 overlaps a non-zero pixel of the background if both displays are enabled
  // - cleared on pre-render line
  // Bit 7 (V): VBlank
  // - set at line 241
  // - cleared after reading PPUSTATUS and at pre-render line
  update_PPUSTATUS: () => {
    CPU.mem[0x2002] = PPU.PPUSTATUS_low + (PPU.PPUSTATUS_O << 5) + (PPU.PPUSTATUS_S << 6) + (PPU.PPUSTATUS_V << 7);
  },
  
  get_PPUSTATUS: () => {
    
    // Get status
    var tmp = CPU.mem[0x2002];
    //console.log("PPUSTATUS",CPU.mem[0x2002].toString(2).padStart(8,0));
    
    // Reset PPUSCROLL/PPUADDR latch
    PPU.latch = 0;
    
    // Reset VBlank
    PPU.PPUSTATUS_V = 0;
    
    // Update PPUSTATUS register
    PPU.update_PPUSTATUS();

    // Return status (without the resets)
    return tmp;
  },
  
  // $2003 (write): set SPR-RAM Address Register (OAMADDR)
  set_OAMADDR: address => {
    PPU.OAMADDR = address;
  },
  
  // $2004h (read/write): SPR-RAM Data Register (OAMDATA, address must be set first)
  get_OAMDATA: () => {
    return PPU.OAM[PPU.OAMADDR];
  },

  set_OAMDATA: value => {
    
    // Render previous scanlines
    PPU.render();

    PPU.OAM[PPU.OAMADDR] = value;
    //PPU.spriteRamWriteUpdate(PPU.OAMADDR, value);
    PPU.OAMADDR++;
    PPU.OAMADDR %= 0x100;
  },
  
  // $2005 (write twice: vertical, then horizontal): PPU Background Scrolling Offset (PPUSCROLL)
  set_PPUSCROLL: value => {
    
    // Render previous scanlines
    PPU.render();

    // Latch 0: first write, horizontal scroll
    if(PPU.latch == 0){
      PPU.PPUSCROLL_X = value;
      //PPU.PPUCTRL_XT = (value >> 3) & 31;
      //PPU.regFH = value & 7;

    } 
    
    // Latch 1: second write, vertical scroll
    // TODO: if value is between 240 and 255, it becomes negative (-16 to -1)
    else {
      
      PPU.PPUSCROLL_Y = value;
      //PPU.regFV = value & 7;
      //PPU.PPUCTRL_YT = (value >> 3) & 31;
    }
    
    // Toggle latch
    PPU.latch ^= 1;
  },
  
  // $2006 (write twice): VRAM Address Register (PPUADDR)
  set_PPUADDR: address => {
    
    // Latch 0: first write, high byte of address 
    if(PPU.latch == 0){
      //PPU.regFV = (address >> 4) & 3;
      //PPU.PPUCTRL_Y = (address >> 3) & 1;
      //PPU.PPUCTRL_X = (address >> 2) & 1;
      //PPU.PPUCTRL_YT = (PPU.PPUCTRL_YT & 7) | ((address & 3) << 3);
      PPU.PPUADDR = address << 8;
    } 
    
    // Latch 1: second write, low byte of address 
    else {
      /*PPU.render();
      PPU.PPUCTRL_YT = (PPU.PPUCTRL_YT & 24) | ((address >> 5) & 7);
      PPU.PPUCTRL_XT = address & 31;
      PPU.cntFV = PPU.regFV;
      PPU.cntV = PPU.PPUCTRL_Y;
      PPU.cntH = PPU.PPUCTRL_X;
      PPU.cntVT = PPU.PPUCTRL_YT;
      PPU.cntHT = PPU.PPUCTRL_XT;
      PPU.checkSprite0(PPU.scanline - 20);*/
      PPU.PPUADDR += address;
      
    }
    
    // Toggle latch
    PPU.latch ^= 1;
    
    // Invoke mapper latch:
    //PPU.cntsToAddress();*/
  },
  
  // $2007h (read/write): VRAM Data Register (PPUDATA, address must be set first)
  set_PPUDATA: value => {
    
    // Render previous scanlines
    PPU.render();
    
    /*PPU.cntsToAddress();
    PPU.regsToAddress();
    PPU.write(PPU.vramAddress, value);
    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    PPU.vramAddress += PPU.PPUCTRL_I === 1 ? 32 : 1;
    PPU.regsFromAddress();
    PPU.cntsFromAddress();*/
    
    PPU.write(PPU.PPUADDR, value);
    //console.log("set PPUDATA", PPU.mem[PPU.PPUADDR].toString(16), value.toString(16))
    PPU.PPUADDR += PPU.PPUCTRL_I === 1 ? 32 : 1; 
  },
  
  get_PPUDATA: () => {
    
    var tmp;
    
    // PPUADDR between $0000 and $3EFF: buffered read
    // Each read fills a 1-byte buffer and returns the value previously stored in that buffer
    if(PPU.PPUADDR <= 0x3F00){
      tmp = PPU.PPUDATA_read_buffer;
      PPU.PPUDATA_read_buffer = PPU.load(PPU.PPUADDR);
    }
    
    // PPUADDR higher than $3EFF: direct read
    else {
      tmp = PPU.load(PPU.PPUADDR);
    }
    
    /*var tmp;
    PPU.cntsToAddress();
    PPU.regsToAddress();

    // If address is in range 0x0000-0x3EFF, return buffered values:
      tmp = PPU.vramBufferedReadValue;
      PPU.vramBufferedReadValue = PPU.load(PPU.vramAddress);
      // Increment by either 1 or 32, depending on d2 of Control Register 1:
      PPU.vramAddress += PPU.PPUCTRL_I === 1 ? 32 : 1;
      PPU.cntsFromAddress();
      PPU.regsFromAddress();
      return tmp; // Return the previous buffered value.
    }

    // No buffering in this mem range. Read normally.
    tmp = PPU.load(PPU.vramAddress);

    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    PPU.vramAddress += PPU.PPUCTRL_I === 1 ? 32 : 1;

    PPU.cntsFromAddress();
    PPU.regsFromAddress();

    return tmp;*/
    //console.log("get PPUDATA", PPU.mem[PPU.PPUADDR].toString(16), tmp.toString(16))
    PPU.PPUADDR += PPU.PPUCTRL_I === 1 ? 32 : 1; 
    return tmp;
  },

  // $4014: (write): copy a 256-byte page of CPU memory into the OAM memory (OAMDMA)
  set_OAMDMA: value => {
    
    // Render previous scanlines
    PPU.render();
    
    var tmp = value * 0x100;
    //var data;
    for(var i = PPU.OAMADDR; i < 256; i++){
      PPU.OAM[i] = CPU.mem[tmp + i];;
      //PPU.spriteRamWriteUpdate(i, data);
    }
    
    // Consume 513 CPU cycles
    // TODO: 514 cycles when the current CPU cycle is odd
    for(i = 0; i < 513; i++){
      CPU.tick();
    }
  },
  
  // Clock
  // -----
  
  // Clock one PPU cycle
  tick: () => {
    
    //console.log("tick", PPU.scanline, PPU.dot);
    
    PPU.dot++;
    
    // The PPU renders one dot (pixel) per cycle
    // At the end of each scanline (341 dots), a new scanline starts
    // TODO: the PPU reads the name table 34 times per scanline (the 34th is garbage), some mappers need this to work properly
    // TODO: On every odd frame, when background rendering is enabled, the pre-render line has 340 dots instead of 341
    if(PPU.dot > 341){
      PPU.dot = 0;
      PPU.scanline++;
      
      // Scroll
      PPU.scroll_x = (PPU.PPUCTRL_X * 256 + PPU.PPUSCROLL_X) || 0;
      PPU.scroll_y = (PPU.PPUCTRL_Y * 240 + PPU.PPUSCROLL_Y) || 0;

      // Visible scanlines
      if(PPU.scanline < 241){
        //console.log(PPU.scanline-1, PPU.scanline+PPU.scroll_y-1);
        PPU.drawVramScanline(PPU.scanline+PPU.scroll_y-1);
        PPU.drawScanline(PPU.scanline-1);
      }
      
      // VBlank starts at scanline 241 (NMI is triggered, current frame is displayed on screen)
      else if(PPU.scanline == 241){
        //console.log("tick", PPU.scanline, PPU.dot);
        PPU.PPUSTATUS_V = 1;
        PPU.update_PPUSTATUS()
        CPU.requestIrq(CPU.NMI);
        
        // Render previous scanlines on frame buffer
        PPU.render();

        //vramCanvas.width ^= 0;
        
        // Output frameBuffer on canvas
        NES.frameData.data.set(NES.frameBuffer8);
        NES.frameCtx.putImageData(NES.frameData, 0, 0);
      
        NES.vramData.data.set(NES.vramBuffer8);
        NES.vramCtx.putImageData(NES.vramData, 0, 0);

        // Debug
        NES.vramCtx.strokeStyle = "pink";
        NES.vramCtx.lineWidth = 6;
        NES.vramCtx.rect(PPU.scroll_x+3, PPU.scroll_y+3, 256, 240);
        NES.vramCtx.rect(PPU.scroll_x+3 - 512, PPU.scroll_y+3, 256, 240);
        NES.vramCtx.rect(PPU.scroll_x+3, PPU.scroll_y+3 - 480, 256, 240);
        NES.vramCtx.rect(PPU.scroll_x+3 - 512, PPU.scroll_y+3 - 480, 256, 240);
        NES.vramCtx.stroke();
      }
      
      // VBlank ends at the pre-render scanline, and PPUSTATUS is reset
      else if(PPU.scanline == 261){
        PPU.PPUSTATUS_O =
        PPU.PPUSTATUS_S =
        PPU.PPUSTATUS_V = 0;
        PPU.update_PPUSTATUS();
      }
      
      // When the pre-render scanline is completed, a new frame starts
      else if(PPU.scanline == 262){
        PPU.scanline = 0;
        PPU.endFrame = 1;
      }
    }
    
    
    
    // Handle Sprite 0 hit
    /*if(PPU.dot === PPU.spr0HitX && PPU.f_spVisibility === 1 && PPU.scanline - 21 === PPU.spr0HitY){
      PPU.PPUSTATUS_S = 1;
      PPU.update_PPUSTATUS();
    }*/

    // Handle VBlank request (end of current frame)
    /*if(PPU.requestEndFrame){
      PPU.nmiCounter--;
      if(PPU.nmiCounter === 0){
        PPU.requestEndFrame = false;
        PPU.startVBlank();
        break loop;
      }
    }*/

    
  },
  
  // Frame rendering
  // ---------------
  
  // When the CHR-ROM, VRAM, palettes, OAM or registers are updated, render all the previous scanlines
  // If render() has been called in the same frame, draw the scanlines between the two calls
  // Otherwise, start at the first scanline
  
  render: () => {
    
  }
  
  // Start a new frame
  /*startFrame: () => {
    
    // Background color
    // TODO: handle greyscale / emphasis
    //var bgColor = PPU.bgPalette[0];

    // Fill frame buffer with background image
    /*var buffer = PPU.buffer;
    var i;
    for(i = 0; i < 256 * 240; i++){
      buffer[i] = bgColor;
    }
    var pixrendered = PPU.pixrendered;
    for(i = 0; i < pixrendered.length; i++){
      pixrendered[i] = 65;
    }* /
  },
  
  startVBlank: () => {
    // Do NMI:
    /*CPU.requestIrq(CPU.NMI);

    // Make sure everything is rendered:
    if(PPU.lastRenderedScanline < 239){
      PPU.renderFramePartially(
        PPU.lastRenderedScanline + 1,
        240 - PPU.lastRenderedScanline
      );
    }

    // End frame:
    PPU.endFrame();

    // Reset scanline counter:
    PPU.lastRenderedScanline = -1;
   * /
  },

  endScanline: () => {
    /*switch (PPU.scanline){
      case 19:
        // Dummy scanline.
        // May be variable length:
        if(PPU.dummyCycleToggle){
          // Remove dead cycle at end of scanline,
          // for next scanline:
          PPU.dot = 1;
          PPU.dummyCycleToggle = !PPU.dummyCycleToggle;
        }
        break;

      case 20:
        // Clear VBlank flag:
        PPU.PPUSTATUS_V = 0;
        //PPU.update_PPUSTATUS();

        // Clear Sprite #0 hit flag:
        PPU.PPUSTATUS_S = 0;
        PPU.update_PPUSTATUS();
        PPU.hitSpr0 = false;
        PPU.spr0HitX = -1;
        PPU.spr0HitY = -1;

        if(PPU.PPUMASK_b === 1 || PPU.PPUMASK_s === 1){
          // Update counters:
          PPU.cntFV = PPU.regFV;
          PPU.cntV = PPU.PPUCTRL_Y;
          PPU.cntH = PPU.PPUCTRL_X;
          PPU.cntVT = PPU.PPUCTRL_YT;
          PPU.cntHT = PPU.PPUCTRL_XT;

          if(PPU.PPUMASK_b === 1){
            // Render dummy scanline:
            PPU.renderBgScanline(false, 0);
          }
        }

        if(PPU.PPUMASK_b === 1 && PPU.PPUMASK_s === 1){
          // Check sprite 0 hit for first scanline:
          PPU.checkSprite0(0);
        }

        if(PPU.PPUMASK_b === 1 || PPU.PPUMASK_s === 1){
          // Clock mapper IRQ Counter:
          //Mapper.clockIrqCounter();
        }
        break;

      case 261:
        // Dead scanline, no rendering.
        // Set VINT:
        PPU.PPUSTATUS_V = 1;
        PPU.update_PPUSTATUS();
        PPU.requestEndFrame = true;
        PPU.nmiCounter = 9;

        // Wrap around:
        PPU.scanline = -1; // will be incremented to 0

        break;

      default:
        if(PPU.scanline >= 21 && PPU.scanline <= 260){
          // Render normally:
          if(PPU.PPUMASK_b === 1){
            if(!PPU.scanlineAlreadyRendered){
              // update scroll:
              PPU.cntHT = PPU.PPUCTRL_XT;
              PPU.cntH = PPU.PPUCTRL_X;
              PPU.renderBgScanline(true, PPU.scanline + 1 - 21);
            }
            PPU.scanlineAlreadyRendered = false;

            // Check for sprite 0 (next scanline):
            if(!PPU.hitSpr0 && PPU.PPUMASK_s === 1){
              if(
                PPU.sprX[0] >= -7 &&
                PPU.sprX[0] < 256 &&
                PPU.sprY[0] + 1 <= PPU.scanline - 20 &&
                PPU.sprY[0] + 1 + (PPU.PPUCTRL_H === 0 ? 8 : 16) >=
                  PPU.scanline - 20
              ){
                if(PPU.checkSprite0(PPU.scanline - 20)){
                  PPU.hitSpr0 = true;
                }
              }
            }
          }

          if(PPU.PPUMASK_b === 1 || PPU.PPUMASK_s === 1){
            // Clock mapper IRQ Counter:
            //Mapper.clockIrqCounter();
          }
        }
    }

    PPU.scanline++;
    PPU.regsToAddress();
    PPU.cntsToAddress();* /
  },

  endFrame: () => {
    //var i, x, y;
    //var buffer = PPU.buffer;

    // Draw spr#0 hit coordinates:
    /*if(PPU.showSpr0Hit){
      // Spr 0 position:
      if(
        PPU.sprX[0] >= 0 &&
        PPU.sprX[0] < 256 &&
        PPU.sprY[0] >= 0 &&
        PPU.sprY[0] < 240
      ){
        for(i = 0; i < 256; i++){
          buffer[(PPU.sprY[0] << 8) + i] = 0xff5555;
        }
        for(i = 0; i < 240; i++){
          buffer[(i << 8) + PPU.sprX[0]] = 0xff5555;
        }
      }
      // Hit position:
      if(
        PPU.spr0HitX >= 0 &&
        PPU.spr0HitX < 256 &&
        PPU.spr0HitY >= 0 &&
        PPU.spr0HitY < 240
      ){
        for(i = 0; i < 256; i++){
          buffer[(PPU.spr0HitY << 8) + i] = 0x55ff55;
        }
        for(i = 0; i < 240; i++){
          buffer[(i << 8) + PPU.spr0HitX] = 0x55ff55;
        }
      }
    }* /

    // This is a bit lazy..
    // if either the sprites or the background should be clipped,
    // both are clipped after rendering is finished.
    /*if(
      //PPU.clipToTvSize ||
      PPU.PPUMASK_m === 0 ||
      PPU.PPUMASK_M === 0
    ){
      // Clip left 8-pixels column:
      for(y = 0; y < 240; y++){
        for(x = 0; x < 8; x++){
          buffer[(y << 8) + x] = 0;
        }
      }
    }

    //if(PPU.clipToTvSize){
      // Clip right 8-pixels column too:
      for(y = 0; y < 240; y++){
        for(x = 0; x < 8; x++){
          buffer[(y << 8) + 255 - x] = 0;
        }
      }
    //}

    // Clip top and bottom 8 pixels:
    //if(PPU.clipToTvSize){
      for(y = 0; y < 8; y++){
        for(x = 0; x < 256; x++){
          buffer[(y << 8) + x] = 0;
          buffer[((239 - y) << 8) + x] = 0;
        }
      }
    //}

    NES.onFrame(buffer, PPU.vramBuffer);* /
  },


  // Updates the scroll registers from a new VRAM address.
  regsFromAddress: () => {
    /*var address = (PPU.vramTmpAddress >> 8) & 0xff;
    PPU.regFV = (address >> 4) & 7;
    PPU.PPUCTRL_Y = (address >> 3) & 1;
    PPU.PPUCTRL_X = (address >> 2) & 1;
    PPU.PPUCTRL_YT = (PPU.PPUCTRL_YT & 7) | ((address & 3) << 3);

    address = PPU.vramTmpAddress & 0xff;
    PPU.PPUCTRL_YT = (PPU.PPUCTRL_YT & 24) | ((address >> 5) & 7);
    PPU.PPUCTRL_XT = address & 31;* /
  },

  // Updates the scroll registers from a new VRAM address.
  cntsFromAddress: () => {
    /*var address = (PPU.vramAddress >> 8) & 0xff;
    PPU.cntFV = (address >> 4) & 3;
    PPU.cntV = (address >> 3) & 1;
    PPU.cntH = (address >> 2) & 1;
    PPU.cntVT = (PPU.cntVT & 7) | ((address & 3) << 3);

    address = PPU.vramAddress & 0xff;
    PPU.cntVT = (PPU.cntVT & 24) | ((address >> 5) & 7);
    PPU.cntHT = address & 31;* /
  },

  regsToAddress: () => {
    /*var b1 = (PPU.regFV & 7) << 4;
    b1 |= (PPU.PPUCTRL_Y & 1) << 3;
    b1 |= (PPU.PPUCTRL_X & 1) << 2;
    b1 |= (PPU.PPUCTRL_YT >> 3) & 3;

    var b2 = (PPU.PPUCTRL_YT & 7) << 5;
    b2 |= PPU.PPUCTRL_XT & 31;

    PPU.vramTmpAddress = ((b1 << 8) | b2) & 0x7fff;* /
  },

  cntsToAddress: () => {
    /*var b1 = (PPU.cntFV & 7) << 4;
    b1 |= (PPU.cntV & 1) << 3;
    b1 |= (PPU.cntH & 1) << 2;
    b1 |= (PPU.cntVT >> 3) & 3;

    var b2 = (PPU.cntVT & 7) << 5;
    b2 |= PPU.cntHT & 31;

    PPU.vramAddress = ((b1 << 8) | b2) & 0x7fff;* /
  },

  incTileCounter: count => {
    /*for(var i = count; i !== 0; i--){
      PPU.cntHT++;
      if(PPU.cntHT === 32){
        PPU.cntHT = 0;
        PPU.cntVT++;
        if(PPU.cntVT >= 30){
          PPU.cntH++;
          if(PPU.cntH === 2){
            PPU.cntH = 0;
            PPU.cntV++;
            if(PPU.cntV === 2){
              PPU.cntV = 0;
              PPU.cntFV++;
              PPU.cntFV &= 0x7;
            }
          }
        }
      }
    }* /
  },

  // Finish rendering the current frame, I think?
  render: () => {
    /*if(PPU.scanline >= 21 && PPU.scanline <= 260){
      // Render sprites, and combine:
      PPU.renderFramePartially(
        PPU.lastRenderedScanline + 1,
        PPU.scanline - 21 - PPU.lastRenderedScanline
      );

      // Set last rendered scanline:
      PPU.lastRenderedScanline = PPU.scanline - 21;
    }* /
  },

  renderFramePartially: (startScan, scanCount) => {
    /*if(PPU.PPUMASK_s === 1){
      PPU.renderSpritesPartially(startScan, scanCount, true);
    }

    if(PPU.PPUMASK_b === 1){
      var si = startScan << 8;
      var ei = (startScan + scanCount) << 8;
      if(ei > 0xf000){
        ei = 0xf000;
      }
      var buffer = PPU.buffer;
      var bgbuffer = PPU.bgbuffer;
      var pixrendered = PPU.pixrendered;
      for(var destIndex = si; destIndex < ei; destIndex++){
        if(pixrendered[destIndex] > 0xff){
          buffer[destIndex] = bgbuffer[destIndex];
        }
      }
    }

    if(PPU.PPUMASK_s === 1){
      PPU.renderSpritesPartially(startScan, scanCount, false);
    }

    PPU.validTileData = false;* /
  },

  renderBgScanline: (bgbuffer, scan) => {
    /*var baseTile = PPU.PPUCTRL_B === 0 ? 0 : 256;
    var destIndex = (scan << 8) - PPU.regFH;

    //PPU.curNt = PPU.ntable1[PPU.cntV + PPU.cntV + PPU.cntH];

    PPU.cntHT = PPU.PPUCTRL_XT;
    PPU.cntH = PPU.PPUCTRL_X;
    //PPU.curNt = PPU.ntable1[PPU.cntV + PPU.cntV + PPU.cntH];

    if(scan < 240 && scan - PPU.cntFV >= 0){
      var tscanoffset = PPU.cntFV << 3;
      var scantile = PPU.scantile;
      var attrib = PPU.attrib;
      var ptTile = PPU.ptTile;
      var nameTable = PPU.nameTable;
      var bgPalette = PPU.bgPalette;
      var pixrendered = PPU.pixrendered;
      var targetBuffer = bgbuffer ? PPU.bgbuffer : PPU.buffer;

      var t, tpix, att, col;

      for(var tile = 0; tile < 32; tile++){
        if(scan >= 0){
          // Fetch tile & attrib data:
          if(PPU.validTileData){
            // Get data from array:
            t = scantile[tile];
            if(typeof t === "undefined"){
              continue;
            }
            tpix = t.pixels;
            att = attrib[tile];
          } else {
            // Fetch data:
            t =
              ptTile[
                baseTile +
                  nameTable[PPU.curNt].getTileIndex(PPU.cntHT, PPU.cntVT)
              ];
            if(typeof t === "undefined"){
              continue;
            }
            tpix = t.pixels;
            att = nameTable[PPU.curNt].getAttrib(PPU.cntHT, PPU.cntVT);
            scantile[tile] = t;
            attrib[tile] = att;
          }

          // Render tile scanline:
          var sx = 0;
          var x = (tile << 3) - PPU.regFH;

          if(x > -8){
            if(x < 0){
              destIndex -= x;
              sx = -x;
            }

              for(; sx < 8; sx++){
                col = tpix[tscanoffset + sx];
                if(col !== 0){
                  targetBuffer[destIndex] = bgPalette[col + att];
                  pixrendered[destIndex] |= 256;
                }
                destIndex++;
              }
          }
        }

        // Increase Horizontal Tile Counter:
        if(++PPU.cntHT === 32){
          PPU.cntHT = 0;
          PPU.cntH++;
          PPU.cntH %= 2;
          //PPU.curNt = PPU.ntable1[(PPU.cntV << 1) + PPU.cntH];
        }
      }

      // Tile data for one row should now have been fetched,
      // so the data in the array is valid.
      PPU.validTileData = true;
    }

    // update vertical scroll:
    PPU.cntFV++;
    if(PPU.cntFV === 8){
      PPU.cntFV = 0;
      PPU.cntVT++;
      if(PPU.cntVT === 30){
        PPU.cntVT = 0;
        PPU.cntV++;
        PPU.cntV %= 2;
        //PPU.curNt = PPU.ntable1[(PPU.cntV << 1) + PPU.cntH];
      } else if(PPU.cntVT === 32){
        PPU.cntVT = 0;
      }

      // Invalidate fetched data:
      PPU.validTileData = false;
    }* /
  },

  renderSpritesPartially: (startscan, scancount, bgPri) => {
    /*if(PPU.PPUMASK_s === 1){
      for(var i = 0; i < 64; i++){
        if(
          PPU.bgPriority[i] === bgPri &&
          PPU.sprX[i] >= 0 &&
          PPU.sprX[i] < 256 &&
          PPU.sprY[i] + 8 >= startscan &&
          PPU.sprY[i] < startscan + scancount
        ){
          // Show sprite.
          if(PPU.PPUCTRL_H === 0){
            // 8x8 sprites

            PPU.srcy1 = 0;
            PPU.srcy2 = 8;

            if(PPU.sprY[i] < startscan){
              PPU.srcy1 = startscan - PPU.sprY[i] - 1;
            }

            if(PPU.sprY[i] + 8 > startscan + scancount){
              PPU.srcy2 = startscan + scancount - PPU.sprY[i] + 1;
            }

            /*Tile.draw_sprite(
              PPU.ptTile[PPU.PPUCTRL_S === 0 ? PPU.sprTile[i] : PPU.sprTile[i] + 256],
              PPU.buffer,
              PPU.srcy1,
              PPU.srcy2,
              PPU.sprX[i],
              PPU.sprY[i] + 1,
              PPU.sprPalette,
              PPU.sprCol[i],
              PPU.horiFlip[i],
              PPU.vertFlip[i],
              i,
              PPU.pixrendered
            );* /
          } else {
            // 8x16 sprites
            var top = PPU.sprTile[i];
            if((top & 1) !== 0){
              top = PPU.sprTile[i] - 1 + 256;
            }

            var srcy1 = 0;
            var srcy2 = 8;

            if(PPU.sprY[i] < startscan){
              srcy1 = startscan - PPU.sprY[i] - 1;
            }

            if(PPU.sprY[i] + 8 > startscan + scancount){
              srcy2 = startscan + scancount - PPU.sprY[i];
            }

            /*Tile.draw_sprite(
              PPU.ptTile[top + (PPU.vertFlip[i] ? 1 : 0)],
              PPU.buffer,
              srcy1,
              srcy2,
              PPU.sprX[i],
              PPU.sprY[i] + 1,
              PPU.sprPalette,
              PPU.sprCol[i],
              PPU.horiFlip[i],
              PPU.vertFlip[i],
              i,
              PPU.pixrendered
            );* /

            srcy1 = 0;
            srcy2 = 8;

            if(PPU.sprY[i] + 8 < startscan){
              srcy1 = startscan - (PPU.sprY[i] + 8 + 1);
            }

            if(PPU.sprY[i] + 16 > startscan + scancount){
              srcy2 = startscan + scancount - (PPU.sprY[i] + 8);
            }

            /*Tile.draw_sprite(
              PPU.ptTile[top + (PPU.vertFlip[i] ? 0 : 1)],
              PPU.buffer,
              srcy1,
              srcy2,
              PPU.sprX[i],
              PPU.sprY[i] + 1 + 8,
              PPU.sprPalette,
              PPU.sprCol[i],
              PPU.horiFlip[i],
              PPU.vertFlip[i],
              i,
              PPU.pixrendered
            );* /
          }
        }
      }
    }* /
  },

  checkSprite0: scan => {
    /*PPU.spr0HitX = -1;
    PPU.spr0HitY = -1;

    var toffset;
    var tIndexAdd = PPU.PPUCTRL_S === 0 ? 0 : 256;
    var x, y, t, i;
    var bufferIndex;

    x = PPU.sprX[0];
    y = PPU.sprY[0] + 1;

    if(PPU.PPUCTRL_H === 0){
      // 8x8 sprites.

      // Check range:
      if(y <= scan && y + 8 > scan && x >= -7 && x < 256){
        // Sprite is in range.
        // Draw scanline:
        t = PPU.ptTile[PPU.sprTile[0] + tIndexAdd];

        if(PPU.vertFlip[0]){
          toffset = 7 - (scan - y);
        } else {
          toffset = scan - y;
        }
        toffset *= 8;

        bufferIndex = scan * 256 + x;
        if(PPU.horiFlip[0]){
          for(i = 7; i >= 0; i--){
            if(x >= 0 && x < 256){
              if(
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                PPU.pixrendered[bufferIndex] !== 0
              ){
                if(t.pixels[toffset + i] !== 0){
                  PPU.spr0HitX = bufferIndex % 256;
                  PPU.spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        } else {
          for(i = 0; i < 8; i++){
            if(x >= 0 && x < 256){
              if(
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                PPU.pixrendered[bufferIndex] !== 0
              ){
                if(t.pixels[toffset + i] !== 0){
                  PPU.spr0HitX = bufferIndex % 256;
                  PPU.spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        }
      }
    } else {
      // 8x16 sprites:

      // Check range:
      if(y <= scan && y + 16 > scan && x >= -7 && x < 256){
        // Sprite is in range.
        // Draw scanline:

        if(PPU.vertFlip[0]){
          toffset = 15 - (scan - y);
        } else {
          toffset = scan - y;
        }

        if(toffset < 8){
          // first half of sprite.
          t = PPU.ptTile[
            PPU.sprTile[0] +
              (PPU.vertFlip[0] ? 1 : 0) +
              ((PPU.sprTile[0] & 1) !== 0 ? 255 : 0)
          ];
        } else {
          // second half of sprite.
          t = PPU.ptTile[
            PPU.sprTile[0] +
              (PPU.vertFlip[0] ? 0 : 1) +
              ((PPU.sprTile[0] & 1) !== 0 ? 255 : 0)
          ];
          if(PPU.vertFlip[0]){
            toffset = 15 - toffset;
          } else {
            toffset -= 8;
          }
        }
        toffset *= 8;

        bufferIndex = scan * 256 + x;
        if(PPU.horiFlip[0]){
          for(i = 7; i >= 0; i--){
            if(x >= 0 && x < 256){
              if(
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                PPU.pixrendered[bufferIndex] !== 0
              ){
                if(t.pixels[toffset + i] !== 0){
                  PPU.spr0HitX = bufferIndex % 256;
                  PPU.spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        } else {
          for(i = 0; i < 8; i++){
            if(x >= 0 && x < 256){
              if(
                bufferIndex >= 0 &&
                bufferIndex < 61440 &&
                PPU.pixrendered[bufferIndex] !== 0
              ){
                if(t.pixels[toffset + i] !== 0){
                  PPU.spr0HitX = bufferIndex % 256;
                  PPU.spr0HitY = scan;
                  return true;
                }
              }
            }
            x++;
            bufferIndex++;
          }
        }
      }
    }

    return false;* /
  },

  // Reads data from $3f00 to $3f20
  // into the two buffered palettes.
  updatePalettes: () => {
    /*for(var i = 0; i < 16; i++){
      PPU.bgPalette[i] = PPU.palTable.getEntry(PPU.load(0x3f00 + i));
      PPU.sprPalette[i] = PPU.palTable.getEntry(PPU.load(0x3f10 + i));
    }
    //console.log(PPU.bgPalette);
    * /
  },

  // Updates the internal pattern
  // table buffers with this new byte.
  // In vNES, there is a version of this with 4 arguments which isn't used.
  patternWrite: (address, value) => {
    /*var bank = address > 0x1000 ? 1 : 0;
    var tileIndex = Math.floor(address / 16);
    ROM.chr_rom[bank][address % 0x1000] = value;
    ROM.chr_rom_tiles[bank][tileIndex] = { pixels: [] };
    Tile.decode(ROM.chr_rom_tiles[bank][tileIndex], ROM.chr_rom[bank], tileIndex);* /
  },

  // Updates the internal name table buffers
  // with this new byte.
  nameTableWrite: (index, address, value) => {
    //console.log(PPU.nameTable, index, PPU.nameTable[index]);
    //PPU.nameTable[index].tile[address] = value;

    // Update Sprite #0 hit:
    //updateSpr0Hit();
    //PPU.checkSprite0(PPU.scanline - 20);
  },

  // Updates the internal pattern
  // table buffers with this new attribute
  // table byte.
  attribTableWrite: (index, address, value) => {
    //PPU.nameTable[index].writeAttrib(address, value);
  },

  // Updates the internally buffered sprite
  // data with this new byte of info.
  spriteRamWriteUpdate: (address, value) => {
    /*var tIndex = Math.floor(address / 4);

    if(tIndex === 0){
      //updateSpr0Hit();
      PPU.checkSprite0(PPU.scanline - 20);
    }

    if(address % 4 === 0){
      // Y coordinate
      PPU.sprY[tIndex] = value;
    } else if(address % 4 === 1){
      // Tile index
      PPU.sprTile[tIndex] = value;
    } else if(address % 4 === 2){
      // Attributes
      PPU.vertFlip[tIndex] = (value & 0x80) !== 0;
      PPU.horiFlip[tIndex] = (value & 0x40) !== 0;
      PPU.bgPriority[tIndex] = (value & 0x20) !== 0;
      PPU.sprCol[tIndex] = (value & 3) << 2;
    } else if(address % 4 === 3){
      // X coordinate
      PPU.sprX[tIndex] = value;
    }
  },

  doNMI: () => {
    // Set VBlank flag:
    PPU.PPUSTATUS_V = 1;
    PPU.update_PPUSTATUS();
    CPU.requestIrq(CPU.NMI);
  },

  isPixelWhite: (x, y) => {* /
    PPU.render();
    return PPU.buffer[(y << 8) + x] === 0xffffff;
  },
};

var NameTable = function(width, height, name){
  /*this.width = width;
  this.height = height;
  this.name = name;

  this.tile = new Array(width * height);
  this.attrib = new Array(width * height);
  for(var i = 0; i < width * height; i++){
    this.tile[i] = 0;
    this.attrib[i] = 0;
  }* /
};

NameTable.prototype = {
  /*getTileIndex: function(x, y){
    return this.tile[y * this.width + x];
  },

  getAttrib: function(x, y){
    return this.attrib[y * this.width + x];
  },

  writeAttrib: function(index, value){
    var basex = (index % 8) * 4;
    var basey = Math.floor(index / 8) * 4;
    var add;
    var tx, ty;
    var attindex;

    for(var sqy = 0; sqy < 2; sqy++){
      for(var sqx = 0; sqx < 2; sqx++){
        add = (value >> (2 * (sqy * 2 + sqx))) & 3;
        for(var y = 0; y < 2; y++){
          for(var x = 0; x < 2; x++){
            tx = basex + sqx * 2 + x;
            ty = basey + sqy * 2 + y;
            attindex = ty * this.width + tx;
            this.attrib[attindex] = (add << 2) & 12;
          }
        }
      }
    }
  },* /
};

var PaletteTable = function(){
  /*this.curTable = new Array(64);
  this.emphTable = new Array(8);
  this.currentEmph = -1;* /
};

PaletteTable.prototype = {
  /*reset: function(){
    this.setEmphasis(0);
  },

  loadNTSCPalette: function(){
    // prettier-ignore
    this.curTable = [0x525252, 0xB40000, 0xA00000, 0xB1003D, 0x740069, 0x00005B, 0x00005F, 0x001840, 0x002F10, 0x084A08, 0x006700, 0x124200, 0x6D2800, 0x000000, 0x000000, 0x000000, 0xC4D5E7, 0xFF4000, 0xDC0E22, 0xFF476B, 0xD7009F, 0x680AD7, 0x0019BC, 0x0054B1, 0x006A5B, 0x008C03, 0x00AB00, 0x2C8800, 0xA47200, 0x000000, 0x000000, 0x000000, 0xF8F8F8, 0xFFAB3C, 0xFF7981, 0xFF5BC5, 0xFF48F2, 0xDF49FF, 0x476DFF, 0x00B4F7, 0x00E0FF, 0x00E375, 0x03F42B, 0x78B82E, 0xE5E218, 0x787878, 0x000000, 0x000000, 0xFFFFFF, 0xFFF2BE, 0xF8B8B8, 0xF8B8D8, 0xFFB6FF, 0xFFC3FF, 0xC7D1FF, 0x9ADAFF, 0x88EDF8, 0x83FFDD, 0xB8F8B8, 0xF5F8AC, 0xFFFFB0, 0xF8D8F8, 0x000000, 0x000000];
    this.makeTables();
    this.setEmphasis(0);
  },

  makeTables: function(){
    var r, g, b, col, i, rFactor, gFactor, bFactor;

    // Calculate a table for each possible emphasis setting:
    for(var emph = 0; emph < 8; emph++){
      // Determine color component factors:
      rFactor = 1.0;
      gFactor = 1.0;
      bFactor = 1.0;

      if((emph & 1) !== 0){
        rFactor = 0.75;
        bFactor = 0.75;
      }
      if((emph & 2) !== 0){
        rFactor = 0.75;
        gFactor = 0.75;
      }
      if((emph & 4) !== 0){
        gFactor = 0.75;
        bFactor = 0.75;
      }

      this.emphTable[emph] = new Array(64);

      // Calculate table:
      for(i = 0; i < 64; i++){
        col = this.curTable[i];
        r = Math.floor(this.getRed(col))// * rFactor);
        g = Math.floor(this.getGreen(col))// * gFactor);
        b = Math.floor(this.getBlue(col))// * bFactor);
        this.emphTable[emph][i] = this.getRgb(r, g, b);
      }
    }
  },

  setEmphasis: function(emph){
    if(emph !== this.currentEmph){
      this.currentEmph = emph;
      for(var i = 0; i < 64; i++){
        this.curTable[i] = this.emphTable[emph][i];
      }
    }
  },

  getEntry: function(yiq){
    return this.curTable[yiq];
  },

  getRed: function(rgb){
    return (rgb >> 16) & 0xff;
  },

  getGreen: function(rgb){
    return (rgb >> 8) & 0xff;
  },

  getBlue: function(rgb){
    return rgb & 0xff;
  },

  getRgb: function(r, g, b){
    return (r << 16) | (g << 8) | b;
  }*/
};
