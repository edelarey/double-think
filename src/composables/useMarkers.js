/**
 * useMarkers Composable
 * Manages timeline markers for video analysis.
 * Provides CRUD operations and state management for markers.
 */
import { ref } from 'vue';
import axios from 'axios';

const API_BASE = 'http://localhost:3000';

export function useMarkers(analysisIdRef) {
  const markers = ref([]);
  const isLoading = ref(false);
  const error = ref(null);
  
  // Fetch markers for the current analysis
  const fetchMarkers = async () => {
    if (!analysisIdRef.value) return;
    
    isLoading.value = true;
    error.value = null;
    
    try {
      const response = await axios.get(`${API_BASE}/api/videos/${analysisIdRef.value}`);
      markers.value = response.data.markers || [];
    } catch (err) {
      error.value = 'Failed to load markers: ' + err.message;
      markers.value = [];
    } finally {
      isLoading.value = false;
    }
  };
  
  // Add a new marker at the specified timestamp
  const addMarker = async (timestamp, label = '', color = '#ff6384') => {
    if (!analysisIdRef.value) {
      error.value = 'No analysis loaded';
      return null;
    }
    
    isLoading.value = true;
    error.value = null;
    
    try {
      const response = await axios.post(`${API_BASE}/api/markers`, {
        analysisId: analysisIdRef.value,
        timestamp,
        label,
        color
      });
      
      markers.value.push(response.data);
      return response.data;
    } catch (err) {
      error.value = 'Failed to add marker: ' + err.message;
      return null;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Update an existing marker
  const updateMarker = async (markerId, updates) => {
    if (!analysisIdRef.value) {
      error.value = 'No analysis loaded';
      return null;
    }
    
    isLoading.value = true;
    error.value = null;
    
    try {
      const response = await axios.put(`${API_BASE}/api/markers/${markerId}`, {
        analysisId: analysisIdRef.value,
        ...updates
      });
      
      const index = markers.value.findIndex(m => m.id === markerId);
      if (index !== -1) {
        markers.value[index] = response.data;
      }
      
      return response.data;
    } catch (err) {
      error.value = 'Failed to update marker: ' + err.message;
      return null;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Delete a marker
  const deleteMarker = async (markerId) => {
    if (!analysisIdRef.value) {
      error.value = 'No analysis loaded';
      return false;
    }
    
    isLoading.value = true;
    error.value = null;
    
    try {
      await axios.delete(`${API_BASE}/api/markers/${markerId}`, {
        data: { analysisId: analysisIdRef.value }
      });
      
      markers.value = markers.value.filter(m => m.id !== markerId);
      return true;
    } catch (err) {
      error.value = 'Failed to delete marker: ' + err.message;
      return false;
    } finally {
      isLoading.value = false;
    }
  };
  
  // Get markers sorted by timestamp
  const getMarkersSorted = () => {
    return [...markers.value].sort((a, b) => a.timestamp - b.timestamp);
  };
  
  // Find nearest marker to a timestamp
  const findNearestMarker = (timestamp, threshold = 2) => {
    let nearest = null;
    let minDiff = threshold;
    
    for (const marker of markers.value) {
      const diff = Math.abs(marker.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = marker;
      }
    }
    
    return nearest;
  };
  
  // Clear all markers (local state only, doesn't delete from server)
  const clearLocalMarkers = () => {
    markers.value = [];
  };
  
  // Set markers from external source (e.g., loaded video analysis)
  const setMarkers = (newMarkers) => {
    markers.value = newMarkers || [];
  };
  
  return {
    markers,
    isLoading,
    error,
    fetchMarkers,
    addMarker,
    updateMarker,
    deleteMarker,
    getMarkersSorted,
    findNearestMarker,
    clearLocalMarkers,
    setMarkers
  };
}
