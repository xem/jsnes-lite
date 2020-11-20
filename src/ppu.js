// PPU
// ===

// PPU memory map (64KiB):

// +-------------+-------+----------------------------------------------------------+
// | Address     | Size  | Use                                                      |
// +-------------+-------+----------------------------------------------------------+
// | $0000-$FFFh | 4KiB  | Pattern Table 0 (256 tiles)                              |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
// | $1000-$1FFF | 4KiB  | Pattern Table 1 (256 tiles)                              |
// +-------------+-------+----------------------------------------------------------+
// | $2000-$23FF | 1KiB  | Name Table 0 + attribute Table 0                         |
// | $2400-$27FF | 1KiB  | Name Table 1 + attribute Table 1                         |
// | $2800-$2BFF | 1KiB  | Name Table 2 + attribute Table 2                         |
// | $2C00-$2FFF | 1KiB  | Name Table 3 + attribute Table 3                         |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
// | $3000-$3EFF | 3840B | Mirror of $2000-$2EFF (not used during rendering)        |
// +-------------+-------+----------------------------------------------------------+
// | $3F00-$3F1F | 32B   | Background and sprite palettes                           |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
// | $3F20-$3FFF | 224B  | Mirrors of $3F00-$3F1F                                   |
// +- - - - - - -+- - - -+- - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
// | $4000-$FFFF | 48ki  | Mirrors of $0000-$3FFF                                   |
// +-------------+-------+----------------------------------------------------------+

// OAM Memory (128B):

// +-------------+-------+----------------------------------------------------------+
// | Address     | Size  | Use                                                      |
// +-------------+-------+----------------------------------------------------------+
// | $00-$FF     | 256B  | Sprites properties (4 bytes for each)                    |
// +-------------+-------+----------------------------------------------------------+

