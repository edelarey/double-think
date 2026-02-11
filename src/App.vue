<template>
  <div class="container my-4">
    <h1 class="text-center mb-4">Double Think - Reverse Speech Analysis</h1>
    <ul class="nav nav-tabs">
      <!-- Video Analysis (Primary) -->
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'video' }" @click="activeTab = 'video'; $router.push('/video')">
          🎬 Video Analysis
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'videos' }" @click="activeTab = 'videos'; $router.push('/videos')">
          📁 Video Browser
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'video-snippets' }" @click="activeTab = 'video-snippets'; $router.push('/video-snippets')">
          🎵 Video Snippets
        </button>
      </li>
      <!-- Audio Analysis (Legacy) -->
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'file' }" @click="activeTab = 'file'; $router.push('/file')">
          🔊 Audio Analysis
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'realtime' }" @click="activeTab = 'realtime'; $router.push('/realtime')">
          🎤 Real-Time
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'snippets' }" @click="activeTab = 'snippets'; $router.push('/snippets')">
          📋 Audio Snippets
        </button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'outputs' }" @click="activeTab = 'outputs'; $router.push('/outputs')">
          📂 Audio Outputs
        </button>
      </li>
    </ul>
    <div class="tab-content mt-3">
      <router-view></router-view>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const activeTab = ref('video');

// Set active tab based on current route
const updateActiveTab = (path) => {
  if (path === '/video' || path.startsWith('/video?')) activeTab.value = 'video';
  else if (path === '/videos') activeTab.value = 'videos';
  else if (path === '/video-snippets') activeTab.value = 'video-snippets';
  else if (path === '/file') activeTab.value = 'file';
  else if (path === '/realtime') activeTab.value = 'realtime';
  else if (path === '/snippets') activeTab.value = 'snippets';
  else if (path === '/outputs') activeTab.value = 'outputs';
};

watch(() => router.currentRoute.value.path, updateActiveTab);

onMounted(() => {
  updateActiveTab(router.currentRoute.value.path);
});
</script>

<style>
.nav-tabs .nav-link {
  font-size: 0.9rem;
}

.nav-tabs .nav-link.active {
  font-weight: 600;
}
</style>