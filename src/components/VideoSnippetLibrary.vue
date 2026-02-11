<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Video Snippet Library</h3>
      <p class="text-muted">Browse and re-listen to saved audio snippets from video analyses.</p>
      
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading snippets...</p>
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="alert alert-danger alert-dismissible">
        {{ error }}
        <button type="button" class="btn-close" @click="error = null"></button>
        <button class="btn btn-link" @click="fetchSnippets">Try Again</button>
      </div>
      
      <!-- Empty State -->
      <div v-else-if="snippets.length === 0" class="text-center py-5">
        <div class="text-muted mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor" viewBox="0 0 16 16">
            <path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h13zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2h-13z"/>
            <path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8zm0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5z"/>
          </svg>
        </div>
        <p class="text-muted">No video snippets saved yet.</p>
        <router-link to="/video" class="btn btn-primary">Analyze a Video</router-link>
      </div>
      
      <!-- Filter/Search Controls -->
      <div v-else class="mb-4">
        <div class="row g-2 align-items-center">
          <div class="col-md-4">
            <input 
              v-model="searchQuery" 
              type="text" 
              class="form-control" 
              placeholder="Search annotations..."
            />
          </div>
          <div class="col-md-3">
            <select v-model="sortBy" class="form-select">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration">Longest Duration</option>
            </select>
          </div>
          <div class="col-md-3">
            <select v-model="filterBySpeed" class="form-select">
              <option value="">All Speeds</option>
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
          <div class="col-md-2">
            <span class="badge bg-secondary">{{ filteredSnippets.length }} snippets</span>
          </div>
        </div>
      </div>
      
      <!-- Snippet Grid -->
      <div v-if="filteredSnippets.length > 0" class="row">
        <div v-for="snippet in filteredSnippets" :key="snippet.id" class="col-lg-6 mb-4">
          <div class="card snippet-card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <div>
                <h6 class="mb-0 text-primary">
                  {{ snippet.name || 'Unnamed Snippet' }}
                </h6>
              </div>
              <div>
                <span class="badge bg-secondary me-1">{{ formatTime(snippet.start) }} - {{ formatTime(snippet.end) }}</span>
                <span class="badge bg-info">{{ snippet.playbackSpeed }}x</span>
              </div>
            </div>
            <div class="card-body">
              <!-- Name Edit -->
              <div class="mb-3">
                <div v-if="!snippet._editingName" class="d-flex align-items-center gap-2">
                  <strong>Name:</strong>
                  <span>{{ snippet.name || 'Unnamed' }}</span>
                  <button class="btn btn-sm btn-outline-secondary py-0" @click="startEditName(snippet)">
                    ✏️
                  </button>
                </div>
                <div v-else class="d-flex gap-2">
                  <input v-model="snippet._tempName" class="form-control form-control-sm" placeholder="Snippet name..." />
                  <button class="btn btn-sm btn-success" @click="saveSnippetName(snippet)">Save</button>
                  <button class="btn btn-sm btn-outline-secondary" @click="snippet._editingName = false">Cancel</button>
                </div>
              </div>
              
              <!-- Source Info -->
              <p class="small text-muted mb-2">
                From: <strong>{{ snippet.analysisId }}</strong>
              </p>
              
              <!-- Annotation -->
              <div class="annotation-box mb-3 p-2 bg-light rounded">
                <p v-if="snippet.annotation" class="mb-0">
                  <strong>📝</strong> {{ snippet.annotation }}
                </p>
                <p v-else class="mb-0 text-muted fst-italic">No annotation</p>
              </div>
              
              <!-- Playback Speed Control -->
              <div class="mb-3">
                <label class="form-label small">Playback Speed:</label>
                <div class="d-flex align-items-center gap-2">
                  <select 
                    v-model.number="snippetPlaybackSpeeds[snippet.id]" 
                    class="form-select form-select-sm w-auto"
                    @change="updateSnippetPlaybackSpeed(snippet.id)"
                  >
                    <option :value="0.25">0.25x</option>
                    <option :value="0.5">0.5x</option>
                    <option :value="0.75">0.75x</option>
                    <option :value="1">1x</option>
                    <option :value="1.5">1.5x</option>
                    <option :value="2">2x</option>
                  </select>
                  <span class="small text-muted">(Original: {{ snippet.playbackSpeed }}x)</span>
                </div>
              </div>
              
              <!-- Reversed Audio Player -->
              <div class="mb-3">
                <label class="form-label small fw-bold text-danger">🔄 Reversed Audio:</label>
                <audio 
                  :ref="el => audioRefs[`reversed_${snippet.id}`] = el" 
                  :src="snippet.url" 
                  controls 
                  class="w-100"
                ></audio>
              </div>
              
              <!-- Forward Audio Player -->
              <div class="mb-3">
                <label class="form-label small fw-bold text-success">▶ Forward Audio:</label>
                <audio 
                  :ref="el => audioRefs[`forward_${snippet.id}`] = el" 
                  :src="snippet.forwardUrl" 
                  controls 
                  class="w-100"
                ></audio>
              </div>
              
              <!-- Duration Info -->
              <p class="small text-muted mb-2">
                Duration: {{ (snippet.end - snippet.start).toFixed(2) }}s
                <span v-if="snippet.createdAt"> • Saved: {{ formatDate(snippet.createdAt) }}</span>
              </p>
              
              <!-- Actions -->
              <div class="d-flex gap-2 flex-wrap">
                <a :href="snippet.url" download class="btn btn-sm btn-outline-danger">
                  ⬇ Download Reversed
                </a>
                <a :href="snippet.forwardUrl" download class="btn btn-sm btn-outline-success">
                  ⬇ Download Forward
                </a>
                <router-link 
                  :to="`/video?load=${snippet.analysisId}`" 
                  class="btn btn-sm btn-outline-primary"
                >
                  Open Source Video
                </router-link>
                <button 
                  class="btn btn-sm btn-outline-danger"
                  @click="confirmDelete(snippet)"
                  :disabled="deletingId === snippet.id"
                >
                  <span v-if="deletingId === snippet.id" class="spinner-border spinner-border-sm"></span>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Results After Filter -->
      <div v-else-if="snippets.length > 0" class="text-center py-4">
        <p class="text-muted">No snippets match your search criteria.</p>
        <button class="btn btn-outline-secondary" @click="clearFilters">Clear Filters</button>
      </div>
      
      <!-- Delete Confirmation Modal -->
      <div v-if="snippetToDelete" class="modal-overlay" @click.self="snippetToDelete = null">
        <div class="modal-content">
          <h5>Delete Snippet</h5>
          <p>Are you sure you want to delete this snippet?</p>
          <p class="small text-muted">
            {{ formatTime(snippetToDelete.start) }} - {{ formatTime(snippetToDelete.end) }}
            <br>
            {{ snippetToDelete.annotation || 'No annotation' }}
          </p>
          
          <div class="d-flex gap-2 justify-content-end">
            <button class="btn btn-secondary" @click="snippetToDelete = null">Cancel</button>
            <button class="btn btn-danger" @click="deleteSnippet" :disabled="deletingId">
              <span v-if="deletingId" class="spinner-border spinner-border-sm me-1"></span>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

