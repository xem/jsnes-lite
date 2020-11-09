// NES CPU simulator
// =================

// Resources:
// - https://wiki.nesdev.com/w/index.php/CPU_unofficial_opcodes
// - https://wiki.nesdev.com/w/index.php/Status_flags
// - http://wiki.nesdev.com/w/index.php/CPU_interrupts
// - https://wiki.nesdev.com/w/index.php/Stack
// - https://www.masswerk.at/6502/6502_instruction_set.html

// Globals
// -------

// 16kb memory
// Each chunk of 256 bytes in memory is called a page
// Fhe first chunk ($00-$FF) is called Zero page
m = [],

// Registers
A = X = Y = 0, // general purpose
S = 0,       // stack pointer
PC = 0x8000,   // program counter (addres of next instruction)
P = 0x34,      // status register (contains the flags below)

// Flags
C = Z = D = V = N = 0,
I = B = 1,

// Temp vars
t = o = a = p = 0,

// Helpers
// -------

// Read a byte from memory. Costs 1 cycle
// The mapper simulators will handle mirror areas, bank switches, save slot persistence, etc
r = v => {
  ++c;
  return (m[v] = CPU.load(v)) || 0;
},

// Write a byte in memory. Costs 1 cycle.
w = (v, w) => {
  ++c;
  return m[v] = w;
},

// Update N, Z flags
// - the value v is clamped on 8 bits
// - Zero flag (byte 1 of P) is set if v is non-zero, otherwise it's cleared
// - Negative flag (byte 7 of P) is set if byte 7 of v is 1, otherwise it's cleared
// Opcode BIT sets the N flag directly, and doesn't use this function
// Other flags (C, I, D, B, V) are set individually by each concerned opcode
NZ = v => {
  Z = ((v &= 255) > 0);
  N = (v >> 7);
  return v;
},

// Update flags value using status register
f = v => (
  C = P&1,
  Z = (P>>1) & 1,
  I = (P>>2) & 1,
  D = (P>>3) & 1,
  B = (P>>4) & 1,
  V = (P>>6) & 1,
  N = (P>>7) & 1
),

// Push on Stack
// write at address $100 + S, decrement S, wrap it between $00 and $FF
push = v => {
  w(256 + S--, v);
  return S = (255 & S);
},

// Pull from stack
pull = v => {
  return r(256 + (S = (255 & (S+1))))
},

// Addressing modes
// ----------------

