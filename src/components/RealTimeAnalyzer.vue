<template>
  <div class="card">
    <div class="card-body">
      <h3 class="card-title">Real-Time Analysis</h3>
      <button class="btn" :class="isRecording ? 'btn-danger' : 'btn-success'" @click="toggleRecording">
        {{ isRecording ? 'Stop Recording' : 'Start Recording' }}
      </button>
      <div v-if="error" class="alert alert-danger mt-3">{{ error }}</div>
      <div v-if="features" class="mt-3">
        <div class="row">
          <div class="col-md-6 mb-3">
            <h5>Real-Time Waveform</h5>
            <div ref="waveform" class="border"></div>
          </div>
          <div class="col-md-6 mb-3">
            <h5>Real-Time MFCC Spectrogram</h5>
            <div ref="mfccSpectrogram" class="border"></div>
          </div>
        </div>
        <h5>Real-Time MFCC Features</h5>
        <VChart type="bar" :data="realTimeChartData" :options="chartOptions" class="chart" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import Meyda from 'meyda';
import WaveSurfer from 'wavesurfer.js';
import p5 from 'p5';

const isRecording = ref(false);
const features = ref(null);
const error = ref(null);
const waveform = ref(null);
const mfccSpectrogram = ref(null);
let audioContext = null;
let meydaAnalyzer = null;
let stream = null;
let waveSurfer = null;
let p5Instance = null;

const toggleRecording = async () => {
  if (isRecording.value) {
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    waveSurfer.stop();
    isRecording.value = false;
    features.value = null;
    meydaAnalyzer = null;
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    waveSurfer = WaveSurfer.create({
      container: waveform.value,
      waveColor: '#4CAF50',
      progressColor: '#28A745',
      height: 100,
      media: source.mediaStream,
    });
    waveSurfer.play();

    meydaAnalyzer = Meyda.createMeydaAnalyzer({
      audioContext,
      source,
      bufferSize: 512,
      featureExtractors: ['mfcc'],
      callback: (extractedFeatures) => {
        features.value = extractedFeatures.mfcc;
      },
    });

    meydaAnalyzer.start();
    isRecording.value = true;
  } catch (err) {
    error.value = 'Failed to access microphone: ' + err.message;
    isRecording.value = false;
  }
};

onMounted(() => {
  if (mfccSpectrogram.value) {
    p5Instance = new p5((sketch) => {
      sketch.setup = () => {
        sketch.createCanvas(400, 200).parent(mfccSpectrogram.value);
        sketch.background(255);
      };
      sketch.draw = () => {
        if (!features.value) return;
        sketch.background(255);
        for (let i = 0; i < features.value.length; i++) {
          sketch.fill(features.value[i] * 10);
          sketch.noStroke();
          sketch.rect(i * 20, 0, 20, 200);
        }
      };
    });
  }
});

onUnmounted(() => {
  if (isRecording.value) {
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    waveSurfer.destroy();
  }
  if (p5Instance) p5Instance.remove();
});

const realTimeChartData = computed(() => {
  if (!features.value) return {};
  return {
    labels: Array.from({ length: features.value.length }, (_, i) => `MFCC ${i + 1}`),
    datasets: [
      {
        label: 'Real-Time MFCC',
        data: features.value,
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { title: { display: true, text: 'MFCC Value' } },
    x: { title: { display: true, text: 'Coefficient' } },
  },
};
</script>

<style scoped>
.chart {
  max-height: 300px;
}
.border {
  min-height: 100px;
}
</style>