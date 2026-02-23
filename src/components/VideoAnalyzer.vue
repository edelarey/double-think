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
            
            <div class="mb-2">
              <label class="form-label" title="Set the maximum file size allowing for upload">
                Max File Size Limit: {{ maxFileSize }} MB
              </label>
              <select v-model.number="maxFileSize" class="form-select">
                <option v-for="size in sizeOptions" :key="size" :value="size">
                  {{ size }} MB
                </option>
              </select>
            </div>

            <label class="form-label" title="Determines the maximum length of reversed audio segments. Smaller values preserve word order better.">
              Reversal Chunk Size: {{ reversalChunkSize }}s
            </label>
            <input
              type="range"
              class="form-range"
              min="0.1"
              max="5.0"
              step="0.1"
              v-model.number="reversalChunkSize"
            />
            <div class="d-flex justify-content-between small text-muted">
              <span>0.1s (More Granular)</span>
              <span>5.0s (Longer Phrases)</span>
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
            <span class="me-3" v-if="analysisData.createdAt">
              <strong>Created:</strong> {{ formatDate(analysisData.createdAt) }}
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
        
        <!-- Sync & Global Status Bar -->
        <div class="controls-bar mb-3 p-3 bg-light rounded border">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <!-- Sync Toggle -->
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
              
              <!-- Time Display -->
              <div class="time-display">
                <span class="font-monospace">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
              </div>
            </div>

            <!-- Global Settings -->
            <div class="d-flex align-items-center gap-3">
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
                <label class="form-label mb-0 small">Rev Vol:</label>
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
            </div>
          </div>
        </div>
        
        <!-- Waveform Timelines with Dedicated Controls -->
        <div class="mb-3">
          <!-- FORWARD Waveform & Controls -->
          <div class="mb-4 border rounded p-3 bg-white shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-2">
               <h5 class="text-success mb-0">FORWARD Audio</h5>
               <span class="badge bg-light text-dark border">Original</span>
            </div>
            
            <div ref="forwardWaveformContainer" class="waveform-container border rounded mb-3"></div>
            
            <!-- Forward Controls -->
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
               <div class="btn-group">
                  <button class="btn btn-outline-success btn-sm" @click="handlePlayForward(false)">
                     {{ isOriginalPlaying && !originalVideoEl?.muted ? '⏸ Pause' : '▶ Play (Mute Rev)' }}
                  </button>
                  <button class="btn btn-outline-secondary btn-sm" @click="skip(-5)">⏪ 5s</button>
                  <button class="btn btn-outline-secondary btn-sm" @click="skip(5)">5s ⏩</button>
               </div>

               <div v-if="forwardRegion" class="d-flex align-items-center gap-2 p-1 border rounded bg-light">
                  <span class="small text-success fw-bold ps-2">Selection:</span>
                  <button class="btn btn-sm btn-success" @click="playForwardRegion">
                    ▶ Play Region
                  </button>
                  <button
                    class="btn btn-sm"
                    :class="isLooping && activeLoopType === 'forward' ? 'btn-success active' : 'btn-outline-secondary'"
                    @click="toggleForwardLoop"
                  >
                    🔁 Loop
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="clearForwardRegion">
                    ✕ Clear
                  </button>
                  <span class="small text-muted pe-2 border-start ps-2">
                     {{ formatTime(forwardRegion.start) }} - {{ formatTime(forwardRegion.end) }}
                  </span>
               </div>
               <div v-else class="text-muted small fst-italic">
                  Drag on waveform to select region
               </div>
            </div>
          </div>

          <!-- REVERSE Waveform & Controls -->
          <div class="mb-4 border rounded p-3 bg-white shadow-sm">
             <div class="d-flex justify-content-between align-items-center mb-2">
               <h5 class="text-danger mb-0">REVERSED Audio</h5>
               <span class="badge bg-light text-dark border">Analysis</span>
            </div>
            
            <div ref="waveformContainer" class="waveform-container border rounded mb-3"></div>
            
            <!-- Reverse Controls -->
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
               <div class="btn-group">
                  <button class="btn btn-outline-danger btn-sm" @click="handlePlayReverse(false)">
                     {{ isPlaying && !reversedVideoEl?.muted ? '⏸ Pause' : '▶ Play (Mute Fwd)' }}
                  </button>
                  <button class="btn btn-outline-secondary btn-sm" @click="skip(-5)">⏪ 5s</button>
                  <button class="btn btn-outline-secondary btn-sm" @click="skip(5)">5s ⏩</button>
               </div>

               <div v-if="reverseRegion" class="d-flex align-items-center gap-2 p-1 border rounded bg-light">
                  <span class="small text-danger fw-bold ps-2">Selection:</span>
                  <button class="btn btn-sm btn-danger" @click="playReverseRegion">
                    ▶ Play Region
                  </button>
                  <button
                    class="btn btn-sm"
                    :class="isLooping && activeLoopType === 'reverse' ? 'btn-success active' : 'btn-outline-secondary'"
                    @click="toggleReverseLoop"
                  >
                    🔁 Loop
                  </button>
                  <button class="btn btn-sm btn-outline-danger" @click="clearReverseRegion">
                    ✕ Clear
                  </button>
                  <span class="small text-muted pe-2 border-start ps-2">
                     {{ formatTime(reverseRegion.start) }} - {{ formatTime(reverseRegion.end) }}
                  </span>
               </div>
               <div v-else class="text-muted small fst-italic">
                  Drag on waveform to select region
               </div>
            </div>
          </div>
          
           <!-- Save Snippet Area -->
          <div v-if="forwardRegion || reverseRegion" class="mt-3 p-3 bg-light rounded d-flex justify-content-between align-items-center border border-success">
             <div>
                <strong>Actions:</strong>
                <span v-if="forwardRegion && reverseRegion" class="text-success ms-2">Ready to save Pair</span>
                <span v-else-if="forwardRegion" class="text-success ms-2">Forward Selection Active</span>
                <span v-else-if="reverseRegion" class="text-danger ms-2">Reverse Selection Active</span>
             </div>
             <div class="d-flex gap-2">
                <button class="btn btn-success fw-bold" @click="showSaveSnippetModal = true">
                  💾 Save Snippet
                </button>
                <button class="btn btn-outline-secondary" @click="clearAllRegions">
                  ✕ Clear All Selections
                </button>
             </div>
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
                  <div>
                    <span class="badge bg-light text-dark border me-2" v-if="snippet.maxChunkDuration" title="Reversal Chunk Size">
                      📏 {{ snippet.maxChunkDuration }}s
                    </span>
                    <span class="badge bg-secondary">{{ formatTime(snippet.start) }} - {{ formatTime(snippet.end) }}</span>
                  </div>
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
                  
                  <!-- Ranges in List -->
                  <div class="mb-2 small">
                      <div class="d-flex justify-content-between text-danger">
                        <span><strong>Reverse:</strong> {{ formatTime(snippet.start) }} - {{ formatTime(snippet.end) }}</span>
                      </div>
                      <div class="d-flex justify-content-between text-success">
                        <span><strong>Forward:</strong> {{ formatTime(snippet.forwardStart || snippet.start) }} - {{ formatTime(snippet.forwardEnd || snippet.end) }}</span>
                      </div>
                  </div>

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
                    
                    <div class="dropdown">
                      <button class="btn btn-sm btn-success dropdown-toggle" type="button" :id="'exportDropdown' + snippet.id" data-bs-toggle="dropdown" aria-expanded="false" :disabled="exportingSnippets[snippet.id]?.any">
                         <span v-if="exportingSnippets[snippet.id]?.any" class="spinner-border spinner-border-sm me-1"></span>
                         📤 Export
                      </button>
                      <ul class="dropdown-menu" :aria-labelledby="'exportDropdown' + snippet.id">
                         <li>
                            <button class="dropdown-item" @click="exportStitchedAudio(snippet)">🎵 Stitched Audio</button>
                         </li>
                         <li v-if="snippet.type === 'video'">
                            <button class="dropdown-item" @click="exportStitchedVideo(snippet)">🎬 Stitched Video</button>
                         </li>
                         <li><hr class="dropdown-divider"></li>
                         <li>
                            <button class="dropdown-item fw-bold" @click="exportCompletePackage(snippet)">📦 Complete Package</button>
                         </li>
                      </ul>
                    </div>
              
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
        
        <div class="alert alert-info mb-3">
          <div class="d-flex justify-content-between mb-1">
             <strong class="text-danger">Reverse Range:</strong>
             <span>{{ formatTime(reverseRegion?.start || 0) }} - {{ formatTime(reverseRegion?.end || 0) }}</span>
          </div>
          <div class="d-flex justify-content-between">
             <strong class="text-success">Forward Range:</strong>
             <span>{{ formatTime(forwardRegion?.start || (reverseRegion?.start || 0)) }} - {{ formatTime(forwardRegion?.end || (reverseRegion?.end || 0)) }}</span>
          </div>
          <div v-if="!forwardRegion" class="mt-2 small fst-italic">
            * Using reverse range for forward clip since no independent forward selection was made.
          </div>
        </div>
        
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
import { useRoute } from 'vue-router';
import axios from 'axios';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import { useVideoSync, useMarkers, useVolumeBoost } from '../composables';

