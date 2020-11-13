// CPU
// ===
log = 0;
ko = 0;
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

    // CPU Registers
    CPU.A = 0;            // Accumulator
    CPU.X = 0;            // Address index X
    CPU.Y = 0;            // Address index Y
    CPU.S = 0x01fd;       // Stack pointer
    CPU.PC = 0x8000 - 1;  // Program counter

    // 8 bit flags form the Status Register (P)
    // P is set to $34 (00110100) when booting the console
    // Bit 3 is set to 1 when resetting the console
    
    //CPU.P = 0x0010100;
    
    CPU.C = 0;  // Bit 0: Carry
    CPU.Z = 1;  // Bit 1: Zero
    CPU.I = 1;  // Bit 2: Interrupt disable
    CPU.D = 0;  // Bit 3: Decimal
    CPU.B = 1;  // Bit 4: B flag (PHP/BRK set it to 1, IRQ/NMI set it to 0)
                // Bit 5 is always 1 
    CPU.V = 0;  // Bit 6: Overflow
    CPU.N = 0;  // Bit 7: Negative
    
    // TMP
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
    var temp;
    var add;

    // Check interrupts:
    if(CPU.interrupt_requested){
      temp =
        CPU.C |
        ((CPU.Z === 0 ? 1 : 0) << 1) |
        (CPU.I << 2) |
        (CPU.D << 3) |
        (CPU.B << 4) |
        (1 << 5) |
        (CPU.V << 6) |
        (CPU.N << 7);

      CPU.PC_NEW = CPU.PC;
      CPU.I_NEW = CPU.I;
      switch (CPU.interrupt_type){
        case 0: {
          // Normal IRQ:
          if(CPU.I !== 0){
            // console.log("Interrupt was masked.");
            break;
          }
          //console.log(log,"irq");
          //CPU.doIrq(temp);
          myop(3);
          // console.log("Did normal IRQ. I="+CPU.I);
          break;
        }
        case 1: {
          // NMI:
          //console.log(log,"nmi");
          //CPU.doNonMaskableInterrupt(temp);
          myop(1);
          break;
        }
        case 2: {
          // Reset:
          //console.log(log,"reset");
          //CPU.doResetInterrupt();
          myop(2);
          break;
        }
      }

      CPU.PC = CPU.PC_NEW;
      CPU.I = CPU.I_NEW;
      //CPU.B = CPU.B_NEW;
      //console.log(CPU.B, CPU.getP().toString(2));
      CPU.interrupt_requested = false;
    }

    var op = CPU.load(CPU.PC + 1);
    
    // Separate opcode in 3 parts (aaa-bbb-cc)
    /*var a = op >> 5;
    var b = op >> 2 & 0b111;
    var c = op & 0b11;
    if([0x80,0x02,0x22,0x42,0x62,0x82,0xC2,0xE2,0x04,0x44,0x64,0x89,0x0C,0x14,0x34,0x54,0x74,0xD4,0xF4,0x1A,0x3A,0x5A,0x7A,0xDA,0xFA,0x1C,0x3C,0x5C,0x7C,0x9C,0xDC,0xFC,0x9E,0x12,0x32,0x52,0x72,0x92,0xB2,0xD2,0xF2].includes(op) || c==3){
      console.log(op.toString(16));
      CPU.stop();
    }
    
    var opinf = CPU.opdata[op];
    var cycleCount = opinf >> 24;
    var cycleAdd = 0;

    // Find address mode:
    // Addressing mode based on c and b
    var addrMode = [
      
      // c == 0
      [
        a > 4 ? "#" : a == 1 && "a", // b == 0
        "z", // b == 1
        , // b == 2
        a == 3 ? "in" : "a", // b == 3
        "r", // b == 4
        "zX", // b == 5
        , // b == 6
        "aX", // b == 7
      ],
      
      // c == 1
      [
        "iX", // b == 0
        "z", // b == 1
        "#", // b == 2
        "a", // b == 3
        "iY", // b == 4
        "zX", // b == 5
        "aY", // b == 6
        "aX", // b == 7
      ],
      
      // c == 2
      [
        "#", // b == 0
        "z", // b == 1
        a < 4 && "A", // b == 2
        "a", // b == 3
        , // b == 4
        a >> 1 == 0b10 ? "zY" : "zX", // b == 5
        , // b == 6
        a == 5 ? "aY" : "aX", // b == 7
      ],
      
      // c == 3
      //[],
    
    ][c][b] || "im";
    
    admnames = ["z", "r", "im", "a", "A",  "#", "zX", "zY", "aX", "aY", "iX", "iY", "in"];
    /*if(addrMode != admnames[(opinf >> 8) & 0xff]){
      console.log(op, addrMode, admnames[(opinf >> 8) & 0xff]);
      CPU.stop()
    }*/
    //addrMode = admnames[(opinf >> 8) & 0xff];
    
    //console.log(op, addrMode);

    // Increment PC by number of op bytes:
    /*var opaddr = CPU.PC;
    CPU.PC += (opinf >> 16) & 0xff;

    var addr = 0;
    switch (addrMode){
      case "z": {
        // Zero Page mode. Use the address given after the opcode,
        // but without high byte.
        addr = CPU.load(opaddr + 2);
        break;
      }
      case "r": {
        // Relative mode.
        addr = CPU.load(opaddr + 2);
        if(addr < 0x80){
          addr += CPU.PC;
        } else {
          addr += CPU.PC - 256;
        }
        break;
      }
      case "im": {
        // Ignore. Address is implied in instruction.
        break;
      }
      case "a": {
        // Absolute mode. Use the two bytes following the opcode as
        // an address.
        addr = CPU.load16bit(opaddr + 2);
        break;
      }
      case "A": {
        // Accumulator mode. The address is in the accumulator
        // register.
        addr = CPU.A;
        break;
      }
      case "#": {
        // Immediate mode. The value is given after the opcode.
        addr = CPU.PC;
        break;
      }
      case "zX": {
        // Zero Page Indexed mode, X as index. Use the address given
        // after the opcode, then add the
        // X register to it to get the final address.
        addr = (CPU.load(opaddr + 2) + CPU.X) & 0xff;
        break;
      }
      case "zY": {
        // Zero Page Indexed mode, Y as index. Use the address given
        // after the opcode, then add the
        // Y register to it to get the final address.
        addr = (CPU.load(opaddr + 2) + CPU.Y) & 0xff;
        break;
      }
      case "aX": {
        // Absolute Indexed Mode, X as index. Same as zero page
        // indexed, but with the high byte.
        addr = CPU.load16bit(opaddr + 2);
        if((addr & 0xff00) !== ((addr + CPU.X) & 0xff00)){
          cycleAdd = 1;
        }
        addr += CPU.X;
        break;
      }
      case "aY": {
        // Absolute Indexed Mode, Y as index. Same as zero page
        // indexed, but with the high byte.
        addr = CPU.load16bit(opaddr + 2);
        if((addr & 0xff00) !== ((addr + CPU.Y) & 0xff00)){
          cycleAdd = 1;
        }
        addr += CPU.Y;
        break;
      }
      case "iX": {
        // Pre-indexed Indirect mode. Find the 16-bit address
        // starting at the given location plus
        // the current X register. The value is the contents of that
        // address.
        addr = CPU.load(opaddr + 2);
        if((addr & 0xff00) !== ((addr + CPU.X) & 0xff00)){
          cycleAdd = 1;
        }
        addr += CPU.X;
        addr &= 0xff;
        addr = CPU.load16bit(addr);
        break;
      }
      case "iY": {
        // Post-indexed Indirect mode. Find the 16-bit address
        // contained in the given location
        // (and the one following). Add to that address the contents
        // of the Y register. Fetch the value
        // stored at that adress.
        addr = CPU.load16bit(CPU.load(opaddr + 2));
        if((addr & 0xff00) !== ((addr + CPU.Y) & 0xff00)){
          cycleAdd = 1;
        }
        addr += CPU.Y;
        break;
      }
      case "in": {
        // Indirect Absolute mode. Find the 16-bit address contained
        // at the given location.
        addr = CPU.load16bit(opaddr + 2); // Find op
        if(addr < 0x1fff){
          addr =
            CPU.mem[addr] +
            (CPU.mem[(addr & 0xff00) | (((addr & 0xff) + 1) & 0xff)] << 8); // Read from address given in op
        } else {
          addr =
            CPU.load(addr) +
            (CPU.load(
              (addr & 0xff00) | (((addr & 0xff) + 1) & 0xff)
            ) <<
              8);
        }
        break;
      }
    }
    // Wrap around for addresses above 0xFFFF:
    addr &= 0xffff;

    // ----------------------------------------------------------------------------------------------------
    // Decode & execute instruction:
    // ----------------------------------------------------------------------------------------------------

    // This should be compiled to a jump table.
    switch (opinf & 0xff){
      case 0: {
        // *******
        // * ADC *
        // *******

        // Add with carry.
        temp = CPU.A + CPU.load(addr) + CPU.C;

        if(
          ((CPU.A ^ CPU.load(addr)) & 0x80) === 0 &&
          ((CPU.A ^ temp) & 0x80) !== 0
        ){
          CPU.V = 1;
        } else {
          CPU.V = 0;
        }
        CPU.C = temp > 255 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        CPU.A = temp & 255;
        cycleCount += cycleAdd;
        break;
      }
      case 1: {
        // *******
        // * AND *
        // *******

        // AND memory with accumulator.
        CPU.A = CPU.A & CPU.load(addr);
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 2: {
        // *******
        // * ASL *
        // *******

        // Shift left one bit
        if(addrMode === admnames[4]){
          // ADDR_ACC = 4

          CPU.C = (CPU.A >> 7) & 1;
          CPU.A = (CPU.A << 1) & 255;
          CPU.N = (CPU.A >> 7) & 1;
          CPU.Z = CPU.A;
        } else {
          temp = CPU.load(addr);
          CPU.C = (temp >> 7) & 1;
          temp = (temp << 1) & 255;
          CPU.N = (temp >> 7) & 1;
          CPU.Z = temp;
          CPU.write(addr, temp);
        }
        break;
      }
      case 3: {
        // *******
        // * BCC *
        // *******

        // Branch on carry clear
        if(CPU.C === 0){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 4: {
        // *******
        // * BCS *
        // *******

        // Branch on carry set
        if(CPU.C === 1){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 5: {
        // *******
        // * BEQ *
        // *******

        // Branch on zero
        if(CPU.Z === 0){
          //console.log('it',addr,opaddr);
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 6: {
        // *******
        // * BIT *
        // *******

        temp = CPU.load(addr);
        CPU.N = (temp >> 7) & 1;
        CPU.V = (temp >> 6) & 1;
        temp &= CPU.A;
        CPU.Z = temp;
        break;
      }
      case 7: {
        // *******
        // * BMI *
        // *******

        // Branch on negative result
        if(CPU.N === 1){
          cycleCount++;
          CPU.PC = addr;
        }
        break;
      }
      case 8: {
        // *******
        // * BNE *
        // *******

        // Branch on not zero
        if(CPU.Z !== 0){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 9: {
        // *******
        // * BPL *
        // *******

        // Branch on positive result
        if(CPU.N === 0){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 10: {
        // *******
        // * BRK *
        // *******

        CPU.PC += 2;
        CPU.push((CPU.PC >> 8) & 255);
        CPU.push(CPU.PC & 255);
        CPU.B = 1;

        CPU.push(
          CPU.C |
          ((CPU.Z === 0 ? 1 : 0) << 1) |
          (CPU.I << 2) |
          (CPU.D << 3) |
          (CPU.B << 4) |
          (1 << 5) |
          (CPU.V << 6) |
          (CPU.N << 7)
        );

        CPU.I = 1;
        //CPU.PC = load(0xFFFE) | (load(0xFFFF) << 8);
        CPU.PC = CPU.load16bit(0xfffe);
        CPU.PC--;
        break;
      }
      case 11: {
        // *******
        // * BVC *
        // *******

        // Branch on overflow clear
        if(CPU.V === 0){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 12: {
        // *******
        // * BVS *
        // *******

        // Branch on overflow set
        if(CPU.V === 1){
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          CPU.PC = addr;
        }
        break;
      }
      case 13: {
        // *******
        // * CLC *
        // *******

        // Clear carry flag
        CPU.C = 0;
        break;
      }
      case 14: {
        // *******
        // * CLD *
        // *******

        // Clear decimal flag
        CPU.D = 0;
        break;
      }
      case 15: {
        // *******
        // * CLI *
        // *******

        // Clear interrupt flag
        CPU.I = 0;
        break;
      }
      case 16: {
        // *******
        // * CLV *
        // *******

        // Clear overflow flag
        CPU.V = 0;
        break;
      }
      case 17: {
        // *******
        // * CMP *
        // *******

        // Compare memory and accumulator:
        temp = CPU.A - CPU.load(addr);
        CPU.C = temp >= 0 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        cycleCount += cycleAdd;
        break;
      }
      case 18: {
        // *******
        // * CPX *
        // *******

        // Compare memory and index X:
        temp = CPU.X - CPU.load(addr);
        CPU.C = temp >= 0 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        break;
      }
      case 19: {
        // *******
        // * CPY *
        // *******

        // Compare memory and index Y:
        temp = CPU.Y - CPU.load(addr);
        CPU.C = temp >= 0 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        break;
      }
      case 20: {
        // *******
        // * DEC *
        // *******

        // Decrement memory by one:
        temp = (CPU.load(addr) - 1) & 0xff;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp;
        CPU.write(addr, temp);
        break;
      }
      case 21: {
        // *******
        // * DEX *
        // *******

        // Decrement index X by one:
        CPU.X = (CPU.X - 1) & 0xff;
        CPU.N = (CPU.X >> 7) & 1;
        CPU.Z = CPU.X;
        break;
      }
      case 22: {
        // *******
        // * DEY *
        // *******

        // Decrement index Y by one:
        CPU.Y = (CPU.Y - 1) & 0xff;
        CPU.N = (CPU.Y >> 7) & 1;
        CPU.Z = CPU.Y;
        break;
      }
      case 23: {
        // *******
        // * EOR *
        // *******

        // XOR Memory with accumulator, store in accumulator:
        CPU.A = (CPU.load(addr) ^ CPU.A) & 0xff;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        cycleCount += cycleAdd;
        break;
      }
      case 24: {
        // *******
        // * INC *
        // *******

        // Increment memory by one:
        temp = (CPU.load(addr) + 1) & 0xff;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp;
        CPU.write(addr, temp & 0xff);
        break;
      }
      case 25: {
        // *******
        // * INX *
        // *******

        // Increment index X by one:
        CPU.X = (CPU.X + 1) & 0xff;
        CPU.N = (CPU.X >> 7) & 1;
        CPU.Z = CPU.X;
        break;
      }
      case 26: {
        // *******
        // * INY *
        // *******

        // Increment index Y by one:
        CPU.Y++;
        CPU.Y &= 0xff;
        CPU.N = (CPU.Y >> 7) & 1;
        CPU.Z = CPU.Y;
        break;
      }
      case 27: {
        // *******
        // * JMP *
        // *******

        // Jump to new location:
        CPU.PC = addr - 1;
        break;
      }
      case 28: {
        // *******
        // * JSR *
        // *******

        // Jump to new location, saving return address.
        // Push return address on stack:
        CPU.push((CPU.PC >> 8) & 255);
        CPU.push(CPU.PC & 255);
        CPU.PC = addr - 1;
        break;
      }
      case 29: {
        // *******
        // * LDA *
        // *******

        // Load accumulator with memory:
        CPU.A = CPU.load(addr);
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        cycleCount += cycleAdd;
        break;
      }
      case 30: {
        // *******
        // * LDX *
        // *******

        // Load index X with memory:
        CPU.X = CPU.load(addr);
        CPU.N = (CPU.X >> 7) & 1;
        CPU.Z = CPU.X;
        cycleCount += cycleAdd;
        break;
      }
      case 31: {
        // *******
        // * LDY *
        // *******

        // Load index Y with memory:
        CPU.Y = CPU.load(addr);
        CPU.N = (CPU.Y >> 7) & 1;
        CPU.Z = CPU.Y;
        cycleCount += cycleAdd;
        break;
      }
      case 32: {
        // *******
        // * LSR *
        // *******

        // Shift right one bit:
        if(addrMode === admnames[4]){
          // ADDR_ACC

          temp = CPU.A & 0xff;
          CPU.C = temp & 1;
          temp >>= 1;
          CPU.A = temp;
        } else {
          temp = CPU.load(addr) & 0xff;
          CPU.C = temp & 1;
          temp >>= 1;
          CPU.write(addr, temp);
        }
        CPU.N = 0;
        CPU.Z = temp;
        break;
      }
      case 33: {
        // *******
        // * NOP *
        // *******

        // No OPeration.
        // Ignore.
        break;
      }
      case 34: {
        // *******
        // * ORA *
        // *******

        // OR memory with accumulator, store in accumulator.
        temp = (CPU.load(addr) | CPU.A) & 255;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp;
        CPU.A = temp;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 35: {
        // *******
        // * PHA *
        // *******

        // Push accumulator on stack
        CPU.push(CPU.A);
        break;
      }
      case 36: {
        // *******
        // * PHP *
        // *******

        // Push processor status on stack
        CPU.B = 1;
        CPU.push(
          CPU.C |
          ((CPU.Z === 0 ? 1 : 0) << 1) |
          (CPU.I << 2) |
          (CPU.D << 3) |
          (CPU.B << 4) |
          (1 << 5) |
          (CPU.V << 6) |
          (CPU.N << 7)
        );
        break;
      }
      case 37: {
        // *******
        // * PLA *
        // *******

        // Pull accumulator from stack
        CPU.A = CPU.pull();
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        break;
      }
      case 38: {
        // *******
        // * PLP *
        // *******

        // Pull processor status from stack
        temp = CPU.pull();
        CPU.C = temp & 1;
        CPU.Z = ((temp >> 1) & 1) === 1 ? 0 : 1;
        CPU.I = (temp >> 2) & 1;
        CPU.D = (temp >> 3) & 1;
        CPU.B = (temp >> 4) & 1;
        
        CPU.V = (temp >> 6) & 1;
        CPU.N = (temp >> 7) & 1;
        break;
      }
      case 39: {
        // *******
        // * ROL *
        // *******

        // Rotate one bit left
        if(addrMode === admnames[4]){
          // ADDR_ACC = 4

          temp = CPU.A;
          add = CPU.C;
          CPU.C = (temp >> 7) & 1;
          temp = ((temp << 1) & 0xff) + add;
          CPU.A = temp;
        } else {
          temp = CPU.load(addr);
          add = CPU.C;
          CPU.C = (temp >> 7) & 1;
          temp = ((temp << 1) & 0xff) + add;
          CPU.write(addr, temp);
        }
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp;
        break;
      }
      case 40: {
        // *******
        // * ROR *
        // *******

        // Rotate one bit right
        if(addrMode === admnames[4]){
          // ADDR_ACC = 4

          add = CPU.C << 7;
          CPU.C = CPU.A & 1;
          temp = (CPU.A >> 1) + add;
          CPU.A = temp;
        } else {
          temp = CPU.load(addr);
          add = CPU.C << 7;
          CPU.C = temp & 1;
          temp = (temp >> 1) + add;
          CPU.write(addr, temp);
        }
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp;
        break;
      }
      case 41: {
        // *******
        // * RTI *
        // *******

        // Return from interrupt. Pull status and PC from stack.

        temp = CPU.pull();
        CPU.C = temp & 1;
        CPU.Z = ((temp >> 1) & 1) === 0 ? 1 : 0;
        CPU.I = (temp >> 2) & 1;
        CPU.D = (temp >> 3) & 1;
        CPU.B = (temp >> 4) & 1;
        CPU.V = (temp >> 6) & 1;
        CPU.N = (temp >> 7) & 1;

        CPU.PC = CPU.pull();
        CPU.PC += CPU.pull() << 8;
        if(CPU.PC === 0xffff){
          return;
        }
        CPU.PC--;
        break;
      }
      case 42: {
        // *******
        // * RTS *
        // *******

        // Return from subroutine. Pull PC from stack.

        CPU.PC = CPU.pull();
        CPU.PC += CPU.pull() << 8;

        if(CPU.PC === 0xffff){
          return; // return from NSF play routine:
        }
        break;
      }
      case 43: {
        // *******
        // * SBC *
        // *******

        temp = CPU.A - CPU.load(addr) - (1 - CPU.C);
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        if(
          ((CPU.A ^ temp) & 0x80) !== 0 &&
          ((CPU.A ^ CPU.load(addr)) & 0x80) !== 0
        ){
          CPU.V = 1;
        } else {
          CPU.V = 0;
        }
        CPU.C = temp < 0 ? 0 : 1;
        CPU.A = temp & 0xff;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 44: {
        // *******
        // * SEC *
        // *******

        // Set carry flag
        CPU.C = 1;
        break;
      }
      case 45: {
        // *******
        // * SED *
        // *******

        // Set decimal mode
        CPU.D = 1;
        break;
      }
      case 46: {
        // *******
        // * SEI *
        // *******

        // Set interrupt disable status
        CPU.I = 1;
        break;
      }
      case 47: {
        // *******
        // * STA *
        // *******

        // Store accumulator in memory
        CPU.write(addr, CPU.A);
        break;
      }
      case 48: {
        // *******
        // * STX *
        // *******

        // Store index X in memory
        CPU.write(addr, CPU.X);
        break;
      }
      case 49: {
        // *******
        // * STY *
        // *******

        // Store index Y in memory:
        CPU.write(addr, CPU.Y);
        break;
      }
      case 50: {
        // *******
        // * TAX *
        // *******

        // Transfer accumulator to index X:
        CPU.X = CPU.A;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        break;
      }
      case 51: {
        // *******
        // * TAY *
        // *******

        // Transfer accumulator to index Y:
        CPU.Y = CPU.A;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        break;
      }
      case 52: {
        // *******
        // * TSX *
        // *******

        // Transfer stack pointer to index X:
        CPU.X = CPU.S - 0x0100;
        CPU.N = (CPU.S >> 7) & 1;
        CPU.Z = CPU.X;
        break;
      }
      case 53: {
        // *******
        // * TXA *
        // *******

        // Transfer index X to accumulator:
        CPU.A = CPU.X;
        CPU.N = (CPU.X >> 7) & 1;
        CPU.Z = CPU.X;
        break;
      }
      case 54: {
        // *******
        // * TXS *
        // *******

        // Transfer index X to stack pointer:
        CPU.S = CPU.X + 0x0100;
        CPU.stackWrap();
        break;
      }
      case 55: {
        // *******
        // * TYA *
        // *******

        // Transfer index Y to accumulator:
        CPU.A = CPU.Y;
        CPU.N = (CPU.Y >> 7) & 1;
        CPU.Z = CPU.Y;
        break;
      }
      case 56: {
        // *******
        // * ALR *
        // *******

        // Shift right one bit after ANDing:
        temp = CPU.A & CPU.load(addr);
        CPU.C = temp & 1;
        CPU.A = CPU.Z = temp >> 1;
        CPU.N = 0;
        break;
      }
      case 57: {
        // *******
        // * ANC *
        // *******

        // AND accumulator, setting carry to bit 7 result.
        CPU.A = CPU.Z = CPU.A & CPU.load(addr);
        CPU.C = CPU.N = (CPU.A >> 7) & 1;
        break;
      }
      case 58: {
        // *******
        // * ARR *
        // *******

        // Rotate right one bit after ANDing:
        temp = CPU.A & CPU.load(addr);
        CPU.A = CPU.Z = (temp >> 1) + (CPU.C << 7);
        CPU.N = CPU.C;
        CPU.C = (temp >> 7) & 1;
        CPU.V = ((temp >> 7) ^ (temp >> 6)) & 1;
        break;
      }
      case 59: {
        // *******
        // * AXS *
        // *******

        // Set X to (X AND A) - value.
        temp = (CPU.X & CPU.A) - CPU.load(addr);
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        if(
          ((CPU.X ^ temp) & 0x80) !== 0 &&
          ((CPU.X ^ CPU.load(addr)) & 0x80) !== 0
        ){
          CPU.V = 1;
        } else {
          CPU.V = 0;
        }
        CPU.C = temp < 0 ? 0 : 1;
        CPU.X = temp & 0xff;
        break;
      }
      case 60: {
        // *******
        // * LAX *
        // *******

        // Load A and X with memory:
        CPU.A = CPU.X = CPU.Z = CPU.load(addr);
        CPU.N = (CPU.A >> 7) & 1;
        cycleCount += cycleAdd;
        break;
      }
      case 61: {
        // *******
        // * SAX *
        // *******

        // Store A AND X in memory:
        CPU.write(addr, CPU.A & CPU.X);
        break;
      }
      case 62: {
        // *******
        // * DCP *
        // *******

        // Decrement memory by one:
        temp = (CPU.load(addr) - 1) & 0xff;
        CPU.write(addr, temp);

        // Then compare with the accumulator:
        temp = CPU.A - temp;
        CPU.C = temp >= 0 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 63: {
        // *******
        // * ISC *
        // *******

        // Increment memory by one:
        temp = (CPU.load(addr) + 1) & 0xff;
        CPU.write(addr, temp);

        // Then subtract from the accumulator:
        temp = CPU.A - temp - (1 - CPU.C);
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        if(
          ((CPU.A ^ temp) & 0x80) !== 0 &&
          ((CPU.A ^ CPU.load(addr)) & 0x80) !== 0
        ){
          CPU.V = 1;
        } else {
          CPU.V = 0;
        }
        CPU.C = temp < 0 ? 0 : 1;
        CPU.A = temp & 0xff;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 64: {
        // *******
        // * RLA *
        // *******

        // Rotate one bit left
        temp = CPU.load(addr);
        add = CPU.C;
        CPU.C = (temp >> 7) & 1;
        temp = ((temp << 1) & 0xff) + add;
        CPU.write(addr, temp);

        // Then AND with the accumulator.
        CPU.A = CPU.A & temp;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 65: {
        // *******
        // * RRA *
        // *******

        // Rotate one bit right
        temp = CPU.load(addr);
        add = CPU.C << 7;
        CPU.C = temp & 1;
        temp = (temp >> 1) + add;
        CPU.write(addr, temp);

        // Then add to the accumulator
        temp = CPU.A + CPU.load(addr) + CPU.C;

        if(
          ((CPU.A ^ CPU.load(addr)) & 0x80) === 0 &&
          ((CPU.A ^ temp) & 0x80) !== 0
        ){
          CPU.V = 1;
        } else {
          CPU.V = 0;
        }
        CPU.C = temp > 255 ? 1 : 0;
        CPU.N = (temp >> 7) & 1;
        CPU.Z = temp & 0xff;
        CPU.A = temp & 255;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 66: {
        // *******
        // * SLO *
        // *******

        // Shift one bit left
        temp = CPU.load(addr);
        CPU.C = (temp >> 7) & 1;
        temp = (temp << 1) & 255;
        CPU.write(addr, temp);

        // Then OR with the accumulator.
        CPU.A = CPU.A | temp;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 67: {
        // *******
        // * SRE *
        // *******

        // Shift one bit right
        temp = CPU.load(addr) & 0xff;
        CPU.C = temp & 1;
        temp >>= 1;
        CPU.write(addr, temp);

        // Then XOR with the accumulator.
        CPU.A = CPU.A ^ temp;
        CPU.N = (CPU.A >> 7) & 1;
        CPU.Z = CPU.A;
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 68: {
        // *******
        // * SKB *
        // *******

        // Do nothing
        break;
      }
      case 69: {
        // *******
        // * IGN *
        // *******

        // Do nothing but load.
        // TODO: Properly implement the double-reads.
        CPU.load(addr);
        if(addrMode !== admnames[11]) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }

      default: {
        // *******
        // * ??? *
        // *******

        NES.stop();
        NES.crashMessage =
          "Game crashed, invalid opcode at address $" + opaddr.toString(16);
        break;
      }
    } // end of switch
    */
    myop();

    //if((op !== o || CPU.A !== A || CPU.X !== X || CPU.Y !== Y || (CPU.S-0x100) !== S  || (CPU.PC+1) !== PC || cycleCount !== top.c || CPU.getP() !== P) && !ko) {
    
    //ko || console.log("Z", Z, CPU.Z)
    //theirs = `Op: ${op.toString(16).padStart(2,0)} A: ${CPU.A.toString(16).padStart(2,0)} X: ${CPU.X.toString(16).padStart(2,0)} Y: ${CPU.Y.toString(16).padStart(2,0)} S: ${(CPU.S - 0x100).toString(16).padStart(2,0)} new PC: ${(CPU.PC+1).toString(16).padStart(4,0)} nvxbdizc: ${CPU.getP().toString(2).padStart(8,0)} cycles: ${cycleCount} M[0]: ${CPU.load(0)} M[1]: ${CPU.load(0x1)} M[fb]: ${CPU.load(0x1FB).toString(2)}`
    //mine = `Op: ${o.toString(16).padStart(2,0)} A: ${A.toString(16).padStart(2,0)} X: ${X.toString(16).padStart(2,0)} Y: ${Y.toString(16).padStart(2,0)} S: ${S.toString(16).padStart(2,0)} new PC: ${PC.toString(16).padStart(4,0)} nvxbdizc: ${P.toString(2).padStart(8,0)} cycles: ${top.c} M[0]: ${top.m[0]||0} M[1]: ${top.m[0x1]||0} M[fb]: ${(top.m[0x1FB]||0).toString(2)}`
      
    /*if(theirs != mine && !ko){
      console.log(log, 
        [["brk","imm"],["ora","iix"],["   ","   "],["   ","   "],["   ","   "],["ora","zpg"],["asl","zpg"],["   ","   "],  // 00
         ["php","   "],["ora","imm"],["asl","acc"],["   ","   "],["   ","   "],["ora","abs"],["asl","abs"],["   ","   "],  // 08
         ["bpl","rel"],["ora","iiy"],["   ","   "],["   ","   "],["   ","   "],["ora","zpx"],["asl","zpx"],["   ","   "],  // 10
         ["clc","   "],["ora","aby"],["   ","   "],["   ","   "],["   ","   "],["ora","abx"],["asl","abx"],["   ","   "],  // 18
         ["jsr","adr"],["and","iix"],["   ","   "],["   ","   "],["bit","zpg"],["and","zpg"],["rol","zpg"],["   ","   "],  // 20
         ["plp","   "],["and","imm"],["rol","acc"],["   ","   "],["bit","abs"],["and","abs"],["rol","abs"],["   ","   "],  // 28
         ["bmi","rel"],["and","iiy"],["   ","   "],["   ","   "],["   ","   "],["and","zpx"],["rol","zpx"],["   ","   "],  // 30
         ["sec","   "],["and","aby"],["   ","   "],["   ","   "],["   ","   "],["and","abx"],["rol","abx"],["   ","   "],  // 38
         ["rti","   "],["eor","iix"],["   ","   "],["   ","   "],["   ","   "],["eor","zpg"],["lsr","zpg"],["   ","   "],  // 40
         ["pha","   "],["eor","imm"],["lsr","acc"],["   ","   "],["jmp","adr"],["eor","abs"],["lsr","abs"],["   ","   "],  // 48
         ["bvc","rel"],["eor","iiy"],["   ","   "],["   ","   "],["   ","   "],["eor","zpx"],["lsr","zpx"],["   ","   "],  // 50
         ["cli","   "],["eor","aby"],["   ","   "],["   ","   "],["   ","   "],["eor","abx"],["lsr","abx"],["   ","   "],  // 58
         ["rts","   "],["adc","iix"],["   ","   "],["   ","   "],["   ","   "],["adc","zpg"],["ror","zpg"],["   ","   "],  // 60
         ["pla","   "],["adc","imm"],["ror","acc"],["   ","   "],["jmp","ind"],["adc","abs"],["ror","abs"],["   ","   "],  // 68
         ["bvs","rel"],["adc","iiy"],["   ","   "],["   ","   "],["   ","   "],["adc","zpx"],["ror","zpx"],["   ","   "],  // 70
         ["sei","   "],["adc","aby"],["   ","   "],["   ","   "],["   ","   "],["adc","abx"],["ror","abx"],["   ","   "],  // 78
         ["   ","   "],["sta","iix"],["   ","   "],["   ","   "],["sty","zpg"],["sta","zpg"],["stx","zpg"],["   ","   "],  // 80
         ["dey","   "],["   ","   "],["txa","   "],["   ","   "],["sty","abs"],["sta","abs"],["stx","abs"],["   ","   "],  // 88
         ["bcc","rel"],["sta","iiy"],["   ","   "],["   ","   "],["sty","zpx"],["sta","zpx"],["stx","zpy"],["   ","   "],  // 90
         ["tya","   "],["sta","aby"],["txs","   "],["   ","   "],["   ","   "],["sta","abx"],["   ","   "],["   ","   "],  // 98
         ["ldy","imm"],["lda","iix"],["ldx","imm"],["   ","   "],["ldy","zpg"],["lda","zpg"],["ldx","zpg"],["   ","   "],  // A0
         ["tay","   "],["lda","imm"],["tax","   "],["   ","   "],["ldy","abs"],["lda","abs"],["ldx","abs"],["   ","   "],  // A8
         ["bcs","rel"],["lda","iiy"],["   ","   "],["   ","   "],["ldy","zpx"],["lda","zpx"],["ldx","zpy"],["   ","   "],  // B0
         ["clv","   "],["lda","aby"],["tsx","   "],["   ","   "],["ldy","abx"],["lda","abx"],["ldx","aby"],["   ","   "],  // B8
         ["cpy","imm"],["cmp","iix"],["   ","   "],["   ","   "],["cpy","zpx"],["cmp","zpg"],["dec","zpg"],["   ","   "],  // C0
         ["iny","   "],["cmp","imm"],["dex","   "],["   ","   "],["cpy","abs"],["cmp","abs"],["dec","abs"],["   ","   "],  // C8
         ["bne","rel"],["cmp","iiy"],["   ","   "],["   ","   "],["   ","   "],["cmp","zpx"],["dec","zpx"],["   ","   "],  // D0
         ["cld","   "],["cmp","aby"],["   ","   "],["   ","   "],["   ","   "],["cmp","abx"],["dec","abx"],["   ","   "],  // D8
         ["cpx","imm"],["sbc","iix"],["   ","   "],["   ","   "],["cpx","zpg"],["sbc","zpg"],["inc","zpg"],["   ","   "],  // E0
         ["inx","   "],["sbc","imm"],["nop","   "],["   ","   "],["cpx","abs"],["sbc","abs"],["inc","abs"],["   ","   "],  // E8
         ["beq","rel"],["sbc","iiy"],["   ","   "],["   ","   "],["   ","   "],["sbc","zpx"],["inc","zpx"],["   ","   "],  // F0
         ["sed","   "],["sbc","aby"],["   ","   "],["   ","   "],["   ","   "],["sbc","abx"],["inc","abx"],["   ","   "]][op].join(' ')
    );
      console.log("theirs: " + theirs, " addr: ", addr.toString(16), CPU.load(addr).toString(16))
      console.log("mine:   " + mine, " addr: ", top.a.toString(16), (top.r(top.a)||0).toString(16))
      if(theirs != mine) ko = 1;
    }*/

    log++;
    //return cycleCount;
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

  push: value => {
    //ko || console.log("They push " + value.toString(16) + " at " + (0x100+S).toString(16));
  
    CPU.write(CPU.S, value);
    CPU.S--;
    CPU.S = 0x0100 | (CPU.S & 0xff);
  },

  stackWrap: () => {
    CPU.S = 0x0100 | (CPU.S & 0xff);
  },

  pull: () => {
    CPU.S++;
    CPU.S = 0x0100 | (CPU.S & 0xff);
    return CPU.load(CPU.S);
  },

  pageCrossed: (addr1, addr2) => {
    return (addr1 & 0xff00) !== (addr2 & 0xff00);
  },

  haltCycles: cycles => {
    CPU.halt_cycles += cycles;
  },

  doNonMaskableInterrupt: status => {
    if((CPU.load(0x2000) & 128) !== 0){
      // Check whether VBlank Interrupts are enabled

      CPU.PC_NEW++;
      CPU.push((CPU.PC_NEW >> 8) & 0xff);
      CPU.push(CPU.PC_NEW & 0xff);
      //CPU.I_NEW = 1;
      CPU.push(status&239);

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
  },

  getP: () => {
    return (
      CPU.C |
      (CPU.Z > 0 ? 0 : 1) << 1 |
      (CPU.I << 2) |
      (CPU.D << 3) |
      (CPU.B << 4) |
      (1 << 5) |
      (CPU.V << 6) |
      (CPU.N << 7)
    );
  },
  
  getStatus: () => {
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
  },

  setStatus: st => {
    CPU.C = st & 1;
    CPU.Z = (st >> 1) & 1;
    CPU.I = (st >> 2) & 1;
    CPU.D = (st >> 3) & 1;
    CPU.B = (st >> 4) & 1;

    CPU.V = (st >> 6) & 1;
    CPU.N = (st >> 7) & 1;
  },
  
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
            return m[0x2000] = CPU.mem[0x2000];

          case 0x1:
            // 0x2001:
            // PPU Control Register 2.
            // (the value is stored both
            // in main memory and in the
            // PPU as flags):
            // (not in the real NES)
            return m[0x2001] = CPU.mem[0x2001];

          case 0x2:
            // 0x2002:
            // PPU Status Register.
            // The value is stored in
            // main memory in addition
            // to as flags in the PPU.
            // (not in the real NES)
            return m[0x2002] = PPU.readStatusRegister();

          case 0x3:
            return 0;

          case 0x4:
            // 0x2004:
            // Sprite Memory read.
            return m[0x2004] = PPU.sramLoad();
          case 0x5:
            return 0;

          case 0x6:
            return 0;

          case 0x7:
            // 0x2007:
            // VRAM read:
            return m[0x2007] = PPU.vramLoad();
        }
        break;
      case 4:
        // Sound+Joypad registers
        switch (address - 0x4015){
          case 0:
            // 0x4015:
            // Sound channel enable, DMC Status
            return m[0x4015] =APU.readReg(address);

          case 1:
            // 0x4016:
            // Joystick 1 + Strobe
            return m[0x4016] = joy1Read();

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
            return m[0x4017] = (joy2Read() | w) & 0xffff;
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
    OpData.setOp(OpData.INS_PLA, 0x68, OpData.ADDR_IMP, 1, 4);

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
