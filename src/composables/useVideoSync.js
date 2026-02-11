/**
 * useVideoSync Composable
 * Synchronizes playback between two video elements (original and reversed).
 * Provides shared controls for play/pause, seek, speed, and loop functionality.
 */
import { ref, watch, onUnmounted } from 'vue';

export function useVideoSync(originalVideoRef, reversedVideoRef) {
  const isPlaying = ref(false); // Master (Reversed) playing state
  const isOriginalPlaying = ref(false); // Slave (Original) playing state
  const isSynced = ref(false); // Default to false (separate playback)
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackSpeed = ref(1);
  const isLooping = ref(false);
  const loopStart = ref(null);
  const loopEnd = ref(null);
  
  let syncInterval = null;
  let isSeeking = false;
  
  // Sync time from master (reversed video) to slave (original video)
  const syncTime = () => {
    if (!reversedVideoRef.value) return;
    
    // Always update current time from master
    currentTime.value = reversedVideoRef.value.currentTime;
    
    // Only sync to slave if enabled
    if (isSynced.value && originalVideoRef.value && !isSeeking) {
      // Allow a small drift (0.1s) before forcing seek to avoid stutter
      if (Math.abs(originalVideoRef.value.currentTime - reversedVideoRef.value.currentTime) > 0.1) {
        originalVideoRef.value.currentTime = reversedVideoRef.value.currentTime;
      }
      
      // Ensure playback state matches
      if (!originalVideoRef.value.paused && reversedVideoRef.value.paused) {
        originalVideoRef.value.pause();
      } else if (originalVideoRef.value.paused && !reversedVideoRef.value.paused) {
        originalVideoRef.value.play().catch(() => {});
      }
    }
    
    // Handle looping (applies to whatever is playing)
    if (isLooping.value && loopStart.value !== null && loopEnd.value !== null) {
      if (currentTime.value >= loopEnd.value) {
        // If synced, seek both, otherwise just seek the one playing (master usually)
        if (isSynced.value) {
          seekTo(loopStart.value);
        } else {
           // If only master is playing
           reversedVideoRef.value.currentTime = loopStart.value;
           if (originalVideoRef.value && !originalVideoRef.value.paused) {
             originalVideoRef.value.currentTime = loopStart.value;
           }
        }
      }
    }
  };
  
  // Start synchronization interval
  const startSync = () => {
    if (syncInterval) return;
    syncInterval = setInterval(syncTime, 50);
  };
  
  // Stop synchronization interval
  const stopSync = () => {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  };
  
  // Play videos (Synced = both, Unsynced = Reversed only)
  const play = () => {
    if (!reversedVideoRef.value) return;
    
    const promises = [reversedVideoRef.value.play()];
    
    if (isSynced.value && originalVideoRef.value) {
      promises.push(originalVideoRef.value.play());
    } else if (originalVideoRef.value && !originalVideoRef.value.paused) {
      // If unsynced but original is already playing, let it be?
      // Or pause it to enforce "Reversed Only" for main control?
      // User asked for "separate", so main control probably targets Reversed (Master).
    }
    
    Promise.all(promises)
      .then(() => {
        isPlaying.value = true;
        startSync();
      })
      .catch(err => {
        console.error('Error playing videos:', err);
      });
  };
  
  // Pause videos
  const pause = () => {
    if (!reversedVideoRef.value) return;
    
    reversedVideoRef.value.pause();
    
    if (isSynced.value && originalVideoRef.value) {
      originalVideoRef.value.pause();
    }
    
    isPlaying.value = false;
    stopSync(); // We stop the interval, but we might want to keep it running for UI updates if playing separately?
    // Actually better to keep running if any is playing.
    if (!reversedVideoRef.value.paused || (originalVideoRef.value && !originalVideoRef.value.paused)) {
      startSync();
    }
  };

  // Separate controls
  const playOriginal = () => originalVideoRef.value?.play();
  const pauseOriginal = () => originalVideoRef.value?.pause();
  const toggleOriginal = () => {
    if (originalVideoRef.value?.paused) playOriginal();
    else pauseOriginal();
  };
  
  // Toggle play/pause
  const togglePlay = () => {
    if (isPlaying.value) {
      pause();
    } else {
      play();
    }
  };
  
  // Seek to a specific time
  const seekTo = (time) => {
    if (!reversedVideoRef.value) return;
    
    isSeeking = true;
    const clampedTime = Math.max(0, Math.min(time, duration.value));
    
    reversedVideoRef.value.currentTime = clampedTime;
    
    // Always sync seek if synced, OR if user wants to align them manually even if playback is separate?
    // Usually "separate playback" implies "I want to watch X then Y".
    // But maintaining timeline sync is useful.
    // Let's implement: If Synced, seek both. If not, seek reversed (Master).
    if (isSynced.value && originalVideoRef.value) {
      originalVideoRef.value.currentTime = clampedTime;
    }
    
    currentTime.value = clampedTime;
    
    setTimeout(() => {
      isSeeking = false;
    }, 100);
  };
  
  // Skip forward/backward by seconds
  const skip = (seconds) => {
    seekTo(currentTime.value + seconds);
  };
  
  // Set playback speed for both videos
  const setSpeed = (speed) => {
    playbackSpeed.value = speed;
    if (reversedVideoRef.value) reversedVideoRef.value.playbackRate = speed;
    if (originalVideoRef.value) originalVideoRef.value.playbackRate = speed;
  };
  
  // Set loop region
  const setLoop = (start, end) => {
    loopStart.value = start;
    loopEnd.value = end;
    isLooping.value = true;
  };
  
  // Clear loop region
  const clearLoop = () => {
    loopStart.value = null;
    loopEnd.value = null;
    isLooping.value = false;
  };
  
  // Toggle looping
  const toggleLoop = () => {
    if (loopStart.value !== null && loopEnd.value !== null) {
      isLooping.value = !isLooping.value;
    }
  };
  
  // Initialize video elements with event listeners
  const initVideoElement = (videoEl, isMaster = false) => {
    if (!videoEl) return;
    
    videoEl.playbackRate = playbackSpeed.value;
    
    if (isMaster) {
      videoEl.addEventListener('loadedmetadata', () => {
        duration.value = videoEl.duration;
      });
      
      videoEl.addEventListener('play', () => { isPlaying.value = true; });
      videoEl.addEventListener('pause', () => { isPlaying.value = false; });
      
      videoEl.addEventListener('ended', () => {
        if (!isLooping.value) {
          isPlaying.value = false;
          stopSync();
        }
      });
    } else {
      videoEl.addEventListener('play', () => { isOriginalPlaying.value = true; });
      videoEl.addEventListener('pause', () => { isOriginalPlaying.value = false; });
    }
  };
  
  // Watch for video ref changes and initialize
  watch(reversedVideoRef, (newVal) => {
    if (newVal) initVideoElement(newVal, true);
  }, { immediate: true });
  
  watch(originalVideoRef, (newVal) => {
    if (newVal) initVideoElement(newVal, false);
  }, { immediate: true });
  
  // Watch playback speed changes
  watch(playbackSpeed, (speed) => {
    setSpeed(speed);
  });
  
  // Cleanup on unmount
  onUnmounted(() => {
    stopSync();
  });
  
  return {
    isPlaying,
    isOriginalPlaying,
    isSynced,
    currentTime,
    duration,
    playbackSpeed,
    isLooping,
    loopStart,
    loopEnd,
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
    toggleLoop
  };
}
