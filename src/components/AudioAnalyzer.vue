<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">File-Based Analysis</h3>
      <div v-if="!isProcessing" class="mb-3">
        <input type="file" accept="audio/*" class="form-control mb-2" @change="handleFileSelect" />
        <button class="btn btn-primary" :disabled="!file" @click="analyzeAudio">Analyze Audio</button>
      </div>
      <div v-else class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Processing...</span>
        </div>
        <p>Processing...</p>
      </div>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-if="result" class="mt-3">
        <h4>Results</h4>
        <div class="row">
          <div class="col-md-6 mb-3">
            <p><strong>Original Audio Waveform:</strong></p>
            <div ref="originalWaveform" class="border"></div>
            <div class="mt-2 d-flex align-items-center">
              <button class="btn btn-secondary me-2" @click="playSelectedSegment('original')" :disabled="!selectedSegment">
                Play Selected
              </button>
            </div>
            <audio ref="mainOriginalAudio" :src="result.originalAudioUrl" controls class="w-100 mt-2"></audio>
            <p><strong>Reversed Audio Waveform:</strong></p>
            <div ref="waveform" class="border"></div>
            <div class="mt-2 d-flex align-items-center">
              <button class="btn btn-secondary me-2" @click="playSelectedSegment('reversed')" :disabled="!selectedSegment">
                Play Selected
                <span v-if="!selectedSegment && (console.log('[Play Selected disabled] selectedSegment:', selectedSegment), false)"></span>
              </button>
              <button class="btn btn-success me-2" @click="saveSegment" :disabled="!selectedSegment">
                Save Segment
                <span v-if="!selectedSegment && (console.log('[Save Segment disabled] selectedSegment:', selectedSegment), false)"></span>
              </button>
              <select v-model="playbackSpeed" class="form-select w-auto ms-2" @change="updatePlaybackSpeed">
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1" selected>1x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>
            <audio ref="mainAudio" :src="result.reversedAudioUrl" controls class="w-100 mt-2"></audio>
            <div v-if="result.snippets && result.snippets.length" class="mt-2">
              <h5>Extracted Snippets</h5>
              <div v-for="(snippet, index) in result.snippets" :key="index" class="mb-2">
                <p>Snippet {{ index + 1 }} ({{ snippet.start.toFixed(2) }}s - {{ snippet.end.toFixed(2) }}s, Speed: {{ snippet.playbackSpeed }}x):</p>
                <p><strong>Reverse:</strong></p>
                <audio ref="snippetAudios" :src="snippet.url" controls class="w-100"></audio>
                <p><strong>Forward:</strong></p>
                <audio ref="snippetForwardAudios" :src="snippet.forwardUrl" controls class="w-100"></audio>
                <div class="d-flex align-items-center mb-2">
                  <input v-model="snippet._pendingAnnotation" class="form-control d-inline-block w-auto me-2" placeholder="Add annotation" />
                  <button class="btn btn-info btn-sm" @click="saveSnippetAnnotation(index)" :disabled="!snippet._pendingAnnotation">Save Annotation</button>
                </div>
                <p v-if="snippet.annotation">Annotation: {{ snippet.annotation }}</p>
                <a :href="snippet.url" download class="btn btn-outline-secondary btn-sm me-2">Download Reverse</a>
                <a :href="snippet.forwardUrl" download class="btn btn-outline-secondary btn-sm">Download Forward</a>
              </div>
            </div>
          </div>
          <div class="col-md-6 mb-3">
            <p><strong>Spectrogram:</strong></p>
            <div ref="spectrogram" class="border"></div>
            <h5>Detection Thresholds</h5>
            <div class="mb-3">
              <label for="energyThreshold" class="form-label">Energy Threshold: {{ energyThreshold }}</label>
              <input type="range" v-model.number="energyThreshold" id="energyThreshold" min="0" max="1" step="0.01" class="form-range" @change="redetectSegments" />
            </div>
            <div class="mb-3">
              <label for="formantShiftThreshold" class="form-label">Formant Shift Threshold: {{ formantShiftThreshold }}</label>
              <input type="range" v-model.number="formantShiftThreshold" id="formantShiftThreshold" min="0" max="0.2" step="0.001" class="form-range" @change="redetectSegments" />
            </div>
          </div>
        </div>
        <p><a :href="result.analysisFile" download class="btn btn-outline-secondary">Download Analysis (JSON)</a></p>
        <h5>MFCC Features</h5>
        <VChart type="line" :data="mfccChartData" :options="chartOptions" class="chart" />
        <h5>Pitch and Formants</h5>
        <VChart type="line" :data="pitchFormantChartData" :options="chartOptions" class="chart" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import axios from 'axios';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import p5 from 'p5';

