'use strict';

const oscTypes = ["BasicWaves", "Superwave", "Wavetable", "Harmonic", "KarplusStrong", "Virtual Analog", "Waveshaper", "Two Op FM", "Formant", "Chords", "Speech", "Modal", "Noise", "Bass", "SawX", "Vocoder", "Harm", "WaveUser", "Sample", "Scan Grains", "Cloud Grains", "Hit Grains"];
const chordTypes = ["Oct", "5th", "sus4", "minor", "m7", "m9", "m11", "69", "maj9", "maj7", "Major"];
const oscParams = {
    "BasicWaves": { w: "Morph: Sqr->Saw", t: "Sym/Pulse Width", s: "Sub-Osc Sine" },
    "Superwave": { w: "Wave Select", t: "Detune", s: "Volume" },
    "Wavetable": { w: "Table Select", t: "Cycle Pos", s: "Chorus" },
    "Harmonic": { w: "Table Morph", t: "Sine-Tri Morph", s: "Chorus" },
    "KarplusStrong": { w: "Bow Amount", t: "Strike Pos", s: "Decay" },
    "Virtual Analog": { w: "Detune", t: "Shape (Sqr)", s: "Shape (Saw)" },
    "Waveshaper": { w: "Waveform", t: "Wavefolder", s: "Asymmetry" },
    "Two Op FM": { w: "Ratio", t: "Mod Index", s: "Feedback" },
    "Formant": { w: "Ratio", t: "Formant Freq", s: "Window Shape" },
    "Chords": { w: "Chord Type", t: "Inv/Freq", s: "Waveform" },
    "Speech": { w: "Library", t: "Formant Shift", s: "Word Subset" },
    "Modal": { w: "Inharm", t: "Brightness", s: "Damping" },
    "Noise": { w: "Rate/SampleRed", t: "Noise Type", s: "Filt/Reso" },
    "Bass": { w: "Saturation", t: "Pulse Width", s: "Noise/Sub" },
    "SawX": { w: "Saw Spread", t: "Saw Shape", s: "Chorus" },
    "Vocoder": { w: "Waveform", t: "Timbre", s: "Shape" },
    "Harm": { w: "Spread", t: "Rectification", s: "Noise/Clip" },
    "WaveUser": { w: "Table Select", t: "Cycle Pos", s: "Bitdepth" },
    "Sample": { w: "Start", t: "Length", s: "Loop" },
    "Scan Grains": { w: "Scan Speed", t: "Density", s: "Chaos" },
    "Cloud Grains": { w: "Start Pos", t: "Density", s: "Chaos" },
    "Hit Grains": { w: "Start Pos", t: "Density", s: "Chaos" }
};
const lfoShapes = ["Sine", "Triangle", "Saw", "Square", "S&H (Random)", "S&H Smooth"];
const lfoSyncRates = ["8 bars", "4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16"];
const modSources = ["CycEnv", "Envelope", "LFO", "Pressure", "Key/Arp"];
const fixedDests = ["Pitch", "Wave", "Timbre", "Cutoff"];
const assignTargets = ["LFO Rate", "Reso", "Env Dec", "Env Sus", "Cyc Rise", "Cyc Fall", "Cyc Hold", "Cyc Amt", "Glide", "Osc Shape", "Spread", "Unispread", "Arp Rate"];

