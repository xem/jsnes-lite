// CPU
// ===
log = 0;

var CPU = {
  
  // Interrupt types
  IRQ: 0,   // IRQ/BRK
  NMI: 1,   // Non-maskable
  RESET: 2, // Reset

  // Reset the CPU
  reset: () => {
    
    var i;
    
    // CPU memory map (16kb)
    CPU.mem = [];
    for(i = 0; i < 16 * 1024; i++){
      CPU.mem[i] = 0;
    }
    
    OpData.init();
    CPU.opdata = OpData.opdata;
    
    // Cycles to wait until next opcode
    CPU.halt_cycles = 0;
    
    // Interrupts
    CPU.interrupt_requested = false;
    CPU.interrupt_type = null;
  },
  
  // Clock 1 CPU cycle
  // During this time, 3 PPU cycles and 1 APU cycles take place
  tick: () => {
    PPU.tick();
    PPU.tick();
    PPU.tick();
    APU.tick();
  },

  // Emulates a single CPU instruction, returns the number of cycles
  emulate: () => {

    // Check interrupts:
    if(CPU.interrupt_requested){

      switch (CPU.interrupt_type){
        case 0: {
          // Normal IRQ:
          if(I !== 0){
            break;
          }
          console.log(log, "irq")
          //CPU.doIrq(temp);
          myop(3);
          break;
        }
        case 1: {
          // NMI:
          console.log(log, "nmi")
          //CPU.doNonMaskableInterrupt(temp);
          myop(1)
          break;
        }
        case 2: {
          // Reset:
          console.log(log, "reset")
          //CPU.doResetInterrupt();
          myop(2);
          break;
        }
      }

      CPU.interrupt_requested = false;
    }
    
    myop();
    log++;
    
    //console.log(1);
    return top.c;
  },

  load16bit: addr => {
    if(addr < 0x1fff){
      return CPU.mem[addr & 0x7ff] | (CPU.mem[(addr + 1) & 0x7ff] << 8);
    } else {
      return CPU.load(addr) | (CPU.load(addr + 1) << 8);
    }
  },

  requestIrq: type => {
    if(CPU.interrupt_requested){
      if(type === CPU.IRQ){
        return;
      }
      // console.log("too fast irqs. type="+type);
    }
    CPU.interrupt_requested = true;
    CPU.interrupt_type = type;
  },

  /*push: value => {
    CPU.write(CPU.S, value);
    CPU.S--;
    CPU.S = 0x0100 | (CPU.S & 0xff);
  },*/

  /*stackWrap: () => {
    CPU.S = 0x0100 | (CPU.S & 0xff);
  },*/

  /*pull: () => {
    CPU.S++;
    CPU.S = 0x0100 | (CPU.S & 0xff);
    return CPU.load(CPU.S);
  },*/

  pageCrossed: (addr1, addr2) => {
    return (addr1 & 0xff00) !== (addr2 & 0xff00);
  },

  haltCycles: cycles => {
    CPU.halt_cycles += cycles;
  },

  /*doNonMaskableInterrupt: status => {
    if((CPU.load(0x2000) & 128) !== 0){
      // Check whether VBlank Interrupts are enabled

      CPU.PC_NEW++;
      CPU.push((CPU.PC_NEW >> 8) & 0xff);
      CPU.push(CPU.PC_NEW & 0xff);
      CPU.I_NEW = 1;
      CPU.push(status & 239);
      
      //console.log(log, "nmi they push", CPU.Z, status.toString(2).padStart(8,0), (239 & status).toString(2).padStart(8,0))

      CPU.PC_NEW =
        CPU.load(0xfffa) | (CPU.load(0xfffb) << 8);
      CPU.PC_NEW--;
    }
  },

  doResetInterrupt: () => {
    CPU.PC_NEW =
      CPU.load(0xfffc) | (CPU.load(0xfffd) << 8);
    CPU.PC_NEW--;
  },

  doIrq: status => {
    CPU.PC_NEW++;
    CPU.push((CPU.PC_NEW >> 8) & 0xff);
    CPU.push(CPU.PC_NEW & 0xff);
    CPU.push(status);
    CPU.I_NEW = 1;
    CPU.B_NEW = 0;

    CPU.PC_NEW =
      CPU.load(0xfffe) | (CPU.load(0xffff) << 8);
    CPU.PC_NEW--;
  },*/

  /*getStatus: () => {
    //console.log(CPU.C, CPU.Z, CPU.I, CPU.D, CPU.B, CPU.V, CPU.N)
    return (
      CPU.C |
      (CPU.Z << 1) |
      (CPU.I << 2) |
      (CPU.D << 3) |
      (CPU.B << 4) |
      (1 << 5) |
      (CPU.V << 6) |
      (CPU.N << 7)
    );
  },*/
  
  /*getP: () => {
    //console.log(CPU.C, CPU.Z, CPU.I, CPU.D, CPU.B, CPU.V, CPU.N)
    return (
      CPU.C |
      ((CPU.Z ? 0 : 1) << 1) |
      (CPU.I << 2) |
      (CPU.D << 3) |
      (CPU.B << 4) |
      (1 << 5) |
      (CPU.V << 6) |
      (CPU.N << 7)
    );
  },*/

  /*setStatus: st => {
    CPU.C = st & 1;
    CPU.Z = (st >> 1) & 1;
    CPU.I = (st >> 2) & 1;
    CPU.D = (st >> 3) & 1;
    CPU.B = (st >> 4) & 1;

    CPU.V = (st >> 6) & 1;
    CPU.N = (st >> 7) & 1;
  },*/
  
  regWrite: (address, value) => {
    switch (address){
      case 0x2000:
        // PPU Control register 1
        CPU.mem[address] = value;
        PPU.updateControlReg1(value);
        break;

      case 0x2001:
        // PPU Control register 2
        CPU.mem[address] = value;
        PPU.updateControlReg2(value);
        break;

      case 0x2003:
        // Set Sprite RAM address:
        PPU.writeSRAMAddress(value);
        break;

      case 0x2004:
        // Write to Sprite RAM:
        PPU.sramWrite(value);
        break;

      case 0x2005:
        // Screen Scroll offsets:
        PPU.scrollWrite(value);
        break;

      case 0x2006:
        // Set VRAM address:
        PPU.writeVRAMAddress(value);
        break;

      case 0x2007:
        // Write to VRAM:
        PPU.vramWrite(value);
        break;

      case 0x4014:
        // Sprite Memory DMA Access
        PPU.sramDMA(value);
        break;

      case 0x4015:
        // Sound Channel Switch, DMC Status
        APU.writeReg(address, value);
        break;

      case 0x4016:
        // Joystick 1 + Strobe
        if((value & 1) === 0 && (Mapper.joypadLastWrite & 1) === 1){
          Mapper.joy1StrobeState = 0;
          Mapper.joy2StrobeState = 0;
        }
        Mapper.joypadLastWrite = value;
        break;

      case 0x4017:
        // Sound channel frame sequencer:
        APU.writeReg(address, value);
        break;

      default:
        // Sound registers
        // console.log("write to sound reg");
        if(address >= 0x4000 && address <= 0x4017){
          APU.writeReg(address, value);
        }
    }
  },

  regLoad:  address => {
    switch (
      address >> 12 // use fourth nibble (0xF000)
    ){
      case 0:
        break;

      case 1:
        break;

      case 2:
      // Fall through to case 3
      case 3:
        // PPU Registers
        switch (address & 0x7){
          case 0x0:
            // 0x2000:
            // PPU Control Register 1.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return CPU.mem[0x2000];

          case 0x1:
            // 0x2001:
            // PPU Control Register 2.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return CPU.mem[0x2001];

          case 0x2:
            // 0x2002:
            // PPU Status Register.
            // The value is stored in
            // main memory in addition
            // to as flags in the PPU.
            // (not in the real NES)
            return PPU.readStatusRegister();

          case 0x3:
            return 0;

          case 0x4:
            // 0x2004:
            // Sprite Memory read.
            return PPU.sramLoad();
          case 0x5:
            return 0;

          case 0x6:
            return 0;

          case 0x7:
            // 0x2007:
            // VRAM read:
            return top.m[0x2007] = PPU.vramLoad();
        }
        break;
      case 4:
        // Sound+Joypad registers
        switch (address - 0x4015){
          case 0:
            // 0x4015:
            // Sound channel enable, DMC Status
            return APU.readReg(address);

          case 1:
            // 0x4016:
            // Joystick 1 + Strobe
            return joy1Read();

          case 2:
            // 0x4017:
            // Joystick 2 + Strobe
            // https://wiki.nesdev.com/w/index.php/Zapper
            var w;

            if(
              Mapper.zapperX !== null &&
              Mapper.zapperY !== null &&
              PPU.isPixelWhite(Mapper.zapperX, Mapper.zapperY)
            ){
              w = 0;
            } else {
              w = 0x1 << 3;
            }

            if(Mapper.zapperFired){
              w |= 0x1 << 4;
            }
            return (joy2Read() | w) & 0xffff;
        }
        break;
    }
    return 0;
  },

  // Handle 8-bit writes in CPU memory
  write: (address, value) => {
    if(address < 0x2000){
      // Mirroring of RAM:
      CPU.mem[address & 0x7ff] = value;
    } else if(address > 0x4017){
      CPU.mem[address] = value;
      if(address >= 0x6000 && address < 0x8000){
        // Write to persistent RAM
        NES.onBatteryRamWrite(address, value);
      }
    } else if(address > 0x2007 && address < 0x4000){
      CPU.regWrite(0x2000 + (address & 0x7), value);
    } else {
      CPU.regWrite(address, value);
    }
  },

  // Handle 8-bit reads from CPU memory
  load: address => {
    // Wrap around:
    address &= 0xffff;

    // Check address range:
    if(address > 0x4017){
      // ROM:
      return CPU.mem[address];
    } else if(address >= 0x2000){
      // I/O Ports.
      return CPU.regLoad(address);
    } else {
      // RAM (mirrored)
      return CPU.mem[address & 0x7ff];
    }
  }
};