const file = ref(null);
const isProcessing = ref(false);
const result = ref(null);
const error = ref(null);
const waveform = ref(null);
const originalWaveform = ref(null);
const spectrogram = ref(null);
const selectedSegment = ref(null);
const segmentAnnotation = ref('');
const energyThreshold = ref(0.1);
const formantShiftThreshold = ref(0.75);
const playbackSpeed = ref(1);
const mainAudio = ref(null);
const mainOriginalAudio = ref(null);
const snippetAudios = ref([]);
const snippetForwardAudios = ref([]);
let waveSurfer = null;
let regionsPlugin = null;
let originalWaveSurfer = null;
let originalRegionsPlugin = null;
let p5Instance = null;

const handleFileSelect = (event) => {
  file.value = event.target.files[0];
  result.value = null;
  selectedSegment.value = null;
  segmentAnnotation.value = '';
  playbackSpeed.value = 1;
};

import { nextTick } from 'vue';

const initializeWaveformAndSpectrogram = () => {
  // Original WaveSurfer
  console.log('[AudioAnalyzer] originalAudioUrl:', result);
  console.log('[AudioAnalyzer] originalWaveform ref:', originalWaveform.value);
  if (result.value?.originalAudioUrl && originalWaveform.value) {
    if (originalWaveSurfer) {
      originalWaveSurfer.destroy();
      originalWaveSurfer = null;
    }
    originalRegionsPlugin = RegionsPlugin.create({
      dragSelection: {
        color: 'rgba(0, 200, 200, 0.2)',
        loop: false,
        resize: true,
      }
    });
    originalWaveSurfer = WaveSurfer.create({
      container: originalWaveform.value,
      waveColor: 'rgb(0, 200, 200)',
      progressColor: 'rgb(0, 100, 100)',
      height: 100,
      plugins: [originalRegionsPlugin],
      responsive: true,
      normalize: true,
      minPxPerSec: 50,
      cursorColor: '#333',
      barWidth: 2
    });
    originalWaveSurfer.on('ready', () => {
      updatePlaybackSpeed();
    });
    originalWaveSurfer.on('error', err => {
      error.value = `Error loading original audio: ${err.message}`;
    });

    // Region events for original waveform
    if (originalRegionsPlugin) {
      originalRegionsPlugin.on('region-created', region => {
        const duration = originalWaveSurfer.getDuration();
        const reversedDuration = waveSurfer ? waveSurfer.getDuration() : duration;
        const start = duration - region.end;
        const end = duration - region.start;
        setReversedRegion(start, end);
        selectedSegment.value = { start, end };
      });
      originalRegionsPlugin.on('region-updated', region => {
        const duration = originalWaveSurfer.getDuration();
        const reversedDuration = waveSurfer ? waveSurfer.getDuration() : duration;
        const start = duration - region.end;
        const end = duration - region.start;
        setReversedRegion(start, end);
        selectedSegment.value = { start, end };
      });
      originalRegionsPlugin.on('region-removed', region => {
        selectedSegment.value = null;
      });
    }

    // Manual click-and-drag region creation for original waveform
    let origDragStart = null;
    let origDragRegion = null;
    const origContainer = originalWaveform.value;
    const getOrigTimeForEvent = (e) => {
      const rect = origContainer.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * originalWaveSurfer.getDuration();
    };
    const onOrigMouseDown = (e) => {
      origDragStart = getOrigTimeForEvent(e);
      if (origDragRegion) {
        origDragRegion.remove();
        origDragRegion = null;
      }
      origContainer.addEventListener('mousemove', onOrigMouseMove);
      origContainer.addEventListener('touchmove', onOrigMouseMove);
      document.addEventListener('mouseup', onOrigMouseUp);
      document.addEventListener('touchend', onOrigMouseUp);
    };
    const onOrigMouseMove = (e) => {
      if (origDragStart == null) return;
      const dragEnd = getOrigTimeForEvent(e);
      const start = Math.min(origDragStart, dragEnd);
      const end = Math.max(origDragStart, dragEnd);
      if (origDragRegion) origDragRegion.remove();
      origDragRegion = originalRegionsPlugin.addRegion({
        start,
        end,
        color: 'rgba(0, 200, 200, 0.2)',
        drag: false,
        resize: true,
      });
    };
    const onOrigMouseUp = (e) => {
      origContainer.removeEventListener('mousemove', onOrigMouseMove);
      origContainer.removeEventListener('touchmove', onOrigMouseMove);
      document.removeEventListener('mouseup', onOrigMouseUp);
      document.removeEventListener('touchend', onOrigMouseUp);
      if (origDragRegion) {
        // Map selection to reversed waveform
        const duration = originalWaveSurfer.getDuration();
        const reversedDuration = waveSurfer ? waveSurfer.getDuration() : duration;
        const start = duration - origDragRegion.end;
        const end = duration - origDragRegion.start;
        setReversedRegion(start, end);
        selectedSegment.value = { start, end };
        origDragRegion = null;
        origDragStart = null;
      }
    };
    origContainer.addEventListener('mousedown', onOrigMouseDown);
    origContainer.addEventListener('touchstart', onOrigMouseDown);

    // Ensure the original waveform loads from the uploads folder
    originalWaveSurfer.load(result.value.originalAudioUrl);
  }

  // Reversed WaveSurfer
  if (result.value?.reversedAudioUrl && waveform.value) {
    if (waveSurfer) {
      waveSurfer.destroy();
      waveSurfer = null;
    }
    regionsPlugin = RegionsPlugin.create({
      dragSelection: {
        color: 'rgba(0, 123, 255, 0.2)',
        loop: false,
        resize: true,
      }
    });
    waveSurfer = WaveSurfer.create({
      container: waveform.value,
      waveColor: 'rgb(200, 0, 200)',
      progressColor: 'rgb(100, 0, 100)',
      height: 100,
      plugins: [regionsPlugin],
      responsive: true,
      normalize: true,
      minPxPerSec: 50,
      cursorColor: '#333',
      barWidth: 2
    });
    waveSurfer.on('ready', () => {
      updatePlaybackSpeed();
    });
    waveSurfer.on('error', err => {
      error.value = `Error loading audio: ${err.message}`;
    });

    // Manual click-and-drag region creation for reversed waveform
    let dragStart = null;
    let dragRegion = null;
    const container = waveform.value;
    const getTimeForEvent = (e) => {
      const rect = container.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      return percent * waveSurfer.getDuration();
    };
    const onMouseDown = (e) => {
      dragStart = getTimeForEvent(e);
      if (dragRegion) {
        dragRegion.remove();
        dragRegion = null;
      }
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('touchmove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchend', onMouseUp);
    };
    const onMouseMove = (e) => {
      if (dragStart == null) return;
      const dragEnd = getTimeForEvent(e);
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      if (dragRegion) dragRegion.remove();
      dragRegion = regionsPlugin.addRegion({
        start,
        end,
        color: 'rgba(0, 123, 255, 0.2)',
        drag: false,
        resize: true,
      });
    };
    const onMouseUp = (e) => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('touchmove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchend', onMouseUp);
      if (dragRegion) {
        // Map selection to original waveform
        const duration = waveSurfer.getDuration();
        const originalDuration = originalWaveSurfer ? originalWaveSurfer.getDuration() : duration;
        const start = originalDuration - dragRegion.end;
        const end = originalDuration - dragRegion.start;
        setOriginalRegion(start, end);
        selectedSegment.value = { start: dragRegion.start, end: dragRegion.end };
        dragRegion = null;
        dragStart = null;
      }
    };
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('touchstart', onMouseDown);

    waveSurfer.load(result.value.reversedAudioUrl);
  }

  // Helper functions to sync regions
  function setReversedRegion(start, end) {
    if (!regionsPlugin) return;
    Object.values(regionsPlugin.regions).forEach(r => r.remove());
    regionsPlugin.addRegion({
      start,
      end,
      color: 'rgba(0, 123, 255, 0.2)',
      drag: false,
      resize: true,
    });
  }
  function setOriginalRegion(start, end) {
    if (!originalRegionsPlugin) return;
    Object.values(originalRegionsPlugin.regions).forEach(r => r.remove());
    originalRegionsPlugin.addRegion({
      start,
      end,
      color: 'rgba(0, 200, 200, 0.2)',
      drag: false,
      resize: true,
    });
  }

  // p5 Spectrogram (unchanged)
  if (result.value?.spectrogramData && spectrogram.value) {
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
    p5Instance = new p5((sketch) => {
      sketch.setup = () => {
        const container = spectrogram.value.getBoundingClientRect();
        sketch.createCanvas(container.width || 400, 200).parent(spectrogram.value);
        sketch.background(255);
        sketch.noLoop();
      };
      sketch.draw = () => {
        if (!result.value || !result.value.spectrogramData) {
          sketch.background(255);
          sketch.fill(0);
          sketch.textAlign(sketch.CENTER);
          sketch.text('No spectrogram data available', sketch.width / 2, sketch.height / 2);
          return;
        }
        sketch.background(255);
        const spec = result.value.spectrogramData;
        const cellWidth = sketch.width / spec.length;
        const cellHeight = sketch.height / (spec[0]?.length || 1);
        for (let i = 0; i < spec.length; i++) {
          for (let j = 0; j < spec[i].length; j++) {
            const intensity = sketch.map(spec[i][j], 0, 1, 0, 255);
            sketch.fill(intensity);
            sketch.noStroke();
            sketch.rect(i * cellWidth, (spec[i].length - 1 - j) * cellHeight, cellWidth, cellHeight);
          }
        }
      };
      sketch.windowResized = () => {
        const container = spectrogram.value.getBoundingClientRect();
        sketch.resizeCanvas(container.width || 400, 200);
        sketch.redraw();
      };
    });
    p5Instance.redraw();
  }
};


