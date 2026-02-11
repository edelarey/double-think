/**
 * useVolumeBoost Composable
 * Uses Web Audio API to boost video/audio volume beyond 100%.
 * Supports volume levels from 0% to 200%.
 */
import { ref, watch, onUnmounted } from 'vue';

export function useVolumeBoost(mediaElementRef) {
  const volume = ref(100); // 0-200 percentage
  const isBoosted = ref(false);
  
  let audioContext = null;
  let gainNode = null;
  let sourceNode = null;
  let isConnected = false;
  
  // Initialize Web Audio context and connect to media element
  const initializeAudio = () => {
    if (!mediaElementRef.value || isConnected) return;
    
    try {
      // Create audio context if needed
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume context if suspended (browsers require user interaction)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Create nodes
      sourceNode = audioContext.createMediaElementSource(mediaElementRef.value);
      gainNode = audioContext.createGain();
      
      // Connect: source -> gain -> destination
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set initial gain
      updateGain();
      
      isConnected = true;
      isBoosted.value = true;
    } catch (err) {
      console.error('Failed to initialize volume boost:', err);
    }
  };
  
  // Update gain value based on current volume
  const updateGain = () => {
    if (gainNode) {
      // Convert percentage (0-200) to gain value (0-2)
      gainNode.gain.value = volume.value / 100;
    } else if (mediaElementRef.value && volume.value <= 100) {
      // Fallback to native volume if not boosted
      mediaElementRef.value.volume = volume.value / 100;
    }
  };
  
  // Set volume (0-200)
  const setVolume = (newVolume) => {
    volume.value = Math.max(0, Math.min(200, newVolume));
    
    // Initialize boost if trying to go above 100%
    if (volume.value > 100 && !isConnected) {
      initializeAudio();
    }
    
    updateGain();
  };
  
  // Increase volume by amount
  const increaseVolume = (amount = 10) => {
    setVolume(volume.value + amount);
  };
  
  // Decrease volume by amount
  const decreaseVolume = (amount = 10) => {
    setVolume(volume.value - amount);
  };
  
  // Mute/unmute
  const mute = () => {
    if (mediaElementRef.value) {
      mediaElementRef.value.muted = true;
    }
  };
  
  const unmute = () => {
    if (mediaElementRef.value) {
      mediaElementRef.value.muted = false;
    }
  };
  
  const toggleMute = () => {
    if (mediaElementRef.value) {
      mediaElementRef.value.muted = !mediaElementRef.value.muted;
    }
  };
  
  // Check if muted
  const isMuted = () => {
    return mediaElementRef.value?.muted || false;
  };
  
  // Cleanup
  const cleanup = () => {
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch (e) {
        // May already be disconnected
      }
    }
    if (gainNode) {
      try {
        gainNode.disconnect();
      } catch (e) {
        // May already be disconnected
      }
    }
    sourceNode = null;
    gainNode = null;
    isConnected = false;
    isBoosted.value = false;
  };
  
  // Watch for media element changes
  watch(mediaElementRef, (newVal, oldVal) => {
    if (oldVal && isConnected) {
      cleanup();
    }
    // Don't auto-initialize, let user request boost when needed
  });
  
  // Watch volume changes
  watch(volume, updateGain);
  
  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  });
  
  return {
    volume,
    isBoosted,
    setVolume,
    increaseVolume,
    decreaseVolume,
    mute,
    unmute,
    toggleMute,
    isMuted,
    initializeAudio,
    cleanup
  };
}
