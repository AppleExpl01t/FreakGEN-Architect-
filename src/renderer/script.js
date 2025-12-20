const fs = require('fs');
const path = require('path');
const os = require('os');
const { ipcRenderer, shell } = require('electron');

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

// State
let currentPatch = { master: [], osc: [], env: [], cyc: [], lfo: [], matrixData: null, style: "init", intensity: "simple", engine: "unknown" };
let locks = { master: false, osc: false, env: false, cyc: false, lfo: false, matrix: false };
let savedPresets = [];
let patchHistory = [];
let patchFuture = [];
let historyDepth = parseInt(localStorage.getItem('freakgen_history_depth')) || 3;
let libraryPath = localStorage.getItem('freakgen_lib_path');
// Since "app" is main process, we use os.homedir for renderer
if (!libraryPath) {
    libraryPath = path.join(os.homedir(), 'Documents', 'FreakGEN_Library');
}
let gallerySort = "name"; // 'name' or 'date'

// Utilities
const rInt = (max) => Math.floor(Math.random() * max);
const rVal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getTime = (minMs, maxMs) => {
    let val = rVal(minMs, maxMs);
    return val >= 1000 ? (val / 1000).toFixed(2) + "s" : val + "ms";
};

// UI Elements
const btnGenerate = document.getElementById('btn-generate');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const selStyle = document.getElementById('sel-style');
const selIntensity = document.getElementById('sel-intensity');
const selEngine = document.getElementById('sel-engine');
const outputGrid = document.getElementById('output-grid');
const placeholder = document.getElementById('placeholder-message');
const statusText = document.getElementById('style-reveal');

// Settings & Tooltips
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleTooltips = document.getElementById('toggle-tooltips');
const tooltipEl = document.getElementById('tooltip');

// New UI Elements (v2.8)
const btnSave = document.getElementById('btn-save');
const btnGallery = document.getElementById('btn-gallery');
const viewGenerator = document.getElementById('view-generator');
const viewGallery = document.getElementById('view-gallery');
const btnBackGen = document.getElementById('btn-back-gen');

// Save Modal
const saveModal = document.getElementById('save-modal');
const btnCloseSave = document.getElementById('btn-close-save');
const btnConfirmSave = document.getElementById('btn-confirm-save');
const inpSaveName = document.getElementById('save-name');
const inpSaveDesc = document.getElementById('save-desc');

// Gallery
const galleryGrid = document.getElementById('gallery-grid');
const searchInput = document.getElementById('gallery-search');
const filterStyle = document.getElementById('filter-style');
const filterEngine = document.getElementById('filter-engine');
const filterComplexity = document.getElementById('filter-complexity');
const btnSortDate = document.getElementById('btn-sort-date');
const btnBackup = document.getElementById('btn-backup');
const btnImport = document.getElementById('btn-import');
const btnFilterFav = document.getElementById('btn-filter-fav');
const galleryStats = document.getElementById('gallery-stats');

// Settings Paths
const libPathDisplay = document.getElementById('lib-path-display');
const btnChangePath = document.getElementById('btn-change-path');

// Gallery State
let showFavoritesOnly = false;

let tooltipTimeout;
let tooltipsEnabled = localStorage.getItem('freakgen_tooltips') !== 'false';
if (tooltipsEnabled) document.body.classList.add('tooltips-enabled');

// Initialize
oscTypes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.innerText = t;
    selEngine.appendChild(opt);
});

// Init Library
initLibrary();

btnGenerate.addEventListener('click', generatePatch);
btnUndo.addEventListener('click', restoreHistory);
btnRedo.addEventListener('click', goForward);
btnSave.addEventListener('click', openSaveWindow);
btnGallery.addEventListener('click', showGallery);
btnBackGen.addEventListener('click', showGenerator);

// Save Modal Listeners
btnCloseSave.addEventListener('click', () => saveModal.classList.add('hidden'));
btnConfirmSave.addEventListener('click', performSave);

// Gallery Listeners
searchInput.addEventListener('input', renderGallery);
filterStyle.addEventListener('change', renderGallery);
filterEngine.addEventListener('change', renderGallery);
filterComplexity.addEventListener('change', renderGallery);
btnSortDate.addEventListener('click', toggleSort);
btnBackup.addEventListener('click', backupGallery);
btnImport.addEventListener('click', importBackup);
btnFilterFav.addEventListener('click', toggleFavFilter);

// Path Listener
btnChangePath.addEventListener('click', async () => {
    const newPath = await ipcRenderer.invoke('select-dir');
    if (newPath) {
        libraryPath = newPath;
        localStorage.setItem('freakgen_lib_path', libraryPath);
        initLibrary();
    }
});

// Modal Logic
btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// Settings Logic
const inpHistoryDepth = document.getElementById('history-depth');
inpHistoryDepth.value = historyDepth;
inpHistoryDepth.addEventListener('change', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) val = 3;
    if (val < 1) val = 1;
    if (val > 20) val = 20;

    e.target.value = val;
    historyDepth = val;
    localStorage.setItem('freakgen_history_depth', val);

    // Trim existing if needed
    if (patchHistory.length > historyDepth) {
        patchHistory = patchHistory.slice(patchHistory.length - historyDepth);
    }
    updateHistoryButtons();
});
toggleTooltips.checked = tooltipsEnabled;
toggleTooltips.addEventListener('change', (e) => {
    tooltipsEnabled = e.target.checked;
    localStorage.setItem('freakgen_tooltips', tooltipsEnabled);
    if (tooltipsEnabled) {
        document.body.classList.add('tooltips-enabled');
    } else {
        document.body.classList.remove('tooltips-enabled');
        hideTooltip();
    }
});

