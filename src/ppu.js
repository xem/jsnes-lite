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
  systemPalette: 
  [
    0xFF737373, 0xFF8c1821, 0xFFad0000, 0xFF9c0042,
    0xFF73008c, 0xFF1000ad, 0xFF0000a5, 0xFF00087b,
    0xFF002942, 0xFF004200, 0xFF005200, 0xFF103900,
    0xFF5a3918, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFbdbdbd, 0xFFef7300, 0xFFef3921, 0xFFf70084,
    0xFFbd00bd, 0xFF5a00e7, 0xFF0029de, 0xFF084ace,
    0xFF00738c, 0xFF009400, 0xFF00ad00, 0xFF399400,
    0xFF8c8400, 0xFF101010, 0xFF000000, 0xFF000000,
    0xFFffffff, 0xFFffbd39, 0xFFff945a, 0xFFff8ca5,
    0xFFff7bf7, 0xFFb573ff, 0xFF6373ff, 0xFF399cff,
    0xFF39bdf7, 0xFF10d684, 0xFF4ade4a, 0xFF9cff5a,
    0xFFdeef00, 0xFF393939, 0xFF000000, 0xFF000000,
    0xFFffffff, 0xFFffe7ad, 0xFFffd6c6, 0xFFffced6,
    0xFFffc6ff, 0xFFdec6ff, 0xFFb5bdff, 0xFFaddeff,
    0xFFa5e7ff, 0xFFa5ffe7, 0xFFbdf7ad, 0xFFceffb5,
    0xFFf7ff9c, 0xFF8c8c8c, 0xFF000000, 0xFF000000
  ],//"666134124214414413412421441341241142144000000000aaa38a34a53a93aa38a34a53a938a34a33a53a9000000000fff6be67e96ed6ee6be67e96ed6be67e66e96ed555000000fffcefccfdcffcffcefccfdcffcefccfccfdcffbbb000000".match(/.../g).map(c=>parseInt("ff"+c[2]+c[2]+c[1]+c[1]+c[0]+c[0], 16)),
  
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
    
    // PPU Scroll internal registers:
    // V: where to scroll on next line (0yyyNNYYYYYXXXXX)
    PPU.V_yyy = 0;
    PPU.V_NN = 0;
    PPU.V_YYYYY = 0;
    PPU.V_XXXXX = 0;
    
    // T: current scroll (0yyyNNYYYYYXXXXX)
    PPU.T_yyy = 0;
    PPU.T_NN = 0;
    PPU.T_YYYYY = 0;
    PPU.T_XXXXX = 0;

    // Fine X scroll (xxx)
    PPU.xxx = 0; 
    
    // Effective PPU scroll
    PPU.scroll_x = 0; // (NN % 2) * 256 + XXXXX * 8 + xxx 
    PPU.scroll_y = 0; // (NN >= 2) * 240 + YYYYY * 8 + yyy

    // PPU Data register buffer
    PPU.PPUDATA_read_buffer = 0;
  },
  
  // Set nametable mirroring
  setMirroring: mirroring => {
    if(mirroring != PPU.nametable_mirroring){
      
      // Render previous scanlines
      //PPU.render();

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
    // When an opaque pixel of the sprite 0 overlaps an opaque pixel of the background and both displays are enabled, a "sprite 0 hit" is detected
    
    // Find the sprites present in this scanline
    var scanlineSprites = [];
    for(i = 0; i < 64; i++){
      if(y >= PPU.OAM[i*4] && y < PPU.OAM[i*4] + (PPU.PPUCTRL_H ? 16 : 8)){
        scanlineSprites.push(i);
      }
    }
    
    //if(debug && scanlineSprites.length) console.log(y, scanlineSprites);
    
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
        bits = PPU.OAM[scanlineSprites[i]*4+2] & 0b11;
        colors = [
          ,
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 1)],
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 2)],
          PPU.systemPalette[PPU.load(0x3F10 + bits * 4 + 3)],
        ];
        
        // If this sprite is present at this pixel
        if(x >= PPU.OAM[scanlineSprites[i]*4+3] && x < PPU.OAM[scanlineSprites[i]*4+3] + 8){
          
          // Decode the current sprite scanline:
          // 16x8:
          if(PPU.PPUCTRL_H){
            
            // Vertical flip: bottom tile is reversed on top, top tile is reversed on bottom
            if(PPU.OAM[scanlineSprites[i]*4+2] & 0b10000000){
              
              // Top tile
              if(y < PPU.OAM[scanlineSprites[i]*4] + 8){
                spriteScanlineAddress = (PPU.OAM[scanlineSprites[i]*4+1] & 1) * 0x1000 + (PPU.OAM[scanlineSprites[i]*4+1] & 0b11111110) * 16 + 8 + (16 - y + PPU.OAM[scanlineSprites[i]*4]);
              }
              
              // Bottom tile
              else {
                spriteScanlineAddress = (PPU.OAM[scanlineSprites[i]*4+1] & 1) * 0x1000 + (PPU.OAM[scanlineSprites[i]*4+1] & 0b11111110) * 16 + (16 - y + PPU.OAM[scanlineSprites[i]*4]);
              }
            }
            
            // No flip
            else {
              
              // Top tile
              if(y < PPU.OAM[scanlineSprites[i]*4] + 8){
                spriteScanlineAddress = (PPU.OAM[scanlineSprites[i]*4+1] & 1) * 0x1000 + (PPU.OAM[scanlineSprites[i]*4+1] & 0b11111110) * 16 + (y - PPU.OAM[scanlineSprites[i]*4]);
              }
              
              // Bottom tile
              else {
                spriteScanlineAddress = (PPU.OAM[scanlineSprites[i]*4+1] & 1) * 0x1000 + (PPU.OAM[scanlineSprites[i]*4+1] & 0b11111110) * 16 + 8 + (y - PPU.OAM[scanlineSprites[i]*4]);
              }
            }
          }
          
          // 8x8:
          else {
          
            // Vertical flip
            if(PPU.OAM[scanlineSprites[i]*4+2] & 0b10000000){
              spriteScanlineAddress = PPU.PPUCTRL_S * 0x1000 + PPU.OAM[scanlineSprites[i]*4+1] * 16 + 8 - (y - PPU.OAM[scanlineSprites[i]*4]);
            }
            
            // No flip
            else {
              spriteScanlineAddress = PPU.PPUCTRL_S * 0x1000 + PPU.OAM[scanlineSprites[i]*4+1] * 16 + (y - PPU.OAM[scanlineSprites[i]*4]);
            }
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
            
            // Sprite 0 hit
            if(scanlineSprites[i] === 0 && !PPU.PPUSTATUS_S && pixel && PPU.vramPixelBuffer[x] && PPU.PPUMASK_s && PPU.PPUMASK_b){
              PPU.PPUSTATUS_S = 1;
              PPU.update_PPUSTATUS();
            }
            
            // If priority bit is 1: draw current background tile pixel on top of sprite (if any)
            if((PPU.OAM[scanlineSprites[i]*4+2] & 0b100000) && PPU.vramPixelBuffer[y*256+x]){
              //NES.frameBuffer32[y*256+x] = PPU.vramPixelBuffer[x];
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
    //PPU.render();

    PPU.PPUCTRL_V = (value >> 7) & 1; // bit 7: trigger a NMI on VBlank
                                      // bit 6: ignored (external pin)
    PPU.PPUCTRL_H = (value >> 5) & 1; // bit 5: sprite size (0: 8x8, 1: 8x16)
    PPU.PPUCTRL_B = (value >> 4) & 1; // bit 4: background pattern table (0: $0000, 1: $1000)
    PPU.PPUCTRL_S = (value >> 3) & 1; // bit 3: sprite pattern table (0: $0000, 1: $1000, ignored in 8x16 mode)
    PPU.PPUCTRL_I = (value >> 2) & 1; // bit 2: VRAM address increment after reading from PPUDATA (0: 1, 1: 32)
    PPU.PPUCTRL_N = value & 0b11;     // bits 0-1: nametable address ($2000 + $400 * N)
    PPU.PPUCTRL_Y = (value >> 1) & 1; // Bit 1: adds 240 to Y scroll position if set
    PPU.PPUCTRL_X = value & 1;        // Bit 0: adds 256 to X scroll position if set
    
    // Update scroll register T (NN = bits 0-1 of value)
    PPU.T_NN = value & 0b11;
  },
  
  // $2001 (write): set PPU Control Register 2 (PPUMASK)
  set_PPUMASK: value => {
    
    //console.log("PPUMASK",value.toString(2).padStart(8,0));
    
    // Render previous scanlines
    //PPU.render();
    
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
  // - set when an opaque pixel from sprite 0 overlaps an opaque pixel of the background if both displays are enabled
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
    //PPU.render();

    PPU.OAM[PPU.OAMADDR] = value;
    //PPU.spriteRamWriteUpdate(PPU.OAMADDR, value);
    PPU.OAMADDR++;
    PPU.OAMADDR %= 0x100;
  },
  
  // $2005 (write twice: vertical, then horizontal): PPU Background Scrolling Offset (PPUSCROLL)
  set_PPUSCROLL: value => {
    
    // Render previous scanlines
    //PPU.render();

    // Latch 0: first write, horizontal scroll
    if(PPU.latch == 0){
      //PPU.PPUSCROLL_X = value;
      
      // Update scroll register T (XXXXXxxx = value)
      PPU.T_XXXXX = value >> 3;
      //console.log(PPU.T_XXXXX);
      PPU.xxx = value & 0b111;
    } 
    
    // Latch 1: second write, vertical scroll
    // TODO: if value is between 240 and 255, it becomes negative (-16 to -1)
    else {
      //PPU.PPUSCROLL_Y = value;
      
      // Update scroll register T (YYYYYyyy = value)
      PPU.T_YYYYY = value >> 3;
      PPU.T_yyy = value & 0b111;
      
    }
    
    // Toggle latch
    PPU.latch ^= 1;
  },
  
  // $2006 (write twice): VRAM Address Register (PPUADDR)
  set_PPUADDR: value => {
    
    // Latch 0: first write, high byte of address 
    if(PPU.latch == 0){
      //PPU.regFV = (address >> 4) & 3;
      //PPU.PPUCTRL_Y = (address >> 3) & 1;
      //PPU.PPUCTRL_X = (address >> 2) & 1;
      //PPU.PPUCTRL_YT = (PPU.PPUCTRL_YT & 7) | ((address & 3) << 3);
      PPU.PPUADDR = value << 8;
      
      // Update scroll register T (00yyNNYY)
      PPU.T_yyy = (value >> 4) & 0b11; // only bits 1 and 2 of yyy are set. Bit 3 is corrupted to 0
      PPU.T_NN = (value >> 2) & 0b11;
      PPU.T_YYYYY = (value & 0b11) << 3; // read the two high bits of YYYYY
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
      PPU.PPUADDR += value;
      
      // Update scroll register T (YYYXXXXX)
      PPU.T_YYYYY += (value >> 5); // read the three low bits of YYYYY
      PPU.T_XXXXX = value & 0b11111;
      //console.log(PPU.T_XXXXX);
      
      // Copy T in V
      PPU.V_yyy = PPU.T_yyy;
      PPU.V_YYYYY = PPU.T_YYYYY;
      PPU.V_XXXXX = PPU.T_XXXXX;
      PPU.V_NN = PPU.T_NN;

      
    }
    
    // Toggle latch
    PPU.latch ^= 1;
    
    // Invoke mapper latch:
    //PPU.cntsToAddress();*/
  },
  
  // $2007h (read/write): VRAM Data Register (PPUDATA, address must be set first)
  set_PPUDATA: value => {
    
    // Render previous scanlines
    //PPU.render();
    
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
    //PPU.render();
    
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
      
      // Update scroll
      //PPU.scroll_x = 0;
      //PPU.scroll_y = 0;
      PPU.V_XXXXX = PPU.T_XXXXX;
      PPU.V_NN = (PPU.V_NN & 0b10) + (PPU.T_NN & 0b01);

      //if(PPU.scanline == 200){
      //  console.log(PPU.V_XXXXX, PPU.xxx, PPU.scroll_x);
      //}
      
      // Visible scanlines
      if(PPU.scanline < 241){
        //console.log(PPU.scanline-1, PPU.scanline+PPU.scroll_y-1);
        PPU.drawVramScanline(PPU.scanline+PPU.scroll_y-1);
        PPU.drawScanline(PPU.scanline-1);
        
        // Update scroll
        PPU.scroll_x = (PPU.V_NN & 0b1) * 256 + PPU.V_XXXXX * 8 + PPU.xxx;
        
        
      }
      
      // VBlank starts at scanline 241 (NMI is triggered, current frame is displayed on screen)
      else if(PPU.scanline == 241){
        //console.log("tick", PPU.scanline, PPU.dot);
        PPU.PPUSTATUS_V = 1;
        PPU.update_PPUSTATUS()
        CPU.requestIrq(CPU.NMI);
        
        // Render previous scanlines on frame buffer
        //PPU.render();

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
        
        // Update scroll
        //PPU.scroll_x = (PPU.PPUCTRL_X * 256 + PPU.PPUSCROLL_X);
        //PPU.scroll_y = (PPU.PPUCTRL_Y * 240 + PPU.PPUSCROLL_Y);
        //console.log(PPU.PPUCTRL_X, PPU.PPUSCROLL_X)
        PPU.V_YYYYY = PPU.T_YYYYY;
        PPU.V_yyy = PPU.T_yyy;
        PPU.V_NN = (PPU.V_NN & 0b01) + (PPU.T_NN & 0b10);
        PPU.scroll_y = (PPU.V_NN >> 1) * 240 + PPU.V_YYYYY * 8 + PPU.V_yyy;
        
        // Update VRAM view outside viewport
        for(var i = 0; i < PPU.scroll_y; i++){
          PPU.drawVramScanline(i);
        }
        
        for(var i = PPU.scroll_y + 240; i < 480; i++){
          PPU.drawVramScanline(i);
        }
      }
    }

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
};