var PPU = {
  vramMem: null,
  spriteMem: null,
  vramAddress: null,
  vramTmpAddress: null,
  vramBufferedReadValue: null,
  firstWrite: null,
  sramAddress: null,
  currentMirroring: null,
  requestEndFrame: null,
  nmiOk: null,
  dummyCycleToggle: null,
  validTileData: null,
  nmiCounter: null,
  scanlineAlreadyRendered: null,
  f_nmiOnVblank: null,
  f_spriteSize: null,
  f_bgPatternTable: null,
  f_spPatternTable: null,
  f_addrInc: null,
  f_nTblAddress: null,
  f_color: null,
  f_spVisibility: null,
  f_bgVisibility: null,
  f_spClipping: null,
  f_bgClipping: null,
  f_dispType: null,
  cntFV: null,
  cntV: null,
  cntH: null,
  cntVT: null,
  cntHT: null,
  regFV: null,
  regV: null,
  regH: null,
  regVT: null,
  regHT: null,
  regFH: null,
  regS: null,
  curNt: null,
  attrib: null,
  buffer: null,
  bgbuffer: null,
  pixrendered: null,
  validTileData: null,
  scantile: null,
  scanline: null,
  lastRenderedScanline: null,
  curX: null,
  sprX: null,
  sprY: null,
  sprTile: null,
  sprCol: null,
  vertFlip: null,
  horiFlip: null,
  bgPriority: null,
  spr0HitX: null,
  spr0HitY: null,
  hitSpr0: null,
  sprPalette: null,
  imgPalette: null,
  ptTile: null,
  ntable1: null,
  currentMirroring: null,
  nameTable: null,
  vramMirrorTable: null,
  palTable: null,
  showSpr0Hit: false,
  clipToTvSize: true,

  // Status flags:
  STATUS_VRAMWRITE: 4,
  STATUS_SLSPRITECOUNT: 5,
  STATUS_SPRITE0HIT: 6,
  STATUS_VBLANK: 7,

  reset: () => {
    var i;

    // Memory
    PPU.vramMem = new Array(0x8000);
    PPU.spriteMem = new Array(0x100);
    for(i = 0; i < PPU.vramMem.length; i++){
      PPU.vramMem[i] = 0;
    }
    for(i = 0; i < PPU.spriteMem.length; i++){
      PPU.spriteMem[i] = 0;
    }

    // VRAM I/O:
    PPU.vramAddress = null;
    PPU.vramTmpAddress = null;
    PPU.vramBufferedReadValue = 0;
    PPU.firstWrite = true; // VRAM/Scroll Hi/Lo latch

    // SPR-RAM I/O:
    PPU.sramAddress = 0; // 8-bit only.

    PPU.currentMirroring = -1;
    PPU.requestEndFrame = false;
    PPU.nmiOk = false;
    PPU.dummyCycleToggle = false;
    PPU.validTileData = false;
    PPU.nmiCounter = 0;
    PPU.scanlineAlreadyRendered = null;

    // Control Flags Register 1:
    PPU.f_nmiOnVblank = 0; // NMI on VBlank. 0=disable, 1=enable
    PPU.f_spriteSize = 0; // Sprite size. 0=8x8, 1=8x16
    PPU.f_bgPatternTable = 0; // Background Pattern Table address. 0=0x0000,1=0x1000
    PPU.f_spPatternTable = 0; // Sprite Pattern Table address. 0=0x0000,1=0x1000
    PPU.f_addrInc = 0; // PPU Address Increment. 0=1,1=32
    PPU.f_nTblAddress = 0; // Name Table Address. 0=0x2000,1=0x2400,2=0x2800,3=0x2C00

    // Control Flags Register 2:
    PPU.f_color = 0; // Background color. 0=black, 1=blue, 2=green, 4=red
    PPU.f_spVisibility = 0; // Sprite visibility. 0=not displayed,1=displayed
    PPU.f_bgVisibility = 0; // Background visibility. 0=Not Displayed,1=displayed
    PPU.f_spClipping = 0; // Sprite clipping. 0=Sprites invisible in left 8-pixel column,1=No clipping
    PPU.f_bgClipping = 0; // Background clipping. 0=BG invisible in left 8-pixel column, 1=No clipping
    PPU.f_dispType = 0; // Display type. 0=color, 1=monochrome

    // Counters:
    PPU.cntFV = 0;
    PPU.cntV = 0;
    PPU.cntH = 0;
    PPU.cntVT = 0;
    PPU.cntHT = 0;

    // Registers:
    PPU.regFV = 0;
    PPU.regV = 0;
    PPU.regH = 0;
    PPU.regVT = 0;
    PPU.regHT = 0;
    PPU.regFH = 0;
    PPU.regS = 0;

    // These are temporary variables used in rendering and sound procedures.
    // Their states outside of those procedures can be ignored.
    // TODO: the use of this is a bit weird, investigate
    PPU.curNt = null;

    // Variables used when rendering:
    PPU.attrib = new Array(32);
    PPU.buffer = new Array(256 * 240);
    PPU.bgbuffer = new Array(256 * 240);
    PPU.pixrendered = new Array(256 * 240);

    PPU.validTileData = null;

    PPU.scantile = new Array(32);

    // Initialize misc vars:
    PPU.scanline = 0;
    PPU.lastRenderedScanline = -1;
    PPU.curX = 0;

    // Sprite data:
    PPU.sprX = new Array(64); // X coordinate
    PPU.sprY = new Array(64); // Y coordinate
    PPU.sprTile = new Array(64); // Tile Index (into pattern table)
    PPU.sprCol = new Array(64); // Upper two bits of color
    PPU.vertFlip = new Array(64); // Vertical Flip
    PPU.horiFlip = new Array(64); // Horizontal Flip
    PPU.bgPriority = new Array(64); // Background priority
    PPU.spr0HitX = 0; // Sprite #0 hit X coordinate
    PPU.spr0HitY = 0; // Sprite #0 hit Y coordinate
    PPU.hitSpr0 = false;

    // Palette data:
    PPU.sprPalette = new Array(16);
    PPU.imgPalette = new Array(16);

    // Create pattern table tile buffers:
    PPU.ptTile = new Array(512);
    for(i = 0; i < 512; i++){
      PPU.ptTile[i] = { pixels: [] };
    }

    // Create nametable buffers:
    // Name table data:
    PPU.ntable1 = new Array(4);
    PPU.currentMirroring = -1;
    PPU.nameTable = new Array(4);
    for(i = 0; i < 4; i++){
      PPU.nameTable[i] = new NameTable(32, 32, "Nt" + i);
    }

    // Initialize mirroring lookup table:
    PPU.vramMirrorTable = new Array(0x8000);
    for(i = 0; i < 0x8000; i++){
      PPU.vramMirrorTable[i] = i;
    }

    PPU.palTable = new PaletteTable();
    PPU.palTable.loadNTSCPalette();
    //PPU.palTable.loadDefaultPalette();

    PPU.updateControlReg1(0);
    PPU.updateControlReg2(0);
  },

  // Clock one PPU cycle
  // Each PPU cycle advances the rendering by one pixel on a 341*262px grid
  
  //        x=0                 x=256      x=340
  //       _|____________________|__________|
  //  y=-1  | pre-render scanline| prepare *|
  //       _|____________________| sprites  |
  //  y=0   | visible area       | for the  |
  //        | - this is rendered | next     |
  //  y=239 |   on the screen.   | scanline |
  //       _|____________________|__________|
  //  y=240 | idle                          |
  //       _|_______________________________|
  //  y=241 | vertical blanking (idle)      |
  //        | 20 scanlines long             |
  //  y=260_|_______________________________|
  
  // (*) When background-rendering is enabled, the pre-render scanline alternates between 340 and 341 pixels at each frame
  
  tick: () => {
    // TODO
  },
  
  // Sets Nametable mirroring.
  setMirroring: mirroring => {
    if(mirroring === PPU.currentMirroring){
      return;
    }

    PPU.currentMirroring = mirroring;
    PPU.triggerRendering();

    // Remove mirroring:
    if(PPU.vramMirrorTable === null){
      PPU.vramMirrorTable = new Array(0x8000);
    }
    for(var i = 0; i < 0x8000; i++){
      PPU.vramMirrorTable[i] = i;
    }

    // Palette mirroring:
    PPU.defineMirrorRegion(0x3f20, 0x3f00, 0x20);
    PPU.defineMirrorRegion(0x3f40, 0x3f00, 0x20);
    PPU.defineMirrorRegion(0x3f80, 0x3f00, 0x20);
    PPU.defineMirrorRegion(0x3fc0, 0x3f00, 0x20);

    // Additional mirroring:
    PPU.defineMirrorRegion(0x3000, 0x2000, 0xf00);
    PPU.defineMirrorRegion(0x4000, 0x0000, 0x4000);

    if(mirroring === 1){
      // Horizontal mirroring.

      PPU.ntable1[0] = 0;
      PPU.ntable1[1] = 0;
      PPU.ntable1[2] = 1;
      PPU.ntable1[3] = 1;

      PPU.defineMirrorRegion(0x2400, 0x2000, 0x400);
      PPU.defineMirrorRegion(0x2c00, 0x2800, 0x400);
    } else if(mirroring === 0){
      // Vertical mirroring.

      PPU.ntable1[0] = 0;
      PPU.ntable1[1] = 1;
      PPU.ntable1[2] = 0;
      PPU.ntable1[3] = 1;

      PPU.defineMirrorRegion(0x2800, 0x2000, 0x400);
      PPU.defineMirrorRegion(0x2c00, 0x2400, 0x400);
    } /*else if(mirroring === ROM.SINGLESCREEN_MIRRORING){
      // Single Screen mirroring

      PPU.ntable1[0] = 0;
      PPU.ntable1[1] = 0;
      PPU.ntable1[2] = 0;
      PPU.ntable1[3] = 0;

      PPU.defineMirrorRegion(0x2400, 0x2000, 0x400);
      PPU.defineMirrorRegion(0x2800, 0x2000, 0x400);
      PPU.defineMirrorRegion(0x2c00, 0x2000, 0x400);
    } else if(mirroring === ROM.SINGLESCREEN_MIRRORING2){
      PPU.ntable1[0] = 1;
      PPU.ntable1[1] = 1;
      PPU.ntable1[2] = 1;
      PPU.ntable1[3] = 1;

      PPU.defineMirrorRegion(0x2400, 0x2400, 0x400);
      PPU.defineMirrorRegion(0x2800, 0x2400, 0x400);
      PPU.defineMirrorRegion(0x2c00, 0x2400, 0x400);
    } */
    else {
      // Assume Four-screen mirroring.

      PPU.ntable1[0] = 0;
      PPU.ntable1[1] = 1;
      PPU.ntable1[2] = 2;
      PPU.ntable1[3] = 3;
    }
  },

  // Define a mirrored area in the address lookup table.
  // Assumes the regions don't overlap.
  // The 'to' region is the region that is physically in memory.
  defineMirrorRegion: (fromStart, toStart, size) => {
    for(var i = 0; i < size; i++){
      PPU.vramMirrorTable[fromStart + i] = toStart + i;
    }
  },

  startVBlank: () => {
    // Do NMI:
    CPU.requestIrq(CPU.NMI);

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
  },

  endScanline: () => {
    switch (PPU.scanline){
      case 19:
        // Dummy scanline.
        // May be variable length:
        if(PPU.dummyCycleToggle){
          // Remove dead cycle at end of scanline,
          // for next scanline:
          PPU.curX = 1;
          PPU.dummyCycleToggle = !PPU.dummyCycleToggle;
        }
        break;

      case 20:
        // Clear VBlank flag:
        PPU.setStatusFlag(PPU.STATUS_VBLANK, false);

        // Clear Sprite #0 hit flag:
        PPU.setStatusFlag(PPU.STATUS_SPRITE0HIT, false);
        PPU.hitSpr0 = false;
        PPU.spr0HitX = -1;
        PPU.spr0HitY = -1;

        if(PPU.f_bgVisibility === 1 || PPU.f_spVisibility === 1){
          // Update counters:
          PPU.cntFV = PPU.regFV;
          PPU.cntV = PPU.regV;
          PPU.cntH = PPU.regH;
          PPU.cntVT = PPU.regVT;
          PPU.cntHT = PPU.regHT;

          if(PPU.f_bgVisibility === 1){
            // Render dummy scanline:
            PPU.renderBgScanline(false, 0);
          }
        }

        if(PPU.f_bgVisibility === 1 && PPU.f_spVisibility === 1){
          // Check sprite 0 hit for first scanline:
          PPU.checkSprite0(0);
        }

        if(PPU.f_bgVisibility === 1 || PPU.f_spVisibility === 1){
          // Clock mapper IRQ Counter:
          //Mapper.clockIrqCounter();
        }
        break;

      case 261:
        // Dead scanline, no rendering.
        // Set VINT:
        PPU.setStatusFlag(PPU.STATUS_VBLANK, true);
        PPU.requestEndFrame = true;
        PPU.nmiCounter = 9;

        // Wrap around:
        PPU.scanline = -1; // will be incremented to 0

        break;

      default:
        if(PPU.scanline >= 21 && PPU.scanline <= 260){
          // Render normally:
          if(PPU.f_bgVisibility === 1){
            if(!PPU.scanlineAlreadyRendered){
              // update scroll:
              PPU.cntHT = PPU.regHT;
              PPU.cntH = PPU.regH;
              PPU.renderBgScanline(true, PPU.scanline + 1 - 21);
            }
            PPU.scanlineAlreadyRendered = false;

            // Check for sprite 0 (next scanline):
            if(!PPU.hitSpr0 && PPU.f_spVisibility === 1){
              if(
                PPU.sprX[0] >= -7 &&
                PPU.sprX[0] < 256 &&
                PPU.sprY[0] + 1 <= PPU.scanline - 20 &&
                PPU.sprY[0] + 1 + (PPU.f_spriteSize === 0 ? 8 : 16) >=
                  PPU.scanline - 20
              ){
                if(PPU.checkSprite0(PPU.scanline - 20)){
                  PPU.hitSpr0 = true;
                }
              }
            }
          }

          if(PPU.f_bgVisibility === 1 || PPU.f_spVisibility === 1){
            // Clock mapper IRQ Counter:
            //Mapper.clockIrqCounter();
          }
        }
    }

    PPU.scanline++;
    PPU.regsToAddress();
    PPU.cntsToAddress();
  },

  startFrame: () => {
    // Set background color:
    var bgColor = 0;

    if(PPU.f_dispType === 0){
      // Color display.
      // f_color determines color emphasis.
      // Use first entry of image palette as BG color.
      bgColor = PPU.imgPalette[0];
    } else {
      // Monochrome display.
      // f_color determines the bg color.
      switch (PPU.f_color){
        case 0:
          // Black
          bgColor = 0x00000;
          break;
        case 1:
          // Green
          bgColor = 0x00ff00;
          break;
        case 2:
          // Blue
          bgColor = 0xff0000;
          break;
        case 3:
          // Invalid. Use black.
          bgColor = 0x000000;
          break;
        case 4:
          // Red
          bgColor = 0x0000ff;
          break;
        default:
          // Invalid. Use black.
          bgColor = 0x0;
      }
    }

    var buffer = PPU.buffer;
    var i;
    for(i = 0; i < 256 * 240; i++){
      buffer[i] = bgColor;
    }
    var pixrendered = PPU.pixrendered;
    for(i = 0; i < pixrendered.length; i++){
      pixrendered[i] = 65;
    }
  },

  endFrame: () => {
    var i, x, y;
    var buffer = PPU.buffer;

    // Draw spr#0 hit coordinates:
    if(PPU.showSpr0Hit){
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
    }

    // This is a bit lazy..
    // if either the sprites or the background should be clipped,
    // both are clipped after rendering is finished.
    if(
      PPU.clipToTvSize ||
      PPU.f_bgClipping === 0 ||
      PPU.f_spClipping === 0
    ){
      // Clip left 8-pixels column:
      for(y = 0; y < 240; y++){
        for(x = 0; x < 8; x++){
          buffer[(y << 8) + x] = 0;
        }
      }
    }

    if(PPU.clipToTvSize){
      // Clip right 8-pixels column too:
      for(y = 0; y < 240; y++){
        for(x = 0; x < 8; x++){
          buffer[(y << 8) + 255 - x] = 0;
        }
      }
    }

    // Clip top and bottom 8 pixels:
    if(PPU.clipToTvSize){
      for(y = 0; y < 8; y++){
        for(x = 0; x < 256; x++){
          buffer[(y << 8) + x] = 0;
          buffer[((239 - y) << 8) + x] = 0;
        }
      }
    }

    NES.onFrame(buffer);
  },

  updateControlReg1: value => {
    PPU.triggerRendering();

    PPU.f_nmiOnVblank = (value >> 7) & 1;
    PPU.f_spriteSize = (value >> 5) & 1;
    PPU.f_bgPatternTable = (value >> 4) & 1;
    PPU.f_spPatternTable = (value >> 3) & 1;
    PPU.f_addrInc = (value >> 2) & 1;
    PPU.f_nTblAddress = value & 3;

    PPU.regV = (value >> 1) & 1;
    PPU.regH = value & 1;
    PPU.regS = (value >> 4) & 1;
  },

  updateControlReg2: value => {
    PPU.triggerRendering();

    PPU.f_color = (value >> 5) & 7;
    PPU.f_spVisibility = (value >> 4) & 1;
    PPU.f_bgVisibility = (value >> 3) & 1;
    PPU.f_spClipping = (value >> 2) & 1;
    PPU.f_bgClipping = (value >> 1) & 1;
    PPU.f_dispType = value & 1;

    if(PPU.f_dispType === 0){
      PPU.palTable.setEmphasis(PPU.f_color);
    }
    PPU.updatePalettes();
  },

  setStatusFlag: (flag, value) => {
    var n = 1 << flag;
    CPU.mem[0x2002] =
      (CPU.mem[0x2002] & (255 - n)) | (value ? n : 0);
  },

  // CPU Register $2002:
  // Read the Status Register.
  readStatusRegister: () => {
    var tmp = CPU.mem[0x2002];
    
    if(CPU.readSRcount == 2){

    // Reset scroll & VRAM Address toggle:
    PPU.firstWrite = true;

    // Clear VBlank flag:
    PPU.setStatusFlag(PPU.STATUS_VBLANK, false);
    
    }

    // Fetch status data:
    return tmp;
  },

  // CPU Register $2003:
  // Write the SPR-RAM address that is used for sramWrite (Register 0x2004 in CPU memory map)
  writeSRAMAddress: address => {
    PPU.sramAddress = address;
  },

  // CPU Register $2004 (R):
  // Read from SPR-RAM (Sprite RAM).
  // The address should be set first.
  sramLoad: () => {
    /*short tmp = sprMem.load(sramAddress);
        sramAddress++; // Increment address
        sramAddress%=0x100;
        return tmp;*/
    return PPU.spriteMem[PPU.sramAddress];
  },

  // CPU Register $2004 (W):
  // Write to SPR-RAM (Sprite RAM).
  // The address should be set first.
  sramWrite: value => {
    PPU.spriteMem[PPU.sramAddress] = value;
    PPU.spriteRamWriteUpdate(PPU.sramAddress, value);
    PPU.sramAddress++; // Increment address
    PPU.sramAddress %= 0x100;
  },

  // CPU Register $2005:
  // Write to scroll registers.
  // The first write is the vertical offset, the second is the
  // horizontal offset:
  scrollWrite: value => {
    PPU.triggerRendering();

    if(PPU.firstWrite){
      // First write, horizontal scroll:
      PPU.regHT = (value >> 3) & 31;
      PPU.regFH = value & 7;
    } else {
      // Second write, vertical scroll:
      PPU.regFV = value & 7;
      PPU.regVT = (value >> 3) & 31;
    }
    PPU.firstWrite = !PPU.firstWrite;
  },

  // CPU Register $2006:
  // Sets the adress used when reading/writing from/to VRAM.
  // The first write sets the high byte, the second the low byte.
  writeVRAMAddress: address => {
    if(PPU.firstWrite){
      PPU.regFV = (address >> 4) & 3;
      PPU.regV = (address >> 3) & 1;
      PPU.regH = (address >> 2) & 1;
      PPU.regVT = (PPU.regVT & 7) | ((address & 3) << 3);
    } else {
      PPU.triggerRendering();

      PPU.regVT = (PPU.regVT & 24) | ((address >> 5) & 7);
      PPU.regHT = address & 31;

      PPU.cntFV = PPU.regFV;
      PPU.cntV = PPU.regV;
      PPU.cntH = PPU.regH;
      PPU.cntVT = PPU.regVT;
      PPU.cntHT = PPU.regHT;

      PPU.checkSprite0(PPU.scanline - 20);
    }

    PPU.firstWrite = !PPU.firstWrite;

    // Invoke mapper latch:
    PPU.cntsToAddress();
    if(PPU.vramAddress < 0x2000){
      //Mapper.latchAccess(PPU.vramAddress);
    }
  },

  // CPU Register $2007(R):
  // Read from PPU memory. The address should be set first.
  vramLoad: () => {
    var tmp;

    PPU.cntsToAddress();
    PPU.regsToAddress();

    // If address is in range 0x0000-0x3EFF, return buffered values:
    if(PPU.vramAddress <= 0x3eff){
      tmp = PPU.vramBufferedReadValue;

      // Update buffered value:
      if(PPU.vramAddress < 0x2000){
        PPU.vramBufferedReadValue = PPU.vramMem[PPU.vramAddress];
      } else {
        PPU.vramBufferedReadValue = PPU.mirroredLoad(PPU.vramAddress);
      }

      // Mapper latch access:
      if(PPU.vramAddress < 0x2000){
        //Mapper.latchAccess(PPU.vramAddress);
      }

      // Increment by either 1 or 32, depending on d2 of Control Register 1:
      PPU.vramAddress += PPU.f_addrInc === 1 ? 32 : 1;

      PPU.cntsFromAddress();
      PPU.regsFromAddress();

      return tmp; // Return the previous buffered value.
    }

    // No buffering in this mem range. Read normally.
    tmp = PPU.mirroredLoad(PPU.vramAddress);

    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    PPU.vramAddress += PPU.f_addrInc === 1 ? 32 : 1;

    PPU.cntsFromAddress();
    PPU.regsFromAddress();

    return tmp;
  },

  // CPU Register $2007(W):
  // Write to PPU memory. The address should be set first.
  vramWrite: value => {
    PPU.triggerRendering();
    PPU.cntsToAddress();
    PPU.regsToAddress();

    if(PPU.vramAddress >= 0x2000){
      // Mirroring is used.
      PPU.mirroredWrite(PPU.vramAddress, value);
    } else {
      // Write normally.
      PPU.writeMem(PPU.vramAddress, value);

      // Invoke mapper latch:
      //Mapper.latchAccess(PPU.vramAddress);
    }

    // Increment by either 1 or 32, depending on d2 of Control Register 1:
    PPU.vramAddress += PPU.f_addrInc === 1 ? 32 : 1;
    PPU.regsFromAddress();
    PPU.cntsFromAddress();
  },

  // CPU Register $4014:
  // Write 256 bytes of main memory
  // into Sprite RAM.
  sramDMA: value => {
    var baseAddress = value * 0x100;
    var data;
    for(var i = PPU.sramAddress; i < 256; i++){
      data = CPU.mem[baseAddress + i];
      PPU.spriteMem[i] = data;
      PPU.spriteRamWriteUpdate(i, data);
    }

    CPU.haltCycles(513);
  },

  // Updates the scroll registers from a new VRAM address.
  regsFromAddress: () => {
    var address = (PPU.vramTmpAddress >> 8) & 0xff;
    PPU.regFV = (address >> 4) & 7;
    PPU.regV = (address >> 3) & 1;
    PPU.regH = (address >> 2) & 1;
    PPU.regVT = (PPU.regVT & 7) | ((address & 3) << 3);

    address = PPU.vramTmpAddress & 0xff;
    PPU.regVT = (PPU.regVT & 24) | ((address >> 5) & 7);
    PPU.regHT = address & 31;
  },

  // Updates the scroll registers from a new VRAM address.
  cntsFromAddress: () => {
    var address = (PPU.vramAddress >> 8) & 0xff;
    PPU.cntFV = (address >> 4) & 3;
    PPU.cntV = (address >> 3) & 1;
    PPU.cntH = (address >> 2) & 1;
    PPU.cntVT = (PPU.cntVT & 7) | ((address & 3) << 3);

    address = PPU.vramAddress & 0xff;
    PPU.cntVT = (PPU.cntVT & 24) | ((address >> 5) & 7);
    PPU.cntHT = address & 31;
  },

  regsToAddress: () => {
    var b1 = (PPU.regFV & 7) << 4;
    b1 |= (PPU.regV & 1) << 3;
    b1 |= (PPU.regH & 1) << 2;
    b1 |= (PPU.regVT >> 3) & 3;

    var b2 = (PPU.regVT & 7) << 5;
    b2 |= PPU.regHT & 31;

    PPU.vramTmpAddress = ((b1 << 8) | b2) & 0x7fff;
  },

  cntsToAddress: () => {
    var b1 = (PPU.cntFV & 7) << 4;
    b1 |= (PPU.cntV & 1) << 3;
    b1 |= (PPU.cntH & 1) << 2;
    b1 |= (PPU.cntVT >> 3) & 3;

    var b2 = (PPU.cntVT & 7) << 5;
    b2 |= PPU.cntHT & 31;

    PPU.vramAddress = ((b1 << 8) | b2) & 0x7fff;
  },

  incTileCounter: count => {
    for(var i = count; i !== 0; i--){
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
    }
  },

  // Reads from memory, taking into account
  // mirroring/mapping of address ranges.
  mirroredLoad: address =>{
    return PPU.vramMem[PPU.vramMirrorTable[address]];
  },

  // Writes to memory, taking into account
  // mirroring/mapping of address ranges.
  mirroredWrite: (address, value) => {
    if(address >= 0x3f00 && address < 0x3f20){
      // Palette write mirroring.
      if(address === 0x3f00 || address === 0x3f10){
        PPU.writeMem(0x3f00, value);
        PPU.writeMem(0x3f10, value);
      } else if(address === 0x3f04 || address === 0x3f14){
        PPU.writeMem(0x3f04, value);
        PPU.writeMem(0x3f14, value);
      } else if(address === 0x3f08 || address === 0x3f18){
        PPU.writeMem(0x3f08, value);
        PPU.writeMem(0x3f18, value);
      } else if(address === 0x3f0c || address === 0x3f1c){
        PPU.writeMem(0x3f0c, value);
        PPU.writeMem(0x3f1c, value);
      } else {
        PPU.writeMem(address, value);
      }
    } else {
      // Use lookup table for mirrored address:
      if(address < PPU.vramMirrorTable.length){
        PPU.writeMem(PPU.vramMirrorTable[address], value);
      } else {
        throw new Error("Invalid VRAM address: " + address.toString(16));
      }
    }
  },

  triggerRendering: () => {
    if(PPU.scanline >= 21 && PPU.scanline <= 260){
      // Render sprites, and combine:
      PPU.renderFramePartially(
        PPU.lastRenderedScanline + 1,
        PPU.scanline - 21 - PPU.lastRenderedScanline
      );

      // Set last rendered scanline:
      PPU.lastRenderedScanline = PPU.scanline - 21;
    }
  },

  renderFramePartially: (startScan, scanCount) => {
    if(PPU.f_spVisibility === 1){
      PPU.renderSpritesPartially(startScan, scanCount, true);
    }

    if(PPU.f_bgVisibility === 1){
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

    if(PPU.f_spVisibility === 1){
      PPU.renderSpritesPartially(startScan, scanCount, false);
    }

    PPU.validTileData = false;
  },

  renderBgScanline: (bgbuffer, scan) => {
    var baseTile = PPU.regS === 0 ? 0 : 256;
    var destIndex = (scan << 8) - PPU.regFH;

    PPU.curNt = PPU.ntable1[PPU.cntV + PPU.cntV + PPU.cntH];

    PPU.cntHT = PPU.regHT;
    PPU.cntH = PPU.regH;
    PPU.curNt = PPU.ntable1[PPU.cntV + PPU.cntV + PPU.cntH];

    if(scan < 240 && scan - PPU.cntFV >= 0){
      var tscanoffset = PPU.cntFV << 3;
      var scantile = PPU.scantile;
      var attrib = PPU.attrib;
      var ptTile = PPU.ptTile;
      var nameTable = PPU.nameTable;
      var imgPalette = PPU.imgPalette;
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
            /*if(t.opaque[PPU.cntFV]){
              for(; sx < 8; sx++){
                targetBuffer[destIndex] =
                  imgPalette[tpix[tscanoffset + sx] + att];
                pixrendered[destIndex] |= 256;
                destIndex++;
              }
            } else {*/
              for(; sx < 8; sx++){
                col = tpix[tscanoffset + sx];
                if(col !== 0){
                  targetBuffer[destIndex] = imgPalette[col + att];
                  pixrendered[destIndex] |= 256;
                }
                destIndex++;
              }
            //}
          }
        }

        // Increase Horizontal Tile Counter:
        if(++PPU.cntHT === 32){
          PPU.cntHT = 0;
          PPU.cntH++;
          PPU.cntH %= 2;
          PPU.curNt = PPU.ntable1[(PPU.cntV << 1) + PPU.cntH];
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
        PPU.curNt = PPU.ntable1[(PPU.cntV << 1) + PPU.cntH];
      } else if(PPU.cntVT === 32){
        PPU.cntVT = 0;
      }

      // Invalidate fetched data:
      PPU.validTileData = false;
    }
  },

  renderSpritesPartially: (startscan, scancount, bgPri) => {
    if(PPU.f_spVisibility === 1){
      for(var i = 0; i < 64; i++){
        if(
          PPU.bgPriority[i] === bgPri &&
          PPU.sprX[i] >= 0 &&
          PPU.sprX[i] < 256 &&
          PPU.sprY[i] + 8 >= startscan &&
          PPU.sprY[i] < startscan + scancount
        ){
          // Show sprite.
          if(PPU.f_spriteSize === 0){
            // 8x8 sprites

            PPU.srcy1 = 0;
            PPU.srcy2 = 8;

            if(PPU.sprY[i] < startscan){
              PPU.srcy1 = startscan - PPU.sprY[i] - 1;
            }

            if(PPU.sprY[i] + 8 > startscan + scancount){
              PPU.srcy2 = startscan + scancount - PPU.sprY[i] + 1;
            }

            Tile.draw_sprite(
              PPU.ptTile[PPU.f_spPatternTable === 0 ? PPU.sprTile[i] : PPU.sprTile[i] + 256],
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
            );
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

            Tile.draw_sprite(
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
            );

            srcy1 = 0;
            srcy2 = 8;

            if(PPU.sprY[i] + 8 < startscan){
              srcy1 = startscan - (PPU.sprY[i] + 8 + 1);
            }

            if(PPU.sprY[i] + 16 > startscan + scancount){
              srcy2 = startscan + scancount - (PPU.sprY[i] + 8);
            }

            Tile.draw_sprite(
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
            );
          }
        }
      }
    }
  },

  checkSprite0: scan => {
    PPU.spr0HitX = -1;
    PPU.spr0HitY = -1;

    var toffset;
    var tIndexAdd = PPU.f_spPatternTable === 0 ? 0 : 256;
    var x, y, t, i;
    var bufferIndex;

    x = PPU.sprX[0];
    y = PPU.sprY[0] + 1;

    if(PPU.f_spriteSize === 0){
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

    return false;
  },

  // This will write to PPU memory, and
  // update internally buffered data
  // appropriately.
  writeMem: (address, value) => {
    PPU.vramMem[address] = value;

    // Update internally buffered data:
    if(address < 0x2000){
      PPU.vramMem[address] = value;
      PPU.patternWrite(address, value);
    } else if(address >= 0x2000 && address < 0x23c0){
      PPU.nameTableWrite(PPU.ntable1[0], address - 0x2000, value);
    } else if(address >= 0x23c0 && address < 0x2400){
      PPU.attribTableWrite(PPU.ntable1[0], address - 0x23c0, value);
    } else if(address >= 0x2400 && address < 0x27c0){
      PPU.nameTableWrite(PPU.ntable1[1], address - 0x2400, value);
    } else if(address >= 0x27c0 && address < 0x2800){
      PPU.attribTableWrite(PPU.ntable1[1], address - 0x27c0, value);
    } else if(address >= 0x2800 && address < 0x2bc0){
      PPU.nameTableWrite(PPU.ntable1[2], address - 0x2800, value);
    } else if(address >= 0x2bc0 && address < 0x2c00){
      PPU.attribTableWrite(PPU.ntable1[2], address - 0x2bc0, value);
    } else if(address >= 0x2c00 && address < 0x2fc0){
      PPU.nameTableWrite(PPU.ntable1[3], address - 0x2c00, value);
    } else if(address >= 0x2fc0 && address < 0x3000){
      PPU.attribTableWrite(PPU.ntable1[3], address - 0x2fc0, value);
    } else if(address >= 0x3f00 && address < 0x3f20){
      PPU.updatePalettes();
    }
  },

  // Reads data from $3f00 to $f20
  // into the two buffered palettes.
  updatePalettes: () => {
    var i;

    for(i = 0; i < 16; i++){
      if(PPU.f_dispType === 0){
        PPU.imgPalette[i] = PPU.palTable.getEntry(
          PPU.vramMem[0x3f00 + i] & 63
        );
      } else {
        PPU.imgPalette[i] = PPU.palTable.getEntry(
          PPU.vramMem[0x3f00 + i] & 32
        );
      }
    }
    for(i = 0; i < 16; i++){
      if(PPU.f_dispType === 0){
        PPU.sprPalette[i] = PPU.palTable.getEntry(
          PPU.vramMem[0x3f10 + i] & 63
        );
      } else {
        PPU.sprPalette[i] = PPU.palTable.getEntry(
          PPU.vramMem[0x3f10 + i] & 32
        );
      }
    }
  },

  // Updates the internal pattern
  // table buffers with this new byte.
  // In vNES, there is a version of this with 4 arguments which isn't used.
  patternWrite: (address, value) => {
    var bank = address > 0x1000 ? 1 : 0;
    var tileIndex = Math.floor(address / 16);
    ROM.chr_rom[bank][address % 0x1000] = value;
    ROM.chr_rom_tiles[bank][tileIndex] = { pixels: [] };
    Tile.decode(ROM.chr_rom_tiles[bank][tileIndex], ROM.chr_rom[bank], tileIndex);
  },

  // Updates the internal name table buffers
  // with this new byte.
  nameTableWrite: (index, address, value) => {
    PPU.nameTable[index].tile[address] = value;

    // Update Sprite #0 hit:
    //updateSpr0Hit();
    PPU.checkSprite0(PPU.scanline - 20);
  },

  // Updates the internal pattern
  // table buffers with this new attribute
  // table byte.
  attribTableWrite: (index, address, value) => {
    PPU.nameTable[index].writeAttrib(address, value);
  },

  // Updates the internally buffered sprite
  // data with this new byte of info.
  spriteRamWriteUpdate: (address, value) => {
    var tIndex = Math.floor(address / 4);

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
    PPU.setStatusFlag(PPU.STATUS_VBLANK, true);
    //nes.getCpu().doNonMaskableInterrupt();
    CPU.requestIrq(CPU.NMI);
  },

  isPixelWhite: (x, y) => {
    PPU.triggerRendering();
    return PPU.buffer[(y << 8) + x] === 0xffffff;
  },
};

