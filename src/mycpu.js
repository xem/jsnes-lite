// NES CPU simulator
// =================

// Resources:
// - https://wiki.nesdev.com/w/index.php/CPU_unofficial_opcodes
// - https://wiki.nesdev.com/w/index.php/Status_flags
// - http://wiki.nesdev.com/w/index.php/CPU_interrupts
// - https://wiki.nesdev.com/w/index.php/Stack
// - https://www.masswerk.at/6502/6502_instruction_set.html
// - https://problemkaputt.de/everynes.htm#cpu65xxmicroprocessor
// - https://www.npmjs.com/package/dict-tempering
// - http://www.6502.org/tutorials/vflag.html
// - https://retrocomputing.stackexchange.com/questions/145
// - http://forum.6502.org/viewtopic.php?f=8&t=6370

// Globals
// -------

// 16kb memory
// Each chunk of 256 bytes in memory is called a page
// Fhe first chunk ($00-$FF) is called Zero page
m = [],

// Registers
A = 0,        // accumulator
X = 0,        // X
Y = 0,        // Y
S = 0,        // stack pointer
PC = 0x8000,  // program counter (address of next instruction)
P = 0x34,     // status register (bits 0-7 represent the flags C,Z,I,D,B,1,V,N)

// Temp vars
t = o = a = p = c = 0,

// Helpers
// -------

// Read a byte from memory. Costs 1 cycle
// Some areas in memory are mirrored, dynamic (PPU/APU/controller registers),
// or specific to the game's Mapper (bank switches, save slot, ...),
// So this function will be delegated to the Mapper 
r = v => (c++, CPU.load(v)),

// Write a byte in memory. Costs 1 cycle.
w = (v, w) => (c++, CPU.write(v, w)),

// Update N and Z flags:
// - The value v is clamped on 8 bits
// - Zero flag (bit 1 of P) is set if v is zero, otherwise it's cleared
// - Negative flag (bit 7 of P) is set if byte 7 of v is 1, otherwise it's cleared
// Other flags (C, I, D, B, V) are set individually by each concerned opcode
F = v => (
  Z = (v &= 255) < 1,
  N = (v &= 255) >> 7,
  v
),

// Update the flags values from the status register
f = v => (
  C = v & 1,
  Z = (v>>1) & 1,
  I = (v>>2) & 1,
  D = (v>>3) & 1,
  B = (v>>4) & 1,
  V = (v>>6) & 1,
  N = (v>>7) & 1
),

// Set all flags on load
f(P),

// Push on Stack:
// write at address $100 + S, decrement S, wrap it between $00 and $FF
push = v => (
  w(256 + S--, v),
  S &= 255
),

// Pull from stack
// Increment S, wrap it between $00 and $FF, read at address $100 + S
pull = v => r(256 + (S = (255 & (S+1)))),

// Instructions
// ============