// Tooltip Logic
function showTooltip(text, target) {
    if (!tooltipsEnabled || !text) return;

    // Position finding
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect(); // will be 0 if hidden, handled roughly

    tooltipEl.innerText = text;
    tooltipEl.classList.remove('hidden');

    // Re-measure after displaying
    const freshRect = tooltipEl.getBoundingClientRect();

    let top = rect.top - freshRect.height - 10;
    let left = rect.left + (rect.width / 2) - (freshRect.width / 2);

    // Bounds check
    if (top < 0) top = rect.bottom + 10;
    if (left < 0) left = 10;

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

function hideTooltip() {
    tooltipEl.classList.add('hidden');
}

// Global Event Delegation for Tooltips (Ergonomic Delay)
document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
            showTooltip(target.getAttribute('data-tooltip'), target);
        }, 700); // 700ms delay for ergonomics
    }
});

document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        clearTimeout(tooltipTimeout);
        hideTooltip();
    }
});

function generatePatch() {
    // Ensure we are viewing the generator (triggers transition if in gallery)
    showGenerator();

    // History Logic
    if (currentPatch.matrixData) {
        // Clone and push
        patchHistory.push(JSON.parse(JSON.stringify(currentPatch)));
        if (patchHistory.length > historyDepth) patchHistory.shift();

        // Clear future on new generation
        patchFuture = [];

        updateHistoryButtons();
    }

    let style = selStyle.value;
    const intensity = selIntensity.value;
    const engineVal = selEngine.value;

    // Handle Random Style
    const styles = ["bass", "brass", "keys", "lead", "organ", "pad", "percussion", "sequence", "sfx", "strings", "vocoder"];
    if (style === "random") style = styles[rInt(styles.length)];

    // Update Metadata
    currentPatch.style = selStyle.value; // Stored as selected
    currentPatch.realStyle = style;      // Stored as generated
    currentPatch.intensity = intensity;

    // Update text
    statusText.innerText = `Generated Style: ${style.toUpperCase()}`;

    // UI Transition
    placeholder.style.display = 'none';
    outputGrid.classList.remove('hidden');
    outputGrid.innerHTML = ''; // Clear previous

    // Generate OSC first to determine voice mode needs (Constraint: Chords -> Mono)
    // Actually, we pass 'style' and 'engine' to generateOsc.
    if (!locks.osc) currentPatch.osc = generateOsc(style, engineVal);

    // Check if Chords used
    const oscTypeObj = currentPatch.osc.find(x => x.label === "Type");
    const isChords = oscTypeObj && oscTypeObj.val === "Chords";
    currentPatch.engine = oscTypeObj ? oscTypeObj.val : "Unknown";

    if (!locks.master) currentPatch.master = generateMaster(style, intensity, isChords);
    if (!locks.env) currentPatch.env = generateEnv(style);

    // Matrix Generation (if unlocked)
    // We do this BEFORE LFO/Cyc so we know what is used
    if (!locks.matrix) {
        currentPatch.matrixData = generateMatrixData(style, intensity);
    }

    const usedSources = currentPatch.matrixData.usedSources;

    // LFO & Cyc (Regenerate if unlocked, respecting usage?)
    // Actually, pure random generation doesn't care about usage, 
    // but we might want to ensure they aren't "Blank" if we just generated a matrix that uses them.
    // However, `generateCyc` and `generateLFO` take an `active` boolean.
    // If we just generated a NEW matrix, we know if they are active.
    // If Matrix is LOCKED, we use the OLD usage data.

    if (!locks.cyc) currentPatch.cyc = generateCyc(usedSources.has("CycEnv"));
    if (!locks.lfo) currentPatch.lfo = generateLFO(usedSources.has("LFO"));

    // Render Cards
    outputGrid.appendChild(createCard("Master & Voice", currentPatch.master, "master"));
    outputGrid.appendChild(createCard("Oscillator / Type", currentPatch.osc, "osc"));
    outputGrid.appendChild(createCard("Amp & Filter Env", currentPatch.env, "env"));
    outputGrid.appendChild(createCard("Cycling Envelope", currentPatch.cyc, "cyc"));
    outputGrid.appendChild(createCard("LFO", currentPatch.lfo, "lfo"));
    outputGrid.appendChild(createMatrixCard(currentPatch.matrixData, currentPatch.master, "matrix"));
}

