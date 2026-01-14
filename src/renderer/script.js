const fs = require('fs');
const path = require('path');
const os = require('os');
const { ipcRenderer, shell } = require('electron');

// Toast Notification
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

function showToast(message, duration = 3000) {
    toastMessage.innerText = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

// Listen for update status from main process
ipcRenderer.on('update-status', (event, data) => {
    if (data.type === 'uptodate') {
        showToast(`✅ ${data.message}`, 4000);
    } else if (data.type === 'available') {
        showToast(`📥 ${data.message}`, 5000);
    }
});

const {
    oscTypes, chordTypes, oscParams, lfoShapes, lfoSyncRates, modSources, fixedDests, assignTargets, ccMap, styleEngines
} = require('./constants');
const { rInt, rVal, getTime } = require('./utils');
const JSZip = require('jszip'); // Use local dependency

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
// Utilities imported from utils.js

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

// Sub-Settings Selectors
const btnSetGeneral = document.getElementById('btn-settings-general');
const btnSetMidi = document.getElementById('btn-settings-midi');
const btnSetDebug = document.getElementById('btn-settings-debug');
const setMainMenu = document.getElementById('settings-main-menu');
const setSubGeneral = document.getElementById('settings-sub-general');
const setSubMidi = document.getElementById('settings-sub-midi');
const setSubDebug = document.getElementById('settings-sub-debug');
const btnBackSettings = document.getElementById('btn-back-settings');
const settingsTitle = document.getElementById('settings-title');

// New UI Elements (v2.8)
const btnSave = document.getElementById('btn-save');
const btnGallery = document.getElementById('btn-gallery');
const viewGenerator = document.getElementById('view-generator');
const viewGallery = document.getElementById('view-gallery');
const btnBackGen = document.getElementById('btn-back-gen');
const contentArea = document.querySelector('.content-area');

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

// Install App Logic (may not exist in all versions)
const btnInstallApp = document.getElementById('btn-install-app');
const installStatus = document.getElementById('install-status');
const installSection = document.getElementById('install-section');

// Check if running as installed app or portable
(async () => {
    const isPortable = await ipcRenderer.invoke('check-portable');
    if (!isPortable) {
        // Already installed, hide the install button
        if (installSection) installSection.style.display = 'none';
    } else {
        if (installStatus) installStatus.innerText = 'Running in portable mode.';
    }
})();

if (btnInstallApp) {
    btnInstallApp.addEventListener('click', async () => {
        btnInstallApp.disabled = true;
        btnInstallApp.innerText = '⏳ Checking...';

        const result = await ipcRenderer.invoke('trigger-install');

        if (result.success) {
            if (installStatus) {
                installStatus.innerText = result.message;
                installStatus.style.color = '#00ff88';
            }
            btnInstallApp.innerText = '✅ Done';
        } else {
            if (installStatus) {
                installStatus.innerText = result.message;
                installStatus.style.color = '#e74c3c';
            }
            btnInstallApp.innerText = '📥 Install to PC';
            btnInstallApp.disabled = false;
        }
    });
}

// Modal Logic
btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// Sub-Settings Navigation Logic
function openSubSettings(subPage, title) {
    setMainMenu.classList.add('hidden');
    subPage.classList.remove('hidden');
    btnBackSettings.classList.remove('hidden');
    settingsTitle.innerText = title;
}

function closeSubSettings() {
    setMainMenu.classList.remove('hidden');
    [setSubGeneral, setSubMidi, setSubDebug].forEach(el => el.classList.add('hidden'));
    btnBackSettings.classList.add('hidden');
    settingsTitle.innerText = 'Settings';
}

if (btnSetGeneral) btnSetGeneral.addEventListener('click', () => openSubSettings(setSubGeneral, 'General Settings'));
if (btnSetMidi) btnSetMidi.addEventListener('click', () => openSubSettings(setSubMidi, 'MIDI Controls'));
if (btnSetDebug) btnSetDebug.addEventListener('click', () => openSubSettings(setSubDebug, 'Debug / Test'));
if (btnBackSettings) btnBackSettings.addEventListener('click', closeSubSettings);

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

// Debug Mode & Error Reporting
const toggleDebug = document.getElementById('toggle-debug');
const debugTestContainer = document.getElementById('debug-test-container');
const btnTestError = document.getElementById('btn-test-error');

let debugMode = localStorage.getItem('freakgen_debug') === 'true';

// Error Modal Elements
const errorModal = document.getElementById('error-modal');
const btnCloseError = document.getElementById('btn-close-error');
const btnDismissError = document.getElementById('btn-dismiss-error');
const btnCopyError = document.getElementById('btn-copy-error');
const btnReportGithub = document.getElementById('btn-report-github');
const errorContextEl = document.getElementById('error-context');
const errorDetailsEl = document.getElementById('error-details');

// AI State - REMOVED

// AI Logic Removed


// Wire up Error Modal
if (btnCloseError) btnCloseError.addEventListener('click', () => errorModal.classList.add('hidden'));
if (btnDismissError) btnDismissError.addEventListener('click', () => errorModal.classList.add('hidden'));

if (btnCopyError) {
    btnCopyError.addEventListener('click', () => {
        if (errorDetailsEl) {
            errorDetailsEl.select();
            document.execCommand('copy'); // Fallback or use navigator.clipboard
            navigator.clipboard.writeText(errorDetailsEl.value).then(() => {
                showToast("📋 Error copied to clipboard", 2000);
            }).catch(() => {
                // Fallback
                document.execCommand('copy');
                showToast("📋 Error copied (Legacy)", 2000);
            });
        }
    });
}

if (btnReportGithub) {
    btnReportGithub.addEventListener('click', () => {
        // Open GitHub Issues
        shell.openExternal('https://github.com/AppleExpl01t/FreakGEN-Architect-/issues/new');
    });
}

// Init state
if (toggleDebug) {
    toggleDebug.checked = debugMode;
    if (debugMode && debugTestContainer) debugTestContainer.classList.remove('hidden');

    toggleDebug.addEventListener('change', (e) => {
        debugMode = e.target.checked;
        localStorage.setItem('freakgen_debug', debugMode);

        if (debugMode) {
            if (debugTestContainer) debugTestContainer.classList.remove('hidden');
            showToast("🐞 Debug Mode Enabled", 2000);
        } else {
            if (debugTestContainer) debugTestContainer.classList.add('hidden');
            showToast("Debug Mode Disabled", 2000);
        }
    });
}

// Test Error Logic
if (btnTestError) {
    btnTestError.addEventListener('click', () => {
        try {
            // Simulate an error
            throw new Error("This is a simulated error to test the reporting system.");
        } catch (e) {
            reportError(e, "User Triggered Test");
        }
    });
}

function reportError(error, context = 'General') {
    const errorDetails = {
        process: 'renderer',
        context: context,
        message: error.message || error.toString(),
        stack: error.stack || 'No Stack Trace',
        time: new Date().toISOString()
    };

    // Send to main process for logging
    ipcRenderer.invoke('log-error', errorDetails).catch(err => console.error("Failed to ship log:", err));

    // Show User Feedback
    if (debugMode || context.includes('Test')) {
        // Use custom HTML modal instead of native dialog
        if (errorModal) {
            errorContextEl.innerText = `Error Context: ${context}`;
            errorDetailsEl.value = `${error.message}\n\n${error.stack}`;
            errorModal.classList.remove('hidden');
        } else {
            // Fallback
            alert(`Error: ${error.message}`);
        }
    } else {
        // Subtle notification for non-debug
        console.error(error); // Ensure it's in DevTools
    }
}

// Global Error Handlers
window.addEventListener('error', (event) => {
    reportError(event.error || new Error(event.message), `Uncaught Exception (${event.filename}:${event.lineno})`);
});

window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason || new Error('Unhandled Rejection'), 'Promise Rejection');
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
    try {
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
        if (!locks.cyc) currentPatch.cyc = generateCyc(usedSources.has("CycEnv"));
        if (!locks.lfo) currentPatch.lfo = generateLFO(usedSources.has("LFO"));

        // Render Cards
        outputGrid.appendChild(createCard("Master & Voice", currentPatch.master, "master"));
        outputGrid.appendChild(createCard("Oscillator / Type", currentPatch.osc, "osc"));
        outputGrid.appendChild(createCard("Amp & Filter Env", currentPatch.env, "env"));
        outputGrid.appendChild(createCard("Cycling Envelope", currentPatch.cyc, "cyc"));
        outputGrid.appendChild(createCard("LFO", currentPatch.lfo, "lfo"));
        outputGrid.appendChild(createMatrixCard(currentPatch.matrixData, currentPatch.master, "matrix"));
    } catch (err) {
        console.error("Generate error:", err);
        reportError(err, "Generate Patch");
        alert("Error generating patch: " + err.message);
    }
}