const analyzeAudio = async () => {
  console.log('analyzeAudio called');
  if (!file.value) return;
  isProcessing.value = true;
  error.value = null;
  result.value = null;
  selectedSegment.value = null;
  segmentAnnotation.value = '';

  const formData = new FormData();
  formData.append('audio', file.value);

  try {
    const response = await axios.post('http://localhost:3000/api/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    result.value = {
      ...response.data,
      snippets: [],
    };
    await nextTick();
    setTimeout(() => {
      initializeWaveformAndSpectrogram();
    }, 300); // Add a short delay to ensure files are ready
  } catch (err) {
    error.value = 'Failed to process audio: ' + err.message;
  } finally {
    isProcessing.value = false;
  }
};

const playSelectedSegment = (which = 'reversed') => {
  if (!selectedSegment.value) return;
  if (which === 'reversed' && waveSurfer) {
    waveSurfer.setPlaybackRate(playbackSpeed.value);
    waveSurfer.setTime(selectedSegment.value.start);
    waveSurfer.play(selectedSegment.value.start, selectedSegment.value.end);
  } else if (which === 'original' && originalWaveSurfer) {
    // Map reversed segment to original
    const duration = originalWaveSurfer.getDuration();
    const start = duration - selectedSegment.value.end;
    const end = duration - selectedSegment.value.start;
    originalWaveSurfer.setPlaybackRate(playbackSpeed.value);
    originalWaveSurfer.setTime(start);
    originalWaveSurfer.play(start, end);
  }
};

