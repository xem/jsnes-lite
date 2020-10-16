// Loads a ROM file into the CPU and PPU.
// The ROM file is validated first.
NES.loadROM = data => { 
  // Load ROM file:
  NES.rom = new ROM(NES);
  NES.rom.load(data);

  NES.reset();
  NES.mmap = NES.rom.createMapper();
  NES.mmap.loadROM();
  NES.ppu.setMirroring(NES.rom.getMirroringType());
  NES.romData = data;
};


var ROM = function(nes) {
  this.nes = nes;

  this.mapperName = new Array(92);

  for (var i = 0; i < 92; i++) {
    this.mapperName[i] = "Unknown Mapper";
  }
  this.mapperName[0] = "Direct Access";
};

ROM.prototype = {
  // Mirroring types:
  VERTICAL_MIRRORING: 0,
  HORIZONTAL_MIRRORING: 1,
  FOURSCREEN_MIRRORING: 2,
  SINGLESCREEN_MIRRORING: 3,
  SINGLESCREEN_MIRRORING2: 4,
  SINGLESCREEN_MIRRORING3: 5,
  SINGLESCREEN_MIRRORING4: 6,
  CHRROM_MIRRORING: 7,

  header: null,
  rom: null,
  vrom: null,
  vromTile: null,

  romCount: null,
  vromCount: null,
  mirroring: null,
  batteryRam: null,
  trainer: null,
  fourScreen: null,
  mapperType: null,
  valid: false,

  load: function(data) {
    var i, j, v;

    if (data.indexOf("NES\x1a") === -1) {
      throw new Error("Not a valid NES ROM.");
    }
    this.header = new Array(16);
    for (i = 0; i < 16; i++) {
      this.header[i] = data.charCodeAt(i) & 0xff;
    }
    this.romCount = this.header[4];
    this.vromCount = this.header[5] * 2; // Get the number of 4kB banks, not 8kB
    this.mirroring = (this.header[6] & 1) !== 0 ? 1 : 0;
    this.batteryRam = (this.header[6] & 2) !== 0;
    this.trainer = (this.header[6] & 4) !== 0;
    this.fourScreen = (this.header[6] & 8) !== 0;
    this.mapperType = (this.header[6] >> 4) | (this.header[7] & 0xf0);
    /* TODO
        if (this.batteryRam)
            this.loadBatteryRam();*/
    // Check whether byte 8-15 are zero's:
    var foundError = false;
    for (i = 8; i < 16; i++) {
      if (this.header[i] !== 0) {
        foundError = true;
        break;
      }
    }
    if (foundError) {
      this.mapperType &= 0xf; // Ignore byte 7
    }
    // Load PRG-ROM banks:
    this.rom = new Array(this.romCount);
    var offset = 16;
    for (i = 0; i < this.romCount; i++) {
      this.rom[i] = new Array(16384);
      for (j = 0; j < 16384; j++) {
        if (offset + j >= data.length) {
          break;
        }
        this.rom[i][j] = data.charCodeAt(offset + j) & 0xff;
      }
      offset += 16384;
    }
    // Load CHR-ROM banks:
    this.vrom = new Array(this.vromCount);
    for (i = 0; i < this.vromCount; i++) {
      this.vrom[i] = new Array(4096);
      for (j = 0; j < 4096; j++) {
        if (offset + j >= data.length) {
          break;
        }
        this.vrom[i][j] = data.charCodeAt(offset + j) & 0xff;
      }
      offset += 4096;
    }

    // Create VROM tiles:
    this.vromTile = new Array(this.vromCount);
    for (i = 0; i < this.vromCount; i++) {
      this.vromTile[i] = new Array(256);
      for (j = 0; j < 256; j++) {
        this.vromTile[i][j] = new Tile();
      }
    }

    // Convert CHR-ROM banks to tiles:
    var tileIndex;
    var leftOver;
    for (v = 0; v < this.vromCount; v++) {
      for (i = 0; i < 4096; i++) {
        tileIndex = i >> 4;
        leftOver = i % 16;
        if (leftOver < 8) {
          this.vromTile[v][tileIndex].setScanline(
            leftOver,
            this.vrom[v][i],
            this.vrom[v][i + 8]
          );
        } else {
          this.vromTile[v][tileIndex].setScanline(
            leftOver - 8,
            this.vrom[v][i - 8],
            this.vrom[v][i]
          );
        }
      }
    }

    this.valid = true;
  },

  getMirroringType: function() {
    if (this.fourScreen) {
      return this.FOURSCREEN_MIRRORING;
    }
    if (this.mirroring === 0) {
      return this.HORIZONTAL_MIRRORING;
    }
    return this.VERTICAL_MIRRORING;
  },

  getMapperName: function() {
    if (this.mapperType >= 0 && this.mapperType < this.mapperName.length) {
      return this.mapperName[this.mapperType];
    }
    return "Unknown Mapper, " + this.mapperType;
  },

  mapperSupported: function() {
    return typeof Mappers[this.mapperType] !== "undefined";
  },

  createMapper: function() {
    if (this.mapperSupported()) {
      return new Mappers[this.mapperType](this.nes);
    } else {
      throw new Error(
        "This ROM uses a mapper not supported by JSNES: " +
          this.getMapperName() +
          "(" +
          this.mapperType +
          ")"
      );
    }
  }
};