const API_BASE = 'http://localhost:3000';
const route = useRoute();

// Refs for video elements
const originalVideoEl = ref(null);
const reversedVideoEl = ref(null);
const waveformContainer = ref(null);
const forwardWaveformContainer = ref(null);

// State
const selectedFile = ref(null);
const videoName = ref('');
const reversalChunkSize = ref(2.0);
const maxFileSize = ref(200); // Default 200MB
const sizeOptions = computed(() => {
  const options = [];
  for (let i = 50; i <= 1000; i += 50) {
    options.push(i);
  }
  return options;
});
const isProcessing = ref(false);
const error = ref(null);
const analysisData = ref(null);
const existingVideos = ref([]);
const selectedExistingId = ref('');

// Waveform and regions
let waveSurfer = null; // Reverse
let regionsPlugin = null; // Reverse
let forwardWaveSurfer = null; // Forward
let forwardRegionsPlugin = null; // Forward

const reverseRegion = ref(null); // { start, end }
const forwardRegion = ref(null); // { start, end }
// Deprecate selectedRegion efficiently by using a computed that reflects reverseRegion for backward compat if needed,
// but we will mainly switch to separate refs.
const selectedRegion = computed(() => reverseRegion.value);

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
  activeLoopType, // Exposed from composition
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
  toggleLoop,
  playForwardOnly,
  playReverseOnly
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
  
  // Validate file size
  const fileSizeMB = selectedFile.value.size / (1024 * 1024);
  if (fileSizeMB > maxFileSize.value) {
    error.value = `File size (${fileSizeMB.toFixed(2)} MB) exceeds the selected limit of ${maxFileSize.value} MB.`;
    return;
  }

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
  reverseRegion.value = null;
  forwardRegion.value = null;
  
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
  if (forwardWaveSurfer) {
    forwardWaveSurfer.destroy();
    forwardWaveSurfer = null;
  }
  
  fetchExistingVideos();
};