// Generators
function generateMaster(style, intensity, forceMono = false) {
    let vMode;
    if (style === "lead" || style === "bass" || style === "percussion" || forceMono) {
        vMode = "Monophonic";
    } else if (style === "pad") {
        // 70% Paraphonic, 30% Split between Mono/Unison
        vMode = Math.random() < 0.7 ? "Paraphonic" : ["Monophonic", "Unison"][rInt(2)];
    } else {
        vMode = ["Monophonic", "Paraphonic", "Unison"][rInt(3)];
    }
    let uni = "0";
    if (vMode === "Unison") {
        const spots = [0, 4, 7, 8, 12];
        uni = (spots[rInt(spots.length)] + (Math.random() * 0.246 - 0.123)).toFixed(3);
    }
    let fType = (style === "percussion") ? ["BP", "HP"][rInt(2)] : ["LP", "BP", "HP"][rInt(3)];
    let cutoff = (style === "percussion") ? rVal(500, 5000) + "Hz" : (Math.random() * 20 + 0.5).toFixed(1) + "kHz";

    // Glide Logic
    let glideVal = null;
    if (intensity === 'high' && Math.random() < 0.25) {
        glideVal = getTime(10, 500); // 10ms to 0.5s
    } else if (intensity === 'extreme' && Math.random() < 0.50) {
        glideVal = getTime(10, 10000); // 10ms to 10s
    }

    return [
        { label: "Octave", val: (style === "bass" ? -2 : 0), tooltip: "Use the Octave |< >| buttons above the keyboard." },
        { label: "Voice Mode", val: vMode, tooltip: "Press 'Paraphonic'. Shift+Para for Unison/Mono." },
        { label: "Unison Spread", val: uni !== "0" ? uni : null, tooltip: "Amount of detune. (Check Utility menu or Shift functions for Unison Spread)." },
        { label: "Glide", val: glideVal, tooltip: "Turn the Glide knob." },
        { label: "Filter Type", val: fType, tooltip: "Press the 'Filter Type' button to cycle (LP/BP/HP)." },
        { label: "Cutoff", val: cutoff, tooltip: "Turn the Cutoff knob in the Analog Filter section." },
        { label: "Resonance", val: rVal(10, 80) + "%", tooltip: "Turn the Resonance knob in the Analog Filter section." }
    ];
}

function generateOsc(style, forceEngine = "random") {
    let type = forceEngine;
    if (type === "random") {
        type = style === "percussion" ? "Noise" : (style === "vocoder" ? "Vocoder" : oscTypes[rInt(oscTypes.length)]);
    }

    // Manual Constraints & Labels
    const params = oscParams[type] || { w: "Wave", t: "Timbre", s: "Shape" };

    let waveVal = rVal(0, 100) + "%";

    if (type === "Chords") {
        waveVal = chordTypes[rInt(chordTypes.length)];
    } else if (type === "Wavetable") {
        waveVal = rVal(1, 16);
    } else if (type === "Vocoder") {
        waveVal = rVal(50, 100) + "%";
    }

    return [
        { label: "Type", val: type, tooltip: "Turn the Type knob in the Digital Oscillator section." },
        { label: params.w, val: waveVal, tooltip: "Turn the Wave knob (Orange)." },
        { label: params.t, val: rVal(0, 100) + "%", tooltip: "Turn the Timbre knob (White)." },
        { label: params.s, val: rVal(0, 100) + "%", tooltip: "Turn the Shape knob (White)." }
    ];
}

function generateEnv(style) {
    let atk = (style === "percussion") ? "0ms" : (style === "pad" ? getTime(1000, 3000) : "5ms");
    let dec = (style === "percussion") ? getTime(20, 150) : getTime(200, 25000); // 200ms to 25s
    let fAmt = (style === "percussion" || style === "brass" || style === "pad") ? rVal(40, 95) : rVal(-100, 100);
    return [
        { label: "Attack", val: atk, tooltip: "Adjust the Attack slider in the Envelope section." },
        { label: "Decay/Rel", val: dec, tooltip: "Adjust the Decay/Release slider in the Envelope section." },
        { label: "Sustain", val: rVal(0, 100) + "%", tooltip: "Adjust the Sustain slider in the Envelope section." },
        { label: "Filter Amt", val: fAmt, tooltip: "Turn the Filter Amt knob in the Envelope section." }
    ];
}

function generateCyc(active) {
    if (!active) return [{ label: "Status", val: "INT - Blank", tooltip: "This module is not active in the modulation matrix." }];

    let mode = ["Env", "Run", "Loop"][rInt(3)];
    let susLabel = (mode === "Env") ? "Sustain" : "Hold"; // Dynamic label
    let susVal = (mode === "Env") ? rVal(0, 100) + "%" : getTime(0, 5000); // Expanded Hold time slightly

    const result = [
        { label: "Mode", val: mode, tooltip: "Press the Mode button in the Cycling Envelope section." },
        { label: "Rise", val: getTime(10, 1000), tooltip: "Turn the Rise knob in the Cycling Envelope section." }
    ];

    if (selIntensity.value !== "simple") {
        result.push({ label: "Rise Shape", val: rVal(1, 100) + "%", tooltip: "Hold Shift and turn the Rise knob." });
    }

    result.push({ label: "Fall", val: getTime(10, 1000), tooltip: "Turn the Fall knob in the Cycling Envelope section." });

    if (selIntensity.value !== "simple") {
        result.push({ label: "Fall Shape", val: rVal(1, 100) + "%", tooltip: "Hold Shift and turn the Fall knob." });
    }

    result.push({ label: susLabel, val: susVal, tooltip: "Turn the Hold/Sustain knob in the Cycling Envelope section." });
    result.push({ label: "Amount", val: rVal(0, 100) + "%", tooltip: "Turn the Amount knob in the Cycling Envelope section." });

    return result;
}