const styleEngines = {
    "bass": ["Bass", "SawX", "Virtual Analog", "BasicWaves", "Superwave", "Harm", "Wavetable", "Two Op FM"],
    "lead": ["Virtual Analog", "BasicWaves", "Superwave", "Wavetable", "SawX", "Harm", "KarplusStrong", "Formant"],
    "pad": ["Superwave", "Wavetable", "Harmonic", "Cloud Grains", "Sample", "Virtual Analog", "Chords", "Modal"],
    "keys": ["KarplusStrong", "Two Op FM", "Modal", "Chords", "Virtual Analog", "Wavetable"],
    "strings": ["KarplusStrong", "Modal", "String", "Harmonic", "Scan Grains"],
    "brass": ["Virtual Analog", "SawX", "BasicWaves", "Wavetable", "Formant"],
    "organ": ["BasicWaves", "Harmonic", "Wavetable", "Virtual Analog"],
    "percussion": ["Noise", "Two Op FM", "BasicWaves", "Hit Grains", "KarplusStrong"],
    "sequence": ["Virtual Analog", "BasicWaves", "Wavetable", "SawX", "Two Op FM"],
    "sfx": oscTypes, // All allowed
    "vocoder": ["Vocoder"],
    "random": oscTypes
};

const engineSweetSpots = {
    // [min, max] for w (Wave), t (Timbre), s (Shape)
    "BasicWaves": { w: [0, 100], t: [10, 90], s: [0, 60] },
    "Superwave": { w: [0, 127], t: [10, 50], s: [80, 127] }, // Detune (t) not too high
    "Wavetable": { w: [0, 127], t: [0, 127], s: [20, 100] }, // Chorus (s)
    "Harmonic": { w: [0, 127], t: [0, 127], s: [30, 90] },
    "KarplusStrong": { w: [20, 100], t: [20, 100], s: [10, 80] }, // Bow (w) needs signal
    "Virtual Analog": { w: [0, 60], t: [0, 127], s: [0, 127] }, // Detune (w)
    "Two Op FM": { w: [0, 127], t: [20, 100], s: [0, 80] }, // Index (t)
    "Formant": { w: [0, 127], t: [20, 100], s: [0, 127] },
    "Chords": { w: [0, 127], t: [0, 127], s: [0, 127] },
    "Speech": { w: [0, 127], t: [0, 127], s: [0, 127] },
    "Modal": { w: [0, 127], t: [20, 100], s: [10, 60] }, // Damping (s) not too quick
    "Noise": { w: [0, 127], t: [0, 127], s: [0, 127] },
    "Bass": { w: [20, 100], t: [0, 60], s: [0, 127] }, // Saturation (w)
    "SawX": { w: [0, 80], t: [0, 127], s: [0, 80] } // Spread (w)
};

const modRecipes = [
    { name: "Vibrato", source: "LFO", dest: "Pitch", amount: [1, 5], prob: 0.4 },
    { name: "Filter Sweep", source: "Envelope", dest: "Cutoff", amount: [20, 80], prob: 0.5 },
    { name: "PWM", source: "LFO", dest: "Timbre", amount: [10, 40], prob: 0.3 },
    { name: "Timbre Move", source: "CycEnv", dest: "Wave", amount: [10, 60], prob: 0.3 },
    { name: "Pressure Exp", source: "Pressure", dest: "Timbre", amount: [20, 60], prob: 0.25 },
    { name: "Pressure Filt", source: "Pressure", dest: "Cutoff", amount: [20, 60], prob: 0.3 }
];

// MIDI CC Map
const ccMap = {
    // Oscillator
    "Type": 9,
    "Wave": 10,
    "Timbre": 12,
    "Shape": 13,

    // Filter
    "Cutoff": 23,
    "Resonance": 83,

    // Envelope
    "Attack": 105,
    "Decay": 106, 
    "Sustain": 29,
    "Filter Amt": 26,

    // LFO
    "LFO Rate Free": 93,
    "LFO Rate Sync": 94,

    // Cycling Env
    "Cyc Rise": 102,
    "Cyc Fall": 103,
    "Cyc Hold": 28,
    "Cyc Amount": 24,

    // Glide
    "Glide": 5
};

module.exports = {
    oscTypes,
    chordTypes,
    oscParams,
    lfoShapes,
    lfoSyncRates,
    modSources,
    fixedDests,
    assignTargets,
    styleEngines,
    engineSweetSpots,
    modRecipes,
    ccMap
};
