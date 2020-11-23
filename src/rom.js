// ROM manager
// ===========

// This file exposes one function: ROM.load_rom(data)
// It parses a ROM file (iNES 1.0 or 2.0) and sets up the ROM banks, tilesets and various emulator options.

// iNes ROM file header (15 bytes):

// +------+-----------------------------------------------------------------------------------------+
// | Byte | Use                                                                                     |
// +------+-----------------------------------------------------------------------------------------+
// | 0-3  | $4E $45 $53 $1A (ASCII chars "NES<EOF>")                                                |
// +------+-----------------------------------------------------------------------------------------+
// | 4    | Number of 16KiB PRG-ROM banks                                                           |
// | 5    | Number of 8KiB CHR-ROM banks (if 0 => use 1 CHR-RAM bank)                               |
// +------+-----------------------------------------------------------------------------------------+
// | 6    | - bit 0: Nametable mirroring (0 => horizontal / 1 => vertical)                          |
// |      | - bit 1: Cartridge contains battery-backed PRG-RAM (CPU $6000-$7FFF)                    |
// |      | - bit 2: Cartridge contains a 512B trainer (CPU $7000-$71FF)                            |
// |      | - bit 3: Ignore mirroring in bit 0, use 4-screen nametable instead                      |
// |      | - bits 4-7: Bits 0-3 of mapper number                                                   |
// +------+-----------------------------------------------------------------------------------------+
// | 7    | - bit 0: Vs. arcade system                                                              |
// |      | - bit 1: extra 8kib ROM bank for arcade systems                                         |
// |      | - bits 2-3: If bit 3 = 1 and bit 2 = 0: iNES 2.0. Else: iNES 1.0. (Unreliable)          |
// |      | - bits 4-7: Bits 4-7 of mapper number                                                   |
// +------+-----------------------------------------------------------------------------------------+
// | 8    | - iNES 1.0: Number of 8KiB PRG-RAM banks (if 0 => add 1 bank for better compatibility)  |
// |      | - iNES 2.0: Submapper (bits 0-4), bits 8-11 of mapper number (bits 5-8)                 |
// +------+-----------------------------------------------------------------------------------------+
// | 9    | - iNES 1.0: TV system (0: NTSC / 1: PAL). (Unreliable)                                  |
// |      | - iNES 2.0: bits 8-11 of CHR-ROM size (bits 0-3), bits 8-11 of PRG-ROM size (bits 4-7)  |
// +------+-----------------------------------------------------------------------------------------+
// | 10   | iNES 2.0: PRG-RAM NOT battery-backed (bits 0-3) and battery-backed (bits 4-7)           |
// | 11   | iNES 2.0: CHR-RAM NOT battery-backed (bits 0-3) and battery-backed (bits 4-7)           |
// |      | (values follow a logarithmic scale. 0: 0 byte / 1-14: 128 * 2^N bytes / 15: reserved)   |
// +------+-----------------------------------------------------------------------------------------+
// | 12   | iNES 2.0: Bit 0: NTSC / PAL Bit 1: both. (Unreliable)                                   |
// +------+-----------------------------------------------------------------------------------------+
// | 13   | iNES 2.0: Vs. arcade system configuration: PPU mode (bits 0-4), Vs. mode (bits 4-7)     |
// +------+-----------------------------------------------------------------------------------------+
// | 14   | iNES 2.0: amount of extra ROM banks (bits 0-1)                                          |
// +------+-----------------------------------------------------------------------------------------+
// | 15   | $00 (Reserved)                                                                          |
// +------+-----------------------------------------------------------------------------------------+

// ROM file contents, after the header:
// ------------------------------------
// - Trainer, if present (0 or 512 bytes)
// - PRG-ROM banks (16384 * x bytes)
// - CHR-ROM banks (8192 * y bytes, a bank contains two 4KiB pages)
// - Extra ROM banks, if present (arcade games only)

// Banks not present in the ROM file:
// ----------------------------------
// - PRG-RAM banks (save slot) - emulators usually use a save file to simulate this
// - CHR-RAM banks (same as CHR-ROM, readable & writeable) - this is filled directly by the CPU

// How to detect the iNES format version:
// --------------------------------------
// - If (byte 7 AND $0C) == $08, and the size encoded in bytes 4, 5 and 9 does not exceed the file size, then iNES 2.0
// - Else if (byte 7 AND $0C) == $00, and bytes 12-15 are 0, then iNES 1.0
// - Else, archaic iNES format

// How to detect the TV system (when it's absent or wrong in the header):
// ----------------------------------------------------------------------
// - The ROM banks' checksums can be searched in a NES games database like NesCartDB (http://bootgod.dyndns.org:7777)
// - The filename can contain "(E)", "(EUR)" or "(Europe)" for PAL / "(U)", "(USA)", "(J)" or "(Japan)" for NTSC / "(EU)" or "(World)" for both
// - You can also fallback to NTSC if you don't know (if the game is PAL, it will still work, but it'll run 20% faster)

var ROM = {
  header: [],
  mapper: 0,
  mirroring: 0,
  trainer: 0,
  prg_rom_count: 0,
  prg_rom: [],
  chr_rom_count: 0,
  chr_rom: [[],[]],
  chr_rom_tiles: [[],[]],

  // Load a ROM file:
  load_rom: data => {
    
    var i, j, k, l;
    
    // Ensure file starts with chars "NES\x1a"
    if(!data.indexOf("NES\x1a")){
    
      // Parse ROM header (first 16 bytes)
      for(i = 0; i < 16; i++){
        ROM.header[i] = data.charCodeAt(i) & 0xff;
      }
      
      // Read number of 16Kib PRG-ROM banks (byte 4)
      // The game's program is stored here
      ROM.prg_rom_count = ROM.header[4];
      
      // Read number of 8Kib CHR-ROM banks (byte 5)
      // The game's graphics are stored here in the form of 8*8px, 4-color bitmaps
      ROM.chr_rom_count = ROM.header[5] * 2;
      
      // Check if the game adds 2 extra Kib to the PPU's VRAM (byte 6, bit 4)
      // Otherwise, read mirroring layout (byte 6, bit 0)
      // 0 => vertical mirroring (bit 0 on: the game can scroll horizontally)
      // 1 => horizontal mirroring (bit 0 off: the game can scroll vertically)
      // 2 => 4-screen nametable (bit 4 on: the game can scroll horizontally and vertically)
      ROM.mirroring = (ROM.header[6] & 0b00001000) ? 2 : (ROM.header[6] & 0b0000001) ? 0 : 1;

      PPU.setMirroring(ROM.mirroring);
      
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