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
    const activeLoopType = ref(null); // 'forward' or 'reverse'
    
    let syncInterval = null;
  let isSeeking = false;
  
  // Sync time from master (reversed video) to slave (original video)
  const syncTime = () => {
    
    // Determine the authoritative source of time
    // If synced, master (reversed) is authority.
    // If not synced, whichever is playing is authority (preferring master if both playing? or separate?)
    
    if (isSynced.value) {
      if (!reversedVideoRef.value) return;
      
      // Master drives time
      currentTime.value = reversedVideoRef.value.currentTime;
      
      if (originalVideoRef.value && !isSeeking) {
         // Sync slave
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
    } else {
      // Independent playback
      // If we are playing specific regions, we might be playing only one video.
      // Update currentTime based on what is active to ensure UI (timeline/waveform) updates
      if (isOriginalPlaying.value && originalVideoRef.value) {
         currentTime.value = originalVideoRef.value.currentTime;
      } else if (reversedVideoRef.value) {
         // Default to master if original not explicitly active or if master is playing
         currentTime.value = reversedVideoRef.value.currentTime;
      }
    }
    
    // Handle looping (applies to whatever is playing)
    if (isLooping.value && loopStart.value !== null && loopEnd.value !== null) {
      if (currentTime.value >= loopEnd.value) {
        if (isSynced.value) {
           seekTo(loopStart.value);
        } else {
           // Independent looping
           if (isOriginalPlaying.value && originalVideoRef.value) {
             originalVideoRef.value.currentTime = loopStart.value;
           }
           if (reversedVideoRef.value && !reversedVideoRef.value.paused) {
             reversedVideoRef.value.currentTime = loopStart.value;
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

  // Play ONLY Original Video (Forward)
  // Logic: Mute reversed, Unmute original. Play both if synced.
  const playForwardOnly = (muteOthers = true) => {
    if (!originalVideoRef.value) return;

    // Handle muting logic
    if (muteOthers) {
      if (originalVideoRef.value) originalVideoRef.value.muted = false;
      if (reversedVideoRef.value) reversedVideoRef.value.muted = true;
    }
    
    const promises = [originalVideoRef.value.play()];
    
    if (isSynced.value && reversedVideoRef.value) {
      promises.push(reversedVideoRef.value.play());
    }

    Promise.all(promises)
      .then(() => {
        isOriginalPlaying.value = true;
        if (isSynced.value) isPlaying.value = true; // Both playing
        startSync();
      })
      .catch(err => {
        console.error('Error playing forward video:', err);
      });
  };

  // Play ONLY Reversed Video
  // Logic: Mute original, Unmute reversed. Play both if synced.
  const playReverseOnly = (muteOthers = true) => {
    if (!reversedVideoRef.value) return;

    // Handle muting logic
    if (muteOthers) {
      if (reversedVideoRef.value) reversedVideoRef.value.muted = false;
      if (originalVideoRef.value) originalVideoRef.value.muted = true;
    }
    
    const promises = [reversedVideoRef.value.play()];
    
    if (isSynced.value && originalVideoRef.value) {
      promises.push(originalVideoRef.value.play());
    }

    Promise.all(promises)
      .then(() => {
        isPlaying.value = true;
        if (isSynced.value) isOriginalPlaying.value = true;
        startSync();
      })
      .catch(err => {
        console.error('Error playing reversed video:', err);
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

  // Separate controls for original video
  // When playing original separately, first sync to current timeline position
  const playOriginal = () => {
    if (!originalVideoRef.value) return;
    // Ensure original is at the same position as the timeline before playing
    originalVideoRef.value.currentTime = currentTime.value;
    originalVideoRef.value.play();
    startSync(); // Ensure time updates continue
  };
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
  // Waveform is the primary source of truth - always seek BOTH videos
  const seekTo = (time) => {
    isSeeking = true;
    const clampedTime = Math.max(0, Math.min(time, duration.value));
    
    // Always seek both videos to keep them aligned with the waveform position
    if (reversedVideoRef.value) {
      reversedVideoRef.value.currentTime = clampedTime;
    }
    if (originalVideoRef.value) {
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
  activeLoopType,
  play,
  pause,
  togglePlay,
    playOriginal,
    pauseOriginal,
    toggleOriginal,
    playForwardOnly,
    playReverseOnly,
    seekTo,
    skip,
    setSpeed,
    setLoop,
    clearLoop,
    toggleLoop
  };
}
