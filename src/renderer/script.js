const oscTypes = ["BasicWaves", "Superwave", "Wavetable", "Harmonic", "KarplusStrong", "Virtual Analog", "Waveshaper", "Two Op FM", "Formant", "Chords", "Speech", "Modal", "Noise", "Bass", "SawX", "Vocoder"];
const chordTypes = ["Oct", "5th", "sus4", "minor", "m7", "m9", "m11", "69", "maj9", "maj7", "Major"];
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
const outputGrid = document.getElementById('output-grid');
const placeholder = document.getElementById('placeholder-message');
const statusText = document.getElementById('style-reveal');

// Initialize
btnGenerate.addEventListener('click', generatePatch);

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

    if (!locks.master) currentPatch.master = generateMaster(style);
    if (!locks.osc) currentPatch.osc = generateOsc(style);
    if (!locks.env) currentPatch.env = generateEnv(style);

    // For LFO/Cyc, if they are unlocked, we regenerate based on CURRENT matrix usage.
    // If they are locked, they stay as is (even if matrix says they are unused, or vice versa).
    if (!locks.cyc) currentPatch.cyc = generateCyc(usedSources.has("CycEnv"));
    if (!locks.lfo) currentPatch.lfo = generateLFO(usedSources.has("LFO"));

    // Render Cards
    outputGrid.appendChild(createCard("Master & Voice", currentPatch.master, "master"));
    outputGrid.appendChild(createCard("Oscillator", currentPatch.osc, "osc"));
    outputGrid.appendChild(createCard("Amp & Filter Env", currentPatch.env, "env"));
    outputGrid.appendChild(createCard("Cycling Envelope", currentPatch.cyc, "cyc"));
    outputGrid.appendChild(createCard("LFO", currentPatch.lfo, "lfo"));

    // Render Matrix Card (Special Layout)
    outputGrid.appendChild(createMatrixCard(currentPatch.matrixData, currentPatch.master, "matrix"));
}

// Generators
function generateMaster(style) {
    let vMode = (style === "lead" || style === "bass" || style === "percussion") ? "Monophonic" : (style === "pad" ? "Paraphonic" : ["Monophonic", "Paraphonic", "Unison"][rInt(3)]);
    let uni = "0";
    if (vMode === "Unison") {
        const spots = [0, 4, 7, 8, 12];
        uni = (spots[rInt(spots.length)] + (Math.random() * 0.246 - 0.123)).toFixed(3);
    }
    let fType = (style === "percussion") ? ["BP", "HP"][rInt(2)] : ["LP", "BP", "HP"][rInt(3)];
    let cutoff = (style === "percussion") ? rVal(500, 5000) + "Hz" : (Math.random() * 20 + 0.5).toFixed(1) + "kHz";

    return [
        { label: "Octave", val: (style === "bass" ? -2 : 0) },
        { label: "Voice Mode", val: vMode },
        { label: "Unison Spread", val: uni !== "0" ? uni : null },
        { label: "Filter Type", val: fType },
        { label: "Cutoff", val: cutoff },
        { label: "Resonance", val: rVal(10, 80) + "%" }
    ];
}

function generateOsc(style) {
    let type = style === "percussion" ? "Noise" : (style === "vocoder" ? "Vocoder" : oscTypes[rInt(oscTypes.length)]);
    let waveLabel = "Wave Knob";
    let waveVal = rVal(0, 100) + "%";

    if (type === "Chords") {
        waveLabel = "Chord Type";
        waveVal = chordTypes[rInt(chordTypes.length)];
    } else if (type === "Wavetable") {
        waveVal = rVal(1, 16);
    }

    return [
        { label: "Type", val: type },
        { label: waveLabel, val: waveVal },
        { label: "Timbre", val: rVal(10, 90) + "%" },
        { label: "Shape", val: rVal(10, 90) + "%" }
    ];
}

function generateEnv(style) {
    let atk = (style === "percussion") ? "0ms" : (style === "pad" ? getTime(1000, 3000) : "5ms");
    let dec = (style === "percussion") ? getTime(20, 150) : getTime(200, 25000); // 200ms to 25s
    let fAmt = (style === "percussion" || style === "brass" || style === "pad") ? rVal(40, 95) : rVal(-100, 100);
    return [
        { label: "Attack", val: atk },
        { label: "Decay/Rel", val: dec },
        { label: "Sustain", val: rVal(0, 100) + "%" },
        { label: "Filter Amt", val: fAmt }
    ];
}

function generateCyc(active) {
    if (!active) return [{ label: "Status", val: "Inactive (Not in Matrix)" }];

    let mode = ["Env", "Run", "Loop"][rInt(3)];
    let susLabel = (mode === "Env") ? "Sustain" : "Hold"; // Dynamic label
    let susVal = (mode === "Env") ? rVal(0, 100) + "%" : getTime(0, 5000); // Expanded Hold time slightly

    return [
        { label: "Mode", val: mode },
        { label: "Rise", val: getTime(10, 1000) },
        { label: "Fall", val: getTime(10, 1000) },
        { label: susLabel, val: susVal },
        { label: "Amount", val: rVal(0, 100) + "%" }
    ];
}

function generateLFO(active) {
    if (!active) return [{ label: "Status", val: "Inactive (Not in Matrix)" }];

    const sync = ["ON", "OFF"][rInt(2)];
    const rate = (sync === "ON") ? lfoSyncRates[rInt(lfoSyncRates.length)] : (Math.random() * 50).toFixed(2) + " Hz";

    return [
        { label: "Shape", val: lfoShapes[rInt(lfoShapes.length)] },
        { label: "Sync", val: sync },
        { label: "Rate", val: rate }
    ];
}

function generateMatrixData(style, intensity) {
    let count = { 'simple': rVal(2, 3), 'moderate': rVal(4, 7), 'high': rVal(8, 12), 'extreme': rVal(15, 20) }[intensity];
    let usedSources = new Set();
    let usedAssigns = new Set();
    let connections = [];
    let config = [];
    let targets = [...assignTargets];

    // Randomize 3 assign slots
    for (let i = 0; i < 3; i++) config.push(targets.splice(rInt(targets.length), 1)[0]);

    let pairs = new Set();
    let cols = [...fixedDests, "Assign 1", "Assign 2", "Assign 3"];

    for (let i = 0; i < count; i++) {
        let s = modSources[rInt(modSources.length)];
        let d = cols[rInt(cols.length)];
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
    lockBtn.onclick = (e) => toggleLock(lockKey, e);

    header.appendChild(titleSpan);
    header.appendChild(lockBtn);
    card.appendChild(header);

    dataRows.forEach(row => {
        if (row.val === null) return;
        const r = document.createElement('div');
        r.className = 'param-row';
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
    lockBtn.onclick = (e) => toggleLock(lockKey, e);

    header.appendChild(lockBtn);
    card.appendChild(header);

    // Assign Config
    for (let i = 0; i < 3; i++) {
        const row = document.createElement('div');
        row.className = 'param-row compact';
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
