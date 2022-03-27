// Mappers
// =======

// Only Mappers 0 (NROM) and 30 (UNROM_512) are currently supported!

// Resources:
// - https://problemkaputt.de/everynes.htm#cartridgesandmappers
// - https://wiki.nesdev.com/w/index.php/Mapper
// - https://wiki.nesdev.com/w/index.php/Cartridge_and_mappers%27_history

// --------





// Load ROM's content in memory
NES.load = () => {
  
  console.log(NES.prg, NES.chr, NES.mirroring);
  
  // Mapper 0
  // --------
  // https://wiki.nesdev.com/w/index.php/NROM
  // - 8, 16 or 32KB PRG-ROM (mirrored if less than 32KB)
  // - 0 or 8KB PRG-RAM (only one game uses it: Family Basic)
  // - 0, 4 or 8KB CHR-ROM (mirrored if it's just 4)
  // - 0 or 8KB CHR-RAM (enable it if no CHR-ROM is present. Mapper 0 doesn't really support it, but some homebrew ROMs rely on it)
  // - Horizontal or vertical nametable mirroring
  if(!NES.mapper){
    
    // Load PRG-ROM banks in CPU memory:
    // If there are two banks or more, the first two banks are placed at addresses $8000 and $C000
    // If there's only one bank, it's mirrored at both locations (ex: Donkey Kong, Galaxian)
    copy_array(NES.prg[0], cpu_mem, 0x8000);
    copy_array(NES.prg[NES.prg.length > 1 ? 1 : 0], cpu_mem, 0xC000);

    // Load CHR-ROM pages in PPU memory:
    // If there are two pages or more, the first ones are placed at addresses $0000 and $1000
    // If there's only one page, it's mirrored at both locations
    // But if the game has no CHR-ROM banks, do nothing (CHR-RAM is used instead)
    if(NES.chr.length){
      copy_array(NES.chr[0], PPU_mem, 0x0000);
      copy_array(NES.chr[NES.chr.length > 1 ? 1 : 0], PPU_mem, 0x1000);
    }
  }
  
  // Mapper 30 (incomplete)
  // https://www.nesdev.org/wiki/UNROM_512
  // - 32 x 16KB PRG-ROM (can be swapped, erased and written through code)
  // - 8 x 8KB CHR-RAM (can be swapped through code)
  // - H, V or 1-screen mirroring
  // - Write [MCCPP PPP] in any address between $C000 and $FFFF to set M (1-screen mirroring), CC (CHR-RAM bank swap), PPPPP (low PRG-ROM bank swap: $8000-$BFFF).
  // - High PRG-ROM bank: $C000-$FFFF is fixed to the last bank ($1F).
  // - Erase 4KB of PRG-ROM (code must be in wram): $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:$01, $9555:$80, $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:BANK (BANK = $00-$1F), ADDR:$30 (ADDR = $8000/9000/$A000/$B000). Read ADDR twice until DATA is correct twice.
  // - Write 1B of PRG-ROM (code must be in wram): $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:$01, $9555:$A0, $C000:BANK, ADDR:DATA (DATA = $00-$FF). Read ADDR twice until DATA is correct twice.
  // - Routines not implemented: chip-erase, Software ID entry and Software ID exit.
  else if(NES.mapper == 30){
    
    // Initialize the 8 4KB CHR-RAM banks (empty on boot)
    NES.chr = [[], [], [], [], [], [], [], []];
    
    // Load PRG-ROM banks: 0 and "-1" (the last one)
    copy_array(NES.prg[0], cpu_mem, 0x8000);
    copy_array(NES.prg[NES.prg.length - 1], cpu_mem, 0xC000);
    
  }
},

// Copy the values of an array into a specific position in another array
copy_array = (src, dest, address) => {
  for(var i = 0; i < src.length; i++){
    dest[address + i] = src[i];
  }
}