const saveSegment = async () => {
  if (!selectedSegment.value) return;
  try {
    const response = await axios.post('http://localhost:3000/api/extract-segment', {
      audioUrl: result.value.reversedAudioUrl,
      start: selectedSegment.value.start,
      end: selectedSegment.value.end,
      analysisId: result.value.analysisId,
      playbackSpeed: playbackSpeed.value,
      annotation: segmentAnnotation.value // Attach annotation directly to snippet
    });

    // Use the snippet object directly from the response
    const snippet = response.data;
    // Ensure annotation is present in snippet
    if (segmentAnnotation.value) {
      snippet.annotation = segmentAnnotation.value;
    }
    result.value.snippets.push(snippet);

    segmentAnnotation.value = '';
    selectedSegment.value = null;
    updatePlaybackSpeed();
  } catch (err) {
    error.value = 'Failed to save segment: ' + err.message;
  }
};

const saveSnippetAnnotation = async (index) => {
  const snippet = result.value.snippets[index];
  try {
    await axios.post('http://localhost:3000/api/save-annotation', {
      analysisId: result.value.analysisId,
      segmentIndex: index,
      annotation: snippet._pendingAnnotation,
      isSnippet: true,
    });
    snippet.annotation = snippet._pendingAnnotation;
    snippet._pendingAnnotation = '';
  } catch (err) {
    error.value = 'Failed to save annotation: ' + err.message;
  }
};



