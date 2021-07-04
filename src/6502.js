// mini 6502 CPU simulator
// =======================

// Globals
// -------

// Registers
A =           // accumulator
X =           // X
Y =           // Y
S = 0,        // stack pointer (also called SP)
PC = 0x8000,  // program counter (address of next instruction)
P = 0x24,     // status register (flags on bytes 0-7: C=0, Z=0, I=1, D=0, B=0, 1, V=0, N=0)

// Other globals
t =          // temp var
o =          // opcode value
a =          // operand address
p =          // operand value
c = 0,       // cycle counter

// Helpers
// -------

// Read/write a byte in memory. Costs 1 cycle
// These functions handle mirrors, persistent save slots, and Mapper-specific features like bank switches
r = v => (c++, memory_read(v)),
w = (v, w) => (c++, memory_write(v, w)),

// Update N and Z status flags:
// - The value v is clamped on 8 bits and returned
// - The Zero flag (bit 1 of P) is set if v is zero, otherwise it's cleared
// - The Negative flag (bit 7 of P) is set if byte 7 of v is 1, otherwise it's cleared
F = v => (
  Z = (v &= 255) < 1,
  N = v >> 7,
  v
),

// Update the flags values according to the status register P
f = v => (
  C = v & 1,
  Z = (v>>1) & 1,
  I = (v>>2) & 1,
  D = (v>>3) & 1,
  B = (v>>4) & 1,
  V = (v>>6) & 1,
  N = v>>7
),

// Set all flags on load
f(P = 0x24),

// Push on Stack
// Write at address $100 + S, decrement S, wrap it between $00 and $FF
h = v => (
  w(256 + S--, v),
  S &= 255
),

// Pull from stack
// Increment S, wrap it between $00 and $FF, read at address $100 + S
g = v => r(256 + (S = (255 & (S+1)))),

// Instructions
// ============