// The implementation of the 10 main addressing modes is stored in the string E, separated with spaces
// When executing these, `a` represents the address after the opcode, `p` the value stored at this address, and c = 2
// a is modified to become the target address, c and PC are updated
E = (

// "0": Immediate:
// Keep a and p as-is
// Opcode size: 2 bytes
// Total cycles: 2
// Cycles used to get the address: -1
// (the "-1" cancels the cycle used by the opcode to fetch a value in memory. In immediate mode, this is not necessary)
"c--,PC++ "

// "1": Zero page
// Target address (between $00 and $FF) is stored in p
// Opcode size: 2 bytes
// Total cycles: 3 (read or write) / 5 (read + write)
// Cycles used to get the address: 0
+ "a=p,PC++ "

// "2": Relative
// (only used for branching)
// Target address (between PC - 128 and PC + 127) = PC + signed offset stored in p
// Opcode size: 2 bytes
// Total cycles: 2 (no branch) / 3 (branch on same page) / 4 (branch on another page)
// Cycles used to get the address: 0
+ "a=PC+p-256*(p>127)+1 "

// "3": Absolute
// Target address is stored at PC + 1 (low byte) and PC + 2 (high byte)
// Opcode size: 3 bytes
// Total cycles: 3 (JMP) / 4 (read or write) / 6 (read + write or JSR)
// Cycles used to get the address: 1
+ "a=p+256*r(PC+2),PC+=2 "

// "4": Zero page X
// Target address is equal to zero page address (stored at PC + 1) + X, wrapping between $00 and $FF
// Opcode size: 2 bytes
// Total cycles: 3 (BIT) / 4 (read or write) / 6 (read + write)
// Cycles used to get the address: 1
+ "a=r(a)+X&255,PC++ "

// "5": Zero page Y
// Target address is equal to zero page address (stored at PC + 1) + Y, wrapping between $00 and $FF
// Opcode size: 2 bytes
// Total cycles: 4 (read or write)
// Cycles used to get the address: 1
+ "a=r(a)+Y&255,PC++ "

// "6": Absolute X
// Target address is equal to absolute address (stored at PC + 1 and PC + 2) + X
// Opcode size: 3 bytes
// Total cycles: 4* (read) / 5 (write) / 7 (read + write)
// * Cross-page read cost 1 extra cycle
// Opcode 9D writes in memory
// Opcode 1E, 3E, 5E, 7E, DE, FE read and write in memory
// Cycles used to get the address: 1 / 2
+ "t=p+256*r(PC+2),c+=t>>8<t+X>>8||o>>4==9||(15&o)>13,a=t+X,PC+=2 "

// "7": Absolute Y
// Target address is equal to absolute address (stored at PC + 1 and PC + 2) + Y
// Opcode size: 3 bytes
// Total cycles: 4* (read) / 5 (write)
// * Cross-page read cost 1 extra cycle
// Opcode 99 writes in memory
// Cycles used to get the address: 1 / 2
+ "t=p+256*r(PC+2),c+=t>>8<t+Y>>8||o>>4==9,a=t+Y,PC+=2 "

// "8": Indexed indirect X
// Target address is absolute and stored at a zero page address which is stored at PC + 1 + X
// Opcode size: 2 bytes
// Total cycles: 6 (read or write)
// (Zero page wrap doesn't seem to cost an extra cycle)
// Cycles used to get the address: 3
+ "a=r(a+X&255)+256*r(a+X+1&255),c++,PC++ "

// "9": Indirect indexed Y
// Target address is absolute and stored at a zero page address which is stored at PC + 1, then Y is added to it
// Opcode size: 2 bytes
// Total cycles: 5* (read) / 6 (write)
// * Zero page wrap cost 1 extra cycle
// Opcode 91 writes in memory
// Cycles used to get the address: 3 / 4
+ "t=p+256*r(PC+2&255),c+=t>>8<t+Y>>8||o>>4==9,a=t+Y,c++,PC++"

// "Z": implicit or Accumulator
// Keep a and p as-is
// Opcode size: 1 byte
// Total cycles: 2 (edit a flag or register) / 3 (pull/push a register) / 6 (RTI/RTS) / 7 (BRK)
+ " "

// Convert E into an array
).split(" "),

// Instructions
// ------------

