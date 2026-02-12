import fs from 'fs/promises';
import WavDecoder from 'wav-decoder';
import WavEncoder from 'wav-encoder';

/**
 * Detects speech segments based on RMS energy and simple thresholding.
 * Then reverses the audio locally within those segments.
 * 
 * @param {string} inputPath - Path to input WAV file
 * @param {string} outputPath - Path to output WAV file
 * @returns {Promise<Array>} - List of processed segments {start, end} in seconds
 */
export async function processAudio(inputPath, outputPath) {
  try {
    // 1. Read and Decode
    const buffer = await fs.readFile(inputPath);
    const audioData = await WavDecoder.decode(buffer);
    
    const sampleRate = audioData.sampleRate;
    const channelData = audioData.channelData; // Array of Float32Array
    const numChannels = channelData.length;
    
    console.log(`Processing audio: ${sampleRate}Hz, ${numChannels} channels, ${channelData[0].length} samples`);

    // We'll process the first channel for Voice Activity Detection (VAD)
    const signal = channelData[0];
    
    // VAD Parameters
    const frameSize = 1024;
    // Simple RMS threshold. 
    // If signal is normalized -1 to 1, 0.02 is a reasonable noise floor.
    // Adjust based on typical input levels.
    const threshold = 0.02;
    // Minimum duration for a speech segment (e.g., 250ms)
    // Audio shorter than this is likely noise or clicks/pops
    const minSpeechSamples = Math.floor(0.25 * sampleRate);
    // Merge segments closer than this (e.g., 200ms)
    const mergeDistanceSamples = Math.floor(0.2 * sampleRate);
    // Maximum duration for a single reversed segment (2 seconds)
    // Longer segments are split to ensure proper reversal alignment
    const maxSegmentSamples = Math.floor(2.0 * sampleRate);
    
    // Calculate Energy profile
    // Map 1 for speech, 0 for silence
    const isSpeech = new Uint8Array(signal.length);
    
    for (let i = 0; i < signal.length; i += frameSize) {
      let sumSquares = 0;
      let count = 0;
      
      const end = Math.min(i + frameSize, signal.length);
      for (let j = i; j < end; j++) {
        sumSquares += signal[j] * signal[j];
        count++;
      }
      
      const rms = Math.sqrt(sumSquares / count);
      
      if (rms > threshold) {
        for (let j = i; j < end; j++) {
          isSpeech[j] = 1;
        }
      }
    }

    // Identify raw segments
    let rawSegments = [];
    let inSegment = false;
    let start = 0;
    
    for (let i = 0; i < signal.length; i++) {
      if (isSpeech[i] === 1) {
        if (!inSegment) {
          inSegment = true;
          start = i;
        }
      } else {
        if (inSegment) {
          inSegment = false;
          rawSegments.push({ start, end: i });
        }
      }
    }
    if (inSegment) {
      rawSegments.push({ start, end: signal.length });
    }

    // Filter and Merge Segments
    const segments = [];
    if (rawSegments.length > 0) {
        let current = rawSegments[0];
        
        for (let i = 1; i < rawSegments.length; i++) {
            const next = rawSegments[i];
            
            // Check distance between current end and next start
            if (next.start - current.end < mergeDistanceSamples) {
                // Merge
                current.end = next.end;
            } else {
                // Validate duration
                if (current.end - current.start >= minSpeechSamples) {
                    segments.push(current);
                }
                current = next;
            }
        }
        // Check final segment
        if (current.end - current.start >= minSpeechSamples) {
            segments.push(current);
        }
    }

    // Split segments longer than maxSegmentSamples into chunks
    // This ensures no reversed segment exceeds 2 seconds
    const finalSegments = [];
    for (const seg of segments) {
        const segLength = seg.end - seg.start;
        
        if (segLength <= maxSegmentSamples) {
            // Segment is within limit, keep as-is
            finalSegments.push(seg);
        } else {
            // Split into chunks of maxSegmentSamples
            let chunkStart = seg.start;
            while (chunkStart < seg.end) {
                const chunkEnd = Math.min(chunkStart + maxSegmentSamples, seg.end);
                // Only add chunk if it meets minimum length
                if (chunkEnd - chunkStart >= minSpeechSamples) {
                    finalSegments.push({ start: chunkStart, end: chunkEnd });
                }
                chunkStart = chunkEnd;
            }
        }
    }

    console.log(`Detected ${segments.length} VAD segments, split into ${finalSegments.length} chunks (max 2s each).`);

    // Create output buffer channels (clone originals)
    const outputChannels = [];
    for (let c = 0; c < numChannels; c++) {
      outputChannels[c] = new Float32Array(channelData[c]);
    }

    // Reverse segments in place (using finalSegments which are max 2s each)
    for (const seg of finalSegments) {
      const len = seg.end - seg.start;
      
      for (let c = 0; c < numChannels; c++) {
          const originalChannel = channelData[c];
          
          // Create a reversed slice
          const reversedSlice = new Float32Array(len);
          for(let k = 0; k < len; k++) {
              reversedSlice[k] = originalChannel[seg.end - 1 - k];
          }

          // Write back into output
          outputChannels[c].set(reversedSlice, seg.start);
      }
    }

    // 4. Encode
    const encoded = await WavEncoder.encode({
      sampleRate: sampleRate,
      channelData: outputChannels
    });
    
    await fs.writeFile(outputPath, Buffer.from(encoded));
    
    // Return segments in seconds for potential frontend visualization
    return finalSegments.map(s => ({
        start: s.start / sampleRate,
        end: s.end / sampleRate
    }));

  } catch (err) {
    console.error("Error in processAudio:", err);
    throw err;
  }
}
