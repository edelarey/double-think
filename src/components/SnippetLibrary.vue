<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Snippet Library</h3>
      <div v-if="loading" class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading snippets...</p>
      </div>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else>
        <div v-if="snippets.length">
          <div v-for="(snippet, index) in snippets" :key="index" class="card mb-3">
            <div class="card-body">
              <h5 class="card-title">Snippet {{ index + 1 }}</h5>
              <p>File: {{ snippet.file }}</p>
              <p>Time: {{ snippet.start.toFixed(2) }}s - {{ snippet.end.toFixed(2) }}s</p>
              <p>Playback Speed: {{ snippet.playbackSpeed }}x</p>
              <p v-if="snippet.annotation">Annotation: {{ snippet.annotation }}</p>
              <div class="mb-3">
                <label :for="'playbackSpeed' + index" class="form-label">Adjust Playback Speed</label>
                <select v-model="snippetPlaybackSpeeds[index]" :id="'playbackSpeed' + index" class="form-select w-auto" @change="updateSnippetPlaybackSpeed(index)">
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
              <p><strong>Reverse Waveform:</strong></p>
              <div :ref="el => waveforms[index] = el" class="border mb-2"></div>
              <p><strong>Reverse Audio:</strong></p>
              <audio :ref="el => snippetAudios[index] = el" :src="snippet.url" controls class="w-100 mb-2"></audio>
              <p><strong>Forward Waveform:</strong></p>
              <div :ref="el => forwardWaveforms[index] = el" class="border mb-2"></div>
              <p><strong>Forward Audio:</strong></p>
              <audio :ref="el => snippetForwardAudios[index] = el" :src="snippet.forwardUrl" controls class="w-100 mb-2"></audio>
              <a :href="snippet.url" download class="btn btn-outline-secondary btn-sm me-2">Download Reverse</a>
              <a :href="snippet.forwardUrl" download class="btn btn-outline-secondary btn-sm">Download Forward</a>
            </div>
          </div>
        </div>
        <p v-else>No snippets found.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import WaveSurfer from 'wavesurfer.js';

const snippets = ref([]);
const loading = ref(true);
const error = ref(null);
const waveforms = ref([]);
const forwardWaveforms = ref([]);
const snippetAudios = ref([]);
const snippetForwardAudios = ref([]);
const snippetPlaybackSpeeds = ref([]);
let waveSurfers = [];
let forwardWaveSurfers = [];

const fetchSnippets = async () => {
  try {
    loading.value = true;
    const response = await axios.get('http://localhost:3000/api/snippets');

    snippets.value = response.data;
    snippetPlaybackSpeeds.value = snippets.value.map(snippet => snippet.playbackSpeed || 1);
  } catch (err) {
    error.value = 'Failed to load snippets: ' + err.message;
  } finally {
    loading.value = false;
  }
};

const updateSnippetPlaybackSpeed = (index) => {
  if (waveSurfers[index]) {
    waveSurfers[index].setPlaybackRate(snippetPlaybackSpeeds.value[index]);
  }
  if (forwardWaveSurfers[index]) {
    forwardWaveSurfers[index].setPlaybackRate(snippetPlaybackSpeeds.value[index]);
  }
  if (snippetAudios.value[index]) {
    snippetAudios.value[index].playbackRate = snippetPlaybackSpeeds.value[index];
  }
  if (snippetForwardAudios.value[index]) {
    snippetForwardAudios.value[index].playbackRate = snippetPlaybackSpeeds.value[index];
  }
};

onMounted(async () => {
  await fetchSnippets();
  
  snippets.value.forEach((snippet, index) => {
    // Reverse waveform
    if (waveforms.value[index]) {
      const waveSurfer = WaveSurfer.create({
        container: waveforms.value[index],
        waveColor: '#4CAF50',
        progressColor: '#28A745',
        height: 100,
      });
      waveSurfer.load(snippet.url);
      waveSurfer.on('ready', () => {
        waveSurfer.setPlaybackRate(snippetPlaybackSpeeds.value[index]);
      });
      waveSurfers[index] = waveSurfer;
    }
    // Forward waveform
    if (forwardWaveforms.value[index]) {
      const forwardWaveSurfer = WaveSurfer.create({
        container: forwardWaveforms.value[index],
        waveColor: '#FF6384',
        progressColor: '#FF6F61',
        height: 100,
      });
      forwardWaveSurfer.load(snippet.forwardUrl);
      forwardWaveSurfer.on('ready', () => {
        forwardWaveSurfer.setPlaybackRate(snippetPlaybackSpeeds.value[index]);
      });
      forwardWaveSurfers[index] = forwardWaveSurfer;
    }
    // Set initial audio playback speeds
    if (snippetAudios.value[index]) {
      snippetAudios.value[index].playbackRate = snippetPlaybackSpeeds.value[index];
    }
    if (snippetForwardAudios.value[index]) {
      snippetForwardAudios.value[index].playbackRate = snippetPlaybackSpeeds.value[index];
    }
  });
});

onUnmounted(() => {
  waveSurfers.forEach(waveSurfer => waveSurfer && waveSurfer.destroy());
  forwardWaveSurfers.forEach(waveSurfer => waveSurfer && waveSurfer.destroy());
  waveSurfers = [];
  forwardWaveSurfers = [];
});
</script>

<style scoped>
.border {
  min-height: 100px;
}
.form-select.w-auto {
  width: 100px;
}
</style>