// The implementation of the 56 legal instructions is stored in the string F, separated with spaces
// Some opcodes yield extra cycles in certain conditons:
// *  : cross-page when fetching the address costs 1 extra cycle
// ** : Same-page branch costs 1 extra cycle cycles. Cross-page branch costs 2 extra cycles
// ***: Instructions that read, modify and write a value in memory (and JSR/RTI/RTS) cost 1 to 2 extra cycles
F = (

// " ": ASL A / "!": ASL (shift left)
// A or a byte in memory is left shifted. Flags: N, Z, C
// The shifted-out bit 7 is saved in C
// Addressings: A,   zpg, zpgX, abs, absX
// Opcodes:     0A,  06,  16,   0E,  1E
// Cycles:      2,   5,   6,    6,   7
// Cycles addr: 0,   0,   1,    1,   2
// Cycles opc:  0,   3,   3,    3,   3 (***)
"C=A>>7,A=NZ(2*A) "
+ "C=p>>7,w(a,NZ(2*p)),c+=2 "

// """: ROL A / "#": ROL (rotate left)
// Rotate left A or a byte in memory. Same as left shift but C flag is put into bit 0. Flags: N, Z, C
// The shifted-out bit 7 is saved in C
// Addressings: A,   zpg, zpgX, abs, absX
// Opcodes:     2A,  26,  36,   2E,  3E
// Cycles:      2,   5,   6,    6,   7
// Cycles addr: 0,   0,   1,    1,   2
// Cycles opc:  0,   3,   3,    3,   3 (***)
+ "C=A>>7,A=NZ(2*A+(1&P)) "
+ "C=p>>7,w(a,NZ(2*p+(1&P))),c+=2 "

// "$": LSR A / "%": LSR (shift right)
// A or a byte in memory is shifted right. Flags: N, Z, C
// The shifted-out bit 0 is saved in C
// Addressings: A,   zpg, zpgX, abs, absX
// Opcodes:     4A,  46,  56,   4E,  5E
// Cycles:      2,   5,   6,    6,   7
// Cycles addr: 0,   0,   1,    1,   2
// Cycles opc:  0,   3,   3,    3,   3 (***)
+ "C=1&A,A=NZ(A>>1) "
+ "C=1&p,w(a,NZ(p>>1)),c+=2 "

// "&": ROR A / "'": ROR (rotate right)
// Rotate right A or a byte in memory. Same as left shift but C flag is put into bit 7. Flags: N, Z, C
// The shifted-out bit 0 is saved in C
// Addressings: A,   zpg, zpgX, abs, absX
// Opcodes:     6A,  66,  76,   6E,  7E
// Cycles:      2,   5,   6,    6,   7
// Cycles addr: 0,   0,   1,    1,   2
// Cycles opc:  0,   3,   3,    3,   3 (***)
+ "C=1&A,A=NZ(A>>1+128*(1&P)) "
+ "C=1&p,w(a,NZ(p>>1+128*(1&P))),c+=2 "

// "(": AND: (AND memory and accumulator)
// A = A AND a byte in memory. Flags: N, Z
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     29,  25,  35,   2D,  3D,   39,   21,   31
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "A=NZ(r(a)&A) "

// ")": BIT (test bits in memory)
// N and V = bits 7 and 6 of operand. Z is set if operand AND A is not zero. Flags: N, Z, V
// Addressings: zpg, abs
// Opcodes:     24,   2C
// Cycles:      3,    4
// Cycles addr: 0,    1
// Cycles opc:  1,    1
+ "p=r(a),NZ(p&A),V=p>>6&1 "

// "*": ADC (add to accumulator with carry)
// A = A + a byte in memory + Carry. Flags: N, Z, C, V
// Flag C is set if there's a carry
// Flag V is set if the sum of two positive numbers is incorrectly considered negative
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     69,  65,  75,   6D,  7D,   79,   61,   71
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "p=r(a),t=A+C+p,V=(!(128&(A^p))&&(128&(A^t))>0),C=t>255,A=NZ(t) "

// "+": SBC (subtract from accumulator with carry)
// A = A - a byte from memory - (1 - Carry). Flags: N, Z, C, V
// Flag C is set if there's no borrow
// Flag V is set if the subtraction is incorrectly considered positive
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     E9,  E5,  F5,   ED,  FD,   F9,   E1,   F1
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "p=r(a),t=A+C-1-p,V=(128&(A^p))>0&&(128&(A^t))>0,C=t>=0,A=NZ(t) "

// ",": BCS (branch on carry set)
// PC = address if C is 1
// Addressing:  rel 
// Opcode:      B0
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "C&&(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "-": BEQ (branch if equal)
// PC = address if Z is 0
// Addressing:  rel 
// Opcode:      F0
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "Z||(c+=1+(a>>8!=PC-2>>8),PC=a) "

// ".": BMI (branch on minus)
// PC = address if N is 1
// Addressing:  rel 
// Opcode:      30
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "N&&(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "/": BVS (branch on overflow set)
// PC = address if V is 1
// Addressing:  rel 
// Opcode:      70
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "V&&(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "0": BCC (branch on carry clear)
// PC = address if C is 0
// Addressing:  rel 
// Opcode:      90
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "C||(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "1": BNE (branch if not equal)
// PC = address if Z is 1
// Addressing:  rel 
// Opcode:      D0
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "Z&&(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "2": BPL (branch on plus)
// PC = address if N is 0
// Addressing:  rel 
// Opcode:      10
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "N||(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "3": BVC (branch on overflow clear)
// PC = address if V is 0
// Addressing:  rel 
// Opcode:      50
// Cycles:      2**
// Cycles addr: 0
// Cycles opc:  0**
+ "V||(c+=1+(a>>8!=PC-2>>8),PC=a) "

// "4": CLC (clear carry flag)
// C is set to 0
// Addressing:  imp
// Opcode:      18
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "C=0 "

// "5": CLD (clear decimal flag)
// D is set to 0
// Addressing:  imp
// Opcode:      D8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "D=0 "

// "6": CLI (clear interrupt disable flag)
// I is set to 0
// Addressing:  imp
// Opcode:      58
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "I=0 "

// "7": CLV (clear overflow flag)
// V is set to 0
// Addressing:  imp
// Opcode:      B8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "V=0 "

// "8": CMP (compare memory and accumulator)
// N, Z and C are set with the result of A - a byte in memory
// Flag C is set if there's no borrow
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     C9,  C5,  D5,   CD,  DD,   D9,   C1,   D1
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "p=r(a),C=A-p>=0,NZ(A-p) "

// "9": CPX (compare memory and X)
// N, Z and C are set with the result of X - a byte in memory
// Flag C is set if there's no borrow
// Addressings: imm, zpg, abs
// Opcodes:     E0,  E4,  EC
// Cycles:      2,   3,   4
// Cycles addr: -1,  0,   1
// Cycles opc:  1,   1,   1
+ "p=r(a),C=X-p>=0,NZ(X-p) "

// ":": CPY (compare memory and Y)
// N, Z and C are set with the result of Y - a byte in memory
// Flag C is set if there's no borrow
// Addressings: imm, zpg, abs
// Opcodes:     C0,  C4,  CC
// Cycles:      2,   3,   4
// Cycles addr: -1,  0,   1
// Cycles opc:  1,   1,   1
+ "p=r(a),C=Y-p>=0,NZ(Y-p) "

// ";": DEC (decrement memory)
// A byte in memory is decremented. Flags: N, Z
// Addressings: zpg, zpgX, abs, absX
// Opcodes:     C6,  D6,   CE,  DE
// Cycles:      5,   6,    6,   7
// Cycles addr: 0,   1,    1,   2
// Cycles opc:  3,   3,    3,   3 (***)
+ "w(a,NZ(r(a)-1)),c++ "

// "<": DEX (decrement X)
// X is decremented. Flags: N, Z
// Addressing:  imp
// Opcode:      CA
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "NZ(--X) "

// "=": DEY (decrement Y)
// Y is decremented. Flags: N, Z
// Addressing:  imp
// Opcode:      88
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "NZ(--Y) "

// ">": INX (increment X)
// X is incremented. Flags: N, Z
// Addressing:  imp
// Opcode:      E8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "NZ(++X) "

// "?": INY (increment Y)
// Y is incremented. Flags: N, Z
// Addressing:  imp
// Opcode:      C8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "NZ(++Y) "

// "@": EOR (exclusive-or memory and accumulator)
// A = A XOR a byte in memory. Flags: N, Z
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     49,  45,  55,   4D,  5D,   59,   41,   51
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "A=NZ(r(a)^A) "

// "A": INC (increment memory)
// A byte in memory is incremented. Flags: N, Z
// Addressings: zpg, zpgX, abs, absX
// Opcodes:     E6,  F6,   EE,  FE
// Cycles:      5,   6,    6,   7
// Cycles addr: 0,   1,    1,   2
// Cycles opc:  3,   3,    3,   3 (***)
+ "w(a,NZ(r(a)+1)),c++ "

// "B": JMP (jump to new location)
// Set a new value to PC
// "JMP indirect" jumps to an address stored anywhere in memory. The address of this address is stored after the opcode
// NB: if the indirect vector falls on a page boundary ($xxFF), it will wrap and fetch the low byte in the same page ($xx00) - this buggy behavior is not implemented here
// Addressings: abs, ind
// Opcodes:     4C,  6C
// Cycles:      3,   5
// Cycles addr: 1,   3
// Cycles opc:  0,   2
+ "o>>4>4&&(a=r(a)+256*r(a+1)),PC=a-1 "

// "C": LDA (load accumulator with memory)
// A = a byte from memory. Flags: N, Z
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     A9,  A5,  B5,   AD,  BD,   B9,   A1,   B1
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "A=NZ(r(a)) "

// "D": LDX (load X with memory)
// X = a byte from memory. Flags: N, Z
// Addressings: imm, zpg, zpgY, abs, absY
// Opcodes:     A2,  A6,  B6,   AE,  BE
// Cycles:      2,   3,   4,    4,   4*
// Cycles addr: -1,  0,   1,    1,   1*
// Cycles opc:  1,   1,   1,    1,   1
+ "X=NZ(r(a)) "

// "E": LDY (load Y with memory)
// Y = a byte from memory. Flags: N, Z
// Addressings: imm, zpg, zpgX, abs, absX
// Opcodes:     A0,  A4,  B4,   AC,  BC
// Cycles:      2,   3,   4,    4,   4*
// Cycles addr: -1,  0,   1,    1,   1*
// Cycles opc:  1,   1,   1,    1,   1
+ "Y=NZ(r(a)) "

// "F": ORA (OR memory and accumulator)
// A = A OR a byte in memory. Flags: N, Z. 
// Addressings: imm, zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     09,  05,  15,   0D,  1D,   19,   01,   11
// Cycles:      2,   3,   4,    4,   4*,   4*,   6,    5*
// Cycles addr: -1,  0,   1,    1,   1*,   1*    3,    3*
// Cycles opc:  1,   1,   1,    1,   1,    1,    1,    1
+ "A=NZ(r(a)|A) "

// "G": JSR (jump to subroutine)
// Push PC + 2, PC = absolute address
// Addressing:  abs
// Opcode:      20
// Cycles:      6
// Cycles addr: 1
// Cycles opc:  3 (***)
+ "push(PC>>8),push(255&PC),c++,PC=a-1 "

// "H": PHA (push accumulator)
// Push A
// Addressing:  imp
// Opcode:      48
// Cycles:      3
// Cycles addr: 0
// Cycles opc:  1
+ "push(A) "

// "I": PHP (push processor status)
// Push P with B flag set to 1
// Addressing:  imp
// Opcode:      08
// Cycles:      3
// Cycles addr: 0
// Cycles opc:  1
+ "push(P|16) "

// "J": PLA (pull accumulator)
// Pull A. Flags: N, Z.
// Addressing:  imp
// Opcode:      68
// Cycles:      3
// Cycles addr: 0
// Cycles opc:  1
+ "A=NZ(pull()) "

// "K": PLP (pull processor status)
// Pull P and set all flags
// Addressing:  imp
// Opcode:      28
// Cycles:      3
// Cycles addr: 0
// Cycles opc:  1
+ "f(P=pull()) "

// "L": RTI (return from interrupt)
// Pull P, set all flags, pull PC
// Addressing:  imp
// Opcode:      40
// cycles:      6
// Cycles addr: 0
// Cycles opc:  4 (***)
+ "f(P=pull()),c++,PC=pull()+256*pull()-1 "

// "M": SEC (set carry flag)
// C is set to 1
// Addressing:  imp
// Opcode:      38
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "C=1 "

// "N": SED (set decomal flag)
// D is set to 1
// Addressing:  imp
// Opcode:      F8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "D=1 "

// "O": SEI  (set interrupt disable flag)
// I is set to 1
// Addressing:  imp
// Opcode:      78
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "I=1 "

// "P": STA (store accumulator)
// A is copied in memory
// Addressings: zpg, zpgX, abs, absX, absY, indX, indY
// Opcodes:     85,  95,   8D,  9D,   99,   81,   91
// Cycles:      3,   4,    4,   5,    5,    6,    6
// Cycles addr: 0,   1,    1,   2,    2     3,    2
// Cycles opc:  1,   1,    1,   1,    1,    1,    1
+ "w(a,A) "

// "Q": STX (store X)
// X is copied in memory
// Addressings: zpg, zpgY, abs
// Opcodes:     86,  96,   8E
// Cycles:      3,   4,    4
// Cycles addr: 0,   1,    1
// Cycles opc:  1,   1,    1
+ "w(a,X) "

// "R": STY (store Y)
// Y is copied in memory
// Addressings: zpg, zpgX, abs
// Opcodes:     84,  94,   8C
// Cycles:      3,   4,    4
// Cycles addr: 0,   1,    1
// Cycles opc:  1,   1,    1
+ "w(a,Y) "

// "S": TAX (transfer accumulator to X)
// X = A. Flags: N, Z
// Addressing:  imp
// Opcode:      AA
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "X=NZ(A) "

// "T": TSX (transfer stack pointer to X)
// X = S. Flags: N, Z
// Addressing:  imp
// Opcode:      BA
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "X=NZ(S) "

// "U": TAY (transfer accumulator to Y)
// Y = A. Flags: N, Z
// Addressing:  imp
// Opcode:      A8
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "Y=NZ(A) "

// "V": TXA (transfer X to accumulator)
// A = X. Flags: N, Z
// Addressing:  imp
// Opcode:      8A
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "A=NZ(X) "

// "W": TYA (transfer Y to accumulator)
// A = Y. Flags: N, Z
// Addressing:  imp
// Opcode:      98
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "A=NZ(Y) "

// "X": TXS (transfer X to stack pointer)
// SP = X
// Addressing:  imp
// Opcode:      9A
// Cycles:      2
// Cycles addr: 0
// Cycles opc:  0
+ "S=X "

// "Y": RTS (return from subroutine)
// Pull and increment PC
// Addressing:  imp
// Opcode:      60
// cycles:      6
// Cycles addr: 0
// Cycles opc:  0 (***)
+ "PC=pull()+256*pull(),c+=2 "

// "Z": BRK (force break)
// Interrupt, push PC+2 (PC+1 is a padding byte), push P with B flag set to 1, set I to 1
// Addressing:  imp
// Opcode:      00
// Cycles:      7
// Cycles addr: 0
// Cycles opc:  5
+ "PC++,push(PC>>8),push(255&PC),push(P|16),I=1,PC=r(65534)+256*r(65535)-1"

// "[": NOP (no operation) / illegal opcodes
// Addressing: imp
// Opcode:     EA
// Cycles:     2
// Cycles addr: 0
// Cycles opc:  0
+ " "

// Convert F to an array
).split(" "),

