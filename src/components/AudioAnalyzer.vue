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
            <p><strong>Reversed Audio Waveform:</strong></p>
            <div ref="waveform" class="border"></div>
            <div class="mt-2 d-flex align-items-center">
              <button class="btn btn-secondary me-2" @click="playSelectedSegment" :disabled="!selectedSegment">Play Selected</button>
              <button class="btn btn-success me-2" @click="saveSegment" :disabled="!selectedSegment">Save Segment</button>
              <input v-model="segmentAnnotation" class="form-control d-inline-block w-auto me-2" placeholder="Add annotation" />
              <button class="btn btn-info" @click="saveAnnotation" :disabled="!selectedSegment || !segmentAnnotation">Save Annotation</button>
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
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import p5 from 'p5';

const file = ref(null);
const isProcessing = ref(false);
const result = ref(null);
const error = ref(null);
const waveform = ref(null);
const spectrogram = ref(null);
const selectedSegment = ref(null);
const segmentAnnotation = ref('');
const energyThreshold = ref(0.1);
const formantShiftThreshold = ref(0.75);
const playbackSpeed = ref(1);
const mainAudio = ref(null);
const snippetAudios = ref([]);
const snippetForwardAudios = ref([]);
let waveSurfer = null;
let regionsPlugin = null;
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
  // WaveSurfer
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

    // Attach region events to the regionsPlugin, not waveSurfer
    if (regionsPlugin) {
      regionsPlugin.on('region-created', region => {
        selectedSegment.value = {
          start: region.start,
          end: region.end
        };
        // Remove other regions to allow only one selection at a time
        Object.values(regionsPlugin.regions).forEach(r => {
          if (r.id !== region.id) r.remove();
        });
      });
      regionsPlugin.on('region-updated', region => {
        selectedSegment.value = {
          start: region.start,
          end: region.end
        };
      });
      regionsPlugin.on('region-removed', region => {
        if (
          selectedSegment.value &&
          selectedSegment.value.start === region.start &&
          selectedSegment.value.end === region.end
        ) {
          selectedSegment.value = null;
        }
      });
    }
    waveSurfer.load(result.value.reversedAudioUrl);
  }

  // p5 Spectrogram
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
    initializeWaveformAndSpectrogram();
  } catch (err) {
    error.value = 'Failed to process audio: ' + err.message;
  } finally {
    isProcessing.value = false;
  }
};

const playSelectedSegment = () => {
  if (selectedSegment.value) {
    waveSurfer.setPlaybackRate(playbackSpeed.value);
    waveSurfer.setTime(selectedSegment.value.start);
    waveSurfer.play(selectedSegment.value.start, selectedSegment.value.end);
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
    });
    
    // Use the snippet object directly from the response 
    const snippet = response.data;
    result.value.snippets.push(snippet);
    
    if (segmentAnnotation.value) {
      // Pass the annotation to be saved
      await saveAnnotation(true, result.value.snippets.length - 1);
      // Update the local snippet with the annotation
      snippet.annotation = segmentAnnotation.value;
    }
    segmentAnnotation.value = '';
    selectedSegment.value = null;
    updatePlaybackSpeed();
  } catch (err) {
    error.value = 'Failed to save segment: ' + err.message;
  }
};

const saveAnnotation = async (isSnippet = true, index = result.value.snippets.length - 1) => {
  try {
    await axios.post('http://localhost:3000/api/save-annotation', {
      analysisId: result.value.analysisId,
      segmentIndex: index,
      annotation: segmentAnnotation.value,
      isSnippet,
    });
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