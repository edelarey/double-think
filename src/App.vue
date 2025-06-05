<template>
  <div class="container my-4">
    <h1 class="text-center mb-4">Double Think - Reverse Speech Analysis</h1>
    <ul class="nav nav-tabs">
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'file' }" @click="activeTab = 'file'; $router.push('/file')">File Analysis</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'realtime' }" @click="activeTab = 'realtime'; $router.push('/realtime')">Real-Time Analysis</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'snippets' }" @click="activeTab = 'snippets'; $router.push('/snippets')">Snippet Library</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'outputs' }" @click="activeTab = 'outputs'; $router.push('/outputs')">Output Browser</button>
      </li>
    </ul>
    <div class="tab-content mt-3">
      <router-view></router-view>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const activeTab = ref('file');

watch(() => router.currentRoute.value.path, (newPath) => {
  if (newPath === '/file') activeTab.value = 'file';
  else if (newPath === '/realtime') activeTab.value = 'realtime';
  else if (newPath === '/snippets') activeTab.value = 'snippets';
  else if (newPath === '/outputs') activeTab.value = 'outputs';
});
</script>