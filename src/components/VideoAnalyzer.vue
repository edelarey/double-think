<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Video-Based Analysis</h3>
      
      <!-- Upload Section -->
      <div v-if="!isProcessing && !analysisData" class="mb-3">
        <div class="mb-3">
          <label class="form-label">Upload Video File</label>
          <input type="file" accept="video/*" class="form-control mb-2" @change="handleFileSelect" />
          
          <div v-if="selectedFile" class="mb-3">
            <label class="form-label">Video Name (optional)</label>
            <input type="text" v-model="videoName" class="form-control mb-2" placeholder="Give this video a name..." />
            
            <label class="form-label" title="Determines the maximum length of reversed audio segments. Smaller values preserve word order better.">
              Reversal Chunk Size: {{ reversalChunkSize }}s
            </label>
            <input
              type="range"
              class="form-range"
              min="0.1"
              max="2.0"
              step="0.1"
              v-model.number="reversalChunkSize"
            />
            <div class="d-flex justify-content-between small text-muted">
              <span>0.1s (More Granular)</span>
              <span>2.0s (Longer Phrases)</span>
            </div>
          </div>

          <button class="btn btn-primary" :disabled="!selectedFile" @click="processVideo">
            Process Video
          </button>
        </div>
        
        <!-- Or load existing -->
        <div v-if="existingVideos.length > 0" class="mt-3">
          <label class="form-label">Or Load Existing Analysis</label>
          <select v-model="selectedExistingId" class="form-select" @change="loadExistingAnalysis">
            <option value="">Select a video...</option>
            <option v-for="video in existingVideos" :key="video.analysisId" :value="video.analysisId">
              {{ video.name || video.analysisId }} ({{ formatDuration(video.duration) }})
            </option>
          </select>
        </div>
      </div>
      
      <!-- Processing Indicator -->
      <div v-if="isProcessing" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Processing...</span>
        </div>
        <p class="mt-2">Processing video... This may take a moment.</p>
        <p class="text-muted small">Extracting audio, reversing, and muxing...</p>
      </div>
      
      <!-- Error Display -->
      <div v-if="error" class="alert alert-danger alert-dismissible">
        {{ error }}
        <button type="button" class="btn-close" @click="error = null"></button>
      </div>
      
      <!-- Main Analysis UI -->
      <div v-if="analysisData && !isProcessing">
        <!-- New Analysis Button -->
        <div class="mb-3 d-flex justify-content-between align-items-center">
          <button class="btn btn-outline-secondary btn-sm" @click="resetAnalysis">
            ← New Analysis
          </button>
          
          <!-- Analysis Metadata Display -->
          <div class="text-muted small">
            <span class="me-3" v-if="analysisData.maxChunkDuration">
              <strong>Chunk Size:</strong> {{ analysisData.maxChunkDuration }}s
            </span>
            <span class="me-3" v-if="analysisData.duration">
              <strong>Duration:</strong> {{ formatDuration(analysisData.duration) }}
            </span>
            <span>
              <strong>Created:</strong> {{ new Date(analysisData.createdAt).toLocaleDateString() }}
            </span>
          </div>
        </div>
        
        <!-- Dual Video Players -->
        <div class="row mb-3">
          <div class="col-md-6">
            <div class="video-container position-relative">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="mb-0">Original Video</h5>
                <div v-if="!isSynced" class="btn-group btn-group-sm">
                  <button class="btn btn-outline-light btn-sm py-0" @click="toggleOriginal">
                    {{ isOriginalPlaying ? '⏸' : '▶' }}
                  </button>
                </div>
              </div>
              <video
                ref="originalVideoEl"
                :src="analysisData.originalVideoUrl"
                class="w-100"
                @loadedmetadata="onVideoLoaded"
                @click="!isSynced && toggleOriginal()"
                :style="{ cursor: !isSynced ? 'pointer' : 'default' }"
              ></video>
            </div>
          </div>
          <div class="col-md-6">
            <div class="video-container position-relative">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="mb-0">Reverse Speech Analysis</h5>
                <span v-if="!isSynced" class="badge bg-secondary">Master</span>
              </div>
              <video
                ref="reversedVideoEl"
                :src="analysisData.reversedVideoUrl"
                class="w-100"
                @loadedmetadata="onVideoLoaded"
                @click="togglePlay"
                style="cursor: pointer;"
              ></video>
            </div>
          </div>
        </div>
        
        <!-- Playback Controls -->
        <div class="controls-bar mb-3 p-3 bg-light rounded">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <!-- Transport Controls -->
            <div class="d-flex align-items-center gap-2">
              <button
                class="btn btn-sm"
                :class="isSynced ? 'btn-info' : 'btn-outline-secondary'"
                @click="isSynced = !isSynced"
                title="Toggle Sync"
              >
                🔗 Sync {{ isSynced ? 'ON' : 'OFF' }}
              </button>
              
              <div class="vr mx-2"></div>

              <button class="btn btn-secondary btn-sm" @click="skip(-10)" title="Skip back 10s">
                ⏪ -10s
              </button>
              <button class="btn btn-primary" @click="togglePlay">
                {{ isPlaying ? '⏸ Pause' : '▶ Play' }}
              </button>
              <button class="btn btn-secondary btn-sm" @click="skip(10)" title="Skip forward 10s">
                +10s ⏩
              </button>
            </div>
            
            <!-- Time Display -->
            <div class="time-display">
              <span class="font-monospace">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
            </div>
            
            <!-- Speed Control -->
            <div class="d-flex align-items-center gap-2">
              <label class="form-label mb-0 small">Speed:</label>
              <select v-model.number="playbackSpeed" class="form-select form-select-sm speed-select" @change="setSpeed(playbackSpeed)">
                <option :value="0.25">0.25x</option>
                <option :value="0.5">0.5x</option>
                <option :value="0.75">0.75x</option>
                <option :value="1">1x</option>
                <option :value="1.5">1.5x</option>
                <option :value="2">2x</option>
              </select>
            </div>
            
            <!-- Volume Control -->
            <div class="d-flex align-items-center gap-2">
              <label class="form-label mb-0 small">Volume:</label>
              <input 
                type="range" 
                v-model.number="volume" 
                min="0" 
                max="200" 
                class="form-range volume-slider"
                @input="volumeBoost.setVolume(volume)"
              />
              <span class="small">{{ volume }}%</span>
            </div>
            
            <!-- Loop Toggle -->
            <div class="d-flex align-items-center gap-2">
              <button 
                class="btn btn-sm"
                :class="isLooping ? 'btn-success' : 'btn-outline-secondary'"
                @click="toggleLoop"
                :disabled="!selectedRegion"
              >
                🔁 Loop {{ isLooping ? 'ON' : 'OFF' }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Waveform Timeline -->
        <div class="mb-3">
          <h5>Analysis Waveform</h5>
          <p class="text-muted small">Click and drag to select a region for looping or saving as snippet</p>
          <div ref="waveformContainer" class="waveform-container border rounded"></div>
          
          <!-- Region Controls -->
          <div v-if="selectedRegion" class="mt-2 d-flex align-items-center gap-2 flex-wrap">
            <span class="badge bg-primary">
              Selected: {{ formatTime(selectedRegion.start) }} - {{ formatTime(selectedRegion.end) }}
            </span>
            <button class="btn btn-sm btn-outline-primary" @click="playSelectedRegion">
              ▶ Play Selected
            </button>
            <button class="btn btn-sm btn-success" @click="showSaveSnippetModal = true">
              💾 Save Snippet
            </button>
            <button class="btn btn-sm btn-outline-danger" @click="clearSelectedRegion">
              ✕ Clear Selection
            </button>
          </div>
        </div>
        
        <!-- Add Marker Button -->
        <div class="mb-3">
          <button class="btn btn-outline-info" @click="addMarkerAtCurrentTime">
            📍 Add Marker at {{ formatTime(currentTime) }}
          </button>
        </div>
        
        <!-- Markers List -->
        <div v-if="markers.length > 0" class="mb-3">
          <h5>Markers</h5>
          <div class="list-group">
            <div 
              v-for="marker in sortedMarkers" 
              :key="marker.id" 
              class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              @click="seekTo(marker.timestamp)"
              style="cursor: pointer;"
            >
              <div>
                <span class="badge me-2" :style="{ backgroundColor: marker.color }">
                  {{ formatTime(marker.timestamp) }}
                </span>
                <span v-if="marker.label">{{ marker.label }}</span>
                <span v-else class="text-muted fst-italic">No label</span>
              </div>
              <div class="btn-group">
                <button class="btn btn-sm btn-outline-primary" @click.stop="editMarker(marker)">
                  Edit
                </button>
                <button class="btn btn-sm btn-outline-danger" @click.stop="deleteMarkerById(marker.id)">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Saved Snippets -->
        <div v-if="snippets.length > 0" class="mb-3">
          <h5>Saved Snippets</h5>
          <div class="row">
            <div v-for="snippet in snippets" :key="snippet.id" class="col-md-6 mb-3">
              <div class="card snippet-card">
                <div class="card-header d-flex justify-content-between align-items-center">
                  <div>
                    <span class="badge" :class="snippet.type === 'video' ? 'bg-primary' : 'bg-info'">
                      {{ snippet.type === 'video' ? '🎬 Video' : '🎵 Audio' }}
                    </span>
                    <strong class="ms-2">{{ snippet.name || 'Unnamed' }}</strong>
                  </div>
                  <span class="badge bg-secondary">{{ formatTime(snippet.start) }} - {{ formatTime(snippet.end) }}</span>
                </div>
                <div class="card-body">
                  <!-- Video Snippets -->
                  <template v-if="snippet.type === 'video'">
                    <div class="row mb-2">
                      <div class="col-6">
                        <div class="d-flex align-items-center justify-content-between mb-1">
                          <label class="form-label small fw-bold text-danger mb-0">🔄 Reversed:</label>
                          <select
                            :value="snippetSpeeds[snippet.id]?.reversed || 1"
                            class="form-select form-select-sm speed-select-mini"
                            @change="updateSnippetSpeed(snippet.id, 'reversed', parseFloat($event.target.value))"
                          >
                            <option :value="0.25">0.25x</option>
                            <option :value="0.5">0.5x</option>
                            <option :value="0.75">0.75x</option>
                            <option :value="1">1x</option>
                            <option :value="1.5">1.5x</option>
                            <option :value="2">2x</option>
                          </select>
                        </div>
                        <video
                          :ref="el => snippetMediaRefs[`reversed_${snippet.id}`] = el"
                          :src="snippet.url"
                          controls
                          class="w-100 snippet-video"
                        ></video>
                      </div>
                      <div class="col-6">
                        <div class="d-flex align-items-center justify-content-between mb-1">
                          <label class="form-label small fw-bold text-success mb-0">▶ Forward:</label>
                          <select
                            :value="snippetSpeeds[snippet.id]?.forward || 1"
                            class="form-select form-select-sm speed-select-mini"
                            @change="updateSnippetSpeed(snippet.id, 'forward', parseFloat($event.target.value))"
                          >
                            <option :value="0.25">0.25x</option>
                            <option :value="0.5">0.5x</option>
                            <option :value="0.75">0.75x</option>
                            <option :value="1">1x</option>
                            <option :value="1.5">1.5x</option>
                            <option :value="2">2x</option>
                          </select>
                        </div>
                        <video
                          :ref="el => snippetMediaRefs[`forward_${snippet.id}`] = el"
                          :src="snippet.forwardUrl"
                          controls
                          class="w-100 snippet-video"
                        ></video>
                      </div>
                    </div>
                  </template>
                  
                  <!-- Audio Snippets -->
                  <template v-else>
                    <div class="mb-2">
                      <div class="d-flex align-items-center justify-content-between mb-1">
                        <label class="form-label small fw-bold text-danger mb-0">🔄 Reversed:</label>
                        <select
                          :value="snippetSpeeds[snippet.id]?.reversed || 1"
                          class="form-select form-select-sm speed-select-mini"
                          @change="updateSnippetSpeed(snippet.id, 'reversed', parseFloat($event.target.value))"
                        >
                          <option :value="0.25">0.25x</option>
                          <option :value="0.5">0.5x</option>
                          <option :value="0.75">0.75x</option>
                          <option :value="1">1x</option>
                          <option :value="1.5">1.5x</option>
                          <option :value="2">2x</option>
                        </select>
                      </div>
                      <audio
                        :ref="el => snippetMediaRefs[`reversed_${snippet.id}`] = el"
                        :src="snippet.url"
                        controls
                        class="w-100"
                      ></audio>
                    </div>
                    <div class="mb-2">
                      <div class="d-flex align-items-center justify-content-between mb-1">
                        <label class="form-label small fw-bold text-success mb-0">▶ Forward:</label>
                        <select
                          :value="snippetSpeeds[snippet.id]?.forward || 1"
                          class="form-select form-select-sm speed-select-mini"
                          @change="updateSnippetSpeed(snippet.id, 'forward', parseFloat($event.target.value))"
                        >
                          <option :value="0.25">0.25x</option>
                          <option :value="0.5">0.5x</option>
                          <option :value="0.75">0.75x</option>
                          <option :value="1">1x</option>
                          <option :value="1.5">1.5x</option>
                          <option :value="2">2x</option>
                        </select>
                      </div>
                      <audio
                        :ref="el => snippetMediaRefs[`forward_${snippet.id}`] = el"
                        :src="snippet.forwardUrl"
                        controls
                        class="w-100"
                      ></audio>
                    </div>
                  </template>
                  
                  <!-- Annotation -->
                  <div class="mb-2">
                    <div v-if="!snippet._editing" class="annotation-box p-2 bg-light rounded">
                      <p v-if="snippet.annotation" class="mb-0 small">📝 {{ snippet.annotation }}</p>
                      <p v-else class="mb-0 text-muted fst-italic small">No annotation</p>
                    </div>
                    <div v-if="snippet._editing" class="d-flex gap-2">
                      <input v-model="snippet._tempAnnotation" class="form-control form-control-sm" placeholder="Enter annotation..." />
                      <button class="btn btn-sm btn-success" @click="saveSnippetAnnotation(snippet)">Save</button>
                      <button class="btn btn-sm btn-outline-secondary" @click="snippet._editing = false">Cancel</button>
                    </div>
                  </div>
                  
                  <!-- Actions -->
                  <div class="d-flex gap-2 flex-wrap">
                    <button
                      v-if="!snippet._editing"
                      class="btn btn-sm btn-outline-secondary"
                      @click="snippet._editing = true; snippet._tempAnnotation = snippet.annotation"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      class="btn btn-sm btn-success"
                      @click="exportStitchedAudio(snippet)"
                      :disabled="exportingSnippets[snippet.id]?.audio"
                    >
                      <span v-if="exportingSnippets[snippet.id]?.audio" class="spinner-border spinner-border-sm me-1"></span>
                      🎵 Export Audio
                    </button>
                    <button
                      v-if="snippet.type === 'video'"
                      class="btn btn-sm btn-primary"
                      @click="exportStitchedVideo(snippet)"
                      :disabled="exportingSnippets[snippet.id]?.video"
                    >
                      <span v-if="exportingSnippets[snippet.id]?.video" class="spinner-border spinner-border-sm me-1"></span>
                      🎬 Export Video
                    </button>
                    <a :href="snippet.url" download class="btn btn-sm btn-outline-primary">⬇ Reversed</a>
                    <a :href="snippet.forwardUrl" download class="btn btn-sm btn-outline-primary">⬇ Forward</a>
                    <button class="btn btn-sm btn-outline-danger" @click="deleteSnippet(snippet.id)">🗑️ Delete</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Save Snippet Modal -->
      <div v-if="showSaveSnippetModal" class="modal-overlay" @click.self="showSaveSnippetModal = false">
        <div class="modal-content">
          <h5>Save Snippet</h5>
          <p>Save selection: {{ formatTime(selectedRegion?.start || 0) }} - {{ formatTime(selectedRegion?.end || 0) }}</p>
          
          <div class="mb-3">
            <label class="form-label">Name <span class="text-danger">*</span></label>
            <input v-model="snippetName" class="form-control" placeholder="Give this snippet a name..." autofocus />
          </div>
          
          <div class="mb-3">
            <label class="form-label">Annotation (optional)</label>
            <input v-model="snippetAnnotation" class="form-control" placeholder="What do you hear in this segment?" />
          </div>
          
          <div class="mb-3">
            <label class="form-label d-flex align-items-center gap-2">
              <input type="checkbox" v-model="includeVideoInSnippet" class="form-check-input" style="margin-top: 0;" />
              Include Video (creates video clips instead of audio-only)
            </label>
            <small class="text-muted">Video snippets are larger but include visual context for lip-reading analysis.</small>
          </div>
          
          <div class="mb-3">
            <label class="form-label">Current Playback Speed: {{ playbackSpeed }}x</label>
            <small class="text-muted d-block">This speed will be saved with the snippet for reference.</small>
          </div>
          
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary" @click="showSaveSnippetModal = false">Cancel</button>
            <button class="btn btn-success" @click="saveSnippet" :disabled="isSavingSnippet || !snippetName.trim()">
              <span v-if="isSavingSnippet" class="spinner-border spinner-border-sm me-1"></span>
              Save {{ includeVideoInSnippet ? 'Video' : 'Audio' }} Snippet
            </button>
          </div>
        </div>
      </div>
      
      <!-- Edit Marker Modal -->
      <div v-if="editingMarker" class="modal-overlay" @click.self="editingMarker = null">
        <div class="modal-content">
          <h5>Edit Marker</h5>
          
          <div class="mb-3">
            <label class="form-label">Label</label>
            <input v-model="editingMarker.label" class="form-control" placeholder="Marker label..." />
          </div>
          
          <div class="mb-3">
            <label class="form-label">Color</label>
            <input type="color" v-model="editingMarker.color" class="form-control form-control-color" />
          </div>
          
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary" @click="editingMarker = null">Cancel</button>
            <button class="btn btn-primary" @click="saveMarkerEdit">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import axios from 'axios';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import { useVideoSync, useMarkers, useVolumeBoost } from '../composables';

const API_BASE = 'http://localhost:3000';

// Refs for video elements
const originalVideoEl = ref(null);
const reversedVideoEl = ref(null);
const waveformContainer = ref(null);

// State
const selectedFile = ref(null);
const videoName = ref('');
const reversalChunkSize = ref(2.0);
const isProcessing = ref(false);
const error = ref(null);
const analysisData = ref(null);
const existingVideos = ref([]);
const selectedExistingId = ref('');

// Waveform and regions
let waveSurfer = null;
let regionsPlugin = null;
const selectedRegion = ref(null);

// Snippets
const snippets = ref([]);
const showSaveSnippetModal = ref(false);
const snippetName = ref('');
const snippetAnnotation = ref('');
const isSavingSnippet = ref(false);
const includeVideoInSnippet = ref(false);
const snippetSpeeds = ref({}); // { snippetId: { forward: 1, reversed: 1 } }
const snippetMediaRefs = ref({});
const exportingSnippets = ref({}); // { snippetId: true/false }

// Markers
const markers = ref([]);
const editingMarker = ref(null);
const analysisId = computed(() => analysisData.value?.analysisId || null);
const { addMarker, updateMarker, deleteMarker } = useMarkers(analysisId);

// Video sync composable
const { 
  isPlaying,
  isOriginalPlaying,
  isSynced,
  currentTime,
  duration,
  playbackSpeed,
  isLooping,
  play,
  pause,
  togglePlay,
  playOriginal,
  pauseOriginal,
  toggleOriginal,
  seekTo,
  skip,
  setSpeed,
  setLoop,
  clearLoop,
  toggleLoop
} = useVideoSync(originalVideoEl, reversedVideoEl);

// Volume boost (for reversed video)
const volumeBoost = useVolumeBoost(reversedVideoEl);
const volume = ref(100);

// Computed
const sortedMarkers = computed(() => {
  return [...markers.value].sort((a, b) => a.timestamp - b.timestamp);
});

// Methods
const handleFileSelect = (event) => {
  selectedFile.value = event.target.files[0];
  error.value = null;
};

const processVideo = async () => {
  if (!selectedFile.value) return;
  
  isProcessing.value = true;
  error.value = null;
  
  const formData = new FormData();
  formData.append('video', selectedFile.value);
  if (videoName.value.trim()) {
    formData.append('name', videoName.value.trim());
  }
  formData.append('maxChunkDuration', reversalChunkSize.value);
  
  try {
    const response = await axios.post(`${API_BASE}/api/process-video`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    analysisData.value = response.data;
    markers.value = [];
    snippets.value = [];
    
    await nextTick();
    initializeWaveform();
  } catch (err) {
    error.value = 'Failed to process video: ' + (err.response?.data?.error || err.message);
  } finally {
    isProcessing.value = false;
  }
};

const loadExistingAnalysis = async () => {
  if (!selectedExistingId.value) return;
  
  isProcessing.value = true;
  error.value = null;
  
  try {
    const response = await axios.get(`${API_BASE}/api/videos/${selectedExistingId.value}`);
    analysisData.value = response.data;
    markers.value = response.data.markers || [];
    snippets.value = (response.data.snippets || []).map(s => ({ ...s, _editing: false, _tempAnnotation: '' }));
    
    // Initialize speeds for loaded snippets
    snippets.value.forEach(s => {
      const savedSpeed = s.playbackSpeed || 1;
      snippetSpeeds.value[s.id] = { forward: savedSpeed, reversed: savedSpeed };
    });
    
    await nextTick();
    initializeWaveform();
  } catch (err) {
    error.value = 'Failed to load analysis: ' + (err.response?.data?.error || err.message);
  } finally {
    isProcessing.value = false;
  }
};

const fetchExistingVideos = async () => {
  try {
    const response = await axios.get(`${API_BASE}/api/videos`);
    existingVideos.value = response.data;
  } catch (err) {
    console.error('Failed to fetch existing videos:', err);
  }
};

const resetAnalysis = () => {
  analysisData.value = null;
  selectedFile.value = null;
  videoName.value = '';
  selectedExistingId.value = '';
  markers.value = [];
  snippets.value = [];
  selectedRegion.value = null;
  
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
  
  fetchExistingVideos();
};

const onVideoLoaded = () => {
  // Videos are ready
  volumeBoost.initializeAudio();
};

const initializeWaveform = () => {
  // Use absolute URL to ensure WaveSurfer can fetch correctly avoiding proxy issues
  const audioUrl = analysisData.value?.fullReversedAudioUrl ||
                   (analysisData.value?.reversedAudioUrl ? `${API_BASE}${analysisData.value.reversedAudioUrl}` : null);

  if (!waveformContainer.value || !audioUrl) {
    console.warn('Cannot initialize waveform: Missing container or URL', { container: !!waveformContainer.value, url: audioUrl });
    // Retry once if container is missing (race condition with v-if)
    if (!waveformContainer.value && analysisData.value) {
      setTimeout(initializeWaveform, 100);
    }
    return;
  }
  
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
  
  regionsPlugin = RegionsPlugin.create();
  
  try {
    waveSurfer = WaveSurfer.create({
      container: waveformContainer.value,
      waveColor: 'rgb(200, 0, 200)',
      progressColor: 'rgb(100, 0, 100)',
      height: 100,
      plugins: [regionsPlugin],
      responsive: true,
      normalize: true,
      minPxPerSec: 20,
      cursorColor: '#333',
      barWidth: 2,
      url: audioUrl
    });
    
    waveSurfer.on('error', (err) => {
      console.error('WaveSurfer error:', err);
      // Don't show UI error immediately for waveform glitches unless critical
    });

    waveSurfer.on('ready', () => {
    // Add visual markers to waveform
    markers.value.forEach(marker => {
      addMarkerToWaveform(marker);
    });
  });
  
  } catch (err) {
      console.error('WaveSurfer creation error', err);
  }

  waveSurfer.on('click', (relativeX) => {
    const time = relativeX * waveSurfer.getDuration();
    seekTo(time);
  });

  // Enable native drag selection
  regionsPlugin.enableDragSelection({
    color: 'rgba(0, 123, 255, 0.2)',
  });

  // Handle region creation (selection)
  regionsPlugin.on('region-created', (region) => {
    // Remove previous selection regions (keep markers)
    regionsPlugin.getRegions().forEach(r => {
      // If it exists, is not the new one, and is not a marker -> remove it
      if (r.id !== region.id && !r.id.toString().startsWith('marker_')) {
        r.remove();
      }
    });
    
    // Update state
    selectedRegion.value = { start: region.start, end: region.end };
    setLoop(region.start, region.end);
  });

  // Handle region updates (resize/drag)
  regionsPlugin.on('region-updated', (region) => {
    if (!region.id.toString().startsWith('marker_')) {
      selectedRegion.value = { start: region.start, end: region.end };
      setLoop(region.start, region.end);
    }
  });
  
  // Handle clicking a region (activate selection)
  regionsPlugin.on('region-clicked', (region, e) => {
    e.stopPropagation();
    if (!region.id.toString().startsWith('marker_')) {
      selectedRegion.value = { start: region.start, end: region.end };
      setLoop(region.start, region.end);
    }
  });
};

const addMarkerToWaveform = (marker) => {
  if (!regionsPlugin) return;
  regionsPlugin.addRegion({
    start: marker.timestamp,
    end: marker.timestamp + 0.1,
    color: marker.color || '#ff6384',
    drag: false,
    resize: false,
    id: marker.id
  });
};

const clearSelectedRegion = () => {
  selectedRegion.value = null;
  clearLoop();
  
  if (regionsPlugin) {
    Object.values(regionsPlugin.regions || {}).forEach(r => {
      if (!r.id?.startsWith('marker_')) {
        r.remove();
      }
    });
  }
};

const playSelectedRegion = () => {
  if (!selectedRegion.value) return;
  seekTo(selectedRegion.value.start);
  play();
};

const addMarkerAtCurrentTime = async () => {
  if (!analysisId.value) return;
  
  const newMarker = await addMarker(currentTime.value, '', '#ff6384');
  if (newMarker) {
    markers.value.push(newMarker);
    addMarkerToWaveform(newMarker);
  }
};

const editMarker = (marker) => {
  editingMarker.value = { ...marker };
};

const saveMarkerEdit = async () => {
  if (!editingMarker.value) return;
  
  const updated = await updateMarker(editingMarker.value.id, {
    label: editingMarker.value.label,
    color: editingMarker.value.color
  });
  
  if (updated) {
    const index = markers.value.findIndex(m => m.id === updated.id);
    if (index !== -1) {
      markers.value[index] = updated;
    }
  }
  
  editingMarker.value = null;
};

const deleteMarkerById = async (markerId) => {
  const success = await deleteMarker(markerId);
  if (success) {
    markers.value = markers.value.filter(m => m.id !== markerId);
  }
};

const saveSnippet = async () => {
  if (!selectedRegion.value || !analysisId.value) return;
  
  isSavingSnippet.value = true;
  
  try {
    const response = await axios.post(`${API_BASE}/api/extract-video-snippet`, {
      analysisId: analysisId.value,
      start: selectedRegion.value.start,
      end: selectedRegion.value.end,
      playbackSpeed: playbackSpeed.value,
      name: snippetName.value,
      annotation: snippetAnnotation.value,
      includeVideo: includeVideoInSnippet.value
    });
    
    const newSnippet = { ...response.data, _editing: false, _tempAnnotation: '', _tempName: '' };
    snippets.value.push(newSnippet);
    
    // Initialize individual speeds for forward and reversed
    const savedSpeed = newSnippet.playbackSpeed || 1;
    snippetSpeeds.value[newSnippet.id] = { forward: savedSpeed, reversed: savedSpeed };
    
    showSaveSnippetModal.value = false;
    snippetName.value = '';
    snippetAnnotation.value = '';
    includeVideoInSnippet.value = false;
    clearSelectedRegion();
  } catch (err) {
    error.value = 'Failed to save snippet: ' + (err.response?.data?.error || err.message);
  } finally {
    isSavingSnippet.value = false;
  }
};

// Update playback speed for a snippet's individual media element
const updateSnippetSpeed = (snippetId, which, speed) => {
  // Initialize if needed
  if (!snippetSpeeds.value[snippetId]) {
    snippetSpeeds.value[snippetId] = { forward: 1, reversed: 1 };
  }
  
  // Update the speed in state
  snippetSpeeds.value[snippetId][which] = speed;
  
  // Apply to media element
  const mediaRef = snippetMediaRefs.value[`${which}_${snippetId}`];
  if (mediaRef) {
    mediaRef.playbackRate = speed;
  }
};

// Export stitched audio (forward first, then reversed)
const exportStitchedAudio = async (snippet) => {
  if (!exportingSnippets.value[snippet.id]) {
    exportingSnippets.value[snippet.id] = {};
  }
  exportingSnippets.value[snippet.id].audio = true;
  
  try {
    const speeds = snippetSpeeds.value[snippet.id] || { forward: 1, reversed: 1 };
    
    const response = await axios.post(`${API_BASE}/api/stitch-snippet`, {
      snippetId: snippet.id,
      analysisId: analysisId.value,
      reversedSpeed: speeds.reversed,
      forwardSpeed: speeds.forward,
      exportType: 'audio' // Always export as audio-only
    }, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${snippet.name || 'snippet'}_audio.wav`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = 'Failed to export audio: ' + (err.response?.data?.error || err.message);
  } finally {
    exportingSnippets.value[snippet.id].audio = false;
  }
};

// Export stitched video (forward video x2 with stitched audio overlay)
const exportStitchedVideo = async (snippet) => {
  if (!exportingSnippets.value[snippet.id]) {
    exportingSnippets.value[snippet.id] = {};
  }
  exportingSnippets.value[snippet.id].video = true;
  
  try {
    const speeds = snippetSpeeds.value[snippet.id] || { forward: 1, reversed: 1 };
    
    const response = await axios.post(`${API_BASE}/api/stitch-snippet`, {
      snippetId: snippet.id,
      analysisId: analysisId.value,
      reversedSpeed: speeds.reversed,
      forwardSpeed: speeds.forward,
      exportType: 'video' // Export as video with audio overlay
    }, {
      responseType: 'blob'
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${snippet.name || 'snippet'}_video.mp4`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    error.value = 'Failed to export video: ' + (err.response?.data?.error || err.message);
  } finally {
    exportingSnippets.value[snippet.id].video = false;
  }
};

const saveSnippetAnnotation = async (snippet) => {
  try {
    await axios.put(`${API_BASE}/api/video-snippets/${snippet.id}`, {
      analysisId: analysisId.value,
      annotation: snippet._tempAnnotation
    });
    
    snippet.annotation = snippet._tempAnnotation;
    snippet._editing = false;
  } catch (err) {
    error.value = 'Failed to save annotation: ' + err.message;
  }
};

const deleteSnippet = async (snippetId) => {
  try {
    await axios.delete(`${API_BASE}/api/video-snippets/${snippetId}`, {
      data: { analysisId: analysisId.value }
    });
    
    snippets.value = snippets.value.filter(s => s.id !== snippetId);
  } catch (err) {
    error.value = 'Failed to delete snippet: ' + err.message;
  }
};

// Utility functions
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDuration = (seconds) => {
  if (!seconds) return 'Unknown duration';
  return formatTime(seconds);
};

// Lifecycle
onMounted(() => {
  fetchExistingVideos();
});

onUnmounted(() => {
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
});

// Sync waveform cursor with video time
watch(currentTime, (time) => {
  if (waveSurfer && !isNaN(time)) {
    const progress = time / duration.value;
    waveSurfer.seekTo(Math.min(1, Math.max(0, progress)));
  }
});
</script>

<style scoped>
.video-container {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 10px;
}

.video-container h5 {
  color: #fff;
  margin-bottom: 10px;
  font-size: 0.9rem;
}

.video-container video {
  border-radius: 4px;
  max-height: 300px;
  object-fit: contain;
}

.controls-bar {
  background: #f8f9fa;
}

.speed-select {
  width: 80px;
}

.volume-slider {
  width: 100px;
}

.time-display {
  background: #333;
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.9rem;
}

.waveform-container {
  min-height: 100px;
  background: #f8f9fa;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.list-group-item:hover {
  background: #f8f9fa;
}

.badge {
  font-weight: normal;
}

.snippet-card {
  border: 1px solid #dee2e6;
}

.snippet-card .card-header {
  background: #f8f9fa;
  padding: 0.5rem 1rem;
}

.snippet-video {
  border-radius: 4px;
  max-height: 150px;
  object-fit: contain;
  background: #000;
}

.speed-select-mini {
  width: 70px;
  padding: 2px 4px;
  font-size: 0.75rem;
}
</style>
