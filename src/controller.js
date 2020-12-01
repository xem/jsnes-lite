var Controller = function(){
  this.state = new Array(8);
  for(var i = 0; i < this.state.length; i++){
    this.state[i] = 0x40;
  }
};

Controller.BUTTON_A = 0;
Controller.BUTTON_B = 1;
Controller.BUTTON_SELECT = 2;
Controller.BUTTON_START = 3;
Controller.BUTTON_UP = 4;
Controller.BUTTON_DOWN = 5;
Controller.BUTTON_LEFT = 6;
Controller.BUTTON_RIGHT = 7;

Controller.prototype = {
  keydown: function(key){
    this.state[key] = 0x41;
  },

  keyup: function(key){
    this.state[key] = 0x40;
  }
};


joy1Read = function(){
  var ret;

  switch (Mapper.joy1StrobeState){
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      ret = NES.controllers[1].state[Mapper.joy1StrobeState];
      break;
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
      ret = 0;
      break;
    case 19:
      ret = 1;
      break;
    default:
      ret = 0;
  }

  Mapper.joy1StrobeState++;
  if(Mapper.joy1StrobeState === 24){
    Mapper.joy1StrobeState = 0;
  }

  return ret;
},

joy2Read = function(){
  var ret;

  switch (Mapper.joy2StrobeState){
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      ret = NES.controllers[2].state[Mapper.joy2StrobeState];
      break;
    case 8:
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
      ret = 0;
      break;
    case 19:
      ret = 1;
      break;
    default:
      ret = 0;
  }

  Mapper.joy2StrobeState++;
  if(Mapper.joy2StrobeState === 24){
    Mapper.joy2StrobeState = 0;
  }

  return ret;
}


// From Mapper.s.js
  /*reset: function(){
    this.joy1StrobeState = 0;
    this.joy2StrobeState = 0;
    this.joypadLastWrite = 0;

    this.zapperFired = false;
    this.zapperX = null;
    this.zapperY = null;
  },*/
  
  
/*NES.zapperMove: function(x, y){
  if(!NES.mmap) return;
  Mapper.zapperX = x;
  Mapper.zapperY = y;
},

NES.zapperFireDown: function(){
  if(!NES.mmap) return;
  Mapper.zapperFired = true;
},

NES.zapperFireUp: function(){
  if(!NES.mmap) return;
  Mapper.zapperFired = false;
},*/