const updatePlaybackSpeed = () => {
  if (waveSurfer) {
    waveSurfer.setPlaybackRate(playbackSpeed.value);
  }
  if (mainAudio.value) {
    mainAudio.value.playbackRate = playbackSpeed.value;
  }
  if (snippetAudios.value) {
    snippetAudios.value.forEach(audio => {
      if (audio) audio.playbackRate = playbackSpeed.value;
    });
  }
  if (snippetForwardAudios.value) {
    snippetForwardAudios.value.forEach(audio => {
      if (audio) audio.playbackRate = playbackSpeed.value;
    });
  }
};

watch(playbackSpeed, () => {
  updatePlaybackSpeed();
});

onMounted(() => {
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      if (entry.target === waveform.value && waveSurfer) {
        waveSurfer.setHeight(100); // Or recalculate based on new size
      }
      if (entry.target === spectrogram.value && p5Instance) {
        const container = spectrogram.value.getBoundingClientRect();
        p5Instance.resizeCanvas(container.width || 400, 200);
        p5Instance.redraw();
      }
    }
  });

  if (waveform.value) resizeObserver.observe(waveform.value);
  if (spectrogram.value) resizeObserver.observe(spectrogram.value);

  onUnmounted(() => {
    console.log('Unmounting AudioAnalyzer, cleaning up resources');
    if (resizeObserver) resizeObserver.disconnect();
    if (waveSurfer) {
      waveSurfer.destroy();
      waveSurfer = null;
    }
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
  });
});



const mfccChartData = computed(() => {
  if (!result.value) return {};
  const labels = Array.from({ length: result.value.mfccSummary.length }, (_, i) => `Frame ${i + 1}`);
  const datasets = result.value.mfccSummary[0].map((_, i) => ({
    label: `MFCC ${i + 1}`,
    data: result.value.mfccSummary.map(frame => frame[i]),
    borderColor: `hsl(${(i * 360) / 13}, 70%, 50%)`,
    fill: false,
  }));
  return { labels, datasets };
});

const pitchFormantChartData = computed(() => {
  if (!result.value) return {};
  return {
    labels: Array.from({ length: result.value.pitchSummary.length }, (_, i) => `Frame ${i + 1}`),
    datasets: [
      {
        label: 'Pitch',
        data: result.value.pitchSummary,
        borderColor: '#FF6384',
        fill: false,
      },
      {
        label: 'Formant 1',
        data: result.value.formantSummary.map(() => result.value.formantSummary[0]),
        borderColor: '#36A2EB',
        fill: false,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { title: { display: true, text: 'Value' } },
    x: { title: { display: true, text: 'Frame' } },
  },
};
</script>

<style scoped>
.chart {
  max-height: 300px;
}
.border {
  min-height: 100px;
}
.form-control.d-inline-block {
  width: 200px;
}
.form-select.w-auto {
  width: 100px;
}
</style>