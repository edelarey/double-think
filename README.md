# DoubleThink

DoubleThink is a web application for analyzing reverse speech in audio files, inspired by George Orwell's concept of holding contradictory beliefs. It allows users to upload MP3/WAV files, reverse audio, extract snippets, annotate segments, adjust playback speed, and visualize audio properties using audio visualization tools. The app features a snippet library for playing back saved reverse and forward snippets, built with Vue.js, Express, Bootstrap, and audio processing libraries.

## Features
- **Input**: Supports MP3, WAV, and other audio formats.
- **Output**: WAV files for reversed audio and snippets, JSON for analysis data.
- **Segment Handling**: Select, play, extract, and annotate audio segments.
- **Playback Speed**: Adjust speed (0.5x, 0.75x, 1x, 1.5x, 2x) for reverse and forward snippets, saved with metadata.
- **Automated Detection**: Detects potential reverse speech segments using energy and formant shift thresholds.
- **Snippet Library**: Lists all saved snippets with reverse and forward playback.
- **UI**: Responsive Bootstrap interface with tabs for File Analysis, Real-Time Analysis, and Snippet Library.

## Prerequisites
Before setting up, ensure the following are installed:

- **Node.js** (v16+):
  ```bash
  # Ubuntu/Debian
  sudo apt update
  sudo apt install nodejs npm
  # macOS (Homebrew)
  brew install node
  # Verify
  node --version
  npm --version


# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

Setup Instructions
Follow these steps to set up the ReverseRiser app from scratch:
1. Create Project Directory


mkdir double-think
cd double-think

2. Initialize Node.js Project
Create a package.json:

npm init -y

3. Install Backend Dependencies
Install server-side packages:

npm install express@4.21.1 fluent-ffmpeg@2.1.3 meyda@5.2.4 essentia.js@0.1.3  multer@1.4.5-lts.1 wav-decoder@1.3.0 --save
npm install ffmpeg-static@latest --save-dev

4. Install Frontend Dependencies
Install Vue.js, Vite, Vue Router, Bootstrap, and visualization libraries:
bash

npm install vue@3.4.21 vite@5.4.8 @vitejs/plugin-vue@5.1.4 vue-router@4.4.5 bootstrap@5.3.3 wavesurfer.js@7.8.5 p5@1.10.0 chart.js@4.4.5 vue-chartjs@5.3.1 --save

5. Set Up Vue Project
Initialize the frontend with Vite’s Vue template:
bash

npm create vite@latest . -- --template vue
# Prompts: Project name (.), Framework (Vue), Variant (JavaScript)

This creates src/, public/, vite.config.js, and updates package.json.
6. Create Backend Files
Set up the Express server:

mkdir server
touch server/index.js

Copy the server/index.js content from the project codebase into server/index.js.

npm install bootstrap@5.3.3

7. Create Frontend Files
Replace or create the following files with the project codebase:
public/index.html

src/main.js

src/App.vue

vite.config.js

Create components:

mkdir src/components
touch src/components/AudioAnalyzer.vue src/components/RealTimeAnalyzer.vue src/components/SnippetLibrary.vue

Copy the contents of AudioAnalyzer.vue, RealTimeAnalyzer.vue, and SnippetLibrary.vue from the codebase.
8. Create File System Directories
Create directories for uploads and outputs:

mkdir uploads outputs

9. Configure FFmpeg (Optional)
If FFmpeg isn’t installed system-wide, use ffmpeg-static. Add to server/index.js:
javascript

const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

Adjust hmm path if needed (check with ls /usr/share/pocketsphinx/model/en-us or ls /usr/local/share/pocketsphinx/model/en-us).
If PocketSphinx fails to compile:
bash

sudo apt install cmake  # Ubuntu
brew install cmake     # macOS

11. Update package.json Scripts
Ensure package.json includes:

{
  "name": "double-think",
  "version": "0.0.1",
  "scripts": {
    "start-server": "node server/index.js",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "^5.1.4",
    "axios": "^1.9.0",
    "bootstrap": "^5.3.3",
    "chart.js": "^4.4.5",
    "essentia": "^0.1.1",
    "essentia.js": "^0.1.3",
    "express": "^4.21.2",
    "fluent-ffmpeg": "^2.1.3",
    "meyda": "^5.2.4",
    "multer": "^1.4.5-lts.1",
    "p5": "^1.10.0",
    "vite": "^5.4.8",
    "vue": "^3.5.12",
    "vue-chartjs": "^5.3.1",
    "vue-router": "^4.4.5",
    "wav-decoder": "^1.3.0",
    "wavesurfer.js": "^7.8.5"
  },
  "devDependencies": {
    "ffmpeg-static": "^5.2.0"
  },
  "type": "module"
}

12. Start the Backend
Run the Express server:
bash

node server/index.js

13. Start the Frontend
In a separate terminal:
bash

npm run dev

14. Access the App
Open http://localhost:5173 in a browser. Verify tabs for “File Analysis,” “Real-Time Analysis,” and “Snippet Library.”
Project Structure

reverse-speech-app/
├── public/
│   ├── index.html
├── src/
│   ├── components/
│   │   ├── AudioAnalyzer.vue
│   │   ├── RealTimeAnalyzer.vue
│   │   ├── SnippetLibrary.vue
│   ├── App.vue
│   ├── main.js
├── server/
│   ├── index.js
├── uploads/
├── outputs/
├── package.json
├── vite.config.js


# How It Works
Input/Output:
Inputs: MP3, WAV, etc., via fluent-ffmpeg.

Outputs: WAV (reversed_*.wav, snippet_*.wav, forward_snippet_*.wav), JSON (analysis_*.json).

Snippet Extraction:
In AudioAnalyzer.vue, selecting a segment and clicking “Save Segment” extracts both reversed (snippet_*.wav) and forward (forward_snippet_*.wav) snippets using fluent-ffmpeg.

The current playbackSpeed (0.5x, 0.75x, 1x, 1.5x, 2x) is saved in the analysis JSON.

Analysis JSON:
json

{
  "snippets": [
    {
      "file": "snippet_123456789.wav",
      "forwardFile": "forward_snippet_123456789.wav",
      "start": 1.0,
      "end": 2.0,
      "annotation": "Interesting sound",
      "playbackSpeed": 0.5
    }
  ]
}

Snippet Library:
SnippetLibrary.vue lists all snippets from /api/snippets.

Each snippet shows:
Metadata (file, time, annotation, playback speed).

Reverse and forward waveforms (wavesurfer.js) with saved speed.

Reverse and forward <audio> elements with saved speed.

Download links for both.

Users can adjust speed via a dropdown, defaulting to the saved playbackSpeed.

Playback Speed:
Saved with snippets in AudioAnalyzer.vue during extraction.

Loaded and applied in SnippetLibrary.vue for waveforms and <audio> elements.

Consistent across AudioAnalyzer.vue (new snippets) and SnippetLibrary.vue (library playback).

Other Features:
Segment selection, annotations, detection with adjustable thresholds (energy, confidence, formant shift).

Real-time analysis (RealTimeAnalyzer.vue) unchanged.

Bootstrap UI with tabs for File Analysis, Real-Time Analysis, Snippet Library.

Example Usage
File Analysis:
Upload input.mp3, select a segment (1.0s–2.0s), set playback speed to 0.5x, save snippet.

Outputs: snippet_123456789.wav, forward_snippet_123456789.wav, updated analysis_123456789.json with playbackSpeed: 0.5.

Snippet Library:
Navigate to /snippets.

See snippet: “Snippet 1, 1.0s–2.0s, Speed: 0.5x, Annotation: Interesting sound”.

Play reverse and forward snippets at 0.5x via waveform or <audio>.

Adjust speed (e.g., to 1x) if needed.

Outputs:
outputs/snippet_123456789.wav (reverse).

outputs/forward_snippet_123456789.wav (forward).

outputs/analysis_123456789.json (metadata).

Notes
Performance:
Loading many snippets in SnippetLibrary.vue may create multiple wavesurfer.js instances. Add pagination for large libraries.

Backend file scanning (/api/snippets) is lightweight but could use caching.

File System:
Snippets and JSON in outputs/. Add cleanup (e.g., delete old files) for production.

Forward snippets increase storage; ensure disk space.

UI/UX:
Bootstrap ensures responsiveness. Consider adding search/filter by annotation.

Playback speed dropdown is per-snippet in SnippetLibrary.vue for flexibility.

PocketSphinx: Limited for reversed speech. Adjust psConfig paths or consider cloud APIs (e.g., redirect to https://x.ai/api).

Security:
Validate inputs in /api/extract-segment (start, end, playbackSpeed).

Limit upload size: multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } }).