// The code below unpacks and builds a function for each valid opcode supported by the CPU.
// When a function is called:
// - `PC` represents the opcode's address
// - `a` equals PC+1
// - `p` is the value stored at the address PC+1
// - `c` (the cycle counter) equals 2
O = [];
for(o = 255; o--;){
  O[o] = Function(

    (
    
      // Addressing modes
      // ----------------

      // Some opcodes require an address in memory
      // This address can be computed in 10 different ways:

      // `0`: Immediate:
      // The target address is PC+1, already stored in `a`
      // Opcode size: 2 bytes
      // Total cycles: 2 (c is decremented because the first `p` fetch is redundant)
      "c--,PC++;"

      // `1`: Relative:
      // (only used for branching)
      // The target address (between PC-128 and PC+127) = PC + signed offset stored in p
      // Opcode size: 2 bytes
      // Total cycles: 2 (no branch) / 3 (branch on same page) / 4 (branch on another page)
      + "a=a+p-256*(p>>7),PC++;"

      // `2`: Indexed indirect X
      // The target address is absolute and stored at a zero page address which is stored at PC + 1 + X
      // Opcode size: 2 bytes
      // Total cycles: 6 (read or write)
      + "a=r(p+X&255)+256*r(p+X+1&255),PC++,c++;"

      // `3`: Indirect indexed Y
      // The target address is absolute and stored at a zero page address which is stored at PC+1, then Y is added to it
      // Opcode size: 2 bytes
      // Total cycles: 5* (read) / 6 (write)
      // * Cross-page between absolute address and absolute address + Y cost 1 extra cycle
      + "a=r(p)+256*r(p+1&255)+Y,c+=a-Y>>8<a>>8||o>>4==9,PC++;"

      // `4`: Zero page X
      // The target address is equal to zero page address (stored at PC+1) + X, wrapping between $00 and $FF
      // Opcode size: 2 bytes
      // Total cycles: 3 (BIT) / 4 (read or write) / 6 (read + write)
      + "a=r(a)+X&255,PC++;"

      // `5`: Zero page Y
      // The target address is equal to zero page address (stored at PC+1) + Y, wrapping between $00 and $FF
      // Opcode size: 2 bytes
      // Total cycles: 4 (read or write)
      + "a=r(a)+Y&255,PC++;"

      // `6`: Zero page
      // The target address (between $00 and $FF) is stored in p
      // Opcode size: 2 bytes
      // Total cycles: 3 (read or write) / 5 (read + write)
      + "a=p,PC++;"

      // `7`: Absolute
      // The target address is stored at PC+1 (low byte) and PC+2 (high byte)
      // Opcode size: 3 bytes
      // Total cycles: 3 (JMP) / 4 (read or write) / 6 (read + write or JSR)
      + "a=p+256*r(PC+2),PC+=2;"

      // `8`: Absolute Y
      // The target address is equal to absolute address (stored at PC+1 and PC+2) + Y
      // Opcode size: 3 bytes
      // Total cycles: 4* (read) / 5 (write)
      // * Cross-page read cost 1 extra cycle
      + "t=p+256*r(PC+2),c+=t>>8<t+Y>>8||o>>4==9,a=t+Y,PC+=2;"

      // `9`: Absolute X
      // The target address is equal to absolute address (stored at PC+1 and PC+2) + X
      // Opcode size: 3 bytes
      // Total cycles: 4* (read) / 5 (write) / 7 (read + write)
      // * Cross-page read cost 1 extra cycle
      + "t=p+256*r(PC+2),c+=t>>8<t+X>>8||o>>4==9||(15&o)>13,a=t+X,PC+=2;"
    
      // `Z`: implicit or Accumulator
      // The target is either a flag or  (no need to compute an address)
      // Opcode size: 1 byte (no need to increment PC)
      // Total cycles: 2-7
      + ""
      
    // Make an array from this string
    ).split `;`
    
    // Fetch the right addressing mode for the current opcode (ignore every illegal opcode where o % 4 == 3):
    [
      `020666Z0Z77713Z444Z8Z999720666Z0Z77713Z444Z8Z999Z20666Z0Z77713Z444Z8Z999Z20666Z0Z77713Z444Z8Z999020666Z0Z77713Z445Z8Z998020666Z0Z77713Z445Z8Z998020666Z0Z77713Z444Z8Z999020666Z0Z77713Z444Z8Z999`[o-(o>>2)]
    ]
    
    // Separator
    + `;`
    
    // Instructions
    // ------------

    // There are 56 valid instructions, performing operations in memory and/or in the registers
    // Some instructions use extra cycles:
    // *  : cross-page when fetching the address costs 1 extra cycle
    // ** : Same-page branch (PC+2>>8 == a>>8) costs 1 extra cycle cycles. Cross-page branch costs another extra cycle.
    // ***: Instructions that read, modify and write a value in memory (and JSR/RTI/RTS) cost 1 to 2 extra cycles
    + (
    
      // ` `: SED (set decomal flag)
      // D is set to 1
      // Addressing:  imp
      // Opcode:      F8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      "D=1;"
      
      // `!`: CPX (compare memory and X)
      // N, Z and C are set with the result of X - a byte in memory
      // Flag C is set if there's no borrow
      // Addressings: imm, zpg, abs
      // Opcodes:     E0,  E4,  EC
      // Cycles:      2,   3,   4
      // Cycles addr: -1,  0,   1
      // Cycles opc:  1,   1,   1
      + "p=r(a),C=X-p>=0,F(X-p);"
      
      // `"`: CPY (compare memory and Y)
      // N, Z and C are set with the result of Y - a byte in memory
      // Flag C is set if there's no borrow
      // Addressings: imm, zpg, abs
      // Opcodes:     C0,  C4,  CC
      // Cycles:      2,   3,   4
      // Cycles addr: -1,  0,   1
      // Cycles opc:  1,   1,   1
      + "p=r(a),C=Y-p>=0,F(Y-p);"
      
      // `#`: ASL (shift left)
      // A byte in memory is left shifted. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     06,  16,   0E,  1E
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "p=r(a),C=p>>7,w(a,F(2*p)),c++;"
      
      // `$`: ROL A (rotate left accumulator)
      // Rotate left A. Same as left shift but C flag is put into bit 0. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressing:  A
      // Opcode:      2A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=A>>7,A=F(2*A+(1&P));"
      
      // `%`: ROL (rotate left)
      // Rotate left a byte in memory. Same as left shift but C flag is put into bit 0. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     26,  36,   2E,  3E
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "p=r(a),C=p>>7,w(a,F(2*p+(1&P))),c++;"
      
      // `&`: LSR A (shift right accumulator)
      // A is shifted right. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressing:  A
      // Opcode:      4A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=1&A,A=F(A>>1);"
      
      // `'`: LSR (shift right)
      // A or a byte in memory is shifted right. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     46,  56,   4E,  5E
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "p=r(a),C=1&p,w(a,F(p>>1)),c++;"
      
      // `(`: DEX (decrement X)
      // X is decremented. Flags: N, Z
      // Addressing:  imp
      // Opcode:      CA
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "X=F(X-1);"
      
      // `)`: BIT (test bits in memory)
      // N and V = bits 7 and 6 of operand. Z is set if operand AND A is not zero. Flags: N, Z, V
      // Addressings: zpg, abs
      // Opcodes:     24,   2C
      // Cycles:      3,    4
      // Cycles addr: 0,    1
      // Cycles opc:  1,    1
      + "p=r(a),F(p&A),N=p>>7&1,V=p>>6&1;"
      
      // `*`: ROR A (rotate right accumulator)
      // Rotate right A or a byte in memory. Same as left shift but C flag is put into bit 7. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressing:  A
      // Opcode:      6A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=1&A,A=F((A>>1)+128*(1&P));"
      
      // `+`: INC (increment memory)
      // A byte in memory is incremented. Flags: N, Z
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     E6,  F6,   EE,  FE
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "w(a,F(r(a)+1)),c++;"
      
      // `,`: INX (increment X)
      // X is incremented. Flags: N, Z
      // Addressing:  imp
      // Opcode:      E8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "X=F(X+1);"
      
      // `-`: DEY (decrement Y)
      // Y is decremented. Flags: N, Z
      // Addressing:  imp
      // Opcode:      88
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "Y=F(Y-1);"
      
      // `.`: INY (increment Y)
      // Y is incremented. Flags: N, Z
      // Addressing:  imp
      // Opcode:      C8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "Y=F(Y+1);"
      
      // `/`: LDY (load Y with memory)
      // Y = a byte from memory. Flags: N, Z
      // Addressings: imm, zpg, zpgX, abs, absX
      // Opcodes:     A0,  A4,  B4,   AC,  BC
      // Cycles:      2,   3,   4,    4,   4*
      // Cycles addr: -1,  0,   1,    1,   1*
      // Cycles opc:  1,   1,   1,    1,   1
      + "Y=F(r(a));"
      
      // `0`: ROR (rotate right)
      // Rotate right a byte in memory. Same as left shift but C flag is put into bit 7. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     66,  76,   6E,  7E
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "p=r(a),C=1&p,w(a,F((p>>1)+128*(1&P))),c++;"
      
      // `1`: CLC (clear carry flag)
      // C is set to 0
      // Addressing:  imp
      // Opcode:      18
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=0;"
      
      // `2`: SEI  (set interrupt disable flag)
      // I is set to 1
      // Addressing:  imp
      // Opcode:      78
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "I=1;"
      
      // `3`: CLD (clear decimal flag)
      // D is set to 0
      // Addressing:  imp
      // Opcode:      D8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "D=0;"
      
      // `4`: CLI (clear interrupt disable flag)
      // I is set to 0
      // Addressing:  imp
      // Opcode:      58
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "I=0;"
      
      // `5`: LDA (load accumulator with memory)
      // A = a byte from memory. Flags: N, Z
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     A9,  A5,  B5,   AD,  BD,   B9,   A1,   B1
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a));"
      
      // `6`: AND: (AND memory and accumulator)
      // A = A AND a byte in memory. Flags: N, Z
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     29,  25,  35,   2D,  3D,   39,   21,   31
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)&A);"
      
      // `7`: CMP (compare memory and accumulator)
      // N, Z and C are set with the result of A - a byte in memory
      // Flag C is set if there's no borrow
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     C9,  C5,  D5,   CD,  DD,   D9,   C1,   D1
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),C=A-p>=0,F(A-p);"
      
      // `8`: SBC (subtract from accumulator with carry)
      // A = A - a byte from memory - (1 - Carry). Flags: N, Z, C, V
      // Flag C is set if there's no borrow
      // Flag V is set if the subtraction is incorrectly considered positive
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     E9,  E5,  F5,   ED,  FD,   F9,   E1,   F1
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),t=A+C-1-p,V=(128&(A^p))>0&&(128&(A^t))>0,C=t>=0,A=F(t);"
      
      // `9`: ADC (add to accumulator with carry)
      // A = A + a byte in memory + Carry. Flags: N, Z, C, V
      // Flag C is set if there's a carry
      // Flag V is set if the sum of two positive numbers is incorrectly considered negative
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     69,  65,  75,   6D,  7D,   79,   61,   71
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),t=A+C+p,V=!(128&(A^p))&&(128&(A^t))>0,C=t>255,A=F(t);"
      
      // `:`: JMP (jump to new location)
      // Set a new value to PC
      // `JMP indirect` jumps to an address stored anywhere in memory. The address of this address is stored after the opcode
      // NB: if the indirect address falls on a page boundary ($xxFF), it will wrap and fetch the low byte in the same page ($xx00)
      // Addressings: abs, ind
      // Opcodes:     4C,  6C
      // Cycles:      3,   5
      // Cycles addr: 1,   3
      // Cycles opc:  0,   2
      + "o>76&&(a=r(a)+256*r(a+1-256*(a&255==255))),PC=a-1;"
      
      // `;`: BCS (branch on carry set)
      // PC = address if C is 1
      // Addressing:  rel 
      // Opcode:      B0
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "C&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `<`: BMI (branch on minus)
      // PC = address if N is 1
      // Addressing:  rel 
      // Opcode:      30
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "N&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `=`: BPL (branch on plus)
      // PC = address if N is 0
      // Addressing:  rel 
      // Opcode:      10
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "N||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `>`: BVC (branch on overflow clear)
      // PC = address if V is 0
      // Addressing:  rel 
      // Opcode:      50
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "V||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `?`: LDX (load X with memory)
      // X = a byte from memory. Flags: N, Z
      // Addressings: imm, zpg, zpgY, abs, absY
      // Opcodes:     A2,  A6,  B6,   AE,  BE
      // Cycles:      2,   3,   4,    4,   4*
      // Cycles addr: -1,  0,   1,    1,   1*
      // Cycles opc:  1,   1,   1,    1,   1
      + "X=F(r(a));"
      
      // `@`: EOR (exclusive-or memory and accumulator)
      // A = A XOR a byte in memory. Flags: N, Z
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     49,  45,  55,   4D,  5D,   59,   41,   51
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)^A);"
      
      // `A`: DEC (decrement memory)
      // A byte in memory is decremented. Flags: N, Z
      // Addressings: zpg, zpgX, abs, absX
      // Opcodes:     C6,  D6,   CE,  DE
      // Cycles:      5,   6,    6,   7
      // Cycles addr: 0,   1,    1,   2
      // Cycles opc:  3,   3,    3,   3 (***)
      + "w(a,F((r(a)-1)&255)),c++;"

      // `B`: ASL A (shift left accumulator)
      // A is left shifted. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressing:  A
      // Opcode:      0A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=A>>7,A=F(2*A);"
      
      // `C`: JSR (jump to subroutine)
      // Push PC + 2, PC = absolute address
      // Addressing:  abs
      // Opcode:      20
      // Cycles:      6
      // Cycles addr: 1
      // Cycles opc:  3 (***)
      + "push(PC>>8),push(255&PC),PC=a-1,c++;"
      
      // `D`: SEC (set carry flag)
      // C is set to 1
      // Addressing:  imp
      // Opcode:      38
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "C=1;"
      
      // `E`: ORA (OR memory and accumulator)
      // A = A OR a byte in memory. Flags: N, Z. 
      // Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     09,  05,  15,   0D,  1D,   19,   01,   11
      // Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)|A);"
      
      // `F`: PHA (push accumulator)
      // Push A
      // Addressing:  imp
      // Opcode:      48
      // Cycles:      3
      // Cycles addr: 0
      // Cycles opc:  1
      + "push(A);"
      
      // `G`: PHP (push processor status)
      // Push P with B flag set to 1
      // Addressing:  imp
      // Opcode:      08
      // Cycles:      3
      // Cycles addr: 0
      // Cycles opc:  1
      + "push(P|16);"
      
      // `H`: PLA (pull accumulator)
      // Pull A. Flags: N, Z.
      // Addressing:  imp
      // Opcode:      68
      // Cycles:      4 (*** 1 extra cycle according to nestest)
      // Cycles addr: 0
      // Cycles opc:  1
      + "A=F(pull()),c++;"
      
      // `I`: PLP (pull processor status)
      // Pull P and set all flags
      // (According to nestest, the B flag stays at 0) 
      // Addressing:  imp
      // Opcode:      28
      // Cycles:      4 (*** 1 extra cycle according to nestest)
      // Cycles addr: 0
      // Cycles opc:  1
      + "f(pull()&239),c++;"
      
      // `J`: RTI (return from interrupt)
      // Pull P, set all flags, pull PC
      // Addressing:  imp
      // Opcode:      40
      // cycles:      6
      // Cycles addr: 0
      // Cycles opc:  4 (***)
      + "f(pull()),PC=pull()+256*pull()-1,c++;"
      
      // `K`: TXS (transfer X to stack pointer)
      // Stack pointer = X
      // Addressing:  imp
      // Opcode:      9A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "S=X;"
      
      // `L`: TAY (transfer accumulator to Y)
      // Y = A. Flags: N, Z
      // Addressing:  imp
      // Opcode:      A8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "Y=F(A);"
      
      // `M`: STA (store accumulator)
      // A is copied in memory
      // Addressings: zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:     85,  95,   8D,  9D,   99,   81,   91
      // Cycles:      3,   4,    4,   5,    5,    6,    6
      // Cycles addr: 0,   1,    1,   2,    2     3,    2
      // Cycles opc:  1,   1,    1,   1,    1,    1,    1
      + "w(a,A);"
      
      // `N`: STX (store X)
      // X is copied in memory
      // Addressings: zpg, zpgY, abs
      // Opcodes:     86,  96,   8E
      // Cycles:      3,   4,    4
      // Cycles addr: 0,   1,    1
      // Cycles opc:  1,   1,    1
      + "w(a,X);"
      
      // `O`: TSX (transfer stack pointer to X)
      // X = S. Flags: N, Z
      // Addressing:  imp
      // Opcode:      BA
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "X=F(S);"
      
      // `P`: TAX (transfer accumulator to X)
      // X = A. Flags: N, Z
      // Addressing:  imp
      // Opcode:      AA
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "X=F(A);"
      
      // `Q`: STY (store Y)
      // Y is copied in memory
      // Addressings: zpg, zpgX, abs
      // Opcodes:     84,  94,   8C
      // Cycles:      3,   4,    4
      // Cycles addr: 0,   1,    1
      // Cycles opc:  1,   1,    1
      + "w(a,Y);"
      
      // `R`: TYA (transfer Y to accumulator)
      // A = Y. Flags: N, Z
      // Addressing:  imp
      // Opcode:      98
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "A=F(Y);"
      
      // `S`: TXA (transfer X to accumulator)
      // A = X. Flags: N, Z
      // Addressing:  imp
      // Opcode:      8A
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "A=F(X);"
      
      // `T`: RTS (return from subroutine)
      // Pull and increment PC
      // Addressing:  imp
      // Opcode:      60
      // cycles:      6
      // Cycles addr: 0
      // Cycles opc:  0 (***)
      + "PC=pull()+256*pull(),c+=2;"
      
      // `U`: BRK (force break)
      // Interrupt, push PC+2 (PC+1 is a padding byte), push P with B flag set to 1, set I to 1
      // Addressing:  imp
      // Opcode:      00
      // Cycles:      7
      // Cycles addr: 0
      // Cycles opc:  5
      + "C++,push(PC>>8),push(255&PC),push(P|16),I=1,PC=r(65534)+256*r(65535)-1;"
      
      // `V`: BCC (branch on carry clear)
      // PC = address if C is 0
      // Addressing:  rel 
      // Opcode:      90
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "C||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `W`: BVS (branch on overflow set)
      // PC = address if V is 1
      // Addressing:  rel 
      // Opcode:      70
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "V&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `X`: BEQ (branch if equal)
      // PC = address if Z is 0
      // Addressing:  rel 
      // Opcode:      F0
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "Z&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      // `Y`: BNE (branch if not equal)
      // PC = address if Z is 1
      // Addressing:  rel 
      // Opcode:      D0
      // Cycles:      2**
      // Cycles addr: 0
      // Cycles opc:  0**
      + "Z||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // `Z`: CLV (clear overflow flag)
      // V is set to 0
      // Addressing:  imp
      // Opcode:      B8
      // Cycles:      2
      // Cycles addr: 0
      // Cycles opc:  0
      + "V=0;"
      
      // `[`: NOP (no operation)
      // Addressing: imp
      // Opcode:     EA
      // Cycles:     2
      // Cycles addr: 0
      // Cycles opc:  0
      + ""
      
    // Make an array from this string
    ).split`;`
    
    // Fetch the right instruction for the current opcode (ignore every illegal opcode where o % 4 == 3):
    [
      `UE#UE#GEBUE#=E#UE#1E#UE#C6%)6%I6$)6%<6%D6%D6%C6%J@'J@'F@&:@'>@'J@'4@'J@'T90T90H9*:90W90T90290T90QMNQMN-NSQMNVMNQMNRMKQMN/5?/5?L5P/5?;5?/5?Z5O/5?"7A"7A.7("7AY7A"7A37A"7A!8+!8+,8[!8+X8+!8+ 8+!8+`[o - (o >> 2)].charCodeAt() - 32
    ]
  )
}