const onVideoLoaded = () => {
  // Videos are ready
  volumeBoost.initializeAudio();
};

const initializeWaveform = () => {
  // REVERSED AUDIO WAVEFORM
  // Use absolute URL to ensure WaveSurfer can fetch correctly avoiding proxy issues
  const audioUrl = analysisData.value?.fullReversedAudioUrl ||
                   (analysisData.value?.reversedAudioUrl ? `${API_BASE}${analysisData.value.reversedAudioUrl}` : null);

  // FORWARD AUDIO WAVEFORM
  // We prefer the extracted audio (WAV) if available, otherwise fallback to video url or original audio url
  const forwardAudioUrl = analysisData.value?.fullExtractedAudioUrl ||
                          (analysisData.value?.extractedAudioUrl ? `${API_BASE}${analysisData.value.extractedAudioUrl}` : null) ||
                          (analysisData.value?.originalVideoUrl ? `${API_BASE}${analysisData.value.originalVideoUrl}` : null);

  if (!audioUrl) {
    console.warn('Cannot initialize waveform: Missing URL', { url: audioUrl });
    return;
  }

  // Ensure container is available
  if (!waveformContainer.value) {
    // If not available yet, wait for next tick or retry slightly later
    // This handles the race condition where v-if hasn't rendered the element yet
    console.debug('Waveform container not ready, retrying...');
    setTimeout(initializeWaveform, 50);
    return;
  }
  
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
  
  if (forwardWaveSurfer) {
    forwardWaveSurfer.destroy();
    forwardWaveSurfer = null;
  }

  regionsPlugin = RegionsPlugin.create();
  forwardRegionsPlugin = RegionsPlugin.create();
  
  // --- REVERSED WAVEFORM ---
  try {
    waveSurfer = WaveSurfer.create({
      container: waveformContainer.value,
      waveColor: 'rgb(255, 99, 132)', // Red-ish for reverse
      progressColor: 'rgb(200, 50, 100)',
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
    });

    waveSurfer.on('ready', () => {
      markers.value.forEach(marker => {
        addMarkerToWaveform(marker);
      });
    });
    
    waveSurfer.on('click', (relativeX) => {
      const time = relativeX * waveSurfer.getDuration();
      // Click on reverse waveform mainly targets reverse video
      if (reversedVideoEl.value) {
        reversedVideoEl.value.currentTime = time;
      }
      // If synced, update original too
      if (isSynced.value && originalVideoEl.value) {
        originalVideoEl.value.currentTime = time;
      }
      currentTime.value = time;
    });

  } catch (err) {
      console.error('WaveSurfer creation error', err);
  }

  // --- FORWARD WAVEFORM ---
  if (forwardWaveformContainer.value && forwardAudioUrl) {
      try {
        forwardWaveSurfer = WaveSurfer.create({
          container: forwardWaveformContainer.value,
          waveColor: 'rgb(75, 192, 192)', // Green-ish for forward
          progressColor: 'rgb(50, 150, 150)',
          height: 100,
          plugins: [forwardRegionsPlugin],
          responsive: true,
          normalize: true,
          minPxPerSec: 20,
          cursorColor: '#333',
          barWidth: 2,
          url: forwardAudioUrl
        });

        forwardWaveSurfer.on('error', (err) => {
          console.error('Forward WaveSurfer error:', err);
        });

        forwardWaveSurfer.on('click', (relativeX) => {
          const time = relativeX * forwardWaveSurfer.getDuration();
          // Click on forward waveform should target forward video
          if (originalVideoEl.value) {
            originalVideoEl.value.currentTime = time;
          }
          // If synced, update reverse too
          if (isSynced.value && reversedVideoEl.value) {
            reversedVideoEl.value.currentTime = time;
          }
          currentTime.value = time;
        });
        
      } catch (err) {
        console.error('Forward WaveSurfer creation error', err);
      }
  }

  // --- REGION EVENTS (REVERSED) ---
  regionsPlugin.enableDragSelection({
    color: 'rgba(255, 99, 132, 0.2)', // Red tint
  });

  const handleReverseRegionUpdate = (region) => {
        if (!region.id.toString().startsWith('marker_')) {
          reverseRegion.value = { start: region.start, end: region.end };
        }
    };

  regionsPlugin.on('region-created', (region) => {
    // Ensure only one active selection region exists per waveform
    regionsPlugin.getRegions().forEach(r => {
      if (r.id !== region.id && !r.id.toString().startsWith('marker_')) {
        r.remove();
      }
    });
    handleReverseRegionUpdate(region);
  });

  regionsPlugin.on('region-updated', handleReverseRegionUpdate);
  regionsPlugin.on('region-clicked', (region, e) => {
    e.stopPropagation();
    handleReverseRegionUpdate(region);
  });

  // --- REGION EVENTS (FORWARD) ---
  forwardRegionsPlugin.enableDragSelection({
     color: 'rgba(75, 192, 192, 0.2)', // Green tint
  });

  const handleForwardRegionUpdate = (region) => {
    forwardRegion.value = { start: region.start, end: region.end };
  };

  forwardRegionsPlugin.on('region-created', (region) => {
    forwardRegionsPlugin.getRegions().forEach(r => {
      if (r.id !== region.id) {
        r.remove();
      }
    });
    handleForwardRegionUpdate(region);
  });

  forwardRegionsPlugin.on('region-updated', handleForwardRegionUpdate);
  forwardRegionsPlugin.on('region-clicked', (region, e) => {
    e.stopPropagation();
    handleForwardRegionUpdate(region);
  });
};

