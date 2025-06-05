<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Output Browser (Reversed)</h3>
      <div v-if="loading" class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading outputs...</p>
      </div>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else>
        <div v-if="outputs.length">
          <div v-for="(output, index) in outputs" :key="index" class="card mb-3">
            <div class="card-body">
              <h5 class="card-title">Output File: {{ output.file }}</h5>
              <div class="mb-3">
                <label :for="'playbackSpeed' + index" class="form-label">Adjust Playback Speed</label>
                <select v-model="outputPlaybackSpeeds[index]" :id="'playbackSpeed' + index" class="form-select w-auto" @change="updateOutputPlaybackSpeed(index)">
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
              <p><strong>Waveform:</strong></p>
              <div :ref="el => waveforms[index] = el" class="border mb-2"></div>
              <p><strong>Audio:</strong></p>
              <audio :ref="el => outputAudios[index] = el" :src="output.url" controls class="w-100 mb-2"></audio>
              <a :href="output.url" :download="output.file" class="btn btn-outline-secondary btn-sm me-2">Download</a>
              <button
                class="btn btn-outline-danger btn-sm"
                :disabled="deletingIndexes[index]"
                @click="deleteOutput(index)"
              >
                <span v-if="deletingIndexes[index]" class="spinner-border spinner-border-sm me-1"></span>
                Delete
              </button>
            </div>
          </div>
        </div>
        <p v-else>No outputs found in @outputs/reversed.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import axios from 'axios';
import WaveSurfer from 'wavesurfer.js';

const outputs = ref([]);
const loading = ref(true);
const error = ref(null);
const waveforms = ref([]);
const outputAudios = ref([]);
const outputPlaybackSpeeds = ref([]);
const deletingIndexes = ref({});
let waveSurfers = [];

const fetchOutputs = async () => {
  try {
    loading.value = true;
    error.value = null;
    // Assuming API endpoint will be '/api/outputs/reversed'
    const response = await axios.get('http://localhost:3000/api/outputs/reversed');
    outputs.value = response.data;
    outputPlaybackSpeeds.value = outputs.value.map(() => 1); // Default playback speed 1x
  } catch (err) {
    error.value = 'Failed to load outputs: ' + (err.response?.data?.message || err.message);
    outputs.value = []; // Clear outputs on error
  } finally {
    loading.value = false;
  }
};

const updateOutputPlaybackSpeed = (index) => {
  const speed = parseFloat(outputPlaybackSpeeds.value[index]);
  if (waveSurfers[index]) {
    waveSurfers[index].setPlaybackRate(speed);
  }
  if (outputAudios.value[index]) {
    outputAudios.value[index].playbackRate = speed;
  }
};

onMounted(async () => {
  await fetchOutputs();
  
  await nextTick(); // Ensure DOM elements are available

  outputs.value.forEach((output, index) => {
    if (waveforms.value[index] && output.url) {
      try {
        const waveSurfer = WaveSurfer.create({
          container: waveforms.value[index],
          waveColor: '#6c757d', // Bootstrap secondary color
          progressColor: '#495057', // Darker gray
          height: 100,
          url: output.url, // Pass URL directly
        });
        waveSurfer.on('ready', () => {
          waveSurfer.setPlaybackRate(outputPlaybackSpeeds.value[index] || 1);
        });
        waveSurfer.on('error', (err) => {
          console.error(`WaveSurfer error for ${output.file}:`, err);
          // Optionally display a message to the user in the waveform container
          if (waveforms.value[index]) {
            waveforms.value[index].innerHTML = `<p class="text-danger small">Error loading waveform: ${err.message}</p>`;
          }
        });
        waveSurfers[index] = waveSurfer;
      } catch (e) {
        console.error(`Failed to initialize WaveSurfer for ${output.file}:`, e);
         if (waveforms.value[index]) {
            waveforms.value[index].innerHTML = `<p class="text-danger small">Could not initialize waveform player.</p>`;
          }
      }
    }
    // Set initial audio playback speeds
    if (outputAudios.value[index]) {
      outputAudios.value[index].playbackRate = outputPlaybackSpeeds.value[index] || 1;
    }
  });
});

const deleteOutput = async (index) => {
  const outputToDelete = outputs.value[index];
  deletingIndexes.value = { ...deletingIndexes.value, [index]: true };
  error.value = null;
  try {
    // Assuming API endpoint will be '/api/outputs/reversed/:filename' or similar
    // For now, we'll use a body to pass the filename, similar to snippets
    await axios.delete('http://localhost:3000/api/outputs/reversed', {
      data: {
        file: outputToDelete.file, // Send the filename to be deleted
      },
    });
    // Remove from local arrays
    outputs.value.splice(index, 1);
    outputPlaybackSpeeds.value.splice(index, 1);
    
    if (waveSurfers[index]) {
      waveSurfers[index].destroy();
    }
    waveSurfers.splice(index, 1);
    
    // Adjust refs arrays
    waveforms.value.splice(index, 1);
    outputAudios.value.splice(index, 1);

    // Re-index waveSurfers to match the new outputs array indices
    // This is tricky because splice shifts indices. A better way might be to map by a unique ID if available.
    // For now, we'll re-initialize them on next fetch or handle carefully.
    // The simplest for now is to ensure waveSurfers array is also spliced correctly.

  } catch (err) {
    error.value = 'Failed to delete output: ' + (err.response?.data?.message || err.message);
  } finally {
    // Remove loading state for this specific index
    const { [index]: _, ...rest } = deletingIndexes.value;
    deletingIndexes.value = rest;
     // If the last item was deleted, and it was the only one, WaveSurfer might have issues.
    // We might need to re-fetch or re-initialize if all items are gone.
    if (outputs.value.length === 0) {
        // Optionally clear all waveSurfers if no outputs remain
        waveSurfers.forEach(ws => ws && ws.destroy());
        waveSurfers = [];
    }
  }
};

onUnmounted(() => {
  waveSurfers.forEach(waveSurfer => waveSurfer && waveSurfer.destroy());
  waveSurfers = [];
});
</script>

<style scoped>
.border {
  min-height: 100px;
  background-color: #f8f9fa; /* Light background for waveform container */
}
.form-select.w-auto {
  width: 100px;
}
.card-title {
  word-break: break-all; /* Ensure long filenames don't break layout */
}
</style>