// Generators
// Generators
function genRaw(minPc = 0, maxPc = 100) {
    // Generates { val: "XX%", raw: 0-127 }
    const raw = rVal(Math.floor(minPc / 100 * 127), Math.floor(maxPc / 100 * 127));
    const val = Math.floor((raw / 127) * 100) + "%";
    return { val, raw };
}

function generateMaster(style, intensity, forceMono = false) {
    let vMode;
    if (style === "lead" || style === "bass" || style === "percussion" || forceMono) {
        vMode = "Monophonic";
    } else if (style === "pad") {
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

    // Cutoff: linear map 0-127 to 20Hz-20kHz (approx) or just random for display
    // We'll generate a raw value 0-127
    const cutRaw = rInt(128);
    // Display: Very roughly map to Hz/kHz for flavor
    let cutoff;
    if (style === "percussion") {
        cutoff = rVal(500, 5000) + "Hz"; // specific override style
        // adjust raw to match roughly
        // 500Hz is low, 5000Hz is mid. 
        // Let's just keep cutRaw random or biased?
        // For percussion we want specific raw values? 
        // Let's rely on the random raw for the push, and random display for text. 
        // Ideally they match.
    } else {
        cutoff = (cutRaw / 127 * 19.5 + 0.5).toFixed(1) + "kHz";
    }

    // Resonance
    const res = genRaw(10, 80);

    // Glide Logic
    let glideVal = null;
    let glideRaw = 0;
    if (intensity === 'high' && Math.random() < 0.25) {
        glideVal = getTime(10, 500);
        glideRaw = rVal(5, 40);
    } else if (intensity === 'extreme' && Math.random() < 0.50) {
        glideVal = getTime(10, 10000);
        glideRaw = rVal(5, 100);
    }

    // Glide mapping is weird, usually 0 is off.

    return [
        { label: "Octave", val: (style === "bass" ? -2 : 0), tooltip: "Use the Octave |< >| buttons above the keyboard." },
        { label: "Voice Mode", val: vMode, tooltip: "Press 'Paraphonic'. Shift+Para for Unison/Mono." },
        { label: "Unison Spread", val: uni !== "0" ? uni : null, tooltip: "Amount of detune. (Check Utility menu or Shift functions for Unison Spread)." },
        { label: "Glide", val: glideVal, raw: glideRaw, tooltip: "Turn the Glide knob." },
        { label: "Filter Type", val: fType, tooltip: "Press the 'Filter Type' button to cycle (LP/BP/HP)." },
        { label: "Cutoff", val: cutoff, raw: cutRaw, tooltip: "Turn the Cutoff knob in the Analog Filter section." },
        { label: "Resonance", val: res.val, raw: res.raw, tooltip: "Turn the Resonance knob in the Analog Filter section." }
    ];
}

function generateOsc(style, forceEngine = "random") {
    let type = forceEngine;
    if (type === "random") {
        if (!styleEngines[style]) style = "random";
        const allowed = styleEngines[style] || oscTypes;
        type = allowed[rInt(allowed.length)];
    }

    const params = oscParams[type] || { w: "Wave", t: "Timbre", s: "Shape" };

    // Standard raw generation
    let wRaw = rInt(128);
    let tRaw = rInt(128);
    let sRaw = rInt(128);

    let waveVal = Math.floor(wRaw / 127 * 100) + "%";
    let tVal = Math.floor(tRaw / 127 * 100) + "%";
    let sVal = Math.floor(sRaw / 127 * 100) + "%";

    // Overrides
    if (type === "Chords") {
        const cIdx = rInt(chordTypes.length);
        waveVal = chordTypes[cIdx];
        // Map index to raw roughly? 
        // 12 values. 127/11 approx 11 step.
        wRaw = Math.floor(cIdx * (127 / (chordTypes.length - 1)));
    } else if (type === "Wavetable") {
        let wv = rVal(1, 16);
        waveVal = wv;
        wRaw = Math.floor((wv - 1) / 15 * 127); // 1-16 map to 0-127
    }

    return [
        { label: "Type", val: type, tooltip: "Turn the Type knob in the Digital Oscillator section." },
        { label: params.w, val: waveVal, raw: wRaw, tooltip: "Turn the Wave knob (Orange)." },
        { label: params.t, val: tVal, raw: tRaw, tooltip: "Turn the Timbre knob (White)." },
        { label: params.s, val: sVal, raw: sRaw, tooltip: "Turn the Shape knob (White)." }
    ];
}

function generateEnv(style) {
    // Attack
    let atkRaw = rInt(128);
    let atk = (style === "percussion") ? "0ms" : (style === "pad" ? getTime(1000, 3000) : "5ms");
    if (style === "percussion") atkRaw = 0;

    // Decay / Release (Tuned V3.3.2)
    let decRaw = rInt(128);
    let dec;

    if (style === "percussion") {
        dec = getTime(20, 400); // Snappy
    } else if (style === "bass") {
        dec = getTime(100, 2000); // Max 2s
    } else if (style === "pad") {
        dec = getTime(1000, 8000); // Max 8s (was 25s!)
    } else {
        dec = getTime(200, 4000); // General max 4s
    }

    // Filter Amt (Bipolar 0-127, 64=0)
    let fAmtRaw;
    let fAmt;
    if (style === "percussion" || style === "brass" || style === "pad") {
        // High positive
        fAmtRaw = rVal(80, 127);
    } else {
        fAmtRaw = rVal(0, 127);
    }
    // Map raw to display -100 to 100
    let famtVal = Math.floor((fAmtRaw - 64) / 63 * 100);
    fAmt = famtVal; // e.g. -50, 20

    // Sustain
    // Tune sustain probability
    let sus = genRaw(0, 100);
    if (style === "bass" || style === "lead") {
        // Bias towards higher sustain for playability
        if (Math.random() > 0.3) {
             const raw = rVal(100, 127); 
             sus = { raw: raw, val: Math.floor(raw / 127 * 100) + "%" };
        }
    }

    return [
        { label: "Attack", val: atk, raw: atkRaw, tooltip: "Adjust the Attack slider in the Envelope section." },
        { label: "Decay/Rel", val: dec, raw: decRaw, tooltip: "Adjust the Decay/Release slider in the Envelope section." },
        { label: "Sustain", val: sus.val, raw: sus.raw, tooltip: "Adjust the Sustain slider in the Envelope section." },
        { label: "Filter Amt", val: fAmt, raw: fAmtRaw, tooltip: "Turn the Filter Amt knob in the Envelope section." }
    ];
}

function generateCyc(active) {
    if (!active) return [{ label: "Status", val: "INT - Blank", tooltip: "This module is not active in the modulation matrix." }];

    let mode = ["Env", "Run", "Loop"][rInt(3)];
    let susLabel = (mode === "Env") ? "Sustain" : "Hold";

    // Raw values
    let riseRaw = rInt(128);
    let fallRaw = rInt(128);
    let holdRaw = rInt(128);
    let amt = genRaw(0, 100); // Amount

    let susVal = (mode === "Env") ? Math.floor(holdRaw / 127 * 100) + "%" : getTime(0, 5000);

    const result = [
        { label: "Mode", val: mode, tooltip: "Press the Mode button in the Cycling Envelope section." },
        { label: "Rise", val: getTime(10, 1000), raw: riseRaw, tooltip: "Turn the Rise knob in the Cycling Envelope section." }
    ];

    if (selIntensity.value !== "simple") {
        result.push({ label: "Rise Shape", val: rVal(1, 100) + "%", tooltip: "Hold Shift and turn the Rise knob." });
    }

    result.push({ label: "Fall", val: getTime(10, 1000), raw: fallRaw, tooltip: "Turn the Fall knob in the Cycling Envelope section." });

    if (selIntensity.value !== "simple") {
        result.push({ label: "Fall Shape", val: rVal(1, 100) + "%", tooltip: "Hold Shift and turn the Fall knob." });
    }

    result.push({ label: susLabel, val: susVal, raw: holdRaw, tooltip: "Turn the Hold/Sustain knob in the Cycling Envelope section." });
    result.push({ label: "Amount", val: amt.val, raw: amt.raw, tooltip: "Turn the Amount knob in the Cycling Envelope section." });

    return result;
}

function generateLFO(active) {
    if (!active) return [{ label: "Status", val: "INT - Blank", tooltip: "This module is not active in the modulation matrix." }];

    const sync = ["ON", "OFF"][rInt(2)];
    // Rate raw: 0-127
    let rateRaw = rInt(128);
    const rate = (sync === "ON") ? lfoSyncRates[rInt(lfoSyncRates.length)] : (rateRaw / 127 * 50).toFixed(2) + " Hz";

    return [
        { label: "Shape", val: lfoShapes[rInt(lfoShapes.length)], tooltip: "Press the Shape button in the LFO section." },
        { label: "Sync", val: sync, tooltip: "Press the Sync button in the LFO section." },
        { label: "Rate", val: rate, raw: rateRaw, tooltip: "Turn the Rate knob in the LFO section." }
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

    const vModeObj = masterData.find(x => x.label === "Voice Mode");
    const vMode = vModeObj ? vModeObj.val : "Monophonic";

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

// Function to safely push current state to history (Missing in original scan)
function pushToHistory(patch) {
    patchHistory.push(JSON.parse(JSON.stringify(patch)));
    if (patchHistory.length > historyDepth) patchHistory.shift();
    patchFuture = [];
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

// --- MIDI Logic ---

// ccMap imported from constants.js

let midiAccess = null;
let selectedMidiOut = null;

// UI Elements
const btnMidi = document.getElementById('btn-midi');
const midiModal = document.getElementById('midi-modal');
const btnCloseMidi = document.getElementById('btn-close-midi');
const midiSelect = document.getElementById('midi-output-select');
const btnRefreshMidi = document.getElementById('btn-refresh-midi');
const btnPushMidi = document.getElementById('btn-push-midi');
const midiStatus = document.getElementById('midi-status');

// Emulation
const toggleEmulate = document.getElementById('toggle-emulate-synth');
let emulateSynth = localStorage.getItem('freakgen_emulate') === 'true';
if (toggleEmulate) {
    toggleEmulate.checked = emulateSynth;
    toggleEmulate.addEventListener('change', (e) => {
        emulateSynth = e.target.checked;
        localStorage.setItem('freakgen_emulate', emulateSynth);
        updateMidiDevices(); // Refresh list to show/hide virtual
    });
}

// Init
// MIDI Setup Logic (Refactored v3.3.1 for Settings Menu)

// midiSelect and btnRefreshMidi are already defined in upper scope (as indicated by linter).
// We use them safely here.

const btnPushMidiLocalRef = document.getElementById('btn-push-midi');
const midiStatusLocalRef = document.getElementById('midi-status');

// Helper to update status text if element exists
const updateMidiStatus = (msg, color) => {
    if (midiStatusLocalRef) {
        midiStatusLocalRef.innerText = msg;
        midiStatusLocalRef.style.color = color;
    }
};

if (typeof btnRefreshMidi !== 'undefined' && btnRefreshMidi) {
    btnRefreshMidi.addEventListener('click', () => {
        if (!midiAccess && !emulateSynth) initMIDI();
        else updateMidiDevices();
    });
}

if (typeof midiSelect !== 'undefined' && midiSelect) {
    midiSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'virtual-mf') {
            selectedMidiOut = { id: 'virtual-mf', name: 'Virtual MicroFreak (Debug)', send: (data) => console.log('[Virtual MIDI]', data) };
            showToast(`🎹 Virtual Synth Connected (Debug Log Enabled)`, 3000);
            localStorage.setItem('freakgen_midi_id', 'virtual-mf');
            return;
        }
        if (!midiAccess) return;
        selectedMidiOut = midiAccess.outputs.get(val);
        if (selectedMidiOut) {
            showToast(`🎹 MIDI Output set to: ${selectedMidiOut.name}`, 3000);
            localStorage.setItem('freakgen_midi_id', selectedMidiOut.id);
        }
    });
}

// Ensure Push to Midi is wired
if (btnPushMidiLocalRef) {
    btnPushMidiLocalRef.onclick = pushToMidi;
}

async function initMIDI() {
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        midiAccess.onstatechange = (e) => {
            // Only update if it's an output port
            if (e.port.type === 'output') updateMidiDevices();
        };
        updateMidiDevices();
        midiStatus.innerText = "MIDI System Ready";
        midiStatus.style.color = "#00ff88";
    } catch (err) {
        console.error("MIDI Init Failed", err);
        if (emulateSynth) {
            midiStatus.innerText = "MIDI Failed (Emulation Active)";
            midiStatus.style.color = "#ffcc00";
            updateMidiDevices();
        } else {
            midiStatus.innerText = "MIDI Access Failed: " + err.message;
            midiStatus.style.color = "#e74c3c";
        }
    }
}

