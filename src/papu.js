// APU
// ===

// Resources:
// - https://www.nesdev.org/apu_ref.txt
// - https://www.emulationonline.com/systems/nes/apu-audio/
// - https://www.nesdev.org/wiki/APU
// - https://www.nesdev.org/wiki/APU_Pulse
// - https://www.nesdev.org/wiki/APU_Triangle
// - https://www.nesdev.org/wiki/APU_Noise
// - https://www.nesdev.org/wiki/APU_DMC
// - https://www.nesdev.org/wiki/APU_basics
// - https://www.nesdev.org/wiki/APU_Envelope
// - https://www.nesdev.org/wiki/APU_Length_Counter
// - https://www.nesdev.org/wiki/APU_Sweep
// - https://www.nesdev.org/2A03%20technical%20reference.txt

// Audio contexts, oscillators, gains
a1 = a2 = a3 = a4 = a5 = 0;
o1 = o2 = o3 = o4 = o5 = 0;
g1 = g2 = g3 = g4 = g5 = 0;

// Status: DMC/frame interrupt + enabled DMC/noise/triangle/pulse 2/pulse 1 channels
apu_status = {I: 0, F:0, P1: 0, P2: 0, T:0, N:0, D:0}

apu_reset = () => {
  if(!a2) a2 = new AudioContext();
  if(!a3) a3 = new AudioContext();
  if(!a4) a4 = new AudioContext();
  if(!a5) a5 = new AudioContext();

  if(o1) o1.stop();
  if(o2) o2.stop();
  if(o3) o3.stop();
  if(o4) o4.stop();
  if(o5) o5.stop();
  
  // Pulse 1
  pulse1timer = 0;
  pulse1volume = 0;
  if(!a1) a1 = new AudioContext();
  o1 = new OscillatorNode(a1, {type: "square", frequency: 0});
  g1 = new GainNode(a1, {gain: 0.1});
  o1.connect(g1).connect(a1.destination);
  o1.start();
  
  // Pulse 2
  pulse2timer = 0;
  pulse2volume = 0;
  if(!a2) a2 = new AudioContext();
  o2 = new OscillatorNode(a2, {type: "square", frequency: 0});
  g2 = new GainNode(a2, {gain: 0.1});
  o2.connect(g2).connect(a2.destination);
  o2.start();

  // Triangle
  triangletimer = 0;
  if(!a3) a3 = new AudioContext();
  o3 = new OscillatorNode(a3, {type: "triangle", frequency: 0});
  g3 = new GainNode(a3, {gain: 0.1});
  o3.connect(g3).connect(a3.destination);
  o3.start();

  // Noise
  noisetimer = 0;
  noisevolume = 0;
  if(!a4) a4 = new AudioContext();
  o4 = new OscillatorNode(a4, {frequency: 0});
  real = new Float32Array(128);
  imag = new Float32Array(128);
  for(var i = 128; i--;){
    real[i] = 3;
    imag[i] = -Math.random()/3;
  }
  wave = a4.createPeriodicWave(real, imag, { disableNormalization: true });
  o4.setPeriodicWave(wave)
  g4 = new GainNode(a4, {gain: 0.003 * 15});
  o4.connect(g4).connect(a4.destination);
  o4.start();
}

// 4015: Status register (read/write)
get_4015 = () => {
  //console.log("get 4015");
  return apu_status.P1 + apu_status.P2 << 1 + apu_status.T << 2 + apu_status.N << 3 + apu_status.D << 4 + apu_status.F <<6 + apu_status.I << 7;
}

set_4015 = (value) => {
  //console.log("set 4015");
  apu_status.P1 = value & 1;
  apu_status.P2 = (value >> 1) & 0b1;
  apu_status.T = (value >> 2) & 0b1;
  apu_status.N = (value >> 3) & 0b1;
  apu_status.D1 = (value >> 4) & 0b1;
}

// 4017: Frame counter
set_4017 = (value) => {
  // Bit 6: IRQ inhibit flag
  // Bit 7: Mode
}