// State
const snippets = ref([]);
const loading = ref(true);
const error = ref(null);
const searchQuery = ref('');
const sortBy = ref('newest');
const filterBySpeed = ref('');
const snippetPlaybackSpeeds = ref({});
const audioRefs = ref({});
const snippetToDelete = ref(null);
const deletingId = ref(null);

// Fetch all video snippets
const fetchSnippets = async () => {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await axios.get(`${API_BASE}/api/video-snippets`);
    // Initialize editing states for each snippet
    snippets.value = response.data.map(snippet => ({
      ...snippet,
      _editingName: false,
      _tempName: ''
    }));
    
    // Initialize playback speeds from saved values
    snippets.value.forEach(snippet => {
      snippetPlaybackSpeeds.value[snippet.id] = snippet.playbackSpeed || 1;
    });
  } catch (err) {
    error.value = 'Failed to load snippets: ' + (err.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
};

// Filtered and sorted snippets
const filteredSnippets = computed(() => {
  let result = [...snippets.value];
  
  // Filter by search query (name, annotation, analysisId)
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(s =>
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.annotation && s.annotation.toLowerCase().includes(query)) ||
      (s.analysisId && s.analysisId.toLowerCase().includes(query))
    );
  }
  
  // Filter by playback speed
  if (filterBySpeed.value) {
    result = result.filter(s => s.playbackSpeed === parseFloat(filterBySpeed.value));
  }
  
  // Sort
  if (sortBy.value === 'newest') {
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sortBy.value === 'oldest') {
    result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sortBy.value === 'duration') {
    result.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  }
  
  return result;
});

// Update playback speed for a snippet's audio players
const updateSnippetPlaybackSpeed = (snippetId) => {
  const speed = snippetPlaybackSpeeds.value[snippetId] || 1;
  const reversedAudio = audioRefs.value[`reversed_${snippetId}`];
  const forwardAudio = audioRefs.value[`forward_${snippetId}`];
  
  if (reversedAudio) reversedAudio.playbackRate = speed;
  if (forwardAudio) forwardAudio.playbackRate = speed;
};

// Watch for audio refs to be populated and set initial speeds
watch(audioRefs, () => {
  Object.keys(snippetPlaybackSpeeds.value).forEach(snippetId => {
    updateSnippetPlaybackSpeed(snippetId);
  });
}, { deep: true });

// Clear all filters
const clearFilters = () => {
  searchQuery.value = '';
  sortBy.value = 'newest';
  filterBySpeed.value = '';
};

// Start editing snippet name
const startEditName = (snippet) => {
  snippet._editingName = true;
  snippet._tempName = snippet.name || '';
};

// Save snippet name
const saveSnippetName = async (snippet) => {
  try {
    await axios.put(`${API_BASE}/api/video-snippets/${snippet.id}`, {
      analysisId: snippet.analysisId,
      name: snippet._tempName
    });
    
    snippet.name = snippet._tempName;
    snippet._editingName = false;
  } catch (err) {
    error.value = 'Failed to save name: ' + (err.response?.data?.error || err.message);
  }
};

// Delete handlers
const confirmDelete = (snippet) => {
  snippetToDelete.value = snippet;
};

const deleteSnippet = async () => {
  if (!snippetToDelete.value) return;
  
  deletingId.value = snippetToDelete.value.id;
  
  try {
    await axios.delete(`${API_BASE}/api/video-snippets/${snippetToDelete.value.id}`, {
      data: { analysisId: snippetToDelete.value.analysisId }
    });
    
    snippets.value = snippets.value.filter(s => s.id !== snippetToDelete.value.id);
    delete snippetPlaybackSpeeds.value[snippetToDelete.value.id];
    snippetToDelete.value = null;
  } catch (err) {
    error.value = 'Failed to delete snippet: ' + (err.response?.data?.error || err.message);
  } finally {
    deletingId.value = null;
  }
};

// Utility functions
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
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
  fetchSnippets();
});
</script>

<style scoped>
.snippet-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.snippet-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.annotation-box {
  min-height: 40px;
  border-left: 3px solid #6c757d;
}

.annotation-box p {
  word-break: break-word;
}

audio {
  height: 32px;
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
  max-width: 400px;
  width: 90%;
}

.card-header {
  background: #f8f9fa;
}
</style>
