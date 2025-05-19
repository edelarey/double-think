import { createApp } from 'vue';
import App from './App.vue';
import { Chart, registerables } from 'chart.js';
import { Chart as VueChart } from 'vue-chartjs';
import * as p5 from 'p5';
import { createRouter, createWebHistory } from 'vue-router';
import AudioAnalyzer from './components/AudioAnalyzer.vue';
import RealTimeAnalyzer from './components/RealTimeAnalyzer.vue';
import SnippetLibrary from './components/SnippetLibrary.vue';

Chart.register(...registerables);

const routes = [
  { path: '/', redirect: '/file' },
  { path: '/file', component: AudioAnalyzer },
  { path: '/realtime', component: RealTimeAnalyzer },
  { path: '/snippets', component: SnippetLibrary },
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