// 4000-4003: Pulse 1
// ==================

set_4000 = (value) => {
  //console.log("set 4000");
  //pulse1duty = value >> 6;
  //pulse1loop = (value >> 5) & 0b1;
  //pulse1constant = (value >> 4) & 0b1;
  pulse1volume = value & 0b1111; // Volume
  g1.gain.value = 0.1 * (pulse1volume/15);
}

set_4001 = (value) => {
  //console.log("set 4001");
  //pulse1enabled = value >> 7;
  //pulse1period = (value >> 4) & 0b111;
  //pulse1negate = (value >> 3) & 0b1;
  //pulse1shift = value & 0b111;
}

set_4002 = (value) => {
  //console.log("set 4002");
  pulse1timer = (pulse1timer & 0b00000000) + value; // Timer low
  o1.frequency.setValueAtTime(pulse1timer < 8 ? 0 : (111860.8/(pulse1timer+1)),1);
}

set_4003 = (value) => {
  //console.log("set 4003");
  //pulse1length = value >> 3;
  pulse1timer = (pulse1timer & 0b00011111111) + ((value & 0b111) << 8); // Timer high
  o1.frequency.setValueAtTime(pulse1timer < 8 ? 0 : (111860.8/(pulse1timer+1)),1);
}

// 4004-4007: Pulse 2
// ==================

set_4004 = (value) => {
  //console.log("set 4004");
  //pulse2duty = value >> 6;
  //pulse2loop = (value >> 5) & 0b1;
  //pulse2constant = (value >> 4) & 0b1;
  pulse2volume = value & 0b1111; // Volume
  g2.gain.value = 0.1 * (pulse2volume/15);
}

set_4005 = (value) => {
  //console.log("set 4005");
  //pulse2enabled = value >> 7;
  //pulse2period = (value >> 4) & 0b111;
  //pulse2negate = (value >> 3) & 0b1;
  //pulse2shift = value & 0b111;
}

set_4006 = (value) => {
  //console.log("set 4006");
  pulse2timer = (pulse2timer & 0b00000000) + value; // Timer low
  o2.frequency.setValueAtTime(pulse2timer < 8 ? 0 : (111860.8/(pulse2timer+1)),1);
}

set_4007 = (value) => {
  //console.log("set 4007");
  //pulse2lengthload = value >> 3;
  pulse2timer = (pulse2timer & 0b00011111111) + ((value & 0b111) << 8); // Timer high
  o2.frequency.setValueAtTime(pulse2timer < 8 ? 0 : (111860.8/(pulse2timer+1)),1);
}

// 4008-400B: Triangle
// ===================

set_4008 = (value) => {
  //console.log("set 4008");
  //trianglecontrol = (value >> 7); // 1: play, 0: mute
  //trianglecounter = value & 0b1111111;
}

set_400a = (value) => {
  //console.log("set 400a");
  triangletimer = (triangletimer & 0b00000000) + value; // Timer low
  o3.frequency.setValueAtTime(55930.4/(triangletimer+1),1);
}

set_400b = (value) => {
  //console.log("set 400b");
  triangletimer = (triangletimer & 0b00011111111) + ((value & 0b111) << 8); // Timer high
  o3.frequency.setValueAtTime(55930.4/(triangletimer+1),1);
}

// 400C-400F: Noise
// ================

set_400c = (value) => {
  console.log("set 400c");
  // ...
  noisevolume = value & 0b1111; // Volume
  g4.gain.value = 0.003 * (noisevolume/15);
}

set_400e = (value) => {
  console.log("set 400e");
  // ...
  noiseperiod = value & 0b1111;
  o4.frequency.setValueAtTime(111860.8/[4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068][noiseperiod],1);
}

set_400f = (value) => {
  console.log("set 400f");
  // ...
}


// DMC

set_4010 = (value) => {
  console.log("set 4010");
}

set_4011 = (value) => {
  console.log("set 4011");
}

set_4012 = (value) => {
  console.log("set 4012");
}

set_4013 = (value) => {
  console.log("set 4013");
}