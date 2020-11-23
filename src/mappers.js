// Mapper
// ======

// Resources:
// - https://problemkaputt.de/everynes.htm#cartridgesandmappers
// - https://wiki.nesdev.com/w/index.php/Mapper
// - https://wiki.nesdev.com/w/index.php/Cartridge_and_mappers%27_history

// Mapper 0
// --------

// Only Mapper 0 (NROM) is handled for now:
// https://wiki.nesdev.com/w/index.php/NROM

// - 8, 16 or 32Kib PRG-ROM (mirrored if less than 32Kib)
// - 0 or 8Kib PRG-RAM (only one game uses it: Family Basic)
// - 0, 4 or 8Kib CHR-ROM (mirrored if it's just 4)
// - 0 or 8Kib CHR-RAM (enable it if no CHR-ROM is present. Mapper 0 doesn't really support it, but some homebrew ROMs rely on it)
// - Horizontal or vertical nametable mirroring

var Mapper = {
  
  // Load ROM's content in memory
  load_rom: () => {
    Mapper.load_prg_rom();
    Mapper.load_chr_rom();
  },
  
  // Load PRG-ROM banks in CPU memory
  load_prg_rom: () => {
    
    // If there are two banks or more, the first two banks are placed at addresses $8000 and $C000
    if(ROM.prg_rom_count > 1){
      Mapper.load_prg_rom_bank(0, 0x8000);
      Mapper.load_prg_rom_bank(1, 0xC000);
    }

    else {
      // If there's only one bank, it's mirrored at both locations (ex: Donkey Kong, Galaxian)
      Mapper.load_prg_rom_bank(0, 0x8000);
      Mapper.load_prg_rom_bank(0, 0xC000);
    }
  },

  // Load CHR-ROM pages in PPU memory
  load_chr_rom: () => {
    
    // If there are two pages or more, the first ones are placed at addresses $0000 and $1000
    if(ROM.chr_rom_count > 1){
      Mapper.load_chr_rom_bank(0, 0x0000);
      Mapper.load_chr_rom_bank(1, 0x1000);
    }
    
    // If there's only one page, it's mirrored at both locations
    // If the game has no CHR-ROM banks, do nothing (CHR-RAM is used instead)
    else if(ROM.chr_rom_count > 0){
      Mapper.load_chr_rom_bank(0, 0x0000);
      Mapper.load_chr_rom_bank(0, 0x1000);
    }
  },
  
  // Load a PRG-ROM bank in CPU memory
  load_prg_rom_bank: (bank, address) => {
    //bank %= ROM.prg_rom_count; // why JSNES does it?
    Mapper.copy_array(ROM.prg_rom[bank], CPU.mem, address);
  },

  // Load a CHR-ROM page in PPU memory + the corresponding tiles
  load_chr_rom_bank: (bank, address) => {
    // bank %= ROM.chr_rom_count // why JSNES does it?
    if(ROM.chr_rom_count > 0){
      PPU.triggerRendering();
      Mapper.copy_array(ROM.chr_rom[bank], PPU.mem, address);
      Mapper.copy_array(ROM.chr_rom_tiles[bank], PPU.ptTile, address / 16);
    }
  },
  
  // Copy the values of an array into a specific position in another array
  copy_array: (src, dest, address) => {
    for(var i = 0; i < src.length; i++){
      dest[address + i] = src[i];
    }
  },
};