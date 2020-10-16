var Controller = function() {
  this.state = new Array(8);
  for (var i = 0; i < this.state.length; i++) {
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
  buttonDown: function(key) {
    this.state[key] = 0x41;
  },

  buttonUp: function(key) {
    this.state[key] = 0x40;
  }
};


joy1Read = function() {
  var ret;

  switch (NES.mmap.joy1StrobeState) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      ret = NES.controllers[1].state[NES.mmap.joy1StrobeState];
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

  NES.mmap.joy1StrobeState++;
  if (NES.mmap.joy1StrobeState === 24) {
    NES.mmap.joy1StrobeState = 0;
  }

  return ret;
},

joy2Read = function() {
  var ret;

  switch (NES.mmap.joy2StrobeState) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      ret = NES.controllers[2].state[NES.mmap.joy2StrobeState];
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

  NES.mmap.joy2StrobeState++;
  if (NES.mmap.joy2StrobeState === 24) {
    NES.mmap.joy2StrobeState = 0;
  }

  return ret;
}