function updateMidiDevices() {
    midiSelect.innerHTML = '<option value="">-- Select Output --</option>';

    let outputs = [];
    if (midiAccess) {
        outputs = Array.from(midiAccess.outputs.values());
    }

    if (emulateSynth) {
        outputs.push({ id: 'virtual-mf', name: 'Virtual MicroFreak (Debug)' });
    }

    const storedId = localStorage.getItem('freakgen_midi_id');

    let foundStored = false;
    let mfFound = null;

    outputs.forEach(output => {
        const opt = document.createElement('option');
        opt.value = output.id;
        opt.innerText = output.name;
        midiSelect.appendChild(opt);

        if (output.id === storedId) foundStored = true;
        if (output.name.toLowerCase().includes('microfreak')) mfFound = output;
    });

    if (foundStored) {
        midiSelect.value = storedId;
        if (storedId === 'virtual-mf') {
            selectedMidiOut = { id: 'virtual-mf', name: 'Virtual MicroFreak (Debug)', send: (data) => console.log('[Virtual MIDI]', data) };
        } else if (midiAccess) {
            selectedMidiOut = midiAccess.outputs.get(storedId);
        }
    } else if (mfFound) {
        // Auto-select MicroFreak if no preference
        midiSelect.value = mfFound.id;
        selectedMidiOut = mfFound;
    } else if (outputs.length > 0) {
        // Default to first
        midiSelect.value = outputs[0].id;
        if (outputs[0].id === 'virtual-mf') {
            selectedMidiOut = { id: 'virtual-mf', name: 'Virtual MicroFreak (Debug)', send: (data) => console.log('[Virtual MIDI]', data) };
        } else {
            selectedMidiOut = outputs[0];
        }
    } else {
        midiSelect.innerHTML = '<option value="">No MIDI Devices Found</option>';
        selectedMidiOut = null;
    }
}