// Emulation
// ---------

// Execute the next opcode, at the address pointed by the PC register
// If an interrupt (v) is specified, it's executed instead
myop = v => {

  //console.log("======== " + m0.value + "========");

  // Reset the cycle counter
  c = 0;
  
  // Fetch opcode (costs 1 cycle), save it in o, increment PC
  o = r(PC);
  //console.log("o = r(PC);");
  
  //(log==9929)&&console.log("PC",PC)
  
  // Fetch the byte after the opcode (costs 1 cycle), save its address in a and its value in p
  p = r(a = PC+1);
  //console.log("p = r(a = PC+1);");
  
  //console.log({c});
  
  // Execute an interrupt if v is set
  if(v){
  
    // v == 1: NMI: if VBlank is enabled (PPU register $2000),
    // Push PC and P with B flag set to 0,  then set I to 1,
    // Then jump to address stored at $FFFA-$FFFB
    // This costs 7 cycles
    
    // v == 2: Reset: jump to address stored at $FFFC-$FFFD, and reset PPU (not shown here)
    // This costs 8 cycles
    
    // v == 3: IRQ: push PC and P with B flag set to 0, then set I to 1,
    // Then jump to address stored at $FFFE-$FFFF
    // This costs 7 cycles
    
    if(v < 2 && (r(0x2000)&128 === 0)){
      return;
    }
    
    PC++;
    push(PC >> 8);
    push(255 & PC);
    push(239 & P);
    I = 1;
    PC = r(65528 + v * 2) + 256 * r(65528 + v * 2 + 1);
  }
  
  // Execute the instruction at the address pointed by PC
  else {
    // Addressing modes:
    // This string represents which mode to use for each valid opcode
    // After execution, `a` contains the target address and `p` contains the value stored at this address
    /*console.log( 
      E [
        "Z8Z111Z0Z33329Z444Z7Z66638Z111Z0Z33329Z444Z7Z666Z8Z111Z0Z33329Z444Z7Z666Z8Z111Z0Z33329Z444Z7Z666080111Z0Z33329Z445Z7Z667080111Z0Z33329Z445Z7Z667080111Z0Z33329Z444Z7Z666080111Z0Z33329Z444Z7Z666"[o - (o >> 2)]
      ]
    );*/
    
    eval(
      E [
        "Z8Z111Z0Z33329Z444Z7Z66638Z111Z0Z33329Z444Z7Z666Z8Z111Z0Z33329Z444Z7Z666Z8Z111Z0Z33329Z444Z7Z666080111Z0Z33329Z445Z7Z667080111Z0Z33329Z445Z7Z667080111Z0Z33329Z444Z7Z666080111Z0Z33329Z444Z7Z666"[o - (o >> 2)]
      ]
    //);
    
    //console.log({c});
    
    // Execute an instruction
    /*console.log(
      F [
        `ZF[[F!IF [F!2F[[F!4F[[F!G([)(#K(")(#.([[(#M([[(#L@[[@%H@$B@%3@[[@%6@[[@%Y*[[*'J*&B*'/*[[*'O*[[*'[P[RPQ=[VRPQ0P[RPQWPX[P[ECDECDUCSECD,C[ECD7CTECD:8[:8;?8<:8;18[[8;58[[8;9+[9+A>+[9+A-+[[+AN+[[+A`[o - (o >> 2)].charCodeAt() - 32
      ]
    );*/
    
    //eval(
    + ';'
    + F [
        `ZF[[F!IF [F!2F[[F!4F[[F!G([)(#K(")(#.([[(#M([[(#L@[[@%H@$B@%3@[[@%6@[[@%Y*[[*'J*&B*'/*[[*'O*[[*'[P[RPQ=[VRPQ0P[RPQWPX[P[ECDECDUCSECD,C[ECD7CTECD:8[:8;?8<:8;18[[8;58[[8;9+[9+A>+[9+A-+[[+AN+[[+A`[o - (o >> 2)].charCodeAt() - 32
      ]
    );
    
    PC++;
    //(log==9928)&&(console.log(PC.toString(16)))    //console.log("PC++;");
  }
  
  // Update status register using flags values
  return P = C + Z*2 + I*4 + D*8 + B*16 + 32 + V*64 + N*128;
}