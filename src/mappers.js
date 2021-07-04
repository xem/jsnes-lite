// Mappers
// =======

// Resources:
// - https://problemkaputt.de/everynes.htm#cartridgesandmappers
// - https://wiki.nesdev.com/w/index.php/Mapper
// - https://wiki.nesdev.com/w/index.php/Cartridge_and_mappers%27_history

// Mapper 0
// --------

// Only Mapper 0 (NROM) is handled for now:
// https://wiki.nesdev.com/w/index.php/NROM

// - 8, 16 or 32KB PRG-ROM (mirrored if less than 32KB)
// - 0 or 8KB PRG-RAM (only one game uses it: Family Basic)
// - 0, 4 or 8KB CHR-ROM (mirrored if it's just 4)
// - 0 or 8KB CHR-RAM (enable it if no CHR-ROM is present. Mapper 0 doesn't really support it, but some homebrew ROMs rely on it)
// - Horizontal or vertical nametable mirroring

var 

// Load ROM's content in memory
load_rom = () => {
  
  // Load PRG-ROM banks in CPU memory:
  // If there are two banks or more, the first two banks are placed at addresses $8000 and $C000
  // If there's only one bank, it's mirrored at both locations (ex: Donkey Kong, Galaxian)
  copy_array(prg_rom[0], cpu_mem, 0x8000);
  copy_array(prg_rom[prg_rom.length > 1 ? 1 : 0], cpu_mem, 0xC000);

  // Load CHR-ROM pages in PPU memory:
  // If there are two pages or more, the first ones are placed at addresses $0000 and $1000
  // If there's only one page, it's mirrored at both locations
  // But if the game has no CHR-ROM banks, do nothing (CHR-RAM is used instead)
  if(chr_rom.length > 0){
    copy_array(chr_rom[0], PPU_mem, 0x0000);
    copy_array(chr_rom[chr_rom.length > 1 ? 1 : 0], PPU_mem, 0x1000);
  }
},

// Copy the values of an array into a specific position in another array
copy_array = (src, dest, address) => {
  for(var i = 0; i < src.length; i++){
    dest[address + i] = src[i];
  }
}