function sendCC(cc, val) {
    if (!selectedMidiOut) return;

    // Virtual Handling
    if (selectedMidiOut.id === 'virtual-mf') {
        console.log(`%c[Virtual MIDI] CC ${cc} -> ${val}`, 'color: #00ff88; background: #000; padding: 2px 4px;');
        return;
    }

    // Limit 0-127
    val = Math.max(0, Math.min(127, Math.floor(val)));
    // Channel 1 (0xB0)
    selectedMidiOut.send([0xB0, cc, val]);
}
window.sendCC = sendCC;

const manualModal = document.getElementById('manual-push-modal');
const btnCloseManual = document.getElementById('btn-close-manual');
const btnManualDone = document.getElementById('btn-manual-done');
const manualList = document.getElementById('manual-instructions-list');

if (btnCloseManual) btnCloseManual.addEventListener('click', () => manualModal.classList.add('hidden'));
if (btnManualDone) btnManualDone.addEventListener('click', () => manualModal.classList.add('hidden'));

function pushToMidi() {
    if (!selectedMidiOut) {
        showToast("⚠️ No MIDI Output Selected. Check settings.", 3000);
        return;
    }

    let count = 0;
    let manualParams = [];

    // Helper to extract numeric value from string if 'raw' is missing (Legacy/Fallback)
    const extractVal = (str) => {
        if (typeof str !== 'string') return 0;
        if (str.includes('%')) return parseInt(str) * 1.27; // 100% -> 127
        if (str.includes('ms')) return parseInt(str);
        if (str.includes('s') && !str.includes('ms')) return parseFloat(str) * 10;
        return 0;
    };

    // 1. Oscillator
    if (currentPatch.osc) {
        const typeObj = currentPatch.osc.find(x => x.label === "Type");

        // Oscillator Type (CC 9)
        if (typeObj) {
            // Specific MIDI CC values for MicroFreak Oscillator Types
            const oscCCValues = {
                "BasicWaves": 5, "Superwave": 11, "Wavetable": 17, "Harmonic": 23,
                "KarplusStrong": 29, "Virtual Analog": 34, "Waveshaper": 40, "Two Op FM": 46,
                "Formant": 52, "Chords": 58, "Speech": 64, "Modal": 69, "Noise": 75,
                "Vocoder": 81, "Bass": 87, "SawX": 93, "Harm": 98, "WaveUser": 104,
                "Sample": 110, "Scan Grains": 116, "Cloud Grains": 122, "Hit Grains": 127
            };

            const targetCC = oscCCValues[typeObj.val];

            if (targetCC !== undefined) {
                sendCC(9, targetCC);
                count++;
            } else {
                manualParams.push(`Osc Type: <span style="color:var(--accent)">${typeObj.val}</span>`);
            }
        }

        if (currentPatch.osc.length >= 4) {
            const w = currentPatch.osc[1];
            const t = currentPatch.osc[2];
            const s = currentPatch.osc[3];

            if (w.raw !== undefined) sendCC(10, w.raw); else sendCC(10, extractVal(w.val));
            if (t.raw !== undefined) sendCC(12, t.raw); else sendCC(12, extractVal(t.val));
            if (s.raw !== undefined) sendCC(13, s.raw); else sendCC(13, extractVal(s.val));
            count += 3;
        }
    }

    // 2. Filter / Master
    if (currentPatch.master) {
        const cut = currentPatch.master.find(x => x.label === "Cutoff");
        const res = currentPatch.master.find(x => x.label === "Resonance");
        const glide = currentPatch.master.find(x => x.label === "Glide");
        const fType = currentPatch.master.find(x => x.label === "Filter Type");

        // Manuals (non-MIDI controllable via CC)
        const oct = currentPatch.master.find(x => x.label === "Octave");
        const vMode = currentPatch.master.find(x => x.label === "Voice Mode");
        const uni = currentPatch.master.find(x => x.label === "Unison Spread");

        if (oct && oct.val != 0) manualParams.push(`Octave: <span style="color:var(--accent)">${oct.val > 0 ? '+' + oct.val : oct.val}</span>`);
        if (vMode) manualParams.push(`Voice Mode: <span style="color:var(--accent)">${vMode.val}</span>`);
        if (uni && uni.val && uni.val !== "0") manualParams.push(`Unison Spread: <span style="color:var(--accent)">${uni.val}</span>`);
        // Filter Type is a button toggle on MicroFreak - not MIDI controllable
        if (fType) manualParams.push(`Filter Type: <span style="color:var(--accent)">${fType.val}</span>`);

        // Cutoff (CC 23)
        if (cut) {
            if (cut.raw !== undefined) {
                sendCC(23, cut.raw);
            } else {
                sendCC(23, extractVal(cut.val));
            }
            count++;
        }

        // Resonance (CC 83)
        if (res) {
            if (res.raw !== undefined) sendCC(83, res.raw);
            else sendCC(83, extractVal(res.val));
            count++;
        }

        // Glide (CC 5)
        if (glide) {
            if (glide.raw !== undefined) sendCC(5, glide.raw);
            else if (glide.val) sendCC(5, extractVal(glide.val));
            else sendCC(5, 0);
            count++;
        }
    }

    // 3. Envelope
    if (currentPatch.env) {
        const atk = currentPatch.env.find(x => x.label === "Attack");
        const dec = currentPatch.env.find(x => x.label === "Decay/Rel");
        const sus = currentPatch.env.find(x => x.label === "Sustain");
        const fAmt = currentPatch.env.find(x => x.label === "Filter Amt");

        if (atk) sendCC(105, atk.raw !== undefined ? atk.raw : extractVal(atk.val));
        if (dec) sendCC(106, dec.raw !== undefined ? dec.raw : extractVal(dec.val));
        if (sus) sendCC(29, sus.raw !== undefined ? sus.raw : extractVal(sus.val));
        if (fAmt) {
            let val = 64;
            if (fAmt.raw !== undefined) {
                val = fAmt.raw;
            } else {
                val = 64 + (parseInt(fAmt.val) * 0.64);
            }
            sendCC(26, val);
        }
        count += 4;
    }

    // 4. LFO
    if (currentPatch.lfo) {
        const shape = currentPatch.lfo.find(x => x.label === "Shape");
        const rate = currentPatch.lfo.find(x => x.label === "Rate");
        const sync = currentPatch.lfo.find(x => x.label === "Sync" || x.label === "Rate Sync");
        const lfoType = currentPatch.lfo.find(x => x.label === "Type");

        // LFO Type is a manual setting (not MIDI controllable on MicroFreak)
        if (lfoType) manualParams.push(`LFO Type: <span style="color:var(--accent)">${lfoType.val}</span>`);

        // LFO Shape - button on MicroFreak, not MIDI controllable
        if (shape) manualParams.push(`LFO Shape: <span style="color:var(--accent)">${shape.val}</span>`);

        // LFO Sync - button toggle on MicroFreak, not MIDI controllable
        if (sync) manualParams.push(`LFO Sync: <span style="color:var(--accent)">${sync.val}</span>`);

        // LFO Rate (CC 93 for free rate, CC 94 for synced rate value)
        if (rate) {
            // Determine if synced or free based on sync value
            const isSync = sync && (sync.val || "").toUpperCase() === "ON";
            const rateCC = isSync ? 94 : 93;
            sendCC(rateCC, rate.raw !== undefined ? rate.raw : extractVal(rate.val));
            count++;
        }
    }

    // 5. Cycling Env
    if (currentPatch.cyc && currentPatch.cyc[0].val !== "INT - Blank") {
        const cycType = currentPatch.cyc.find(x => x.label === "Dest" || x.label === "Type" || x.label === "Destination");
        const rise = currentPatch.cyc.find(x => x.label === "Rise");
        const fall = currentPatch.cyc.find(x => x.label === "Fall");
        const hold = currentPatch.cyc.find(x => x.label.includes("Hold") || x.label.includes("Sustain"));
        const amt = currentPatch.cyc.find(x => x.label === "Amount");

        // Cycling Env Type/Destination is a manual setting (not MIDI controllable)
        if (cycType) manualParams.push(`Cycling Env Dest: <span style="color:var(--accent)">${cycType.val}</span>`);

        if (rise) {
            sendCC(102, rise.raw !== undefined ? rise.raw : extractVal(rise.val));
            count++;
        }
        if (fall) {
            sendCC(103, fall.raw !== undefined ? fall.raw : extractVal(fall.val));
            count++;
        }
        if (hold) {
            sendCC(28, hold.raw !== undefined ? hold.raw : extractVal(hold.val));
            count++;
        }
        if (amt) {
            sendCC(24, amt.raw !== undefined ? amt.raw : extractVal(amt.val));
            count++;
        }
    }

    // 6. Modulation Matrix (Manual Only)
    if (currentPatch.matrix && currentPatch.matrix.length > 0) {
        const activeMod = currentPatch.matrix.filter(m => m.amt !== "0");
        if (activeMod.length > 0) {
            manualParams.push(`<br><strong>Modulation Matrix:</strong>`);
            activeMod.forEach(m => {
                manualParams.push(`${m.src} → ${m.dest}: <span style="color:var(--accent)">${m.amt}</span>`);
            });
        }
    }

    // Show manual instructions
    manualList.innerHTML = manualParams.map(p => `<div>• ${p}</div>`).join('');
    manualModal.classList.remove('hidden');

    showToast(`📡 Sent ${count} Params via MIDI`, 3000);
}