// The code below creates a function for each valid opcode supported by the CPU.
// When a function is called:
// - PC represents the current opcode's address
// - o is the opcode's value
// - a equals PC+1
// - p is the value stored at the address PC+1
// - c (the cycle counter) equals 2 because two memory reads have already been done (o and p)
O = [...Array(255)].map((t,o) =>
  Function(

    (

      // Addressing modes
      // ----------------

      // Some opcodes require an address in memory
      // This address can be computed in 11 different ways
      // The 10 main ones are implemented here, the 11th is included in the last instruction (JMP ind)
      // The order and implementations below are optimized for a better gzip compression

      // "0": Immediate:
      // The target address is PC+1, already stored in a
      // Opcode size: 2 bytes
      // Cycles total: 2
      // Cycles addr.: -1 (1 cycle is removed because the first p fetch is redundant, the instruction has to read it again)
      // Cycles opc. : 1
      "c--,PC++;"

      // "1": Relative:
      // (only used for branching)
      // The target address (between PC-128 and PC+127) = PC + signed offset stored in p
      // Opcode size: 2 bytes
      // Cycles total: 2 (no branch) / 3 (branch on same page) / 4 (branch on another page)
      // Cycles addr.: 0
      // Cycles opc. : 0-2
      + "a=a+p-256*(p>>7),PC++;"

      // "2": Indexed indirect X
      // The target address is absolute and stored at a zero page address which is stored at PC + 1 + X
      // Opcode size: 2 bytes
      // Cycles total: 6 (read or write)
      // Cycles addr.: 3
      // Cycles opc. : 1
      + "a=r(p+X&255)+256*r(p+X+1&255),PC++,c++;"

      // "3": Indirect indexed Y
      // The target address is absolute and stored at a zero page address which is stored at PC+1, then Y is added to it
      // Opcode size: 2 bytes
      // Cycles total: 5* (read) / 6 (write)
      // Cycles addr.: 2-3
      // Cycles opc. : 0-1
      // * Cross-page read (if address and address + Y are on different pages) costs 1 extra cycle
      + "a=r(p)+256*r(p+1&255)+Y,c+=a-Y>>8<a>>8||o>>4==9,PC++;"

      // "4": Zero page X
      // The target address is equal to zero page address (stored at PC+1) + X, wrapping between $00 and $FF
      // Opcode size: 2 bytes
      // Cycles total: 3 (BIT) / 4 (read or write) / 6 (read + write)
      // Cycles addr.: 1
      // Cycles opc. : 0-2
      + "a=r(a)+X&255,PC++;"

      // "5": Zero page Y
      // The target address is equal to zero page address (stored at PC+1) + Y, wrapping between $00 and $FF
      // Opcode size: 2 bytes
      // Cycles total: 4 (read or write)
      // Cycles addr.: 1
      // Cycles opc. : 1
      + "a=r(a)+Y&255,PC++;"

      // "6": Zero page
      // The target address (between $00 and $FF) is stored in p
      // Opcode size: 2 bytes
      // Cycles total: 3 (read or write) / 5 (read + write)
      // Cycles addr.: 0
      // Cycles opc. : 1-3
      + "a=p,PC++;"

      // "7": Absolute
      // The target address is stored at PC+1 (low byte) and PC+2 (high byte)
      // Opcode size: 3 bytes
      // Cycles total: 3 (JMP) / 4 (read or write) / 6 (read + write or JSR)
      // Cycles addr.: 1
      // Cycles opc. : 0-3
      + "a=p+256*r(PC+=2);"

      // "8": Absolute Y
      // The target address is equal to absolute address (stored at PC+1 and PC+2) + Y
      // Opcode size: 3 bytes
      // Cycles total: 4* (read) / 5 (write)
      // Cycles addr.: 1-2
      // Cycles opc. : 0-2
      // * Cross-page read (if address and address + Y are on different pages) costs 1 extra cycle
      + "t=p+256*r(PC+=2),c+=t>>8<t+Y>>8||o>>4==9,a=t+Y;"

      // "9": Absolute X
      // The target address is equal to absolute address (stored at PC+1 and PC+2) + X
      // Opcode size: 3 bytes
      // Cycles total: 4* (read) / 5 (write) / 7 (read + write)
      // Cycles addr.: 1-2
      // Cycles opc. : 0-4
      // * Cross-page read (if address and address + X are on different pages) costs 1 extra cycle
      + "t=p+256*r(PC+=2),c+=t>>8<t+X>>8||o>>4==9||(15&o)>13,a=t+X"

      // "Z": implicit or Accumulator
      // The target is either a flag or a CPU register (no need to compute an address)
      // (When a "Z" is read, the generated JavaScript code will just contain "undefined;")
      // Opcode size: 1 byte (no need to increment PC)
      // Cycles total: 2-7
      // Cycles addr.: 0
      // Cycles opc. : 0-5
      + ""

    // Make an array from this string
    ).split(";")

    // Fetch the right addressing mode for the current opcode (ignore illegal opcode where o % 4 == 3):
    // (The string below is optomized for compression: the illegal opcodes are assigned characters that create extra repetitions)
    [
      (
         "020666Z0Z77713Z444Z8Z999"
        +"720666Z0Z77713Z444Z8Z999"
        +"Z20666Z0Z77713Z444Z8Z999"
        +"Z20666Z0Z77713Z444Z8Z999"
        +"020666Z0Z77713Z445Z8Z998"
        +"020666Z0Z77713Z445Z8Z998"
        +"020666Z0Z77713Z444Z8Z999"
        +"020666Z0Z77713Z444Z8Z999"
      )[o-(o>>2)]
    ]

    // Separator
    + ";"

    // Instructions
    // ------------

    // There are 56 official instructions, performing operations in memory and/or in the registers
    // Some instructions use extra cycles:
    // *  : cross-page when fetching the address costs 1 extra cycle
    // ** : Same-page branch (PC+2>>8 == a>>8) costs 1 extra cycle. Cross-page branch costs 2 extra cycles
    // ***: Instructions that read, modify and write a value in memory (+ JSR/RTI/RTS/PLA/PLP) cost 1 to 2 extra cycles
    // The order and implementations below are also optimized for a better gzip compression
    // Also, some instructions were splitted in two if they target either the memory or the Accumulator register (ROR, ROL, LSR, ASL)

    + (
    
      // " ": TXS (transfer X to stack pointer)
      // Stack pointer = X
      // Addressing:   imp
      // Opcode:       9A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      "S=X;"
      
      // "!": CPX (compare memory and X)
      // N, Z and C are set with the result of X minus a byte in memory
      // Flag C is set if there's no borrow
      // Addressings:  imm, zpg, abs
      // Opcodes:      E0,  E4,  EC
      // Cycles total: 2,   3,   4
      // Cycles addr.: -1,  0,   1
      // Cycles opc. : 1,   1,   1
      + "p=r(a),C=X-p>=0,F(X-p);"

      // '"': CPY (compare memory and Y)
      // N, Z and C are set with the result of Y minus a byte in memory
      // Flag C is set if there's no borrow
      // Addressings:  imm, zpg, abs
      // Opcodes:      C0,  C4,  CC
      // Cycles total: 2,   3,   4
      // Cycles addr.: -1,  0,   1
      // Cycles opc. : 1,   1,   1
      + "p=r(a),C=Y-p>=0,F(Y-p);"

      // "#": ASL (shift left)
      // A byte in memory is left shifted. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      06,  16,   0E,  1E
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "p=r(a),C=p>>7,w(a,F(2*p)),c++;"

      // "$": ROL A (rotate left accumulator)
      // Rotate left A. Same as left shift but C flag is put into bit 0. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressing:   A
      // Opcode:       2A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=A>>7,A=F(2*A+(1&P));"

      // "%": ROL (rotate left)
      // Rotate left a byte in memory. Same as left shift but C flag is put into bit 0. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      26,  36,   2E,  3E
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "p=r(a),C=p>>7,w(a,F(2*p+(1&P))),c++;"

      // "&": LSR A (shift right accumulator)
      // A is shifted right. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressing:   A
      // Opcode:       4A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=1&A,A=F(A>>1);"

      // "'": LSR (shift right)
      // A or a byte in memory is shifted right. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      46,  56,   4E,  5E
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "p=r(a),C=1&p,w(a,F(p>>1)),c++;"

      // "(": DEX (decrement X)
      // X is decremented. Flags: N, Z
      // Addressing:   imp
      // Opcode:       CA
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "X=F(X-1);"

      // ")": BIT (test bits in memory)
      // N and V = bits 7 and 6 of operand. Z is set if operand AND A is not zero. Flags: N, Z, V
      // Addressings:  zpg, abs
      // Opcodes:      24,   2C
      // Cycles total: 3,    4
      // Cycles addr.: 0,    1
      // Cycles opc. : 1,    1
      + "p=r(a),F(p&A),N=p>>7&1,V=p>>6&1;"

      // "*": ROR A (rotate right accumulator)
      // Rotate right A or a byte in memory. Same as left shift but C flag is put into bit 7. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressing:   A
      // Opcode:       6A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=1&A,A=F((A>>1)+128*(1&P));"

      // "+": INC (increment memory)
      // A byte in memory is incremented. Flags: N, Z
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      E6,  F6,   EE,  FE
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "w(a,F(r(a)+1)),c++;"

      // ",": INX (increment X)
      // X is incremented. Flags: N, Z
      // Addressing:   imp
      // Opcode:       E8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "X=F(X+1);"

      // "-": DEY (decrement Y)
      // Y is decremented. Flags: N, Z
      // Addressing:   imp
      // Opcode:       88
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "Y=F(Y-1);"

      // ".": INY (increment Y)
      // Y is incremented. Flags: N, Z
      // Addressing:   imp
      // Opcode:       C8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "Y=F(Y+1);"

      // "/": LDY (load Y with memory)
      // Y = a byte from memory. Flags: N, Z
      // Addressings:  imm, zpg, zpgX, abs, absX
      // Opcodes:      A0,  A4,  B4,   AC,  BC
      // Cycles total: 2,   3,   4,    4,   4*
      // Cycles addr.: -1,  0,   1,    1,   1*
      // Cycles opc. : 1,   1,   1,    1,   1
      + "Y=F(r(a));"

      // 0: ROR (rotate right)
      // Rotate right a byte in memory. Same as left shift but C flag is put into bit 7. Flags: N, Z, C
      // The shifted-out bit 0 is saved in C
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      66,  76,   6E,  7E
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "p=r(a),C=1&p,w(a,F((p>>1)+128*(1&P))),c++;"

      // "1": CLC (clear carry flag)
      // C is set to 0
      // Addressing:   imp
      // Opcode:       18
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=0;"

      // "2": SEI  (set interrupt disable flag)
      // I is set to 1
      // Addressing:   imp
      // Opcode:       78
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "I=1;"

      // "3": CLD (clear decimal flag)
      // D is set to 0
      // Addressing:   imp
      // Opcode:       D8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "D=0;"

      // "4": CLI (clear interrupt disable flag)
      // I is set to 0
      // Addressing:   imp
      // Opcode:       58
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "I=0;"

      // "5": LDA (load accumulator with memory)
      // A = a byte from memory. Flags: N, Z
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      A9,  A5,  B5,   AD,  BD,   B9,   A1,   B1
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a));"

      // "6": AND: (AND memory and accumulator)
      // A = A AND a byte in memory. Flags: N, Z
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      29,  25,  35,   2D,  3D,   39,   21,   31
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)&A);"
      
      // "7": CMP (compare memory and accumulator)
      // N, Z and C are set with the result of A - a byte in memory
      // Flag C is set if there's no borrow
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      C9,  C5,  D5,   CD,  DD,   D9,   C1,   D1
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),C=A-p>=0,F(A-p);"

      // "8": SBC (subtract from accumulator with carry)
      // A = A - a byte from memory - (1 - Carry). Flags: N, Z, C, V
      // Flag C is set if there's no borrow
      // Flag V is set if the subtraction is incorrectly considered positive
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      E9,  E5,  F5,   ED,  FD,   F9,   E1,   F1
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),t=A+C-1-p,V=!!(128&(A^p))&&!!(128&(A^t)),C=t>=0,A=F(t);"

      // "9": ADC (add to accumulator with carry)
      // A = A + a byte in memory + Carry. Flags: N, Z, C, V
      // Flag C is set if there's a carry
      // Flag V is set if the sum of two positive numbers is incorrectly considered negative
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      69,  65,  75,   6D,  7D,   79,   61,   71
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "p=r(a),t=A+C+p,V=!(128&(A^p))&&!!(128&(A^t)),C=t>255,A=F(t);"
      
      // ":": BCS (branch on carry set)
      // PC = address if C is 1
      // Addressing:   rel 
      // Opcode:       B0
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "C&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // ";": BMI (branch on minus)
      // PC = address if N is 1
      // Addressing:   rel 
      // Opcode:       30
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "N&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "<": BEQ (branch if equal)
      // PC = address if Z is 0
      // Addressing:   rel 
      // Opcode:       F0
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "Z&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "=": BPL (branch on plus)
      // PC = address if N is 0
      // Addressing:   rel 
      // Opcode:       10
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "N||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // ">": BVS (branch on overflow set)
      // PC = address if V is 1
      // Addressing:   rel 
      // Opcode:       70
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "V&&(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "?": BNE (branch if not equal)
      // PC = address if Z is 1
      // Addressing:   rel 
      // Opcode:       D0
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "Z||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "@": BVC (branch on overflow clear)
      // PC = address if V is 0
      // Addressing:   rel 
      // Opcode:       50
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "V||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "A": LDX (load X with memory)
      // X = a byte from memory. Flags: N, Z
      // Addressings:  imm, zpg, zpgY, abs, absY
      // Opcodes:      A2,  A6,  B6,   AE,  BE
      // Cycles total: 2,   3,   4,    4,   4*
      // Cycles addr.: -1,  0,   1,    1,   1*
      // Cycles opc. : 1,   1,   1,    1,   1
      + "X=F(r(a));"
      
      // "B": EOR (exclusive-or memory and accumulator)
      // A = A XOR a byte in memory. Flags: N, Z
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      49,  45,  55,   4D,  5D,   59,   41,   51
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)^A);"
      
      // "C": DEC (decrement memory)
      // A byte in memory is decremented. Flags: N, Z
      // Addressings:  zpg, zpgX, abs, absX
      // Opcodes:      C6,  D6,   CE,  DE
      // Cycles total: 5,   6,    6,   7
      // Cycles addr.: 0,   1,    1,   2
      // Cycles opc. : 3,   3,    3,   3 (***)
      + "w(a,F((r(a)-1)&255)),c++;"
      
      // "D": ASL A (shift left accumulator)
      // A is left shifted. Flags: N, Z, C
      // The shifted-out bit 7 is saved in C
      // Addressing:   A
      // Opcode:       0A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=A>>7,A=F(2*A);"
      
      // "E": JSR (jump to subroutine)
      // Push PC + 2, PC = absolute address
      // Addressing:   abs
      // Opcode:       20
      // Cycles total: 6
      // Cycles addr.: 1
      // Cycles opc. : 3 (***)
      + "h(PC>>8),h(255&PC),PC=a-1,c++;"
      
      // "F": SEC (set carry flag)
      // C is set to 1
      // Addressing:   imp
      // Opcode:       38
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "C=1;"
      
      // "G": SED (set decomal flag)
      // D is set to 1
      // Addressing:   imp
      // Opcode:       F8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "D=1;"
      
      // "H": CLV (clear overflow flag)
      // V is set to 0
      // Addressing:   imp
      // Opcode:       B8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "V=0;"
      
      // "I": ORA (OR memory and accumulator)
      // A = A OR a byte in memory. Flags: N, Z. 
      // Addressings:  imm, zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      09,  05,  15,   0D,  1D,   19,   01,   11
      // Cycles total: 2,   3,   4,    4,   4*,   4*,   6,    5*
      // Cycles addr.: -1,  0,   1,    1,   1*,   1*    3,    3*
      // Cycles opc. : 1,   1,   1,    1,   1,    1,    1,    1
      + "A=F(r(a)|A);"
      
      // "J": PHA (push accumulator)
      // Push A
      // Addressing:   imp
      // Opcode:       48
      // Cycles total: 3
      // Cycles addr.: 0
      // Cycles opc. : 1
      + "h(A);"
      
      // "K": PHP (push processor status)
      // Push P with B flag set to 1
      // Addressing:   imp
      // Opcode:       08
      // Cycles total: 3
      // Cycles addr.: 0
      // Cycles opc. : 1
      + "h(P|16);"
      
      // A=F(g()),c++
      // "L": PLA (pull accumulator)
      // Pull A. Flags: N, Z.
      // Addressing:   imp
      // Opcode:       68
      // Cycles total: 4 (*** 1 extra cycle according to nestest)
      // Cycles addr.: 0
      // Cycles opc. : 1
      + "A=F(g()),c++;"
      
      // "M": PLP (pull processor status)
      // Pull P and set all flags
      // (According to nestest, the B flag stays at 0) 
      // Addressing:   imp
      // Opcode:       28
      // Cycles total: 4 (*** 1 extra cycle according to nestest)
      // Cycles addr.: 0
      // Cycles opc. : 1
      + "f(g()&239),c++;"
      
      // "N": RTI (return from interrupt)
      // Pull P, set all flags, pull PC
      // Addressing:   imp
      // Opcode:       40
      // Cycles total: 6
      // Cycles addr.: 0
      // Cycles opc. : 4 (***)
      + "f(g()),PC=g()+256*g()-1,c++;"
      
      // "O": BCC (branch on carry clear)
      // PC = address if C is 0
      // Addressing:   rel 
      // Opcode:       90
      // Cycles total: 2**
      // Cycles addr.: 0
      // Cycles opc. : 0**
      + "C||(c+=1+(a>>8!=PC+1>>8),PC=a);"
      
      // "P": BRK (force break)
      // Interrupt, push PC+2 (PC+1 is a padding byte), push P with B flag set to 1, set I to 1
      // This is equivalent to an IRQ interrupt with another value of P pushed on the stack:
      // "h(PC>>8),h(255&PC),h(P|16),I=1,PC=r(65534)+256*r(65535)-1;"
      // Addressing:   imp
      // Opcode:       00
      // Cycles total: 7
      // Cycles addr.: 0
      // Cycles opc. : 5
      //+ 
      + "op(3,1);"
      
      // "Q": TAY (transfer accumulator to Y)
      // Y = A. Flags: N, Z
      // Addressing:   imp
      // Opcode:       A8
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "Y=F(A);"
      
      // "R": STA (store accumulator)
      // A is copied in memory
      // Addressings:  zpg, zpgX, abs, absX, absY, indX, indY
      // Opcodes:      85,  95,   8D,  9D,   99,   81,   91
      // Cycles total: 3,   4,    4,   5,    5,    6,    6
      // Cycles addr.: 0,   1,    1,   2,    2     3,    2
      // Cycles opc. : 1,   1,    1,   1,    1,    1,    1
      + "w(a,A);"
      
      // "S": STX (store X)
      // X is copied in memory
      // Addressings:  zpg, zpgY, abs
      // Opcodes:      86,  96,   8E
      // Cycles total: 3,   4,    4
      // Cycles addr.: 0,   1,    1
      // Cycles opc. : 1,   1,    1
      + "w(a,X);"
      
      // "T": TSX (transfer stack pointer to X)
      // X = S. Flags: N, Z
      // Addressing:   imp
      // Opcode:       BA
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "X=F(S);"
      
      // "U": TAX (transfer accumulator to X)
      // X = A. Flags: N, Z
      // Addressing:   imp
      // Opcode:       AA
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "X=F(A);"
      
      // "V": STY (store Y)
      // Y is copied in memory
      // Addressings:  zpg, zpgX, abs
      // Opcodes:      84,  94,   8C
      // Cycles total: 3,   4,    4
      // Cycles addr.: 0,   1,    1
      // Cycles opc. : 1,   1,    1
      + "w(a,Y);"
      
      // "W": TYA (transfer Y to accumulator)
      // A = Y. Flags: N, Z
      // Addressing:   imp
      // Opcode:       98
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "A=F(Y);"
      
      // "X": TXA (transfer X to accumulator)
      // A = X. Flags: N, Z
      // Addressing:   imp
      // Opcode:       8A
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + "A=F(X);"
      
      // "Y": RTS (return from subroutine)
      // Pull and increment PC
      // Addressing:   imp
      // Opcode:       60
      // Cycles total: 6
      // Cycles addr.: 0
      // Cycles opc. : 0 (***)
      + "PC=g()+256*g(c+=2);"
      
      // "Z": JMP (jump to new location)
      // Set a new value to PC
      // Addressings:  abs
      // Opcodes:      4C
      // Cycles total: 3
      // Cycles addr.: 1
      // Cycles opc. : 0
      + "PC=a-1;"
      
      // "[" JMP indirect
      // Jump to an address stored anywhere in memory. The address of this address is stored after the opcode
      // Hardware bug: if the indirect address falls on a page boundary ($xxFF), it will wrap and fetch the low byte in the same page ($xx00)
      // Addressing:   ind
      // Opcodes:      6C
      // Cycles total: 5
      // Cycles addr.: 3
      // Cycles opc. : 2
      + "PC=r(a)+256*r(a+1-256*((a&255)==255))-1"

      // "z": NOP (no operation)
      // (When a "z" is read, the generated JavaScript code will just contain "undefined;")
      // Addressing:   imp
      // Opcode:       EA
      // Cycles total: 2
      // Cycles addr.: 0
      // Cycles opc. : 0
      + ""

    // Make an array from this string
    ).split(";")

    // Fetch the right instruction for the current opcode (ignore every illegal opcode where o % 4 == 3):
    // (The string below is optomized for compression: all the illegal opcodes are assigned characters that allow extra repetition)
    [
       (
         `PI#PI#KIDPI#=I#PI#1IDPI#`
        +`E6%)6%M6$)6%;6%E6%F6%E6%`
        +`NB'NB'JB&ZB'@B'NB'4B'NB'`
        +`Y90Y90L9*[90>90Y90290Y90`
        +`VRSVRS-zXVRSORSVRSWR VRS`
        +`/5A/5AQ5U/5A:5A/5AH5T/5A`
        +`"7C"7C.7("7C?7C"7C37C"7C`
        +`!8+!8+,8z!8+<8+!8+G8+!8+`
      )[o - (o >> 2)].charCodeAt() - 32
    ]
  )
);