function generateLFO(active) {
    if (!active) return [{ label: "Status", val: "INT - Blank", tooltip: "This module is not active in the modulation matrix." }];

    const sync = ["ON", "OFF"][rInt(2)];
    const rate = (sync === "ON") ? lfoSyncRates[rInt(lfoSyncRates.length)] : (Math.random() * 50).toFixed(2) + " Hz";

    return [
        { label: "Shape", val: lfoShapes[rInt(lfoShapes.length)], tooltip: "Press the Shape button in the LFO section." },
        { label: "Sync", val: sync, tooltip: "Press the Sync button in the LFO section." },
        { label: "Rate", val: rate, tooltip: "Turn the Rate knob in the LFO section." }
    ];
}

function generateMatrixData(style, intensity) {
    let count = { 'simple': rVal(2, 3), 'moderate': rVal(4, 7), 'high': rVal(8, 12), 'extreme': rVal(15, 20) }[intensity];
    let usedSources = new Set();
    let usedAssigns = new Set();
    let connections = [];
    let config = [];
    let targets = [...assignTargets];

    // Determine Voice Mode to filter incompatible targets
    const vModeObj = currentPatch.master ? currentPatch.master.find(x => x.label === "Voice Mode") : null;
    const isUnison = vModeObj && vModeObj.val === "Unison";

    if (!isUnison) {
        targets = targets.filter(t => t !== "Spread" && t !== "Unispread");
    }

    // Constraint Logic: 
    // If we pick Cycling Env parameters for Assign slots, we must ensure CycEnv is actually doing something.
    // Otherwise it will be "Blank" and the assign slot is wasted.

    // 1. Randomize 3 assign slots first
    for (let i = 0; i < 3; i++) config.push(targets.splice(rInt(targets.length), 1)[0]);

    // 2. Check if configuration requires Cycling Envelope or LFO usage
    const cycRelated = ["Cyc Rise", "Cyc Fall", "Cyc Hold", "Cyc Amt"];
    const lfoRelated = ["LFO Rate", "LFO Amount"]; // If user added these? (LFO Amount removed previously, Rate is there)

    const needsCycActivity = config.some(c => cycRelated.includes(c));

    // 3. Generate Connections
    let minCycConnections = needsCycActivity ? 1 : 0;

    let pairs = new Set();
    let cols = [...fixedDests, "Assign 1", "Assign 2", "Assign 3"];

    for (let i = 0; i < count; i++) {
        let s, d;

        // Forced injection for constraints
        if (minCycConnections > 0) {
            s = "CycEnv";
            // Pick a valid destination other than the one we are trying to enable? 
            // Doesn't matter, as long as it modulates SOMETHING, it is "Active".
            d = cols[rInt(cols.length)];
            minCycConnections--;
        } else {
            s = modSources[rInt(modSources.length)];
            d = cols[rInt(cols.length)];
        }

        // ... rest of loop
        let targetParam = d.includes("Assign") ? config[parseInt(d.split(" ")[1]) - 1] : d;

        if (pairs.has(s + d)) continue;
        pairs.add(s + d);
        usedSources.add(s);
        if (d.includes("Assign")) usedAssigns.add(d);

        // Value Generation Logic
        let val = rVal(-100, 100);

        // Pitch Guardrails (V2.0/V2.5)
        // Simple/Mod intensity limits pitch mod unless percussion
        if (d === "Pitch" && style !== "percussion" && (intensity === "simple" || intensity === "moderate")) {
            val = (rVal(-8, 8) / 10.0); // -0.8 to +0.8
        }

        // Unispread Logic (V2.5/V2.6)
        // Must be positive
        if (d === "Unispread" || targetParam === "Unispread") {
            val = Math.abs(val);
        }

        connections.push({ s, d, a: val, targetParam });
    }

    // --- Post-Processing Constraint Check (User Request) ---
    // Rule: "If CycEnv is not controlling a parameter (e.g. Pitch/Wave)... do not assign in custom assign."
    // Definition of Active CycEnv: Modulates a Fixed Dest OR Modulates an Assign slot that is NOT a Cyc Parameter.

    const cycParams = ["Cyc Rise", "Cyc Fall", "Cyc Hold", "Cyc Amt"];

    // Check if CycEnv is effectively active
    // We look at all connections where Source is CycEnv.
    // If the Destination is in fixedDests -> Good.
    // If Destination is Assign X, check if that Assign maps to a non-Cyc param -> Good.

    let cycIsEffective = false;
    for (let c of connections) {
        if (c.s === "CycEnv") {
            if (fixedDests.includes(c.d)) {
                cycIsEffective = true;
                break;
            }
            if (c.d.includes("Assign")) {
                // Check what this assign controls
                // c.targetParam is already resolved
                if (!cycParams.includes(c.targetParam)) {
                    cycIsEffective = true;
                    break;
                }
            }
        }
    }

    if (!cycIsEffective) {
        // 1. Remove CycEnv from usedSources
        usedSources.delete("CycEnv");

        // 2. Remove connections sourced from CycEnv
        connections = connections.filter(c => c.s !== "CycEnv");

        // 3. Replace Cyc Params in Config (Assign 1-3)
        // We need to replace items in `config` that are in `cycParams`
        // `targets` currently holds the remaining pool of assignTargets.

        for (let i = 0; i < 3; i++) {
            if (cycParams.includes(config[i])) {
                // Find a replacement from `targets` that is NOT a Cyc param
                // Filter available targets
                let validReplacements = targets.filter(t => !cycParams.includes(t));

                if (validReplacements.length > 0) {
                    // Pick one
                    let idx = rInt(validReplacements.length);
                    let rep = validReplacements[idx];

                    // Update Config
                    config[i] = rep;

                    // Remove from targets (so we don't pick it again for another slot)
                    // We need to find it in the original `targets` array to splice it out properly
                    let realIdx = targets.indexOf(rep);
                    if (realIdx > -1) targets.splice(realIdx, 1);

                    // Update connections that pointed to this Assign slot?
                    // Their `targetParam` is now wrong. Update it.
                    let assignName = `Assign ${i + 1}`;
                    connections.forEach(c => {
                        if (c.d === assignName) {
                            c.targetParam = rep;
                            // Re-check unispread logic if we swapped into Unispread?
                            if (rep === "Unispread") c.a = Math.abs(c.a);
                        }
                    });
                } else {
                    // Fallback: Just clear it or leave it? ideally shouldn't happen given the pool size.
                    // If no non-cyc targets left, we are stuck. But mod matrix pool is large enough.
                }
            }
        }
    }

    // --- Post-Processing Constraint Check (User Request 2) ---
    // Rule: "If a custom assign is generated it needs to be used in the mod matrix if not leave 'INT - Blank'"
    for (let i = 0; i < 3; i++) {
        const assignName = `Assign ${i + 1}`;
        // Check if any connection targets this assign slot
        const isUsed = connections.some(c => c.d === assignName);

        if (!isUsed) {
            config[i] = "INT - Blank";
        }
    }

    return { usedSources, usedAssigns, connections, config };
}