// --- Program Change (Select Preset on Synth) ---
const programChangeInput = document.getElementById('program-change-num');
const btnSendProgramChange = document.getElementById('btn-send-program-change');

if (btnSendProgramChange) {
    btnSendProgramChange.addEventListener('click', () => {
        if (!selectedMidiOut) {
            showToast("⚠️ No MIDI Output Selected", 3000);
            return;
        }

        let presetNum = parseInt(programChangeInput.value) || 1;
        presetNum = Math.max(1, Math.min(384, presetNum));
        programChangeInput.value = presetNum;

        // MicroFreak uses Bank Select for presets above 127
        // Bank 0 = Presets 1-128, Bank 1 = 129-256, Bank 2 = 257-384
        const bank = Math.floor((presetNum - 1) / 128);
        const program = (presetNum - 1) % 128;

        // Virtual MIDI handling
        if (selectedMidiOut.id === 'virtual-mf') {
            console.log(`%c[Virtual MIDI] Bank Select: ${bank}, Program Change: ${program} (Preset ${presetNum})`, 'color: #00ff88; background: #000; padding: 2px 4px;');
            showToast(`📡 [Virtual] Selected Preset ${presetNum}`, 3000);
            return;
        }

        // Send Bank Select MSB (CC 0)
        selectedMidiOut.send([0xB0, 0, bank]);
        // Send Bank Select LSB (CC 32) - usually 0 for MicroFreak
        selectedMidiOut.send([0xB0, 32, 0]);
        // Send Program Change (Channel 1)
        selectedMidiOut.send([0xC0, program]);

        showToast(`📡 Selected Preset ${presetNum} on synth`, 3000);
    });
}

