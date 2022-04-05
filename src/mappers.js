// Mappers
// =======

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
  // - 2 x 16KB PRG-ROM banks (mirrored if less than 32KB)
  // - 1 x 8KB CHR-ROM  bank (mirrored if less than 8KB) or 1 x 8KB CHR-RAM bank
  // - Horizontal or vertical nametable mirroring (fixed)
  if(!NES.mapper){
    
    // Set PRG-ROM banks: 0 and the last one (fixed):
    NES.prg_0_bank = 0;
    NES.prg_1_bank = NES.prg.length - 1;

    // Set CHR-ROM/RAM bank: 0 (fixed)
    NES.chr_bank = 0;
  }
  
  // Mapper 2
  // --------
  // https://wiki.nesdev.com/w/index.php/NROM
  // - 8 or 16 x 16KB PRG-ROM banks
  // - 1 x 8KB CHR-ROM bank
  // - Horizontal or vertical nametable mirroring (fixed)
  else if(NES.mapper == 2){
    
    // Set PRG-ROM banks: 0 (swappable) and the last one (fixed)
    NES.prg_0_bank = 0;
    NES.prg_1_bank = NES.prg.length - 1;
    
    // Set CHR-RAM bank: 0 (fixed)
    NES.chr_bank = 0;
  }
  
  // Mapper 30 (incomplete)
  // ----------------------
  // https://www.nesdev.org/wiki/UNROM_512
  // - 16 or 32 x 16KB PRG-ROM banks
  // - 4 x 8KB CHR-RAM banks
  // - Horizontal / vertical mirroring (fixed) or 1-screen mirroring (programmable)
  else if(NES.mapper == 30){
    
    // Initialize the 4 x 8KB CHR-RAM banks (empty on boot)
    NES.chr = [[], [], [], []];
    
    // Set PRG-ROM banks: 0 (swappable) and the last one (fixed)
    NES.prg_0_bank = 0;
    NES.prg_1_bank = NES.prg.length - 1;
    
    // Set CHR-RAM bank (fixed):
    NES.chr_bank = 0;
    
    // Backup mirroring
    NES.mirroring_backup = NES.mirroring;
  }
  else {
    alert("unknown mapper: " + NES.mapper);
  }
},

// Some mappers do special things when some addresses are written in CPU memory. This is handled here:
mapper_write = (address, value) => {
  
  // Mapper 0:
  // ---------
  // nothing
  
  // Mapper 2:
  // ---------
  // - Write [MCCP PPPP] in any address between $C000 and $FFFF to set M (1-screen mirroring), CC (CHR-RAM bank swap), PPPPP (low PRG-ROM bank swap: $8000-$BFFF).
  // - TODO: Erase 4KB of PRG-ROM (code must be in wram): $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:$01, $9555:$80, $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:BANK (BANK = $00-$1F), ADDR:$30 (ADDR = $8000/9000/$A000/$B000). Read ADDR twice until DATA is correct twice.
  // - TODO: Write 1B of PRG-ROM (code must be in wram): $C000:$01, $9555:$AA, $C000:$00, $AAAA:$55, $C000:$01, $9555:$A0, $C000:BANK, ADDR:DATA (DATA = $00-$FF). Read ADDR twice until DATA is correct twice.
  // - Other routines (ignored here): chip-erase, Software ID entry and Software ID exit.
  if(NES.mapper == 30){
    if(address >= 0xC000){
      NES.prg_0_bank = value & 0x11111;
      NES.chr_bank = (value >> 5) & 0b11;
      NES.mirroring = (value >> 7) ? 3 : NES.mirroring_backup;
    }
  }
  
  // Mapper 30:
  // ----------
  // - Write [xxxx PPPP] in any address between $8000 and $FFFF to set PPPP (low PRG-ROM bank swap: $8000-$BFFF).
  if(NES.mapper == 2){
    if(address >= 0x8000){
      NES.prg_0_bank = value & 0x1111;
    }
  }
}