// Rendering Helpers
function createCard(title, dataRows, lockKey) {
    const card = document.createElement('div');
    card.className = 'section-card';

    // Header with Lock
    const header = document.createElement('div');
    header.className = 'card-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'card-title';
    titleSpan.innerText = title;

    const lockBtn = document.createElement('button');
    lockBtn.className = `lock-btn ${locks[lockKey] ? 'locked' : ''}`;
    lockBtn.innerText = locks[lockKey] ? 'LOCKED' : 'LOCK';
    lockBtn.setAttribute('data-tooltip', `Lock this section to preserve its current settings when generating a new patch.`);
    lockBtn.onclick = (e) => toggleLock(lockKey, e);

    header.appendChild(titleSpan);
    header.appendChild(lockBtn);
    card.appendChild(header);

    dataRows.forEach(row => {
        if (row.val === null) return;
        const r = document.createElement('div');
        r.className = 'param-row';
        if (row.tooltip) r.setAttribute('data-tooltip', row.tooltip);
        r.innerHTML = `<span class="param-label">${row.label}</span><span class="param-val">${row.val}</span>`;
        card.appendChild(r);
    });
    return card;
}

function toggleLock(key, event) {
    locks[key] = !locks[key];
    // Re-render is tricky without regenerating. 
    // Easiest way in this architecture is to just update the button class in the DOM immediately
    // assuming the grid is not wiped. But Generate wipes the grid.
    // The intended workflow: Toggle lock -> Click Generate -> Lock is respected.
    // So we just need to update visual state of the button that was clicked.
    // Since we re-generate the whole DOM including buttons on "Generate", we just need to update the CURRENT button.

    // Find all buttons for this key? Or just rely on event target.
    // Implementation: Update all buttons for this key just in case (though usually 1).
    // Or just re-generate purely visual? No, if we re-generate, we create new patches. 
    // We just update the button style.
    const btns = document.querySelectorAll('.lock-btn');
    // This is lazy. Let's just update the clicked button context or query it.
    // Better: Rerender the UI? No.
    // Just toggle the class on the active elements.
    // WAIT. If I click "Lock", I don't want to generate new values for UNLOCKED fields yet. 
    // I just want to lock the current ones.
    // So `toggleLock` should only update the visual state and the `locks` variable.
    // The user clicks "Generate" later.

    // Visual update:
    // We need to find the specific button or update generally.
    // Since we don't have IDs on cards, let's just refresh the specific button that triggered it?
    // But Render creates new buttons.
    // Let's iterate and update based on key logic if we had it stored, but we pass the key to onclick.

    // Let's re-render the whole grid using the CURRENT patch data?
    // If we call `generatePatch` logic but bypass generation for EVERYTHING, we effectively re-render.
    // But `generatePatch` calls `generate...` if unlocked.
    // We need a pure `renderCurrentFromState` function or we can just update the button.

    // Simple solution: Just update the button text/class.
    if (event && event.target) {
        const btn = event.target;
        btn.classList.toggle('locked');
        btn.innerText = locks[key] ? 'LOCKED' : 'LOCK';
    }
}

