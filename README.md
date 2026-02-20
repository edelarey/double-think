# DoubleThink

DoubleThink is a web application for analyzing reverse speech in audio and video files, inspired by George Orwell's concept of holding contradictory beliefs. It allows users to upload content, process it to reveal potential reverse speech messages ("reversals"), and manage findings.

The application features advanced audio processing, video synchronization, and a comprehensive library for managing snippets. Built with Vue.js, Express, FFmpeg, and audio visualization libraries.

## ✨ Key Features

### 🎬 Video Analysis
*   **Dual Playback**: Synchronized playback of original video with reversed audio.
*   **Custom Reversal Logic**: Adjust the "Reversal Chunk Size" (0.1s - 5.0s) to fine-tune how the audio is segmented and reversed. Smaller chunks preserve more of the original cadence, while larger chunks reveal longer phrases.
*   **Waveform Visualization**: Interactive waveform for navigation and selection.
*   **Snippet Extraction**: Extract and save interesting segments as both Video (MP4) and Audio (WAV) snippets.
*   **Loop Selection**: Repeatedly play a specific segment to analyze distinct sounds.

### 🔊 Audio Analysis
*   **Input Support**: Process MP3, WAV, and other standard audio formats.
*   **Speed Control**: Variable playback speed (0.25x - 2.0x) for both forward and reverse modes.
*   **Real-time Analysis**: Tools for frequency analysis and spectrum visualization.

### 📂 Snippet Library
*   **Unified Storage**: Manage both Audio and Video snippets in one place.
*   **Metadata Tracking**: Automatically saves playback speed, reversal chunk size, and timestamps.
*   **Annotation**: Add notes and labels to your discoveries.
*   **Export Options**: Download reversed segments, forward segments, or stitched versions (Forward + Reverse).

### ⚙️ Backend Power
*   **Large File Support**: Upload limits increased to **1GB** to accommodate high-quality video files.
*   **FFmpeg Processing**: robust server-side processing for format conversion, stream extraction, and audio manipulation.
*   **Persistent Storage**: Analysis results and metadata are saved as JSON for future retrieval.

## 🚀 Prerequisites

Before setting up, ensure the following are installed:

- **Node.js** (v18+ recommended)
- **FFmpeg**: Must be installed on the system (or provided via `ffmpeg-static` as a fallback).

## 🛠️ Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd double-think
    ```

2.  **Install Dependencies**
    ```bash
    # Install backend dependencies
    npm install

    # Install frontend dependencies (if not unified)
    # (The project uses a root package.json for both in this setup)
    ```

3.  **Create Directory Structure**
    Ensure the following directories exist (created automatically on server start):
    *   `uploads/`
    *   `outputs/`
        *   `snippets/`
        *   `reversed/`
        *   `videos/`
        *   `audio/`

## 🏃 Usage

### Start the Application
1.  **Start the Backend Server**
    ```bash
    npm run start-server
    ```
    Server runs on `http://localhost:3000`.

2.  **Start the Frontend Client**
    ```bash
    npm run dev
    ```
    Client runs on `http://localhost:5173`.

### Workflow Example: Video Analysis
1.  Navigate to the **Video Analysis** tab.
2.  Upload an MP4 video file.
3.  Set the **Chunk Size** (e.g., 2.0s) to determine how the audio is reversed.
4.  Once processed, play the video. The audio track will be the reversed version.
5.  If you hear a potential reversal, drag on the waveform to select that timeframe.
6.  Click **"Save Video Snippet"** or **"Save Audio Snippet"**.
7.  Go to the **Snippet Library** to review, annotate, or download your finding.

## 🏗️ Project Structure

```
double-think/
├── public/              # Static assets
├── server/              # Express backend
│   ├── index.js         # Main server entry & API routes
│   └── processAudio.js  # Custom audio reversal logic
├── src/                 # Vue.js frontend
│   ├── components/      # UI Components (VideoAnalyzer, SnippetLibrary, etc.)
│   ├── composables/     # Shared logic (useVideoSync, etc.)
│   └── App.vue          # Main layout
├── uploads/             # Temporary upload storage
└── outputs/             # Processed files and JSON metadata
```

## 🔧 Configuration

*   **Port**: Frontend defaults to 5173, Backend to 3000.
*   **Upload Limit**: Configured in `server/index.js` (Default: 1GB).
*   **Support**: File questions or issues via the project repository.

## 📝 License

Double Think v1.1.0 © 2026. All rights reserved.
