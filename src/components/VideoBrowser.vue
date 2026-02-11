<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Video Browser</h3>
      <p class="text-muted">Browse and manage processed videos with reversed audio.</p>
      
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading videos...</p>
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="alert alert-danger">
        {{ error }}
        <button class="btn btn-link" @click="fetchVideos">Try Again</button>
      </div>
      
      <!-- Empty State -->
      <div v-else-if="videos.length === 0" class="text-center py-5">
        <p class="text-muted">No processed videos found.</p>
        <router-link to="/video" class="btn btn-primary">Process a Video</router-link>
      </div>
      
      <!-- Video List -->
      <div v-else class="row">
        <div v-for="video in videos" :key="video.analysisId" class="col-lg-6 mb-4">
          <div class="card video-card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h5 class="card-title mb-1">{{ video.analysisId }}</h5>
                  <p class="text-muted small mb-0">
                    Created: {{ formatDate(video.createdAt) }}
                  </p>
                </div>
                <span class="badge bg-primary">{{ formatDuration(video.duration) }}</span>
              </div>
              
              <!-- Video Preview -->
              <div class="video-preview mb-3">
                <div class="row">
                  <div class="col-6">
                    <label class="form-label small text-muted">Original</label>
                    <video 
                      :src="video.originalVideoUrl" 
                      class="w-100 rounded"
                      muted
                      @mouseenter="playPreview($event)"
                      @mouseleave="pausePreview($event)"
                    ></video>
                  </div>
                  <div class="col-6">
                    <label class="form-label small text-muted">Reversed Audio</label>
                    <video 
                      :src="video.reversedVideoUrl" 
                      class="w-100 rounded"
                      @mouseenter="playPreview($event)"
                      @mouseleave="pausePreview($event)"
                    ></video>
                  </div>
                </div>
                <p class="text-muted small text-center mt-1 mb-0">Hover to preview</p>
              </div>
              
              <!-- Stats -->
              <div class="stats mb-3">
                <span class="badge bg-info me-2">
                  📍 {{ video.markerCount }} markers
                </span>
                <span class="badge bg-success">
                  🎵 {{ video.snippetCount }} snippets
                </span>
              </div>
              
              <!-- Actions -->
              <div class="d-flex gap-2 flex-wrap">
                <router-link 
                  :to="`/video?load=${video.analysisId}`" 
                  class="btn btn-primary btn-sm"
                >
                  Open Analysis
                </router-link>
                <a 
                  :href="video.reversedVideoUrl" 
                  download 
                  class="btn btn-outline-secondary btn-sm"
                >
                  ⬇ Download
                </a>
                <button 
                  class="btn btn-outline-danger btn-sm"
                  @click="confirmDelete(video)"
                  :disabled="deletingId === video.analysisId"
                >
                  <span v-if="deletingId === video.analysisId" class="spinner-border spinner-border-sm me-1"></span>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Delete Confirmation Modal -->
      <div v-if="videoToDelete" class="modal-overlay" @click.self="videoToDelete = null">
        <div class="modal-content">
          <h5>Confirm Delete</h5>
          <p>Are you sure you want to delete this video analysis?</p>
          <p class="text-muted small">
            This will permanently delete the original video, reversed video, extracted audio, 
            and all associated markers and snippets.
          </p>
          <p><strong>{{ videoToDelete.analysisId }}</strong></p>
          
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary" @click="videoToDelete = null">Cancel</button>
            <button class="btn btn-danger" @click="deleteVideo" :disabled="deletingId">
              <span v-if="deletingId" class="spinner-border spinner-border-sm me-1"></span>
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

// State
const videos = ref([]);
const loading = ref(true);
const error = ref(null);
const videoToDelete = ref(null);
const deletingId = ref(null);

// Fetch all videos
const fetchVideos = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await axios.get(`${API_BASE}/api/videos`);
    videos.value = response.data;
  } catch (err) {
    error.value = 'Failed to load videos: ' + (err.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
};

// Video preview handlers
const playPreview = (event) => {
  const video = event.target;
  video.currentTime = 0;
  video.play().catch(() => {});
};

const pausePreview = (event) => {
  const video = event.target;
  video.pause();
  video.currentTime = 0;
};

// Delete handlers
const confirmDelete = (video) => {
  videoToDelete.value = video;
};

const deleteVideo = async () => {
  if (!videoToDelete.value) return;
  
  deletingId.value = videoToDelete.value.analysisId;
  
  try {
    await axios.delete(`${API_BASE}/api/videos/${videoToDelete.value.analysisId}`);
    videos.value = videos.value.filter(v => v.analysisId !== videoToDelete.value.analysisId);
    videoToDelete.value = null;
  } catch (err) {
    error.value = 'Failed to delete video: ' + (err.response?.data?.error || err.message);
  } finally {
    deletingId.value = null;
  }
};

// Utility functions
const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
};

// Lifecycle
onMounted(() => {
  fetchVideos();
});
</script>

<style scoped>
.video-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.video-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.video-preview video {
  height: 100px;
  object-fit: cover;
  background: #1a1a1a;
}

.stats {
  display: flex;
  gap: 8px;
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
}
</style>