function createMatrixCard(m, masterData, lockKey) {
    const card = document.createElement('div');
    card.className = 'section-card';

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `<span class="card-title">Modulation Matrix</span>`;

    const lockBtn = document.createElement('button');
    lockBtn.className = `lock-btn ${locks[lockKey] ? 'locked' : ''}`;
    lockBtn.innerText = locks[lockKey] ? 'LOCKED' : 'LOCK';
    lockBtn.setAttribute('data-tooltip', `Lock the Modulation Matrix to keep current connections while changing parameters.`);
    lockBtn.onclick = (e) => toggleLock(lockKey, e);

    header.appendChild(lockBtn);
    card.appendChild(header);

    // Assign Config
    for (let i = 0; i < 3; i++) {
        const row = document.createElement('div');
        row.className = 'param-row compact';
        row.setAttribute('data-tooltip', `Hold 'Assign ${i + 1}' button and turn destination knob.`);
        row.innerHTML = `<span class="param-label">Assign ${i + 1}:</span><span class="param-val" style="color:var(--accent)">${m.config[i]}</span>`;
        card.appendChild(row);
    }

    // Grid for connections
    const grid = document.createElement('div');
    grid.className = 'matrix-grid-layout';
    grid.style.marginTop = '15px';

    const vMode = masterData.find(x => x.label === "Voice Mode").val;

    m.connections.forEach(c => {
        const item = document.createElement('div');
        item.className = 'matrix-item';

        // Handle logic exclusions (simulated from original)
        let opacity = 1;
        let note = "";
        if (c.targetParam === "Unispread" && vMode !== "Unison") {
            opacity = 0.4;
            note = "(No Unison)";
        }

        item.setAttribute('data-tooltip', `Turn Matrix knob to [${c.s}] row & [${c.d}] col. Press & turn to set amount.`);
        item.style.opacity = opacity;
        item.innerHTML = `
            <span class="matrix-route">${c.s} → ${c.d} ${note}</span>
            <span class="matrix-amt">${c.a > 0 ? '+' + c.a : c.a}</span>
        `;
        grid.appendChild(item);
    });

    card.appendChild(grid);
    return card;
}

// --- Library & Gallery Logic ---

function initLibrary() {
    // Ensure dir exists
    if (!fs.existsSync(libraryPath)) {
        fs.mkdirSync(libraryPath, { recursive: true });
    }
    libPathDisplay.value = libraryPath;
    loadPresets();
    populateFilters();
}

function loadPresets() {
    savedPresets = [];
    let corruptedCount = 0;
    const files = fs.readdirSync(libraryPath);
    files.forEach(f => {
        if (f.endsWith('.json')) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(libraryPath, f)));
                savedPresets.push({
                    filename: f,
                    ...data,
                    // Ensure date is valid object or string
                    date: data.date ? new Date(data.date) : new Date(0),
                    // Default favorite to false if not present
                    favorite: data.favorite || false
                });
            } catch (e) {
                console.error("Failed to load preset", f, e.message);
                corruptedCount++;
            }
        }
    });

    if (corruptedCount > 0) {
        console.warn(`Skipped ${corruptedCount} corrupted preset file(s).`);
    }
}

function populateFilters() {
    // Populate Styles found in presets? Or just strict list?
    // Let's use the strict list but maybe mark active ones? For now, standard list.
    const styleList = ["bass", "brass", "keys", "lead", "organ", "pad", "percussion", "sequence", "sfx", "strings", "vocoder"];
    filterStyle.innerHTML = '<option value="all">All Styles</option>';
    styleList.forEach(s => {
        filterStyle.innerHTML += `<option value="${s}">${s.toUpperCase()}</option>`;
    });

    // Populate Engines
    filterEngine.innerHTML = '<option value="all">All Engines</option>';
    oscTypes.forEach(t => {
        filterEngine.innerHTML += `<option value="${t}">${t}</option>`;
    });
}

function openSaveWindow() {
    if (!currentPatch.matrixData) return; // Nothing generated
    saveModal.classList.remove('hidden');
    inpSaveName.value = `My ${currentPatch.realStyle || 'Patch'} ${rInt(99)}`;
    inpSaveDesc.value = "";
    inpSaveName.focus();
}