const addMarkerToWaveform = (marker) => {
  // Add to reverse waveform
  if (regionsPlugin) {
      regionsPlugin.addRegion({
        start: marker.timestamp,
        end: marker.timestamp + 0.1,
        color: marker.color || '#ff6384',
        drag: false,
        resize: false,
        id: marker.id
      });
  }
  // Add to forward waveform
  if (forwardRegionsPlugin) {
    forwardRegionsPlugin.addRegion({
        start: marker.timestamp,
        end: marker.timestamp + 0.1,
        color: marker.color || '#ff6384',
        drag: false,
        resize: false,
        id: marker.id
    });
  }
};

const clearAllRegions = () => {
  clearReverseRegion();
  clearForwardRegion();
  clearLoop();
};

const clearReverseRegion = () => {
   reverseRegion.value = null;
   if (activeLoopType.value === 'reverse') clearLoop();
   
   if (regionsPlugin) {
    Object.values(regionsPlugin.regions || {}).forEach(r => {
      if (!r.id?.startsWith('marker_')) {
        r.remove();
      }
    });
  }
};

const clearForwardRegion = () => {
   forwardRegion.value = null;
   if (activeLoopType.value === 'forward') clearLoop();

   if (forwardRegionsPlugin) {
     forwardRegionsPlugin.clearRegions();
   }
};

