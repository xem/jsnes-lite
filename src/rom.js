// ROM
// ====

// Load a ROM file
// data: ROM file read as binary string
NES.loadROM = data => { 
  ROM.loadROM(data);
  Mapper.loadROM();
};

// ROM contents and properties
var ROM = {
  header: [],
  mapper: 0,
  mirroring: 0,
  trainer: 0,
  prg_rom_count: 0,
  prg_rom: [],
  chr_rom_count: 0,
  chr_rom: [],
  chr_rom_tiles: [],


  // Load a ROM file (iNES format):
  // - Header (16 bytes)
  // - Trainer, if present (0 or 512 bytes)
  // - PRG-ROM data (16384 * x bytes)
  // - CHR-ROM data (8192 * y bytes)
  // - Extra ROM banks, if present (arcade games only)
  loadROM: data => {
    
    var i, j, k, l;
    
    // Ensure file starts with chars "NES\x1a"
    if(!data.indexOf("NES\x1a")){
    
      // Parse ROM header (first 16 bytes)
      for(i = 0; i < 16; i++){
        ROM.header[i] = data.charCodeAt(i) & 0xff;
      }
      
      // Read number of 16kb PRG-ROM banks (byte 4)
      // The game's program is stored here
      ROM.prg_rom_count = ROM.header[4];
      
      // Read number of 8kb CHR-ROM banks (byte 5)
      // The game's graphics are stored here in the form of 8*8px, 4-color bitmaps
      ROM.chr_rom_count = ROM.header[5] * 2; // count 4kb pages instead of 8kb banks
      
      // Check if the game adds 2 extra kb to the PPU's VRAM (byte 6, bit 4)
      // Otherwise, read mirroring layout (byte 6, bit 0)
      // 0 => horizontal mirroring (bit 0 on: the game can scroll vertically)
      // 1 => vertical mirroring (bit 0 off: the game can scroll horizontally)
      // 2 => 4-screen nametable (bit 4 on: the game can scroll horizontally and vertically)
      ROM.mirroring = (ROM.header[6] & 0b00001000) ? 2 : (ROM.header[6] & 0b0000001) ? 0 : 1;
      NES.ppu.setMirroring(ROM.mirroring);
      
      // Check if the game has at least one battery-backed PRG-RAM bank (byte 6, bit 2)
      // This is a persistent save slot that can be used to save the player's progress in a game
      // If present, it can be accessed by the CPU at the addresses $6000-$7FFF
      ROM.batteryRam = (ROM.header[6] & 0b0000010);
      
      // Check if the game contains a 512b trainer (byte 6, bit 3)
      // This bank contains subroutines executed by some Mapper.s
      // If present, it can be accessed by the CPU at the addresses $7000-$71FF
      ROM.trainer = (ROM.header[6] & 0b00000100);
      
      // Mapper number (byte 6, bits 5-8 >> 4 + byte 7, bits 5-8)
      // iNes 2.0 ROMs contain more mapper bits on byte 8
      // (Mapper number is ignored for now as we only support Mapper 0)
      ROM.mapper = (ROM.header[6] >> 4) + (ROM.header[7] & 0b11110000);
      
      // Skip header
      var offset = 16;
      
      // Skip trainer, if it's present
      if(ROM.trainer) offset += 512;
      
      // Load the PRG-ROM banks
      for(i = 0; i < ROM.prg_rom_count; i++){
        ROM.prg_rom[i] = [];
        for(j = 0; j < 16 * 1024; j++){
          ROM.prg_rom[i][j] = data.charCodeAt(offset++) & 0xff;
        }
      }
      
      // Load the CHR-ROM pages and make 256 tiles from each of them
      var byte1;
      var byte2;
      var color;
      
      for(i = 0; i < ROM.chr_rom_count; i++){
        ROM.chr_rom[i] = [];
        ROM.chr_rom_tiles[i] = [];
        for(j = 0; j < 4 * 1024; j++){
          ROM.chr_rom[i][j] = data.charCodeAt(offset++) & 0xff;
        }

        for(j = 0; j < 256; j++){
          ROM.chr_rom_tiles[i][j] = { pixels: [] };
          Tile.decode(ROM.chr_rom_tiles[i][j], ROM.chr_rom[i], j);
        }
      }
    }
  }
}