function performSave() {
    const name = inpSaveName.value.trim() || "Untitled";
    const desc = inpSaveDesc.value.trim();

    const presetData = {
        name,
        description: desc,
        date: new Date().toISOString(),
        style: currentPatch.realStyle,
        intensity: currentPatch.intensity,
        engine: currentPatch.osc.find(o => o.label === "Type")?.val || "Unknown",
        patch: currentPatch
    };

    const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeName}_${Date.now()}.json`;

    fs.writeFileSync(path.join(libraryPath, filename), JSON.stringify(presetData, null, 2));

    saveModal.classList.add('hidden');
    loadPresets();

    // Feedback
    const saveSpan = btnSave.querySelector('span');
    if (saveSpan) {
        saveSpan.innerText = "SAVED!";
        setTimeout(() => saveSpan.innerText = "SAVE", 2000);
    }
}

const contentArea = document.querySelector('.content-area');
contentArea.classList.add('view-active-gen'); // Default

function showGallery() {
    contentArea.classList.remove('view-active-gen');
    contentArea.classList.add('view-active-gallery');
    loadPresets(); // Refresh
    renderGallery();
}

function showGenerator() {
    contentArea.classList.remove('view-active-gallery');
    contentArea.classList.add('view-active-gen');
}

function toggleSort() {
    gallerySort = gallerySort === 'name' ? 'date' : 'name';
    renderGallery();
}

function renderGallery() {
    galleryGrid.innerHTML = '';

    const search = searchInput.value.toLowerCase();
    const fStyle = filterStyle.value;
    const fEngine = filterEngine.value;
    const fComplex = filterComplexity.value;

    // Calculate stats before filtering
    const totalPresets = savedPresets.length;
    const styleCounts = {};
    const favCount = savedPresets.filter(p => p.favorite).length;
    savedPresets.forEach(p => {
        styleCounts[p.style] = (styleCounts[p.style] || 0) + 1;
    });

    // Render Stats Bar
    let statsHtml = `<span class="stat">Total: <span class="stat-value">${totalPresets}</span></span>`;
    statsHtml += `<span class="stat">⭐ Favorites: <span class="stat-value">${favCount}</span></span>`;
    Object.keys(styleCounts).sort().slice(0, 5).forEach(style => {
        statsHtml += `<span class="stat">${style}: <span class="stat-value">${styleCounts[style]}</span></span>`;
    });
    galleryStats.innerHTML = statsHtml;

    let filtered = savedPresets.filter(p => {
        // Search
        const matchText = (p.name.toLowerCase().includes(search) || (p.description || "").toLowerCase().includes(search));
        // Style
        const matchStyle = fStyle === 'all' || p.style === fStyle;
        // Engine
        const matchEngine = fEngine === 'all' || (p.engine === fEngine);
        // Complexity
        const matchComplex = fComplex === 'all' || p.intensity === fComplex;
        // Favorites
        const matchFav = !showFavoritesOnly || p.favorite;

        return matchText && matchStyle && matchEngine && matchComplex && matchFav;
    });

    // Sort logic
    const complexityOrder = { 'simple': 0, 'moderate': 1, 'high': 2, 'extreme': 3 };
    filtered.sort((a, b) => {
        const cA = complexityOrder[a.intensity] || 99;
        const cB = complexityOrder[b.intensity] || 99;
        if (cA !== cB) return cA - cB;
        return gallerySort === 'name' ? a.name.localeCompare(b.name) : b.date - a.date;
    });

    let currentGroup = null;

    filtered.forEach(p => {
        // Group Header
        if (p.intensity !== currentGroup) {
            currentGroup = p.intensity;
            const h = document.createElement('div');
            h.className = 'group-header';
            h.innerText = `${(p.intensity || 'unknown').toUpperCase()} COMPLEXITY`;
            galleryGrid.appendChild(h);
        }

        const card = document.createElement('div');
        card.className = 'preset-card';
        card.setAttribute('data-id', p.filename);
        card.setAttribute('data-tooltip', `Click to load "${p.name}".\n${p.description ? p.description.substring(0, 50) + (p.description.length > 50 ? '...' : '') : ''}`);

        const eng = p.engine || 'Unknown';
        const dateStr = p.date instanceof Date ? p.date.toLocaleDateString() : 'Unknown';

        card.innerHTML = `
            <div class="card-actions">
                <button class="btn-fav" data-tooltip="${p.favorite ? 'Remove from Favorites' : 'Add to Favorites'}" aria-label="Toggle favorite">${p.favorite ? '⭐' : '☆'}</button>
                <button class="btn-delete" data-tooltip="Delete Preset" aria-label="Delete preset">🗑️</button>
            </div>
            <h4>${p.name}</h4>
            <div class="meta">
                <span class="tag" data-tooltip="Design Style: ${p.style}">${p.style}</span>
                <span class="tag" style="color:var(--accent)" data-tooltip="Oscillator Engine: ${eng}">${eng}</span>
            </div>
            <div class="desc" style="font-size:11px; margin-top:8px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.description || "No description"}</div>
            <div class="creation-date">Created: ${dateStr}</div>
        `;

        // Event: Load preset (exclude action buttons)
        card.onclick = (e) => {
            if (e.target.closest('.card-actions')) return;
            loadPresetToGen(p);
        };

        // Event: Favorite toggle
        card.querySelector('.btn-fav').onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(p.filename);
        };

        // Event: Delete
        card.querySelector('.btn-delete').onclick = (e) => {
            e.stopPropagation();
            deletePreset(p.filename, p.name);
        };

        galleryGrid.appendChild(card);
    });

    if (filtered.length === 0) {
        galleryGrid.innerHTML = '<div style="color:#666; font-style:italic;">No presets found matching filters.</div>';
    }
}

function loadPresetToGen(presetData) {
    // Switch view
    showGenerator();
    hideTooltip(); // Force hide tooltip
    if (tooltipTimeout) clearTimeout(tooltipTimeout);

    // Load Data
    currentPatch = presetData.patch;

    // To properly "Load" it, we just re-render the cards.
    // We can reuse the rendering logic from generatePatch but skip generation.
    renderCardsFromCurrent();

    // Also update header/status
    statusText.innerText = `LOADED: ${presetData.name.toUpperCase()}`;

    // Show description?
    // Maybe update placeholder or inject a info banner.
}

function renderCardsFromCurrent() {
    outputGrid.classList.remove('hidden');
    outputGrid.innerHTML = '';
    placeholder.style.display = 'none';

    outputGrid.appendChild(createCard("Master & Voice", currentPatch.master, "master"));
    outputGrid.appendChild(createCard("Oscillator / Type", currentPatch.osc, "osc"));
    outputGrid.appendChild(createCard("Amp & Filter Env", currentPatch.env, "env"));
    outputGrid.appendChild(createCard("Cycling Envelope", currentPatch.cyc, "cyc"));
    outputGrid.appendChild(createCard("LFO", currentPatch.lfo, "lfo"));
    outputGrid.appendChild(createMatrixCard(currentPatch.matrixData, currentPatch.master, "matrix"));
}

function restoreHistory() {
    if (patchHistory.length === 0) return;

    // Push current to future before undoing
    patchFuture.push(JSON.parse(JSON.stringify(currentPatch)));

    // Pop the last state from history
    const prev = patchHistory.pop();
    currentPatch = prev;

    // Re-render
    renderCardsFromCurrent();

    // Update Status
    statusText.innerText = `Restored: ${(currentPatch.realStyle || 'Patch').toUpperCase()} (Undo)`;

    updateHistoryButtons();
}

function goForward() {
    if (patchFuture.length === 0) return;

    // Push current to history before redoing
    patchHistory.push(JSON.parse(JSON.stringify(currentPatch)));
    if (patchHistory.length > historyDepth) patchHistory.shift(); // Keep history cap

    // Pop from future
    const next = patchFuture.pop();
    currentPatch = next;

    renderCardsFromCurrent();
    statusText.innerText = `Restored: ${(currentPatch.realStyle || 'Patch').toUpperCase()} (Redo)`;

    updateHistoryButtons();
}

function updateHistoryButtons() {
    btnUndo.disabled = patchHistory.length === 0;
    btnUndo.style.opacity = patchHistory.length === 0 ? "0.5" : "1";
    btnUndo.setAttribute("data-tooltip", `Undo (${patchHistory.length})`);

    btnRedo.disabled = patchFuture.length === 0;
    btnRedo.style.opacity = patchFuture.length === 0 ? "0.5" : "1";
    btnRedo.setAttribute("data-tooltip", `Redo (${patchFuture.length})`);
}

async function backupGallery() {
    if (!savedPresets.length) {
        alert("No presets to backup!");
        return;
    }

    // Save old state for restoration
    btnBackup.innerText = "⏳";
    btnBackup.disabled = true;

    try {
        const zip = new JSZip();

        // Add each file to the zip
        savedPresets.forEach(p => {
            const filePath = path.join(libraryPath, p.filename);
            if (fs.existsSync(filePath)) {
                // Read as buffer to handle any potential encoding issues, though they are JSON strings
                const content = fs.readFileSync(filePath);
                zip.file(p.filename, content);
            }
        });

        const content = await zip.generateAsync({ type: "nodebuffer" });

        // Ask for save path
        const defaultPathName = `FreakGEN_Backup_${new Date().toISOString().split('T')[0]}.zip`;
        const defaultPath = path.join(os.homedir(), 'Desktop', defaultPathName);

        const savePath = await ipcRenderer.invoke('save-dialog', {
            title: 'Backup Presets',
            defaultPath: defaultPath,
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (savePath) {
            fs.writeFileSync(savePath, content);
            btnBackup.innerText = "✅";
            setTimeout(() => {
                btnBackup.innerText = "📦";
                btnBackup.disabled = false;
            }, 2000);
        } else {
            btnBackup.innerText = "📦";
            btnBackup.disabled = false;
        }

    } catch (err) {
        console.error(err);
        alert("Backup failed: " + err.message);
        btnBackup.innerText = "❌";
        btnBackup.disabled = false;
    }
}

function toggleFavorite(filename) {
    const filePath = path.join(libraryPath, filename);
    try {
        const data = JSON.parse(fs.readFileSync(filePath));
        data.favorite = !data.favorite;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        loadPresets();
        renderGallery();
    } catch (e) {
        console.error("Failed to toggle favorite:", e);
    }
}

function deletePreset(filename, name) {
    if (!confirm(`Delete preset "${name}"? This cannot be undone.`)) return;

    const filePath = path.join(libraryPath, filename);
    try {
        fs.unlinkSync(filePath);
        loadPresets();
        renderGallery();
    } catch (e) {
        console.error("Failed to delete preset:", e);
        alert("Failed to delete preset: " + e.message);
    }
}

function toggleFavFilter() {
    showFavoritesOnly = !showFavoritesOnly;
    btnFilterFav.classList.toggle('active', showFavoritesOnly);
    renderGallery();
}

async function importBackup() {
    btnImport.innerText = "⏳";
    btnImport.disabled = true;

    try {
        const result = await ipcRenderer.invoke('select-file', {
            title: 'Import Backup',
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (!result) {
            btnImport.innerText = "📥";
            btnImport.disabled = false;
            return;
        }

        const zipData = fs.readFileSync(result);
        const zip = await JSZip.loadAsync(zipData);

        let importedCount = 0;
        const files = Object.keys(zip.files);

        for (const filename of files) {
            if (!filename.endsWith('.json')) continue;

            const content = await zip.files[filename].async('string');
            const targetPath = path.join(libraryPath, filename);

            // Skip if file already exists (don't overwrite)
            if (!fs.existsSync(targetPath)) {
                fs.writeFileSync(targetPath, content);
                importedCount++;
            }
        }

        loadPresets();
        renderGallery();

        btnImport.innerText = "✅";
        setTimeout(() => {
            btnImport.innerText = "📥";
            btnImport.disabled = false;
        }, 2000);

        alert(`Imported ${importedCount} new preset(s).`);

    } catch (err) {
        console.error(err);
        alert("Import failed: " + err.message);
        btnImport.innerText = "❌";
        btnImport.disabled = false;
    }
}