const handlePlayForward = (isLoopingRequest = false) => {
   // Logic: Unmute Forward, Mute Reverse
   // If playing, pause. If paused, play.
   if (isOriginalPlaying.value && !originalVideoEl.value?.paused && !originalVideoEl.value?.muted && !isLoopingRequest) {
      pauseOriginal();
      if (isSynced.value) pause();
   } else {
      playForwardOnly(true); // muteOthers = true
   }
};

const handlePlayReverse = (isLoopingRequest = false) => {
   // Logic: Mute Forward, Unmute Reverse
   if (isPlaying.value && !reversedVideoEl.value?.paused && !reversedVideoEl.value?.muted && !isLoopingRequest) {
      pause();
      if (isSynced.value) pauseOriginal();
   } else {
      playReverseOnly(true); // muteOthers = true
   }
};


const toggleForwardLoop = () => {
   if (!forwardRegion.value) return;
   
   if (isLooping.value && activeLoopType.value === 'forward') {
      isLooping.value = false;
      activeLoopType.value = null;
      clearLoop();
   } else {
      setLoop(forwardRegion.value.start, forwardRegion.value.end);
      isLooping.value = true;
      activeLoopType.value = 'forward';
      handlePlayForward(true);
   }
};

const toggleReverseLoop = () => {
   if (!reverseRegion.value) return;
   
   if (isLooping.value && activeLoopType.value === 'reverse') {
      isLooping.value = false;
      activeLoopType.value = null;
      clearLoop();
   } else {
      setLoop(reverseRegion.value.start, reverseRegion.value.end);
      isLooping.value = true;
      activeLoopType.value = 'reverse';
      handlePlayReverse(true);
   }
};

// Play Once Region Handlers
const playForwardRegion = () => {
  if (!forwardRegion.value) return;
  
  // Requirement: "Strictly bounded"
  // We will loop it for now as "Bounded Playback" is often synonymous with looping the selection.
  // If the user wants to play once, they can toggle loop off.
  
  setLoop(forwardRegion.value.start, forwardRegion.value.end);
  isLooping.value = true;
  activeLoopType.value = 'forward';
  
  seekTo(forwardRegion.value.start);
  handlePlayForward(true);
};

