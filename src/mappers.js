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
  
  // Mapper 0
  // --------
  // https://wiki.nesdev.com/w/index.php/NROM
  // - 8, 16 or 32KB PRG-ROM (mirrored if less than 32KB)
  // - 0 or 8KB PRG-RAM (only one game uses it: Family Basic)
  // - 0, 4 or 8KB CHR-ROM (mirrored if it's just 4)
  // - 0 or 8KB CHR-RAM (enable it if no CHR-ROM is present. Mapper 0 doesn't really support it, but some homebrew ROMs rely on it)
  // - Horizontal or vertical nametable mirroring
  if(!NES.mapper){
    
    // Set PRG-ROM banks:
    // If there are two banks, they are placed at addresses $8000 and $C000
    // If there's only one bank, it's mirrored at both locations (ex: Donkey Kong, Galaxian)
    NES.prg_0_bank = 0;
    NES.prg_1_bank = NES.prg.length - 1;

    // Set CHR-ROM/RAM bank: 0
    // If there are many banks, the first one is placed at address $0000
    // If the game has no banks, do nothing (it means a CHR-RAM bank is present, and this bank is empty on load)
    NES.chr_bank = 0;
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
    
    // Initialize the 4 8KB CHR-RAM banks (empty on boot)
    NES.chr = [[], [], [], []];
    
    // Set PRG-ROM banks: 0 and the last one
    NES.prg_0_bank = 0;
    NES.prg_1_bank = NES.prg.length.length - 1;
    
    // Set CHR-RAM bank: 0
    NES.chr_bank = 0;
  }
},

// Some mappers do special things when some addresses are written in CPU memory. This is handled here:
mapper_write = (address, value) => {
  
  // Mapper 0: nothing
  
  // Mapper 30
  if(NES.mapper == 30){
    if(address >= 0xC000){
      
    }
  }
}