// Emulation
// ---------

// If an interrupt (v = 1/2/3) is specified, it's executed
// Otherwise, execute the next opcode at the address pointed by the PC register
op = (v, z) => (

  // - Reset cycle counter
  // - Fetch opcode at address PC (costs 1 cycle), save it in o
  // - Increment PC, save it in a
  // - Fetch the byte at address a (costs 1 cycle), save it in p
  c = 0,
  o = r(PC),
  p = r(a = PC+1),

  // Execute an interrupt if v is set
  v ? (

    // 1: NMI:
    // Push PC and P with B flag set to 0, then set I to 1,
    // then jump to address stored at $FFFA-$FFFB
    // This costs 7 cycles
    // On NES, it only works when VBlank is enabled (bit 7 of PPU register $2000 = 1), otherwise it's skipped and only costs 2 cycles

    // 2: Reset:
    // Push PC and P with B flag set to 0, then set I to 1,
    // then jump to address stored at $FFFC-$FFFD
    // This resets c and costs 8 cycles
    // On NES, this also resets the PPU

    // 3: IRQ/BRK:
    // Push PC and P with B flag set to 0 (IRQ) or 1 (BRK), then set I to 1,
    // then jump to address stored at $FFFE-$FFFF
    // This costs 7 cycles

    // Only execute NMI if VBlank (bit 7 of $2000) is set
    (v > 1 || r(0x2000) >> 7)
    
    // Only execute IRQ if I is not set
    && (v < 3 || !I)
    
    && (
      (
        (v - 2) 
        ? (h(PC >> 8), h(255 & PC), h(z ? (P|16) : (239 & P))) // NMI/IRQ/BRK
        : (S = (S-3) & 255) // Reset
      ),

      I = 1,
      PC = r(65528 + v * 2) + 256 * r(65528 + v * 2 + 1)
    )
  )

  // Or execute the next instruction:
  : (
    o && O[o](),
    PC++
  ),

  // Update status register P according to the new flags values
  P = C + Z*2 + I*4 + D*8 + B*16 + 32 + V*64 + N*128
)