const playReverseRegion = () => {
  if (!reverseRegion.value) return;

  setLoop(reverseRegion.value.start, reverseRegion.value.end);
  isLooping.value = true;
  activeLoopType.value = 'reverse';

  seekTo(reverseRegion.value.start);
  handlePlayReverse(true);
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
  if (!reverseRegion.value || !analysisId.value) return;
  
  isSavingSnippet.value = true;
  
  // Use forward region if available, otherwise default to reverse region (legacy behavior)
  const fStart = forwardRegion.value ? forwardRegion.value.start : reverseRegion.value.start;
  const fEnd = forwardRegion.value ? forwardRegion.value.end : reverseRegion.value.end;

  try {
    const response = await axios.post(`${API_BASE}/api/extract-video-snippet`, {
      analysisId: analysisId.value,
      start: reverseRegion.value.start,
      end: reverseRegion.value.end,
      forwardStart: fStart,
      forwardEnd: fEnd,
      playbackSpeed: playbackSpeed.value,
      name: snippetName.value,
      annotation: snippetAnnotation.value,
      includeVideo: includeVideoInSnippet.value,
      maxChunkDuration: analysisData.value.maxChunkDuration // Pass the sample size used for analysis
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
    clearAllRegions();
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
  exportingSnippets.value[snippet.id].any = true;
  
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
    exportingSnippets.value[snippet.id].any = false;
  }
};

// Export stitched video (forward video x2 with stitched audio overlay)
const exportStitchedVideo = async (snippet) => {
  if (!exportingSnippets.value[snippet.id]) {
    exportingSnippets.value[snippet.id] = {};
  }
  exportingSnippets.value[snippet.id].video = true;
  exportingSnippets.value[snippet.id].any = true;
  
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
    exportingSnippets.value[snippet.id].any = false;
  }
};

const exportCompletePackage = async (snippet) => {
  if (!exportingSnippets.value[snippet.id]) {
    exportingSnippets.value[snippet.id] = {};
  }
  exportingSnippets.value[snippet.id].package = true;
  exportingSnippets.value[snippet.id].any = true;

  try {
     const speeds = snippetSpeeds.value[snippet.id] || { forward: 1, reversed: 1 };

     const response = await axios.post(`${API_BASE}/api/stitch-snippet`, {
      snippetId: snippet.id,
      analysisId: analysisId.value,
      reversedSpeed: speeds.reversed,
      forwardSpeed: speeds.forward,
      exportType: 'complete_package'
    }, {
      responseType: 'blob'
    });

    const isVideo = snippet.type === 'video';
    const ext = isVideo ? 'mp4' : 'wav';
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${snippet.name || 'snippet'}_package.${ext}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

  } catch (err) {
     error.value = 'Failed to export package: ' + (err.response?.data?.error || err.message);
  } finally {
     exportingSnippets.value[snippet.id].package = false;
     exportingSnippets.value[snippet.id].any = false;
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

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown Date';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString();
  } catch (e) {
    return 'Error Formatting Date';
  }
};

// Lifecycle
onMounted(async () => {
  await fetchExistingVideos();
  
  // Check for load param in URL
  if (route.query.load) {
    selectedExistingId.value = route.query.load;
    loadExistingAnalysis();
  }
});

onUnmounted(() => {
  if (waveSurfer) {
    waveSurfer.destroy();
    waveSurfer = null;
  }
  if (forwardWaveSurfer) {
    forwardWaveSurfer.destroy();
    forwardWaveSurfer = null;
  }
});

// Sync waveform cursor with video time
// We need to watch both videos mostly because they might be playing unsynced
const updateWaveforms = (time) => {
    if (waveSurfer && !isNaN(time)) {
      const progress = time / (duration.value || 1); // avoid /0
      waveSurfer.seekTo(Math.min(1, Math.max(0, progress)));
    }
    if (forwardWaveSurfer && !isNaN(time)) {
        const progress = time / (duration.value || 1);
        forwardWaveSurfer.seekTo(Math.min(1, Math.max(0, progress)));
    }
};

watch(currentTime, (time) => {
   updateWaveforms(time);
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
