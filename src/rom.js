// ROM loader
// ==========

// This file exposes one function: parse_rom(data)
// It parses a ROM file (iNES 1.0) and sets up the ROM banks and various emulator options.

// iNes ROM file header (16 bytes):

// +------+-----------------------------------------------------------------------------------------+
// | Byte | Use                                                                                     |
// +------+-----------------------------------------------------------------------------------------+
// | 0-3  | $4E $45 $53 $1A (ASCII chars "NES<EOF>")                                                |
// +------+-----------------------------------------------------------------------------------------+
// | 4    | Number of 16KB PRG-ROM banks                                                            |
// | 5    | Number of 8KB CHR-ROM banks (if 0 => use 1 CHR-RAM bank)                                |
// +------+-----------------------------------------------------------------------------------------+
// | 6    | - bit 0: Nametable mirroring (0 => horizontal / 1 => vertical)                          |
// |      | - bit 1: Cartridge contains battery-backed PRG-RAM (CPU $6000-$7FFF)                    |
// |      | - bit 2: Cartridge contains a 512B trainer (CPU $7000-$71FF)                            |
// |      | - bit 3: Ignore mirroring in bit 0, use 4-screen nametable instead                      |
// |      | - bits 4-7: Bits 0-3 of mapper number                                                   |
// +------+-----------------------------------------------------------------------------------------+
// | 7    | - bit 0: Vs. arcade system                                                              |
// |      | - bit 1: extra 8KB ROM bank for arcade systems                                          |
// |      | - bits 2-3: If bit 3 = 1 and bit 2 = 0: iNES 2.0. Else: iNES 1.0. (Unreliable)          |
// |      | - bits 4-7: Bits 4-7 of mapper number                                                   |
// +------+-----------------------------------------------------------------------------------------+
// | 8    | - iNES 1.0: Number of 8KB PRG-RAM banks (if 0 => add 1 bank for better compatibility)   |
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
// - CHR-ROM banks (8192 * y bytes, a bank contains two 4KB pages)
// - Extra ROM banks, if present (arcade games only)

// Banks not present in the ROM file:
// ----------------------------------
// - PRG-RAM banks (save slot) - emulators usually use a save file to simulate this
// - CHR-RAM banks (same as CHR-ROM, readable & writeable) - this is filled directly by the CPU

// How to detect the iNES format version (ignored here):
// -----------------------------------------------------
// - If (byte 7 AND $0C) == $08, and the size encoded in bytes 4, 5 and 9 does not exceed the file size, then iNES 2.0
// - Else if (byte 7 AND $0C) == $00, and bytes 12-15 are 0, then iNES 1.0
// - Else, archaic iNES format

// How to detect the TV system (when it's absent or wrong in the header):
// ----------------------------------------------------------------------
// - The ROM banks' checksums can be searched in a NES games database like NesCartDB (http://bootgod.dyndns.org:7777)
// - The filename can contain "(E)", "(EUR)" or "(Europe)" for PAL / "(U)", "(USA)", "(J)" or "(Japan)" for NTSC / "(EU)" or "(World)" for both
// - You can also fallback to NTSC if you don't know (if the game is PAL, it will still work, but it'll run 20% faster)

var
mapper,
mirroring,
prg_rom,
chr_rom,
offset,

// Load a ROM file:
parse_rom = (data, i, j) => {
  
  // Ensure file starts with chars "NES\x1a"
  if(data.includes("NES")){
  
    // Read useful information from the rom header:
    
    // Check if the game adds 2 extra KB to the PPU's VRAM to have a 4-screen nametable (byte 6, bit 3)
    // Otherwise, read mirroring layout (byte 6, bit 0)
    // 0 => vertical mirroring (bit 0 on: the game can scroll horizontally)
    // 1 => horizontal mirroring (bit 0 off: the game can scroll vertically)
    // 2 => 4-screen nametable (bit 4 on: the game can scroll horizontally and vertically)
    mirroring = (data.charCodeAt(6) & 0b00001000) ? 2 : (data.charCodeAt(6) & 0b0000001) ? 0 : 1;
    
    // Check if the game has at least one battery-backed PRG-RAM bank (byte 6, bit 1)
    // This is a persistent save slot that can be used to save the player's progress in a game
    // If present, it can be accessed by the CPU at the addresses $6000-$7FFF (ignored for now)
    // batteryRam = (data.charCodeAt(6) & 0b0000010);
    
    // Mapper number (byte 6, bits 4-7 >> 4 + byte 7, bits 4-7)
    // iNes 2.0 ROMs contain more mapper bits on byte 8
    mapper = (data.charCodeAt(6) >> 4) + (data.charCodeAt(7) & 0b11110000);
    
    // Skip header
    offset = 16;
    
    // Skip 512b trainer, if it's present (byte 6, bit 2)
    // This ROM bank is only used by special hardware or rom hacks, so it can be ignored
    // (if present, it's usually mapped to the memory addresses $7000-$71FF)
    if(data.charCodeAt(6) & 0b00000100) offset += 512;
    
    // Load the PRG-ROM banks containing the game's code
    // The number of 16KB PRG-ROM banks is stored on byte 4 of the header
    prg_rom = [];
    for(i = 0; i < data.charCodeAt(4); i++){
      prg_rom[i] = [];
      for(j = 0; j < 16 * 1024; j++){
        prg_rom[i][j] = data.charCodeAt(offset++) & 0xff;
      }
    }
    
    // Load the CHR-ROM pages
    // The number of pairs of 4KB CHR-ROM pages is stored on byte 5 of the header
    // Each bank contains 256 8*8px, 4-color bitmap tiles
    chr_rom = [];
    for(i = 0; i < data.charCodeAt(5) * 2; i++){
      chr_rom[i] = [];
      for(j = 0; j < 4 * 1024; j++){
        chr_rom[i][j] = data.charCodeAt(offset++) & 0xff;
      }
    }
  }
}