var Tile = function(){
  // Tile data:
  this.pix = new Array(64);

  this.fbIndex = null;
  this.x = null;
  this.y = null;
  this.w = null;
  this.h = null;
  this.incX = null;
  this.incY = null;
  this.palIndex = null;
  this.tpri = null;
  this.c = null;
};

Tile.prototype = {

  render: function(
    buffer,
    srcx1,
    srcy1,
    srcx2,
    srcy2,
    dx,
    dy,
    palAdd,
    palette,
    flipHorizontal,
    flipVertical,
    pri,
    priTable
  ){
    if(dx < -7 || dx >= 256 || dy < -7 || dy >= 240){
      return;
    }

    this.w = srcx2 - srcx1;
    this.h = srcy2 - srcy1;

    if(dx < 0){
      srcx1 -= dx;
    }
    if(dx + srcx2 >= 256){
      srcx2 = 256 - dx;
    }

    if(dy < 0){
      srcy1 -= dy;
    }
    if(dy + srcy2 >= 240){
      srcy2 = 240 - dy;
    }

    if(!flipHorizontal && !flipVertical){
      this.fbIndex = (dy << 8) + dx;
      this.tIndex = 0;
      for(this.y = 0; this.y < 8; this.y++){
        for(this.x = 0; this.x < 8; this.x++){
          if(
            this.x >= srcx1 &&
            this.x < srcx2 &&
            this.y >= srcy1 &&
            this.y < srcy2
          ){
            this.palIndex = this.pix[this.tIndex];
            this.tpri = priTable[this.fbIndex];
            if(this.palIndex !== 0 && pri <= (this.tpri & 0xff)){
              //console.log("Rendering upright tile to buffer");
              buffer[this.fbIndex] = palette[this.palIndex + palAdd];
              this.tpri = (this.tpri & 0xf00) | pri;
              priTable[this.fbIndex] = this.tpri;
            }
          }
          this.fbIndex++;
          this.tIndex++;
        }
        this.fbIndex -= 8;
        this.fbIndex += 256;
      }
    } else if(flipHorizontal && !flipVertical){
      this.fbIndex = (dy << 8) + dx;
      this.tIndex = 7;
      for(this.y = 0; this.y < 8; this.y++){
        for(this.x = 0; this.x < 8; this.x++){
          if(
            this.x >= srcx1 &&
            this.x < srcx2 &&
            this.y >= srcy1 &&
            this.y < srcy2
          ){
            this.palIndex = this.pix[this.tIndex];
            this.tpri = priTable[this.fbIndex];
            if(this.palIndex !== 0 && pri <= (this.tpri & 0xff)){
              buffer[this.fbIndex] = palette[this.palIndex + palAdd];
              this.tpri = (this.tpri & 0xf00) | pri;
              priTable[this.fbIndex] = this.tpri;
            }
          }
          this.fbIndex++;
          this.tIndex--;
        }
        this.fbIndex -= 8;
        this.fbIndex += 256;
        this.tIndex += 16;
      }
    } else if(flipVertical && !flipHorizontal){
      this.fbIndex = (dy << 8) + dx;
      this.tIndex = 56;
      for(this.y = 0; this.y < 8; this.y++){
        for(this.x = 0; this.x < 8; this.x++){
          if(
            this.x >= srcx1 &&
            this.x < srcx2 &&
            this.y >= srcy1 &&
            this.y < srcy2
          ){
            this.palIndex = this.pix[this.tIndex];
            this.tpri = priTable[this.fbIndex];
            if(this.palIndex !== 0 && pri <= (this.tpri & 0xff)){
              buffer[this.fbIndex] = palette[this.palIndex + palAdd];
              this.tpri = (this.tpri & 0xf00) | pri;
              priTable[this.fbIndex] = this.tpri;
            }
          }
          this.fbIndex++;
          this.tIndex++;
        }
        this.fbIndex -= 8;
        this.fbIndex += 256;
        this.tIndex -= 16;
      }
    } else {
      this.fbIndex = (dy << 8) + dx;
      this.tIndex = 63;
      for(this.y = 0; this.y < 8; this.y++){
        for(this.x = 0; this.x < 8; this.x++){
          if(
            this.x >= srcx1 &&
            this.x < srcx2 &&
            this.y >= srcy1 &&
            this.y < srcy2
          ){
            this.palIndex = this.pix[this.tIndex];
            this.tpri = priTable[this.fbIndex];
            if(this.palIndex !== 0 && pri <= (this.tpri & 0xff)){
              buffer[this.fbIndex] = palette[this.palIndex + palAdd];
              this.tpri = (this.tpri & 0xf00) | pri;
              priTable[this.fbIndex] = this.tpri;
            }
          }
          this.fbIndex++;
          this.tIndex--;
        }
        this.fbIndex -= 8;
        this.fbIndex += 256;
      }
    }
  },

};