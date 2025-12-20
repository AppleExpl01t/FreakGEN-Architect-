# FreakGEN Architect

![FreakGEN Preview](preview.png)

**FreakGEN Architect** is a premium, intelligent patch generator designed specifically for the **Arturia MicroFreak** hardware synthesizer. 

Unlike generic randomizers that produce chaotic noise, FreakGEN behaves like a virtual sound designer. It uses "Sound Recipes" to construct musically useful patches (Leads, Pads, Bass, Percussion) while strictly adhering to the physical constraints and modulation architecture of the MicroFreak.

## 🚀 Quick Start Guide (How to Install)

Follow these simple steps to get FreakGEN running on your Windows, Mac, or Linux computer.

### 1. Install Node.js
You need the engine that powers this app.
*   **Download Node.js**: Go to [nodejs.org](https://nodejs.org/) and download the **LTS (Long Term Support)** version.
*   Run the installer and click "Next" through the default options.

### 2. Get the Code
You can download this project as a ZIP file or use Git.
*   **Easy Option (ZIP)**: Click the green **Code** button at the top of this GitHub page and select **Download ZIP**. Extract the folder to your desktop.
*   **Developer Option (Git)**: Open a terminal and run:
    ```bash
    git clone https://github.com/AppleExpl01t/FreakGEN-Architect-.git
    ```

### 3. Install & Run
1.  Open your **Command Prompt** (Windows) or **Terminal** (Mac/Linux).
2.  Navigate to the folder where you extracted the app.
    *   *Tip: Type `cd ` (with a space), then drag the folder into the terminal window and hit Enter.*
3.  Type these commands one by one:
    ```bash
    npm install
    npm start
    ```
4.  The application window will open! 🎉

---


## Features

### 🧠 Intelligent Patch Generation
- **Style-Aware Algorithms**: Select from distinct styles like **Bass, Brass, Keys, Lead, Organ, Pad, Percussion, Sequence, SFX, Strings, and Vocoder**. The engine adjusts envelope shapes, filter types, and oscillator models to match the desired character.
- **Complexity Levels**: Choose between **Simple, Moderate, High, or Extreme** intensity. 
  - *Simple*: Subtle drifts and essential texturing.
  - *Extreme*: Complex, self-evolving modulation storms utilizing up to 20 matrix slot connections.

### 🎛️ Hardware-Accurate Logic
- **Physical Modeling**: The app knows the difference between the "Wavetable" engine (values 1-16) and "BasicWaves" (0-100%). It correctly maps distinct parameters for engines like **Chords** (Major, Minor, etc.) vs. continuous controls.
- **Smart Envelopes**: correctly handles the MicroFreak's switchable envelope modes, generating Time values (milliseconds/seconds) for "Run/Loop" modes and Percentages for standard ADSR behavior.
- **Matrix Intelligence**: Prevents invalid connections (e.g., duplicates) and ensures special parameters like **Unispread** are only modulated when the Voice Mode allows it.

### 🔒 Manual Override (Locking System)
Found the perfect Oscillator sound but hate the LFO? **Lock it.**
FreakGEN allows you to independently lock the **Master, Oscillator, Envelopes, Cycling Env, LFO, and Matrix** sections. When you hit "Generate", locked sections remain untouched while the rest of the patch is reinvented around them.

### 🎚️ Modulation Matrix Architect
- The app simulates the physical modulation matrix, randomly assigning up to 3 "Assignable" user slots (e.g., Glide, Cyc Rise, Resonance).
- It generates specific routing instructions with bipolar amounts (-100 to +100), filtered by "Guardrails" to keep patches musical (e.g., limiting pitch chaos on melodic sounds).

## How to Use
1. **Select a Style** (or choose Random/Chaos).
2. **Select Complexity** (Simple to Extreme).
3. **Click Generate**.
4. **Follow the Recipe**: The UI maps 1:1 to the MicroFreak's physical controls. Simply turn the knobs on your hardware to match the values on the screen.



## Credits
- **Comet620**: Project Lead & Concept
- **AppleExpl01t**: Lead Developer

---

### TL;DR
A smart randomizer for the Arturia MicroFreak that actually generates good sounds. It respects the synth's hardware limitations, lets you lock specific sections, and outputs precise "recipes" for you to dial in.