// --- Open MIDI Control Center ---
console.log("Initializing btnOpenMCC logic...");
const btnOpenMCC = document.getElementById('btn-open-mcc');
if (btnOpenMCC) {
    console.log("btnOpenMCC found, attaching listener.");
    btnOpenMCC.addEventListener('click', () => {
        console.log("btnOpenMCC clicked");
        const modal = document.getElementById('control-center-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Force z-index high
            modal.style.zIndex = "9999";

            if (window.renderControlPanel) {
                console.log("Rendering Control Panel...");
                window.renderControlPanel('control-center-grid');
            } else {
                alert("Error: renderControlPanel not found!");
            }
        } else {
            alert("Error: Control Center Modal not found in DOM!");
        }
    });
} else {
    console.error("btnOpenMCC NOT FOUND");
    alert("Debug: btn-open-mcc element not found in DOM!");
}

const btnCloseCC = document.getElementById('btn-close-cc');
const controlCenterModal = document.getElementById('control-center-modal');
if (btnCloseCC && controlCenterModal) {
    console.log("btnCloseCC and controlCenterModal found, attaching listeners.");
    btnCloseCC.addEventListener('click', () => controlCenterModal.classList.add('hidden'));
    controlCenterModal.addEventListener('click', (e) => {
        if (e.target === controlCenterModal) controlCenterModal.classList.add('hidden');
    });
}

