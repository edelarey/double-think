import { createApp } from 'vue';
import App from './App.vue';
import { Chart, registerables } from 'chart.js';
import { Chart as VueChart } from 'vue-chartjs';
import * as p5 from 'p5';
import { createRouter, createWebHistory } from 'vue-router';
import VideoAnalyzer from './components/VideoAnalyzer.vue';
import VideoBrowser from './components/VideoBrowser.vue';
import VideoSnippetLibrary from './components/VideoSnippetLibrary.vue';
import AudioAnalyzer from './components/AudioAnalyzer.vue';
import RealTimeAnalyzer from './components/RealTimeAnalyzer.vue';
import SnippetLibrary from './components/SnippetLibrary.vue';
import OutputBrowser from './components/OutputBrowser.vue';

Chart.register(...registerables);

const routes = [
  { path: '/', redirect: '/video' },
  { path: '/video', component: VideoAnalyzer },
  { path: '/videos', component: VideoBrowser },
  { path: '/video-snippets', component: VideoSnippetLibrary },
  { path: '/file', component: AudioAnalyzer },
  { path: '/realtime', component: RealTimeAnalyzer },
  { path: '/snippets', component: SnippetLibrary },
  { path: '/outputs', component: OutputBrowser },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const app = createApp(App);
app.component('VChart', VueChart);
app.config.globalProperties.$p5 = p5;
app.use(router);
app.mount('#app');