// Emulation
// ---------

// Execute the next opcode, at the address pointed by the PC register
// If an interrupt (v) is specified, it's executed instead
myop = v => (

  // Reset the cycle counter
  c = 0,
  
  // Fetch opcode (costs 1 cycle), save it in o, increment PC
  o = r(PC),
  
  // Fetch the byte after the opcode (costs 1 cycle), save its address in a and its value in p
  p = r(a = PC+1),
  
  // Execute an interrupt if v is set
  v ? (
  
    // 1: NMI:
    // Only if VBlank is enabled (byte 7 of PPU register $2000),
    // Push PC and P with B flag set to 0, then set I to 1,
    // then jump to address stored at $FFFA-$FFFB
    // This costs 7 cycles (or 2 if skipped)
    
    // 2: Reset:
    // Push PC and P with B flag set to 0, then set I to 1 and reset PPU (not shown here),
    // then jump to address stored at $FFFC-$FFFD
    // This costs 8 cycles
    
    // 3: IRQ:
    //push PC and P with B flag set to 0, then set I to 1,
    // Then jump to address stored at $FFFE-$FFFF
    // This costs 7 cycles
    
    (v > 1 || r(0x2000) >> 7)
    &&
    (
      (
        (v == 2) 
        ? (S = (S-3) & 255) 
        : (push(PC >> 8), push(255 & PC), push(239 & P) )
      ),
      
      I = 1,
      PC = r(65528 + v * 2) + 256 * r(65528 + v * 2 + 1)
    )
  )
  
  // Execute the instruction at the address pointed by PC
  : (
    O[o](),
    PC++
  ),
  
  // Update status register using flags values
  P = C + Z*2 + I*4 + D*8 + B*16 + 32 + V*64 + N*128
)