// --- Export .freakgen Format ---
const btnExportFreakgen = document.getElementById('btn-export-freakgen');
if (btnExportFreakgen) {
    btnExportFreakgen.addEventListener('click', async () => {
        if (!currentPatch.matrixData) {
            showToast("⚠️ Generate or load a patch first", 3000);
            return;
        }

        const exportData = {
            format: "freakgen",
            version: "1.0",
            exported: new Date().toISOString(),
            appVersion: "3.2.0",
            patch: currentPatch
        };

        const defaultName = `FreakGEN_${currentPatch.realStyle || 'Patch'}_${Date.now()}.freakgen`;
        const savePath = await ipcRenderer.invoke('save-dialog', {
            title: 'Export FreakGEN Patch',
            defaultPath: path.join(os.homedir(), 'Desktop', defaultName),
            filters: [
                { name: 'FreakGEN Preset', extensions: ['freakgen'] },
                { name: 'JSON File', extensions: ['json'] }
            ]
        });

        if (savePath) {
            fs.writeFileSync(savePath, JSON.stringify(exportData, null, 2));
            showToast(`✅ Exported to ${path.basename(savePath)}`, 3000);
        }
    });
}

// --- Import .mfprojz Viewer ---
const btnImportMfprojz = document.getElementById('btn-import-mfprojz');
const mfprojzModal = document.getElementById('mfprojz-modal');
const btnCloseMfprojz = document.getElementById('btn-close-mfprojz');
const mfprojzPresetList = document.getElementById('mfprojz-preset-list');

