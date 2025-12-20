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
let currentPatch = { master: [], osc: [], env: [], cyc: [], lfo: [], matrixData: null };
let locks = { master: false, osc: false, env: false, cyc: false, lfo: false, matrix: false };

// Utilities
const rInt = (max) => Math.floor(Math.random() * max);
const rVal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getTime = (minMs, maxMs) => {
    let val = rVal(minMs, maxMs);
    return val >= 1000 ? (val / 1000).toFixed(2) + "s" : val + "ms";
};

// UI Elements
const btnGenerate = document.getElementById('btn-generate');
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

let tooltipTimeout;
let tooltipsEnabled = true;
document.body.classList.add('tooltips-enabled');

// Initialize
oscTypes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.innerText = t;
    selEngine.appendChild(opt);
});

btnGenerate.addEventListener('click', generatePatch);

// Modal Logic
btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// Settings Logic
toggleTooltips.addEventListener('change', (e) => {
    tooltipsEnabled = e.target.checked;
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
    let style = selStyle.value;
    const intensity = selIntensity.value;

    // Handle Random Style
    const styleList = ["bass", "brass", "keys", "lead", "organ", "pad", "percussion", "sequence", "sfx", "strings", "vocoder"];
    if (style === "random") style = styleList[rInt(styleList.length)];

    // Update text
    statusText.innerText = `Generated Style: ${style.toUpperCase()}`;

    // UI Transition
    placeholder.style.display = 'none';
    outputGrid.classList.remove('hidden');
    outputGrid.innerHTML = ''; // Clear previous

    // Generate Data
    // Generate Data (Respect Locks)
    // We only generate if NOT locked. If locked, we keep currentPatch data.
    // Exception: If Matrix matches "Inactive" states, we might need to handle dependencies, 
    // but per requirements, strict locking is preferred.

    if (!locks.matrix) {
        currentPatch.matrixData = generateMatrixData(style, intensity);
    }

    // Check matrix usage for dependency logic IF specifically regenerating dependant sections
    const usedSources = currentPatch.matrixData.usedSources;

    // Constraint: Chords engine disactivates Paraphony (Manual p.44)
    // We must generate OSC first to know if we need to force Mono, OR generating Master first helps set the stage?
    // Let's generate OSC first if strictly needed, but `generateOsc` is independent.
    // Actually, `generateMaster` decides Voice Mode. We should pass the chosen Osc Type to `generateMaster` or `locks` logic.
    // Easier: Generate OSC, then if type is Chords, force Master voice mode to Monophonic in the Master generation or post-correction.

    const engine = selEngine.value;
    if (!locks.osc) currentPatch.osc = generateOsc(style, engine);

    // Check for Chords constraint
    const oscTypeObj = currentPatch.osc.find(x => x.label === "Type");
    const isChords = oscTypeObj && oscTypeObj.val === "Chords";

    if (!locks.master) currentPatch.master = generateMaster(style, isChords);
    if (!locks.env) currentPatch.env = generateEnv(style);

    // For LFO/Cyc, if they are unlocked, we regenerate based on CURRENT matrix usage.
    // If they are locked, they stay as is (even if matrix says they are unused, or vice versa).
    if (!locks.cyc) currentPatch.cyc = generateCyc(usedSources.has("CycEnv"));
    if (!locks.lfo) currentPatch.lfo = generateLFO(usedSources.has("LFO"));

    // Render Cards
    outputGrid.appendChild(createCard("Master & Voice", currentPatch.master, "master"));
    outputGrid.appendChild(createCard("Oscillator / Type", currentPatch.osc, "osc"));
    outputGrid.appendChild(createCard("Amp & Filter Env", currentPatch.env, "env"));
    outputGrid.appendChild(createCard("Cycling Envelope", currentPatch.cyc, "cyc"));
    outputGrid.appendChild(createCard("LFO", currentPatch.lfo, "lfo"));

    // Render Matrix Card (Special Layout)
    outputGrid.appendChild(createMatrixCard(currentPatch.matrixData, currentPatch.master, "matrix"));
}

// Generators
function generateMaster(style, forceMono = false) {
    let vMode = (style === "lead" || style === "bass" || style === "percussion" || forceMono) ? "Monophonic" : (style === "pad" ? "Paraphonic" : ["Monophonic", "Paraphonic", "Unison"][rInt(3)]);
    let uni = "0";
    if (vMode === "Unison") {
        const spots = [0, 4, 7, 8, 12];
        uni = (spots[rInt(spots.length)] + (Math.random() * 0.246 - 0.123)).toFixed(3);
    }
    let fType = (style === "percussion") ? ["BP", "HP"][rInt(2)] : ["LP", "BP", "HP"][rInt(3)];
    let cutoff = (style === "percussion") ? rVal(500, 5000) + "Hz" : (Math.random() * 20 + 0.5).toFixed(1) + "kHz";

    return [
        { label: "Octave", val: (style === "bass" ? -2 : 0), tooltip: "Use the Octave |< >| buttons above the keyboard." },
        { label: "Voice Mode", val: vMode, tooltip: "Press 'Paraphonic'. Shift+Para for Unison/Mono." },
        { label: "Unison Spread", val: uni !== "0" ? uni : null, tooltip: "Amount of detune. (Check Utility menu or Shift functions for Unison Spread)." },
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

    return [
        { label: "Mode", val: mode, tooltip: "Press the Mode button in the Cycling Envelope section." },
        { label: "Rise", val: getTime(10, 1000), tooltip: "Turn the Rise knob in the Cycling Envelope section." },
        { label: "Fall", val: getTime(10, 1000), tooltip: "Turn the Fall knob in the Cycling Envelope section." },
        { label: susLabel, val: susVal, tooltip: "Turn the Hold/Sustain knob in the Cycling Envelope section." },
        { label: "Amount", val: rVal(0, 100) + "%", tooltip: "Turn the Amount knob in the Cycling Envelope section." }
    ];
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