// Generates and provides an array of details about instructions
var OpData = {
  opdata: new Array(256),
  
  init: () => {
    // Set all to invalid instruction (to detect crashes):
    for(var i = 0; i < 256; i++) OpData.opdata[i] = 0xff;

    // Now fill in all valid opcodes:

    // ADC:
    OpData.setOp(OpData.INS_ADC, 0x69, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_ADC, 0x65, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_ADC, 0x75, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_ADC, 0x6d, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_ADC, 0x7d, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_ADC, 0x79, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_ADC, 0x61, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_ADC, 0x71, OpData.ADDR_POSTIDXIND, 2, 5);

    // AND:
    OpData.setOp(OpData.INS_AND, 0x29, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_AND, 0x25, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_AND, 0x35, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_AND, 0x2d, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_AND, 0x3d, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_AND, 0x39, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_AND, 0x21, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_AND, 0x31, OpData.ADDR_POSTIDXIND, 2, 5);

    // ASL:
    OpData.setOp(OpData.INS_ASL, 0x0a, OpData.ADDR_ACC, 1, 2);
    OpData.setOp(OpData.INS_ASL, 0x06, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_ASL, 0x16, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_ASL, 0x0e, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_ASL, 0x1e, OpData.ADDR_ABSX, 3, 7);

    // BCC:
    OpData.setOp(OpData.INS_BCC, 0x90, OpData.ADDR_REL, 2, 2);

    // BCS:
    OpData.setOp(OpData.INS_BCS, 0xb0, OpData.ADDR_REL, 2, 2);

    // BEQ:
    OpData.setOp(OpData.INS_BEQ, 0xf0, OpData.ADDR_REL, 2, 2);

    // BIT:
    OpData.setOp(OpData.INS_BIT, 0x24, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_BIT, 0x2c, OpData.ADDR_ABS, 3, 4);

    // BMI:
    OpData.setOp(OpData.INS_BMI, 0x30, OpData.ADDR_REL, 2, 2);

    // BNE:
    OpData.setOp(OpData.INS_BNE, 0xd0, OpData.ADDR_REL, 2, 2);

    // BPL:
    OpData.setOp(OpData.INS_BPL, 0x10, OpData.ADDR_REL, 2, 2);

    // BRK:
    OpData.setOp(OpData.INS_BRK, 0x00, OpData.ADDR_IMP, 1, 7);

    // BVC:
    OpData.setOp(OpData.INS_BVC, 0x50, OpData.ADDR_REL, 2, 2);

    // BVS:
    OpData.setOp(OpData.INS_BVS, 0x70, OpData.ADDR_REL, 2, 2);

    // CLC:
    OpData.setOp(OpData.INS_CLC, 0x18, OpData.ADDR_IMP, 1, 2);

    // CLD:
    OpData.setOp(OpData.INS_CLD, 0xd8, OpData.ADDR_IMP, 1, 2);

    // CLI:
    OpData.setOp(OpData.INS_CLI, 0x58, OpData.ADDR_IMP, 1, 2);

    // CLV:
    OpData.setOp(OpData.INS_CLV, 0xb8, OpData.ADDR_IMP, 1, 2);

    // CMP:
    OpData.setOp(OpData.INS_CMP, 0xc9, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_CMP, 0xc5, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_CMP, 0xd5, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_CMP, 0xcd, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_CMP, 0xdd, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_CMP, 0xd9, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_CMP, 0xc1, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_CMP, 0xd1, OpData.ADDR_POSTIDXIND, 2, 5);

    // CPX:
    OpData.setOp(OpData.INS_CPX, 0xe0, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_CPX, 0xe4, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_CPX, 0xec, OpData.ADDR_ABS, 3, 4);

    // CPY:
    OpData.setOp(OpData.INS_CPY, 0xc0, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_CPY, 0xc4, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_CPY, 0xcc, OpData.ADDR_ABS, 3, 4);

    // DEC:
    OpData.setOp(OpData.INS_DEC, 0xc6, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_DEC, 0xd6, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_DEC, 0xce, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_DEC, 0xde, OpData.ADDR_ABSX, 3, 7);

    // DEX:
    OpData.setOp(OpData.INS_DEX, 0xca, OpData.ADDR_IMP, 1, 2);

    // DEY:
    OpData.setOp(OpData.INS_DEY, 0x88, OpData.ADDR_IMP, 1, 2);

    // EOR:
    OpData.setOp(OpData.INS_EOR, 0x49, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_EOR, 0x45, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_EOR, 0x55, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_EOR, 0x4d, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_EOR, 0x5d, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_EOR, 0x59, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_EOR, 0x41, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_EOR, 0x51, OpData.ADDR_POSTIDXIND, 2, 5);

    // INC:
    OpData.setOp(OpData.INS_INC, 0xe6, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_INC, 0xf6, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_INC, 0xee, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_INC, 0xfe, OpData.ADDR_ABSX, 3, 7);

    // INX:
    OpData.setOp(OpData.INS_INX, 0xe8, OpData.ADDR_IMP, 1, 2);

    // INY:
    OpData.setOp(OpData.INS_INY, 0xc8, OpData.ADDR_IMP, 1, 2);

    // JMP:
    OpData.setOp(OpData.INS_JMP, 0x4c, OpData.ADDR_ABS, 3, 3);
    OpData.setOp(OpData.INS_JMP, 0x6c, OpData.ADDR_INDABS, 3, 5);

    // JSR:
    OpData.setOp(OpData.INS_JSR, 0x20, OpData.ADDR_ABS, 3, 6);

    // LDA:
    OpData.setOp(OpData.INS_LDA, 0xa9, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_LDA, 0xa5, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_LDA, 0xb5, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_LDA, 0xad, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_LDA, 0xbd, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_LDA, 0xb9, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_LDA, 0xa1, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_LDA, 0xb1, OpData.ADDR_POSTIDXIND, 2, 5);

    // LDX:
    OpData.setOp(OpData.INS_LDX, 0xa2, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_LDX, 0xa6, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_LDX, 0xb6, OpData.ADDR_ZPY, 2, 4);
    OpData.setOp(OpData.INS_LDX, 0xae, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_LDX, 0xbe, OpData.ADDR_ABSY, 3, 4);

    // LDY:
    OpData.setOp(OpData.INS_LDY, 0xa0, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_LDY, 0xa4, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_LDY, 0xb4, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_LDY, 0xac, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_LDY, 0xbc, OpData.ADDR_ABSX, 3, 4);

    // LSR:
    OpData.setOp(OpData.INS_LSR, 0x4a, OpData.ADDR_ACC, 1, 2);
    OpData.setOp(OpData.INS_LSR, 0x46, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_LSR, 0x56, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_LSR, 0x4e, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_LSR, 0x5e, OpData.ADDR_ABSX, 3, 7);

    // NOP:
    OpData.setOp(OpData.INS_NOP, 0x1a, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0x3a, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0x5a, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0x7a, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0xda, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0xea, OpData.ADDR_IMP, 1, 2);
    OpData.setOp(OpData.INS_NOP, 0xfa, OpData.ADDR_IMP, 1, 2);

    // ORA:
    OpData.setOp(OpData.INS_ORA, 0x09, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_ORA, 0x05, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_ORA, 0x15, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_ORA, 0x0d, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_ORA, 0x1d, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_ORA, 0x19, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_ORA, 0x01, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_ORA, 0x11, OpData.ADDR_POSTIDXIND, 2, 5);

    // PHA:
    OpData.setOp(OpData.INS_PHA, 0x48, OpData.ADDR_IMP, 1, 3);

    // PHP:
    OpData.setOp(OpData.INS_PHP, 0x08, OpData.ADDR_IMP, 1, 3);

    // PLA:
    OpData.setOp(OpData.INS_PLA, 0x68, OpData.ADDR_IMP, 1, 3);

    // PLP:
    OpData.setOp(OpData.INS_PLP, 0x28, OpData.ADDR_IMP, 1, 4);

    // ROL:
    OpData.setOp(OpData.INS_ROL, 0x2a, OpData.ADDR_ACC, 1, 2);
    OpData.setOp(OpData.INS_ROL, 0x26, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_ROL, 0x36, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_ROL, 0x2e, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_ROL, 0x3e, OpData.ADDR_ABSX, 3, 7);

    // ROR:
    OpData.setOp(OpData.INS_ROR, 0x6a, OpData.ADDR_ACC, 1, 2);
    OpData.setOp(OpData.INS_ROR, 0x66, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_ROR, 0x76, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_ROR, 0x6e, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_ROR, 0x7e, OpData.ADDR_ABSX, 3, 7);

    // RTI:
    OpData.setOp(OpData.INS_RTI, 0x40, OpData.ADDR_IMP, 1, 6);

    // RTS:
    OpData.setOp(OpData.INS_RTS, 0x60, OpData.ADDR_IMP, 1, 6);

    // SBC:
    OpData.setOp(OpData.INS_SBC, 0xe9, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_SBC, 0xe5, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_SBC, 0xf5, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_SBC, 0xed, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_SBC, 0xfd, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_SBC, 0xf9, OpData.ADDR_ABSY, 3, 4);
    OpData.setOp(OpData.INS_SBC, 0xe1, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_SBC, 0xf1, OpData.ADDR_POSTIDXIND, 2, 5);

    // SEC:
    OpData.setOp(OpData.INS_SEC, 0x38, OpData.ADDR_IMP, 1, 2);

    // SED:
    OpData.setOp(OpData.INS_SED, 0xf8, OpData.ADDR_IMP, 1, 2);

    // SEI:
    OpData.setOp(OpData.INS_SEI, 0x78, OpData.ADDR_IMP, 1, 2);

    // STA:
    OpData.setOp(OpData.INS_STA, 0x85, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_STA, 0x95, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_STA, 0x8d, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_STA, 0x9d, OpData.ADDR_ABSX, 3, 5);
    OpData.setOp(OpData.INS_STA, 0x99, OpData.ADDR_ABSY, 3, 5);
    OpData.setOp(OpData.INS_STA, 0x81, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_STA, 0x91, OpData.ADDR_POSTIDXIND, 2, 6);

    // STX:
    OpData.setOp(OpData.INS_STX, 0x86, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_STX, 0x96, OpData.ADDR_ZPY, 2, 4);
    OpData.setOp(OpData.INS_STX, 0x8e, OpData.ADDR_ABS, 3, 4);

    // STY:
    OpData.setOp(OpData.INS_STY, 0x84, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_STY, 0x94, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_STY, 0x8c, OpData.ADDR_ABS, 3, 4);

    // TAX:
    OpData.setOp(OpData.INS_TAX, 0xaa, OpData.ADDR_IMP, 1, 2);

    // TAY:
    OpData.setOp(OpData.INS_TAY, 0xa8, OpData.ADDR_IMP, 1, 2);

    // TSX:
    OpData.setOp(OpData.INS_TSX, 0xba, OpData.ADDR_IMP, 1, 2);

    // TXA:
    OpData.setOp(OpData.INS_TXA, 0x8a, OpData.ADDR_IMP, 1, 2);

    // TXS:
    OpData.setOp(OpData.INS_TXS, 0x9a, OpData.ADDR_IMP, 1, 2);

    // TYA:
    OpData.setOp(OpData.INS_TYA, 0x98, OpData.ADDR_IMP, 1, 2);

    // ALR:
    OpData.setOp(OpData.INS_ALR, 0x4b, OpData.ADDR_IMM, 2, 2);

    // ANC:
    OpData.setOp(OpData.INS_ANC, 0x0b, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_ANC, 0x2b, OpData.ADDR_IMM, 2, 2);

    // ARR:
    OpData.setOp(OpData.INS_ARR, 0x6b, OpData.ADDR_IMM, 2, 2);

    // AXS:
    OpData.setOp(OpData.INS_AXS, 0xcb, OpData.ADDR_IMM, 2, 2);

    // LAX:
    OpData.setOp(OpData.INS_LAX, 0xa3, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_LAX, 0xa7, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_LAX, 0xaf, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_LAX, 0xb3, OpData.ADDR_POSTIDXIND, 2, 5);
    OpData.setOp(OpData.INS_LAX, 0xb7, OpData.ADDR_ZPY, 2, 4);
    OpData.setOp(OpData.INS_LAX, 0xbf, OpData.ADDR_ABSY, 3, 4);

    // SAX:
    OpData.setOp(OpData.INS_SAX, 0x83, OpData.ADDR_PREIDXIND, 2, 6);
    OpData.setOp(OpData.INS_SAX, 0x87, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_SAX, 0x8f, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_SAX, 0x97, OpData.ADDR_ZPY, 2, 4);

    // DCP:
    OpData.setOp(OpData.INS_DCP, 0xc3, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_DCP, 0xc7, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_DCP, 0xcf, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_DCP, 0xd3, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_DCP, 0xd7, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_DCP, 0xdb, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_DCP, 0xdf, OpData.ADDR_ABSX, 3, 7);

    // ISC:
    OpData.setOp(OpData.INS_ISC, 0xe3, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_ISC, 0xe7, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_ISC, 0xef, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_ISC, 0xf3, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_ISC, 0xf7, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_ISC, 0xfb, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_ISC, 0xff, OpData.ADDR_ABSX, 3, 7);

    // RLA:
    OpData.setOp(OpData.INS_RLA, 0x23, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_RLA, 0x27, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_RLA, 0x2f, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_RLA, 0x33, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_RLA, 0x37, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_RLA, 0x3b, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_RLA, 0x3f, OpData.ADDR_ABSX, 3, 7);

    // RRA:
    OpData.setOp(OpData.INS_RRA, 0x63, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_RRA, 0x67, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_RRA, 0x6f, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_RRA, 0x73, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_RRA, 0x77, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_RRA, 0x7b, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_RRA, 0x7f, OpData.ADDR_ABSX, 3, 7);

    // SLO:
    OpData.setOp(OpData.INS_SLO, 0x03, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_SLO, 0x07, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_SLO, 0x0f, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_SLO, 0x13, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_SLO, 0x17, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_SLO, 0x1b, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_SLO, 0x1f, OpData.ADDR_ABSX, 3, 7);

    // SRE:
    OpData.setOp(OpData.INS_SRE, 0x43, OpData.ADDR_PREIDXIND, 2, 8);
    OpData.setOp(OpData.INS_SRE, 0x47, OpData.ADDR_ZP, 2, 5);
    OpData.setOp(OpData.INS_SRE, 0x4f, OpData.ADDR_ABS, 3, 6);
    OpData.setOp(OpData.INS_SRE, 0x53, OpData.ADDR_POSTIDXIND, 2, 8);
    OpData.setOp(OpData.INS_SRE, 0x57, OpData.ADDR_ZPX, 2, 6);
    OpData.setOp(OpData.INS_SRE, 0x5b, OpData.ADDR_ABSY, 3, 7);
    OpData.setOp(OpData.INS_SRE, 0x5f, OpData.ADDR_ABSX, 3, 7);

    // SKB:
    OpData.setOp(OpData.INS_SKB, 0x80, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_SKB, 0x82, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_SKB, 0x89, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_SKB, 0xc2, OpData.ADDR_IMM, 2, 2);
    OpData.setOp(OpData.INS_SKB, 0xe2, OpData.ADDR_IMM, 2, 2);

    // SKB:
    OpData.setOp(OpData.INS_IGN, 0x0c, OpData.ADDR_ABS, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0x1c, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0x3c, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0x5c, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0x7c, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0xdc, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0xfc, OpData.ADDR_ABSX, 3, 4);
    OpData.setOp(OpData.INS_IGN, 0x04, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_IGN, 0x44, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_IGN, 0x64, OpData.ADDR_ZP, 2, 3);
    OpData.setOp(OpData.INS_IGN, 0x14, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_IGN, 0x34, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_IGN, 0x54, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_IGN, 0x74, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_IGN, 0xd4, OpData.ADDR_ZPX, 2, 4);
    OpData.setOp(OpData.INS_IGN, 0xf4, OpData.ADDR_ZPX, 2, 4);

    // prettier-ignore
    OpData.cycTable = new Array(
      /*0x00*/ 7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6,
      /*0x10*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
      /*0x20*/ 6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6,
      /*0x30*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
      /*0x40*/ 6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6,
      /*0x50*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
      /*0x60*/ 6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6,
      /*0x70*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
      /*0x80*/ 2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4,
      /*0x90*/ 2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5,
      /*0xA0*/ 2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4,
      /*0xB0*/ 2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,
      /*0xC0*/ 2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6,
      /*0xD0*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
      /*0xE0*/ 2,6,3,8,3,3,5,5,2,2,2,2,4,4,6,6,
      /*0xF0*/ 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7
    );

    OpData.instname = new Array(70);

    OpData.addrDesc = new Array();
  },

  INS_ADC: 0,
  INS_AND: 1,
  INS_ASL: 2,

  INS_BCC: 3,
  INS_BCS: 4,
  INS_BEQ: 5,
  INS_BIT: 6,
  INS_BMI: 7,
  INS_BNE: 8,
  INS_BPL: 9,
  INS_BRK: 10,
  INS_BVC: 11,
  INS_BVS: 12,

  INS_CLC: 13,
  INS_CLD: 14,
  INS_CLI: 15,
  INS_CLV: 16,
  INS_CMP: 17,
  INS_CPX: 18,
  INS_CPY: 19,

  INS_DEC: 20,
  INS_DEX: 21,
  INS_DEY: 22,

  INS_EOR: 23,

  INS_INC: 24,
  INS_INX: 25,
  INS_INY: 26,

  INS_JMP: 27,
  INS_JSR: 28,

  INS_LDA: 29,
  INS_LDX: 30,
  INS_LDY: 31,
  INS_LSR: 32,

  INS_NOP: 33,

  INS_ORA: 34,

  INS_PHA: 35,
  INS_PHP: 36,
  INS_PLA: 37,
  INS_PLP: 38,

  INS_ROL: 39,
  INS_ROR: 40,
  INS_RTI: 41,
  INS_RTS: 42,

  INS_SBC: 43,
  INS_SEC: 44,
  INS_SED: 45,
  INS_SEI: 46,
  INS_STA: 47,
  INS_STX: 48,
  INS_STY: 49,

  INS_TAX: 50,
  INS_TAY: 51,
  INS_TSX: 52,
  INS_TXA: 53,
  INS_TXS: 54,
  INS_TYA: 55,

  INS_ALR: 56,
  INS_ANC: 57,
  INS_ARR: 58,
  INS_AXS: 59,
  INS_LAX: 60,
  INS_SAX: 61,
  INS_DCP: 62,
  INS_ISC: 63,
  INS_RLA: 64,
  INS_RRA: 65,
  INS_SLO: 66,
  INS_SRE: 67,
  INS_SKB: 68,
  INS_IGN: 69,

  INS_DUMMY: 70, // dummy instruction used for 'halting' the processor some cycles

  // -------------------------------- //

  // Addressing modes:
  ADDR_ZP: 0,
  ADDR_REL: 1,
  ADDR_IMP: 2,
  ADDR_ABS: 3,
  ADDR_ACC: 4,
  ADDR_IMM: 5,
  ADDR_ZPX: 6,
  ADDR_ZPY: 7,
  ADDR_ABSX: 8,
  ADDR_ABSY: 9,
  ADDR_PREIDXIND: 10,
  ADDR_POSTIDXIND: 11,
  ADDR_INDABS: 12,

  setOp: (inst, op, addr, size, cycles) => {
    OpData.opdata[op] =
      (inst & 0xff) |
      ((addr & 0xff) << 8) |
      ((size & 0xff) << 16) |
      ((cycles & 0xff) << 24);
  },
};