if (btnCloseMfprojz) {
    btnCloseMfprojz.addEventListener('click', () => mfprojzModal.classList.add('hidden'));
}

if (btnImportMfprojz) {
    btnImportMfprojz.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('select-file', {
            title: 'Open MicroFreak Project File',
            filters: [
                { name: 'MicroFreak Project', extensions: ['mfprojz'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!result) return;

        try {
            const zipData = fs.readFileSync(result);
            const zip = await JSZip.loadAsync(zipData);

            // mfprojz is a ZIP file containing preset files
            const presets = [];
            const files = Object.keys(zip.files).filter(f => !zip.files[f].dir);

            for (const filename of files) {
                // Try to extract preset info from filename or content
                const basename = path.basename(filename, path.extname(filename));
                presets.push({
                    index: presets.length + 1,
                    filename: filename,
                    name: basename.replace(/_/g, ' ')
                });
            }

            // Display presets
            if (presets.length === 0) {
                mfprojzPresetList.innerHTML = '<div style="color: #666;">No presets found in this file.</div>';
            } else {
                mfprojzPresetList.innerHTML = presets.map(p => `
                    <div style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--accent); font-weight: bold; min-width: 30px;">${p.index}</span>
                        <span style="flex: 1;">${p.name}</span>
                        <span style="font-size: 10px; color: #666;">${p.filename}</span>
                    </div>
                `).join('');
            }

            mfprojzModal.classList.remove('hidden');
            showToast(`📂 Found ${presets.length} preset(s) in file`, 3000);

        } catch (err) {
            console.error("Failed to parse mfprojz:", err);
            showToast("❌ Failed to read mfprojz file: " + err.message, 3000);
        }
    });
}

// --- Import .freakgen Format ---
// Also support importing .freakgen files via the import backup button or drag-drop
function importFreakgenFile(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (data.format !== 'freakgen' || !data.patch) {
            showToast("⚠️ Invalid FreakGEN file format", 3000);
            return false;
        }

        // Load the patch
        currentPatch = data.patch;
        renderCardsFromCurrent();
        showGenerator();
        statusText.innerText = `LOADED: ${(currentPatch.realStyle || 'IMPORTED').toUpperCase()}`;
        pushToHistory(currentPatch);
        showToast(`✅ Imported patch from ${path.basename(filePath)}`, 3000);
        return true;

    } catch (err) {
        console.error("Failed to import freakgen:", err);
        showToast("❌ Failed to import: " + err.message, 3000);
        return false;
    }
}

// Handle file drop on window
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    for (const file of e.dataTransfer.files) {
        if (file.path.endsWith('.freakgen') || file.path.endsWith('.json')) {
            importFreakgenFile(file.path);
            break;
        }
    }
});




// Populate Debug MIDI
// Populate Control Panel (Shared by Debug and Control Center)
window.renderControlPanel = function (containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Oscillator Types (Discrete Buttons)
    const oscCCValues = {
        "BasicWaves": 5, "Superwave": 11, "Wavetable": 17, "Harmonic": 23,
        "KarplusStrong": 29, "Virtual Analog": 34, "Waveshaper": 40, "Two Op FM": 46,
        "Formant": 52, "Chords": 58, "Speech": 64, "Modal": 69, "Noise": 75,
        "Vocoder": 81, "Bass": 87, "SawX": 93, "Harm": 98, "WaveUser": 104,
        "Sample": 110, "Scan Grains": 116, "Cloud Grains": 122, "Hit Grains": 127
    };

    const labelOsc = document.createElement('div');
    labelOsc.style.gridColumn = "span 2";
    labelOsc.innerHTML = "<strong>Oscillator Types</strong>";
    grid.appendChild(labelOsc);

    for (const [name, ccVal] of Object.entries(oscCCValues)) {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.style.fontSize = '10px';
        btn.style.padding = '4px 2px';
        btn.innerText = name;
        btn.onclick = () => {
            sendCC(9, ccVal);
            showToast(`Sent Osc Type: ${name} (CC 9: ${ccVal})`);
        };
        grid.appendChild(btn);
    }

    // 2. Continuous Parameters from ccMap
    const labelParams = document.createElement('div');
    labelParams.style.gridColumn = "span 2";
    labelParams.style.marginTop = "15px";
    labelParams.innerHTML = "<strong>Parameters</strong>";
    grid.appendChild(labelParams);

    for (const [label, cc] of Object.entries(ccMap)) {
        if (label === 'Type') continue; // Handled above

        const div = document.createElement('div');
        div.style.gridColumn = "span 2";
        div.style.display = "flex";
        div.style.gap = "5px";
        div.style.alignItems = "center";
        div.style.marginBottom = "5px";

        div.innerHTML = `
            <span style="font-size:10px; width:70px; color:#aaa;">${label} (${cc})</span>
            <input type="range" class="slider" min="0" max="127" value="64" style="flex:1; height:4px;" 
                oninput="sendCC(${cc}, this.value); this.nextElementSibling.innerText = this.value">
            <span style="font-size:10px; width:25px; text-align:right; color:var(--accent);">64</span>
        `;
        grid.appendChild(div);
    }
};




const btnLoadDebug = document.getElementById('btn-load-debug-midi');
if (btnLoadDebug) btnLoadDebug.addEventListener('click', () => window.renderControlPanel('debug-midi-panel'));

if (btnLoadDebug) btnLoadDebug.addEventListener('click', () => window.renderControlPanel('debug-midi-panel'));