var NameTable = function(width, height, name){
  this.width = width;
  this.height = height;
  this.name = name;

  this.tile = new Array(width * height);
  this.attrib = new Array(width * height);
  for(var i = 0; i < width * height; i++){
    this.tile[i] = 0;
    this.attrib[i] = 0;
  }
};

NameTable.prototype = {
  getTileIndex: function(x, y){
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
  },
};

var PaletteTable = function(){
  this.curTable = new Array(64);
  this.emphTable = new Array(8);
  this.currentEmph = -1;
};

PaletteTable.prototype = {
  reset: function(){
    this.setEmphasis(0);
  },

  loadNTSCPalette: function(){
    // prettier-ignore
    this.curTable = [0x525252, 0xB40000, 0xA00000, 0xB1003D, 0x740069, 0x00005B, 0x00005F, 0x001840, 0x002F10, 0x084A08, 0x006700, 0x124200, 0x6D2800, 0x000000, 0x000000, 0x000000, 0xC4D5E7, 0xFF4000, 0xDC0E22, 0xFF476B, 0xD7009F, 0x680AD7, 0x0019BC, 0x0054B1, 0x006A5B, 0x008C03, 0x00AB00, 0x2C8800, 0xA47200, 0x000000, 0x000000, 0x000000, 0xF8F8F8, 0xFFAB3C, 0xFF7981, 0xFF5BC5, 0xFF48F2, 0xDF49FF, 0x476DFF, 0x00B4F7, 0x00E0FF, 0x00E375, 0x03F42B, 0x78B82E, 0xE5E218, 0x787878, 0x000000, 0x000000, 0xFFFFFF, 0xFFF2BE, 0xF8B8B8, 0xF8B8D8, 0xFFB6FF, 0xFFC3FF, 0xC7D1FF, 0x9ADAFF, 0x88EDF8, 0x83FFDD, 0xB8F8B8, 0xF5F8AC, 0xFFFFB0, 0xF8D8F8, 0x000000, 0x000000];
    this.makeTables();
    this.setEmphasis(0);
  },

  loadPALPalette: function(){
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
        r = Math.floor(this.getRed(col) * rFactor);
        g = Math.floor(this.getGreen(col) * gFactor);
        b = Math.floor(this.getBlue(col) * bFactor);
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
  },

  loadDefaultPalette: function(){
    this.curTable[0] = this.getRgb(117, 117, 117);
    this.curTable[1] = this.getRgb(39, 27, 143);
    this.curTable[2] = this.getRgb(0, 0, 171);
    this.curTable[3] = this.getRgb(71, 0, 159);
    this.curTable[4] = this.getRgb(143, 0, 119);
    this.curTable[5] = this.getRgb(171, 0, 19);
    this.curTable[6] = this.getRgb(167, 0, 0);
    this.curTable[7] = this.getRgb(127, 11, 0);
    this.curTable[8] = this.getRgb(67, 47, 0);
    this.curTable[9] = this.getRgb(0, 71, 0);
    this.curTable[10] = this.getRgb(0, 81, 0);
    this.curTable[11] = this.getRgb(0, 63, 23);
    this.curTable[12] = this.getRgb(27, 63, 95);
    this.curTable[13] = this.getRgb(0, 0, 0);
    this.curTable[14] = this.getRgb(0, 0, 0);
    this.curTable[15] = this.getRgb(0, 0, 0);
    this.curTable[16] = this.getRgb(188, 188, 188);
    this.curTable[17] = this.getRgb(0, 115, 239);
    this.curTable[18] = this.getRgb(35, 59, 239);
    this.curTable[19] = this.getRgb(131, 0, 243);
    this.curTable[20] = this.getRgb(191, 0, 191);
    this.curTable[21] = this.getRgb(231, 0, 91);
    this.curTable[22] = this.getRgb(219, 43, 0);
    this.curTable[23] = this.getRgb(203, 79, 15);
    this.curTable[24] = this.getRgb(139, 115, 0);
    this.curTable[25] = this.getRgb(0, 151, 0);
    this.curTable[26] = this.getRgb(0, 171, 0);
    this.curTable[27] = this.getRgb(0, 147, 59);
    this.curTable[28] = this.getRgb(0, 131, 139);
    this.curTable[29] = this.getRgb(0, 0, 0);
    this.curTable[30] = this.getRgb(0, 0, 0);
    this.curTable[31] = this.getRgb(0, 0, 0);
    this.curTable[32] = this.getRgb(255, 255, 255);
    this.curTable[33] = this.getRgb(63, 191, 255);
    this.curTable[34] = this.getRgb(95, 151, 255);
    this.curTable[35] = this.getRgb(167, 139, 253);
    this.curTable[36] = this.getRgb(247, 123, 255);
    this.curTable[37] = this.getRgb(255, 119, 183);
    this.curTable[38] = this.getRgb(255, 119, 99);
    this.curTable[39] = this.getRgb(255, 155, 59);
    this.curTable[40] = this.getRgb(243, 191, 63);
    this.curTable[41] = this.getRgb(131, 211, 19);
    this.curTable[42] = this.getRgb(79, 223, 75);
    this.curTable[43] = this.getRgb(88, 248, 152);
    this.curTable[44] = this.getRgb(0, 235, 219);
    this.curTable[45] = this.getRgb(0, 0, 0);
    this.curTable[46] = this.getRgb(0, 0, 0);
    this.curTable[47] = this.getRgb(0, 0, 0);
    this.curTable[48] = this.getRgb(255, 255, 255);
    this.curTable[49] = this.getRgb(171, 231, 255);
    this.curTable[50] = this.getRgb(199, 215, 255);
    this.curTable[51] = this.getRgb(215, 203, 255);
    this.curTable[52] = this.getRgb(255, 199, 255);
    this.curTable[53] = this.getRgb(255, 199, 219);
    this.curTable[54] = this.getRgb(255, 191, 179);
    this.curTable[55] = this.getRgb(255, 219, 171);
    this.curTable[56] = this.getRgb(255, 231, 163);
    this.curTable[57] = this.getRgb(227, 255, 163);
    this.curTable[58] = this.getRgb(171, 243, 191);
    this.curTable[59] = this.getRgb(179, 255, 207);
    this.curTable[60] = this.getRgb(159, 255, 243);
    this.curTable[61] = this.getRgb(0, 0, 0);
    this.curTable[62] = this.getRgb(0, 0, 0);
    this.curTable[63] = this.getRgb(0, 0, 0);

    this.makeTables();
    this.setEmphasis(0);
  }
};
