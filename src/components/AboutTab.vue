<template>
  <div class="row justify-content-center">
    <div class="col-lg-10">
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h2 class="card-title text-center text-primary mb-4">About Double Think</h2>

          <div class="alert alert-info">
            <h5 class="alert-heading"><i class="bi bi-info-circle-fill me-2"></i>What is Reverse Speech?</h5>
            <p class="mb-0">
              Reverse Speech is a theory proposed by David John Oates, suggesting that human speech contains hidden backward messages that can communicate unconscious thoughts, truths, or intentions. Double Think is a tool designed to help you analyze audio and video recordings to discover these potential reversals.
            </p>
          </div>

          <h3 class="border-bottom pb-2 mb-3">Core Features</h3>

          <div class="row g-4 mb-4">
            <div class="col-md-6">
              <div class="card h-100 border-primary">
                <div class="card-header bg-primary text-white">
                  <h5 class="mb-0">🎬 Video Analysis</h5>
                </div>
                <div class="card-body">
                  <p class="card-text">Upload video files to analyze both visual cues and reversed audio simultaneously.</p>
                  <ul class="list-group list-group-flush">
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Dual video playback (Original & Reversed)</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Adjustable Reversal Chunk Size (0.1s - 5.0s)</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Synchronized scrubbing</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Waveform visualization</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Save interesting snippets (Video/Audio)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div class="col-md-6">
              <div class="card h-100 border-success">
                <div class="card-header bg-success text-white">
                  <h5 class="mb-0">🔊 Audio Analysis</h5>
                </div>
                <div class="card-body">
                  <p class="card-text">Focus purely on the audio content with advanced filtering and speed controls.</p>
                  <ul class="list-group list-group-flush">
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Process MP3/WAV files</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Variable playback speed (0.25x - 2.0x)</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Real-time audio reversal</li>
                    <li class="list-group-item"><i class="bi bi-check-circle text-success me-2"></i>Frequency analysis</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <h3 class="border-bottom pb-2 mb-3">How to Use</h3>
          
          <div class="accordion" id="helpAccordion">
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingOne">
                <button
                  class="accordion-button"
                  :class="{ collapsed: activeAccordion !== 'collapseOne' }"
                  type="button"
                  @click="toggleAccordion('collapseOne')"
                  aria-expanded="true"
                  aria-controls="collapseOne"
                >
                  Getting Started with Video Analysis
                </button>
              </h2>
              <div
                id="collapseOne"
                class="accordion-collapse collapse"
                :class="{ show: activeAccordion === 'collapseOne' }"
                aria-labelledby="headingOne"
                data-bs-parent="#helpAccordion"
              >
                <div class="accordion-body">
                  <ol>
                    <li>Go to the <strong>Video Analysis</strong> tab.</li>
                    <li>Click <strong>Upload Video</strong> and select an MP4 file.</li>
                    <li>Adjust the <strong>Reversal Chunk Size</strong> slider if needed (0.1s - 5.0s).</li>
                    <li>Wait for the server to process the video (extract and reverse audio).</li>
                    <li>Use the playback controls to listen to the reversed audio while watching the video.</li>
                    <li>If you hear something interesting, drag on the waveform to select a region.</li>
                    <li>Click <strong>Loop Selection</strong> to listen repeatedly.</li>
                    <li>Click <strong>Save Snippet</strong> to store the finding for later review.</li>
                  </ol>
                </div>
              </div>
            </div>
            <div class="accordion-item">
              <h2 class="accordion-header" id="headingTwo">
                <button
                  class="accordion-button"
                  :class="{ collapsed: activeAccordion !== 'collapseTwo' }"
                  type="button"
                  @click="toggleAccordion('collapseTwo')"
                  aria-expanded="false"
                  aria-controls="collapseTwo"
                >
                  Using the Snippet Library
                </button>
              </h2>
              <div
                id="collapseTwo"
                class="accordion-collapse collapse"
                :class="{ show: activeAccordion === 'collapseTwo' }"
                aria-labelledby="headingTwo"
                data-bs-parent="#helpAccordion"
              >
                <div class="accordion-body">
                  <p>Check the <strong>Video Snippets</strong> or <strong>Audio Snippets</strong> tabs to review your saved findings.</p>
                  <ul>
                    <li>Play back the specific segment without searching the whole file.</li>
                    <li>See metadata like the used Chunk Size.</li>
                    <li>Download the snippet as a standalone file.</li>
                    <li>Add notes and annotations to your findings.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-5 text-center text-muted">
            <p><small>Double Think v1.1.0 &copy; 2026</small></p>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const activeAccordion = ref('collapseOne');

const toggleAccordion = (id) => {
  if (activeAccordion.value === id) {
    activeAccordion.value = null;
  } else {
    activeAccordion.value = id;
  }
};
</script>

<style scoped>
.card-header h5 {
  font-weight: 600;
}
.list-group-item {
  border: none;
  padding-left: 0;
}
.alert-heading {
  display: flex;
  align-items: center;
}
</style>
