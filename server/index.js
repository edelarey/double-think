import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import Meyda from 'meyda';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processAudio } from './processAudio.js';
import WavDecoder from 'wav-decoder';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    }
  })
});
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Serve static files from the 'outputs' directory
const outputDir = path.join(__dirname, '../outputs');
app.use('/outputs', express.static(outputDir));

const snippetsDir = path.join(outputDir, 'snippets');
const reversedDir = path.join(outputDir, 'reversed');
const videosDir = path.join(outputDir, 'videos');
const audioExtractDir = path.join(outputDir, 'audio');
const uploadsDir = path.join(__dirname, '../uploads');

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(snippetsDir, { recursive: true });
await fs.mkdir(reversedDir, { recursive: true });
await fs.mkdir(videosDir, { recursive: true });
await fs.mkdir(audioExtractDir, { recursive: true });
await fs.mkdir(uploadsDir, { recursive: true });

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname) || '.wav';
    const outputFileName = `reversed_${Date.now()}${ext}`;
    const outputPath = path.join(reversedDir, outputFileName);
    const analysisId = Date.now();

    // Make sure ffmpeg converts to a web-compatible format with explicit format
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilter('areverse')
        .audioChannels(1) // Ensure mono audio for consistent processing
        .audioFrequency(44100) // Standard web audio frequency
        .format('wav') // Explicitly set format to WAV
        .audioCodec('pcm_s16le') // Use standard PCM format for maximum compatibility
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });

    // Verify the output file exists and has content
    try {
      const outputStat = await fs.stat(outputPath);
      console.log(`Output file created: ${outputPath}, size: ${outputStat.size} bytes`);
      if (outputStat.size === 0) {
        throw new Error('Output file is empty');
      }
    } catch (err) {
      console.error('Error verifying output file:', err);
      throw err;
    }

    const audioData = await fs.readFile(outputPath);
    const decoded = await WavDecoder.decode(audioData);
    const signal = decoded.channelData[0];
    const sampleRate = decoded.sampleRate;

    console.log(`Decoded audio: ${signal.length} samples, ${sampleRate}Hz`);

    const bufferSize = 512;
    const hopSize = 256;
    const mfccFeatures = [];
    const energyValues = [];
    const chromaValues = [];
    const spectrogramData = [];

    // Process audio data
    for (let i = 0; i < signal.length; i += hopSize) {
      const frame = signal.slice(i, i + bufferSize);
      if (frame.length === bufferSize) {
        try {
          const features = Meyda.extract(['mfcc', 'energy', 'chroma', 'amplitudeSpectrum'], frame, {
            sampleRate,
            bufferSize,
          });
          
          if (features && features.amplitudeSpectrum) {
            mfccFeatures.push(features.mfcc);
            energyValues.push(features.energy);
            chromaValues.push(features.chroma);
            
            // Normalize amplitude spectrum for better visualization
            const normalizedSpectrum = Array.from(
              features.amplitudeSpectrum.slice(0, 128)
            ).map(val => Math.min(1, val / 10));
            
            spectrogramData.push(normalizedSpectrum);
          }
        } catch (err) {
          console.error('Error extracting features for frame:', err);
        }
      }
    }

    console.log('Spectrogram Data Length:', spectrogramData.length);
    console.log('Spectrogram Data Sample:', spectrogramData.slice(0, 2));

    const formantValues = chromaValues[0]?.slice(0, 5) || [];
    const formantShifts = [];
    for (let i = 1; i < chromaValues.length; i++) {
      formantShifts.push(Math.abs(chromaValues[i][0] - chromaValues[i - 1][0]));
    }

    // Normalize energyValues and formantShifts
    const maxEnergy = Math.max(...energyValues);
    const maxFormantShift = Math.max(...formantShifts);
    const normalizedEnergyValues = energyValues.map(v => v / (maxEnergy || 1));
    const normalizedFormantShifts = formantShifts.map(v => v / (maxFormantShift || 1));

    // Define detectSegments function but don't call it automatically
    const detectSegments = (energyThreshold = 0.1, formantShiftThreshold = 0.1) => {
      const detectedSegments = [];
      const frameDuration = hopSize / sampleRate;
      for (let i = 0; i < normalizedEnergyValues.length; i++) {
        if (
          normalizedEnergyValues[i] > energyThreshold &&
          (i < normalizedFormantShifts.length && normalizedFormantShifts[i] > formantShiftThreshold)
        ) {
          const startTime = i * frameDuration;
          const endTime = startTime + frameDuration;
          detectedSegments.push({
            start: startTime,
            end: endTime,
            annotation: '',
          });
        }
      }
      console.log('Normalized Energy Values Sample:', normalizedEnergyValues.slice(0, 10));
      console.log('Normalized Formant Shifts Sample:', normalizedFormantShifts.slice(0, 10));
      console.log('Detected Segments:', detectedSegments);
      return detectedSegments;
    };

    // Don't auto-detect segments - start with empty array
    const detectedSegments = [];

    const analysisPath = path.join(reversedDir, `analysis_${analysisId}.json`);
    const analysisData = {
      mfcc: mfccFeatures,
      pitch: [],
      formants: formantValues,
      spectrogram: spectrogramData,
      detectedSegments,
      snippets: [],
      originalAudioPath: inputPath,
      reversedAudioUrl: `/outputs/reversed/${outputFileName}`,
      duration: signal.length / sampleRate,
      normalizedEnergyValues,  // Store for redetection
      normalizedFormantShifts, // Store for redetection
      hopSize,
      sampleRate
    };
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));

    // Return complete response including full paths
    // Expose original audio file URL for frontend playback
    const originalFileName = path.basename(inputPath);
    res.json({
      reversedAudioUrl: `/outputs/reversed/${outputFileName}`,
      originalAudioUrl: `/uploads/${originalFileName}`,
      analysisFile: `/outputs/reversed/${path.basename(analysisPath)}`,
      analysisId,
      mfccSummary: mfccFeatures.slice(0, 5),
      pitchSummary: [],
      formantSummary: formantValues,
      spectrogramData: spectrogramData.slice(0, 300),
      detectedSegments,
      duration: signal.length / sampleRate,
      sampleRate: sampleRate,
      fullReversedAudioUrl: `http://localhost:${port}/outputs/reversed/${outputFileName}`,
      fullOriginalAudioUrl: `http://localhost:${port}/uploads/${originalFileName}`,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
});

// Update the redetect endpoint to use stored values
app.post('/api/redetect', async (req, res) => {
  try {
    const { analysisId, energyThreshold, formantShiftThreshold } = req.body;
    const analysisPath = path.join(outputDir, `analysis_${analysisId}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath));
    
    // Use stored normalized values instead of reprocessing the audio
    const { normalizedEnergyValues, normalizedFormantShifts, hopSize, sampleRate } = analysisData;
    
    if (!normalizedEnergyValues || !normalizedFormantShifts) {
      throw new Error('Missing energy or formant data in analysis file');
    }

    const detectedSegments = [];
    const frameDuration = hopSize / sampleRate;
    
    for (let i = 0; i < normalizedEnergyValues.length; i++) {
      if (
        normalizedEnergyValues[i] > energyThreshold &&
        (i < normalizedFormantShifts.length && normalizedFormantShifts[i] > formantShiftThreshold)
      ) {
        const startTime = i * frameDuration;
        const endTime = startTime + frameDuration;
        detectedSegments.push({
          start: startTime,
          end: endTime,
          annotation: '',
        });
      }
    }
    
    // Merge adjacent segments
    const mergedSegments = [];
    let currentSegment = null;
    
    for (const segment of detectedSegments) {
      if (!currentSegment) {
        currentSegment = { ...segment };
      } else if (segment.start - currentSegment.end < frameDuration * 2) {
        // If segments are close, merge them
        currentSegment.end = segment.end;
      } else {
        // If segments are not close, add current segment and start a new one
        mergedSegments.push(currentSegment);
        currentSegment = { ...segment };
      }
    }
    
    // Add the last segment if it exists
    if (currentSegment) {
      mergedSegments.push(currentSegment);
    }
    
    analysisData.detectedSegments = mergedSegments;
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));

    res.json({ 
      detectedSegments: mergedSegments,
      fullReversedAudioUrl: `http://localhost:${port}${analysisData.reversedAudioUrl}`
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to re-detect segments: ' + error.message });
  }
});

app.post('/api/extract-segment', upload.none(), async (req, res) => {
  try {
    const { audioUrl, start, end, analysisId, playbackSpeed } = req.body;
    const audioPath = path.join(reversedDir, path.basename(audioUrl));
    const analysisPath = path.join(reversedDir, `analysis_${analysisId}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath));
    const originalAudioPath = analysisData.originalAudioPath;

    // Ensure the audio paths exist
    try {
      await fs.access(audioPath);
      await fs.access(originalAudioPath);
    } catch (err) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const ext = path.extname(audioUrl) || '.wav';
    const snippetFileName = `snippet_${Date.now()}${ext}`;
    const snippetPath = path.join(snippetsDir, snippetFileName);
    const forwardSnippetFileName = `forward_snippet_${Date.now()}${ext}`;
    const forwardSnippetPath = path.join(snippetsDir, forwardSnippetFileName);

    await new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(start)
        .setDuration(end - start)
        .output(snippetPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    await new Promise((resolve, reject) => {
      ffmpeg(originalAudioPath)
        .setStartTime(start)
        .setDuration(end - start)
        .output(forwardSnippetPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Create the snippet object with proper URLs
    const snippet = {
      file: snippetFileName,
      forwardFile: forwardSnippetFileName,
      url: `/outputs/snippets/${snippetFileName}`,
      forwardUrl: `/outputs/snippets/${forwardSnippetFileName}`,
      start: parseFloat(start),
      end: parseFloat(end),
      annotation: '',
      playbackSpeed: parseFloat(playbackSpeed) || 1,
    };

    analysisData.snippets = analysisData.snippets || [];
    analysisData.snippets.push({
      file: snippetFileName,
      forwardFile: forwardSnippetFileName,
      start: parseFloat(start),
      end: parseFloat(end),
      annotation: '',
      playbackSpeed: parseFloat(playbackSpeed) || 1,
    });
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));

    // Don't delete original audio until analysis is complete
    // try {
    //   await fs.unlink(originalAudioPath);
    // } catch (err) {
    //   console.warn(`Failed to delete original audio: ${originalAudioPath}`);
    // }

    // Save annotation as JSON file if present
    if (req.body.annotation) {
      const annotationPath = path.join(snippetsDir, `${path.parse(snippetFileName).name}.json`);
      await fs.writeFile(annotationPath, JSON.stringify({ annotation: req.body.annotation }, null, 2));
    }

    res.json(snippet);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to extract segment' });
  }
});

app.post('/api/save-annotation', async (req, res) => {
  try {
    const { analysisId, segmentIndex, annotation, isSnippet } = req.body;
    const analysisPath = path.join(reversedDir, `analysis_${analysisId}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath));

    if (isSnippet) {
      analysisData.snippets[segmentIndex].annotation = annotation;
    } else {
      analysisData.detectedSegments[segmentIndex].annotation = annotation;
    }

    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to save annotation' });
  }
});

app.get('/api/snippets', async (req, res) => {
  try {
    const files = await fs.readdir(reversedDir);
    const analysisFiles = files.filter(file => file.startsWith('analysis_') && file.endsWith('.json'));
    const snippets = [];

    for (const analysisFile of analysisFiles) {
      const analysisPath = path.join(reversedDir, analysisFile);
      let analysisData;
      try {
        analysisData = JSON.parse(await fs.readFile(analysisPath));
      } catch (err) {
        console.warn(`Failed to read or parse ${analysisPath}`);
        continue;
      }
      if (Array.isArray(analysisData.snippets)) {
        for (const snippet of analysisData.snippets) {
          // Check if snippet files exist
          const snippetPath = path.join(snippetsDir, snippet.file);
          const forwardSnippetPath = path.join(snippetsDir, snippet.forwardFile);
          try {
            await fs.access(snippetPath);
            await fs.access(forwardSnippetPath);
            snippets.push({
              url: `/outputs/snippets/${snippet.file}`,
              forwardUrl: `/outputs/snippets/${snippet.forwardFile}`,
              file: snippet.file,
              forwardFile: snippet.forwardFile,
              start: snippet.start,
              end: snippet.end,
              annotation: snippet.annotation || '',
              playbackSpeed: snippet.playbackSpeed || 1,
              analysisId: analysisFile.match(/analysis_(\d+)\.json/)[1],
            });
          } catch (err) {
            console.warn(`Snippet ${snippet.file} or forward snippet ${snippet.forwardFile} not found`);
          }
        }
      }
    }

    res.json(snippets);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to list snippets' });
  }
});

/**
 * Delete a snippet by analysisId, file, forwardFile, start, and end.
 */
app.delete('/api/snippets', async (req, res) => {
  try {
    const { analysisId, file, forwardFile, start, end } = req.body;
    if (!analysisId || !file || !forwardFile || typeof start === 'undefined' || typeof end === 'undefined') {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const analysisPath = path.join(reversedDir, `analysis_${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch (err) {
      return res.status(404).json({ error: 'Analysis file not found' });
    }
    if (!Array.isArray(analysisData.snippets)) {
      return res.status(404).json({ error: 'No snippets found in analysis file' });
    }
    // Find the snippet index
    const snippetIndex = analysisData.snippets.findIndex(
      s =>
        s.file === file &&
        s.forwardFile === forwardFile &&
        parseFloat(s.start) === parseFloat(start) &&
        parseFloat(s.end) === parseFloat(end)
    );
    if (snippetIndex === -1) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    // Remove from array
    const [removed] = analysisData.snippets.splice(snippetIndex, 1);
    // Save updated analysis file
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    // Delete snippet files
    const snippetPath = path.join(snippetsDir, file);
    const forwardSnippetPath = path.join(snippetsDir, forwardFile);
    try {
      await fs.unlink(snippetPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink(forwardSnippetPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting snippet:', error);
    res.status(500).json({ error: 'Failed to delete snippet' });
  }
});

// Endpoint to list files in the reversed directory
app.get('/api/outputs/reversed', async (req, res) => {
  try {
    const files = await fs.readdir(reversedDir);
    const audioFiles = files
      .filter(file => /\.(wav|mp3|ogg|aac|flac|m4a)$/i.test(file)) // Filter for common audio extensions
      .map(file => ({
        file: file,
        url: `/outputs/reversed/${file}`, // URL for the client to access the file
        fullUrl: `http://localhost:${port}/outputs/reversed/${file}` // Full URL for WaveSurfer
      }));
    res.json(audioFiles);
  } catch (error) {
    console.error('Error listing reversed outputs:', error);
    res.status(500).json({ error: 'Failed to list reversed outputs', details: error.message });
  }
});

// Endpoint to delete a file from the reversed directory
app.delete('/api/outputs/reversed', async (req, res) => {
  try {
    const { file } = req.body;
    if (!file) {
      return res.status(400).json({ error: 'Missing file name' });
    }
    const filePath = path.join(reversedDir, file);

    // Try to find and delete the associated original file
    let originalFileDeleted = false;
    let originalFileName = '';
    try {
      // Match reversed_<id>.<ext>
      const match = file.match(/^reversed_(\d+)\./);
      if (match) {
        const analysisId = match[1];
        const analysisPath = path.join(reversedDir, `analysis_${analysisId}.json`);
        const analysisData = JSON.parse(await fs.readFile(analysisPath));
        if (analysisData.originalAudioPath) {
          originalFileName = analysisData.originalAudioPath.split('/').pop();
          const uploadsDir = path.join(__dirname, '../uploads');
          const originalFilePath = path.join(uploadsDir, originalFileName);
          try {
            await fs.unlink(originalFilePath);
            originalFileDeleted = true;
          } catch (err) {
            // File may not exist, ignore error
          }
        }
      }
    } catch (err) {
      // Ignore errors in finding/deleting original file
    }

    try {
      await fs.access(filePath); // Check if file exists
    } catch (err) {
      return res.status(404).json({ error: 'File not found', details: `File ${file} does not exist in ${reversedDir}` });
    }
    await fs.unlink(filePath);
    res.json({
      success: true,
      message: `File ${file} deleted successfully.`,
      originalFileDeleted,
      originalFileName
    });
  } catch (error) {
    console.error('Error deleting reversed output:', error);
    res.status(500).json({ error: 'Failed to delete reversed output', details: error.message });
  }
});

app.get('/api/check-audio/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(outputDir, filename);
    
    try {
      await fs.access(filePath);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      const fileInfo = {
        exists: true,
        size: stats.size,
        path: filePath,
        created: stats.birthtime
      };
      
      res.json(fileInfo);
    } catch (err) {
      res.json({ exists: false, error: err.message });
    }
  } catch (error) {
    console.error('Error checking audio:', error);
    res.status(500).json({ error: 'Failed to check audio file' });
  }
});

app.use('/outputs', express.static(outputDir));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ========== VIDEO PROCESSING ENDPOINTS ==========

/**
 * Process a video file:
 * 1. Extract audio from video
 * 2. Reverse the audio
 * 3. Mux reversed audio with original video
 * 4. Return URLs for both original and processed videos
 */
app.post('/api/process-video', upload.single('video'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const timestamp = Date.now();
    const analysisId = `video_${timestamp}`;
    const videoName = req.body.name || null; // Optional video name
    // Extract reversal chunk size from request (default 2.0s)
    const maxChunkDuration = parseFloat(req.body.maxChunkDuration) || 2.0;
    
    // Define output paths
    const originalVideoFileName = `original_${timestamp}${ext}`;
    const reversedVideoFileName = `reversed_${timestamp}${ext}`;
    const extractedAudioFileName = `extracted_${timestamp}.wav`;
    const reversedAudioFileName = `reversed_audio_${timestamp}.wav`;
    
    const originalVideoPath = path.join(videosDir, originalVideoFileName);
    const reversedVideoPath = path.join(videosDir, reversedVideoFileName);
    const extractedAudioPath = path.join(audioExtractDir, extractedAudioFileName);
    const reversedAudioPath = path.join(audioExtractDir, reversedAudioFileName);
    
    // Copy original video to videos directory
    await fs.copyFile(inputPath, originalVideoPath);
    
    // Step 1: Extract audio from video
    console.log('Step 1: Extracting audio from video...');
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(1)
        .format('wav')
        .output(extractedAudioPath)
        .on('end', resolve)
        .on('error', (err) => {
          console.error('FFmpeg extract error:', err);
          reject(err);
        })
        .run();
    });
    
    // Verify extracted audio exists
    const extractedStat = await fs.stat(extractedAudioPath);
    console.log(`Extracted audio: ${extractedAudioPath}, size: ${extractedStat.size} bytes`);
    
    // Step 2: Reverse the audio using segment-based processing
    console.log('Step 2: Reversing audio segments...');
    
    // Use our custom processor instead of simple ffmpeg reversal
    // This maintains the timeline but reverses local speech segments
    console.log(`Processing with max reversed chunk size: ${maxChunkDuration}s`);
    const processedSegments = await processAudio(extractedAudioPath, reversedAudioPath, maxChunkDuration);
    
    console.log(`Audio processed with ${processedSegments.length} reversed segments.`);
    
    // Verify processed audio exists
    const reversedStat = await fs.stat(reversedAudioPath);
    console.log(`Processed audio: ${reversedAudioPath}, size: ${reversedStat.size} bytes`);
    
    // Step 3: Mux processed audio with original video
    // IMPORTANT: Both video inputs are now playing FORWARD relative to timeline.
    // The "Reversed" video is just the original video with the modified audio track.
    console.log('Step 3: Muxing processed audio with video...');
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputPath)
        .input(reversedAudioPath)
        .outputOptions([
          '-c:v copy',           // Copy video stream (no re-encoding)
          '-c:a aac',            // Encode audio as AAC
          '-map 0:v:0',          // Use video from first input
          '-map 1:a:0',          // Use audio from second input
          '-shortest'            // Match shortest stream duration
        ])
        .output(reversedVideoPath)
        .on('end', resolve)
        .on('error', (err) => {
          console.error('FFmpeg mux error:', err);
          reject(err);
        })
        .run();
    });
    
    // Verify output video exists
    const outputStat = await fs.stat(reversedVideoPath);
    console.log(`Muxed video: ${reversedVideoPath}, size: ${outputStat.size} bytes`);
    
    // Get video duration
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });
    
    // Save analysis metadata
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    const analysisData = {
      analysisId,
      name: videoName,
      maxChunkDuration,
      originalVideoPath: originalVideoPath,
      reversedVideoPath: reversedVideoPath,
      extractedAudioPath: extractedAudioPath,
      reversedAudioPath: reversedAudioPath,
      originalVideoUrl: `/outputs/videos/${originalVideoFileName}`,
      reversedVideoUrl: `/outputs/videos/${reversedVideoFileName}`,
      reversedAudioUrl: `/outputs/audio/${reversedAudioFileName}`,
      duration,
      maxChunkDuration,
      createdAt: new Date().toISOString(),
      markers: [],
      snippets: []
    };
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    // Clean up uploaded file
    try {
      await fs.unlink(inputPath);
    } catch (err) {
      console.warn('Failed to delete uploaded file:', inputPath);
    }
    
    res.json({
      analysisId,
      originalVideoUrl: `/outputs/videos/${originalVideoFileName}`,
      reversedVideoUrl: `/outputs/videos/${reversedVideoFileName}`,
      reversedAudioUrl: `/outputs/audio/${reversedAudioFileName}`,
      duration,
      fullOriginalVideoUrl: `http://localhost:${port}/outputs/videos/${originalVideoFileName}`,
      fullReversedVideoUrl: `http://localhost:${port}/outputs/videos/${reversedVideoFileName}`,
      fullReversedAudioUrl: `http://localhost:${port}/outputs/audio/${reversedAudioFileName}`
    });
  } catch (error) {
    console.error('Video processing error:', error);
    res.status(500).json({ error: 'Video processing failed: ' + error.message });
  }
});

/**
 * List all processed videos
 */
app.get('/api/videos', async (req, res) => {
  try {
    const files = await fs.readdir(videosDir);
    const analysisFiles = files.filter(file => file.startsWith('video_') && file.endsWith('.json'));
    const videos = [];
    
    for (const analysisFile of analysisFiles) {
      const analysisPath = path.join(videosDir, analysisFile);
      try {
        const analysisData = JSON.parse(await fs.readFile(analysisPath));
        videos.push({
          analysisId: analysisData.analysisId,
          name: analysisData.name || null,
          originalVideoUrl: analysisData.originalVideoUrl,
          reversedVideoUrl: analysisData.reversedVideoUrl,
          reversedAudioUrl: analysisData.reversedAudioUrl,
          duration: analysisData.duration,
          createdAt: analysisData.createdAt,
          markerCount: analysisData.markers?.length || 0,
          snippetCount: analysisData.snippets?.length || 0
        });
      } catch (err) {
        console.warn(`Failed to read analysis file: ${analysisFile}`);
      }
    }
    
    res.json(videos);
  } catch (error) {
    console.error('Error listing videos:', error);
    res.status(500).json({ error: 'Failed to list videos: ' + error.message });
  }
});

/**
 * Get a specific video analysis
 */
app.get('/api/videos/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    
    try {
      await fs.access(analysisPath);
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const analysisData = JSON.parse(await fs.readFile(analysisPath));
    res.json(analysisData);
  } catch (error) {
    console.error('Error getting video:', error);
    res.status(500).json({ error: 'Failed to get video: ' + error.message });
  }
});

/**
 * Delete a processed video and all associated files
 */
app.delete('/api/videos/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    // Delete all associated files
    const filesToDelete = [
      analysisData.originalVideoPath,
      analysisData.reversedVideoPath,
      analysisData.extractedAudioPath,
      analysisData.reversedAudioPath,
      analysisPath
    ];
    
    // Delete snippet files
    if (analysisData.snippets) {
      for (const snippet of analysisData.snippets) {
        if (snippet.file) filesToDelete.push(path.join(snippetsDir, snippet.file));
        if (snippet.forwardFile) filesToDelete.push(path.join(snippetsDir, snippet.forwardFile));
      }
    }
    
    for (const filePath of filesToDelete) {
      try {
        if (filePath) await fs.unlink(filePath);
      } catch (err) {
        console.warn('Failed to delete:', filePath);
      }
    }
    
    res.json({ success: true, message: `Deleted video ${analysisId}` });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video: ' + error.message });
  }
});

// ========== MARKER ENDPOINTS ==========

/**
 * Add a marker to a video analysis
 */
app.post('/api/markers', async (req, res) => {
  try {
    const { analysisId, timestamp, label, color } = req.body;
    
    if (!analysisId || timestamp === undefined) {
      return res.status(400).json({ error: 'Missing required fields: analysisId, timestamp' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const markerId = `marker_${Date.now()}`;
    const marker = {
      id: markerId,
      timestamp: parseFloat(timestamp),
      label: label || '',
      color: color || '#ff6384',
      createdAt: new Date().toISOString()
    };
    
    analysisData.markers = analysisData.markers || [];
    analysisData.markers.push(marker);
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json(marker);
  } catch (error) {
    console.error('Error adding marker:', error);
    res.status(500).json({ error: 'Failed to add marker: ' + error.message });
  }
});

/**
 * Update a marker
 */
app.put('/api/markers/:markerId', async (req, res) => {
  try {
    const { markerId } = req.params;
    const { analysisId, label, color, timestamp } = req.body;
    
    if (!analysisId) {
      return res.status(400).json({ error: 'Missing analysisId' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const markerIndex = analysisData.markers?.findIndex(m => m.id === markerId);
    if (markerIndex === -1 || markerIndex === undefined) {
      return res.status(404).json({ error: 'Marker not found' });
    }
    
    if (label !== undefined) analysisData.markers[markerIndex].label = label;
    if (color !== undefined) analysisData.markers[markerIndex].color = color;
    if (timestamp !== undefined) analysisData.markers[markerIndex].timestamp = parseFloat(timestamp);
    
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json(analysisData.markers[markerIndex]);
  } catch (error) {
    console.error('Error updating marker:', error);
    res.status(500).json({ error: 'Failed to update marker: ' + error.message });
  }
});

/**
 * Delete a marker
 */
app.delete('/api/markers/:markerId', async (req, res) => {
  try {
    const { markerId } = req.params;
    const { analysisId } = req.body;
    
    if (!analysisId) {
      return res.status(400).json({ error: 'Missing analysisId' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const markerIndex = analysisData.markers?.findIndex(m => m.id === markerId);
    if (markerIndex === -1 || markerIndex === undefined) {
      return res.status(404).json({ error: 'Marker not found' });
    }
    
    analysisData.markers.splice(markerIndex, 1);
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting marker:', error);
    res.status(500).json({ error: 'Failed to delete marker: ' + error.message });
  }
});

// ========== VIDEO SNIPPET ENDPOINTS ==========

/**
 * Extract a snippet from a video's reversed audio
 * Supports both audio-only and video snippets based on 'includeVideo' flag
 */
app.post('/api/extract-video-snippet', async (req, res) => {
  try {
    const { analysisId, start, end, playbackSpeed, annotation, name, includeVideo } = req.body;
    
    if (!analysisId || start === undefined || end === undefined) {
      return res.status(400).json({ error: 'Missing required fields: analysisId, start, end' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const timestamp = Date.now();
    const duration = parseFloat(end) - parseFloat(start);
    
    let snippet;
    
    if (includeVideo) {
      // Extract video snippets with audio
      const reversedVideoSnippetFileName = `video_clip_reversed_${timestamp}.mp4`;
      const forwardVideoSnippetFileName = `video_clip_forward_${timestamp}.mp4`;
      const reversedVideoSnippetPath = path.join(snippetsDir, reversedVideoSnippetFileName);
      const forwardVideoSnippetPath = path.join(snippetsDir, forwardVideoSnippetFileName);
      
      // Extract reversed video snippet (original video + segment-reversed audio)
      await new Promise((resolve, reject) => {
        ffmpeg(analysisData.reversedVideoPath)
          .setStartTime(parseFloat(start))
          .setDuration(duration)
          .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
          .output(reversedVideoSnippetPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // Extract forward video snippet (original video + original audio)
      await new Promise((resolve, reject) => {
        ffmpeg(analysisData.originalVideoPath)
          .setStartTime(parseFloat(start))
          .setDuration(duration)
          .outputOptions(['-c:v libx264', '-c:a aac', '-preset fast'])
          .output(forwardVideoSnippetPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      snippet = {
        id: `snippet_${timestamp}`,
        name: name || '',
        type: 'video',
        file: reversedVideoSnippetFileName,
        forwardFile: forwardVideoSnippetFileName,
        url: `/outputs/snippets/${reversedVideoSnippetFileName}`,
        forwardUrl: `/outputs/snippets/${forwardVideoSnippetFileName}`,
        start: parseFloat(start),
        end: parseFloat(end),
        duration,
        playbackSpeed: parseFloat(playbackSpeed) || 1,
        annotation: annotation || '',
        createdAt: new Date().toISOString()
      };
    } else {
      // Extract audio-only snippets (original behavior)
      const snippetFileName = `video_snippet_${timestamp}.wav`;
      const forwardSnippetFileName = `video_snippet_forward_${timestamp}.wav`;
      const snippetPath = path.join(snippetsDir, snippetFileName);
      const forwardSnippetPath = path.join(snippetsDir, forwardSnippetFileName);
      
      // Extract reversed audio snippet
      await new Promise((resolve, reject) => {
        ffmpeg(analysisData.reversedAudioPath)
          .setStartTime(parseFloat(start))
          .setDuration(duration)
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(snippetPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // Extract forward (original) audio snippet
      await new Promise((resolve, reject) => {
        ffmpeg(analysisData.extractedAudioPath)
          .setStartTime(parseFloat(start))
          .setDuration(duration)
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(forwardSnippetPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      snippet = {
        id: `snippet_${timestamp}`,
        name: name || '',
        type: 'audio',
        file: snippetFileName,
        forwardFile: forwardSnippetFileName,
        url: `/outputs/snippets/${snippetFileName}`,
        forwardUrl: `/outputs/snippets/${forwardSnippetFileName}`,
        start: parseFloat(start),
        end: parseFloat(end),
        duration,
        playbackSpeed: parseFloat(playbackSpeed) || 1,
        annotation: annotation || '',
        createdAt: new Date().toISOString()
      };
    }
    
    analysisData.snippets = analysisData.snippets || [];
    analysisData.snippets.push(snippet);
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json(snippet);
  } catch (error) {
    console.error('Error extracting video snippet:', error);
    res.status(500).json({ error: 'Failed to extract snippet: ' + error.message });
  }
});

/**
 * Update a video snippet annotation
 */
app.put('/api/video-snippets/:snippetId', async (req, res) => {
  try {
    const { snippetId } = req.params;
    const { analysisId, annotation, name } = req.body;
    
    if (!analysisId) {
      return res.status(400).json({ error: 'Missing analysisId' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const snippetIndex = analysisData.snippets?.findIndex(s => s.id === snippetId);
    if (snippetIndex === -1 || snippetIndex === undefined) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    
    if (name !== undefined) analysisData.snippets[snippetIndex].name = name;
    if (annotation !== undefined) analysisData.snippets[snippetIndex].annotation = annotation;
    
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json(analysisData.snippets[snippetIndex]);
  } catch (error) {
    console.error('Error updating snippet:', error);
    res.status(500).json({ error: 'Failed to update snippet: ' + error.message });
  }
});

/**
 * Delete a video snippet
 */
app.delete('/api/video-snippets/:snippetId', async (req, res) => {
  try {
    const { snippetId } = req.params;
    const { analysisId } = req.body;
    
    if (!analysisId) {
      return res.status(400).json({ error: 'Missing analysisId' });
    }
    
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const snippetIndex = analysisData.snippets?.findIndex(s => s.id === snippetId);
    if (snippetIndex === -1 || snippetIndex === undefined) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    
    const snippet = analysisData.snippets[snippetIndex];
    
    // Delete snippet files
    try {
      if (snippet.file) await fs.unlink(path.join(snippetsDir, snippet.file));
      if (snippet.forwardFile) await fs.unlink(path.join(snippetsDir, snippet.forwardFile));
    } catch (err) {
      console.warn('Failed to delete snippet files');
    }
    
    analysisData.snippets.splice(snippetIndex, 1);
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting snippet:', error);
    res.status(500).json({ error: 'Failed to delete snippet: ' + error.message });
  }
});

/**
 * List all video snippets across all analyses
 */
app.get('/api/video-snippets', async (req, res) => {
  try {
    const files = await fs.readdir(videosDir);
    const analysisFiles = files.filter(file => file.startsWith('video_') && file.endsWith('.json'));
    const allSnippets = [];
    
    for (const analysisFile of analysisFiles) {
      const analysisPath = path.join(videosDir, analysisFile);
      try {
        const analysisData = JSON.parse(await fs.readFile(analysisPath));
        
        if (Array.isArray(analysisData.snippets)) {
          for (const snippet of analysisData.snippets) {
            // Verify snippet files exist
            const snippetPath = path.join(snippetsDir, snippet.file);
            const forwardSnippetPath = path.join(snippetsDir, snippet.forwardFile);
            
            try {
              await fs.access(snippetPath);
              await fs.access(forwardSnippetPath);
              
              allSnippets.push({
                ...snippet,
                analysisId: analysisData.analysisId,
                videoOriginalUrl: analysisData.originalVideoUrl,
                videoDuration: analysisData.duration
              });
            } catch {
              console.warn(`Snippet files not found for ${snippet.id}`);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to read analysis file: ${analysisFile}`);
      }
    }
    
    // Sort by creation date (newest first)
    allSnippets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(allSnippets);
  } catch (error) {
    console.error('Error listing video snippets:', error);
    res.status(500).json({ error: 'Failed to list video snippets: ' + error.message });
  }
});

/**
 * Stitch forward and reversed snippets together with individual speeds
 * Order: Forward first, then Reversed
 * exportType: 'audio' = audio-only WAV, 'video' = MP4 with forward video x2 + stitched audio
 */
app.post('/api/stitch-snippet', async (req, res) => {
  try {
    const { snippetId, analysisId, reversedSpeed, forwardSpeed, exportType } = req.body;
    
    if (!snippetId || !analysisId) {
      return res.status(400).json({ error: 'Missing required fields: snippetId, analysisId' });
    }
    
    // Load analysis to find snippet
    const analysisPath = path.join(videosDir, `${analysisId}.json`);
    let analysisData;
    try {
      analysisData = JSON.parse(await fs.readFile(analysisPath));
    } catch {
      return res.status(404).json({ error: 'Video analysis not found' });
    }
    
    const snippet = analysisData.snippets?.find(s => s.id === snippetId);
    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    
    // Get source files
    const reversedFilePath = path.join(snippetsDir, snippet.file);
    const forwardFilePath = path.join(snippetsDir, snippet.forwardFile);
    
    // Verify files exist
    try {
      await fs.access(reversedFilePath);
      await fs.access(forwardFilePath);
    } catch {
      return res.status(404).json({ error: 'Snippet files not found' });
    }
    
    // For video export, we need to use the original forward video from the analysis
    // The forward video snippet is created from the original video
    const isVideoSnippet = snippet.type === 'video';
    
    const timestamp = Date.now();
    const revSpeed = parseFloat(reversedSpeed) || 1;
    const fwdSpeed = parseFloat(forwardSpeed) || 1;
    
    // Helper: atempo only supports 0.5-2.0, chain filters if needed
    const getAtempoFilters = (speed) => {
      const filters = [];
      let s = speed;
      while (s > 2.0) {
        filters.push('atempo=2.0');
        s /= 2.0;
      }
      while (s < 0.5) {
        filters.push('atempo=0.5');
        s /= 0.5;
      }
      filters.push(`atempo=${s}`);
      return filters.join(',');
    };
    
    if (exportType === 'video') {
      // Video export: Forward video (played twice at different speeds) + stitched audio overlay
      // Requires video snippets
      if (!isVideoSnippet) {
        return res.status(400).json({ error: 'Video export requires a video snippet. This is an audio-only snippet.' });
      }
      
      const outputFilename = `stitched_video_${timestamp}.mp4`;
      const outputPath = path.join(snippetsDir, outputFilename);
      
      // Temp files
      const tempForwardAudio = path.join(snippetsDir, `temp_fwd_audio_${timestamp}.wav`);
      const tempReversedAudio = path.join(snippetsDir, `temp_rev_audio_${timestamp}.wav`);
      const tempStitchedAudio = path.join(snippetsDir, `temp_stitched_audio_${timestamp}.wav`);
      const tempVideo1 = path.join(snippetsDir, `temp_vid1_${timestamp}.mp4`);
      const tempVideo2 = path.join(snippetsDir, `temp_vid2_${timestamp}.mp4`);
      const tempStitchedVideo = path.join(snippetsDir, `temp_stitched_video_${timestamp}.mp4`);
      
      // 1. Extract and speed-adjust FORWARD audio (plays first)
      await new Promise((resolve, reject) => {
        ffmpeg(forwardFilePath)
          .audioFilters(getAtempoFilters(fwdSpeed))
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(tempForwardAudio)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 2. Extract and speed-adjust REVERSED audio (plays second)
      await new Promise((resolve, reject) => {
        ffmpeg(reversedFilePath)
          .audioFilters(getAtempoFilters(revSpeed))
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(tempReversedAudio)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 3. Stitch audio: Forward first, then Reversed
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(tempForwardAudio)
          .input(tempReversedAudio)
          .complexFilter(['[0:a][1:a]concat=n=2:v=0:a=1[out]'])
          .outputOptions(['-map', '[out]'])
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(tempStitchedAudio)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 4. Create first video segment (forward video at forward speed)
      await new Promise((resolve, reject) => {
        ffmpeg(forwardFilePath)
          .videoFilters(`setpts=${1/fwdSpeed}*PTS`)
          .outputOptions(['-c:v libx264', '-an', '-preset fast'])
          .output(tempVideo1)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 5. Create second video segment (forward video at reversed speed)
      await new Promise((resolve, reject) => {
        ffmpeg(forwardFilePath)
          .videoFilters(`setpts=${1/revSpeed}*PTS`)
          .outputOptions(['-c:v libx264', '-an', '-preset fast'])
          .output(tempVideo2)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 6. Concatenate videos
      const concatFile = path.join(snippetsDir, `concat_${timestamp}.txt`);
      await fs.writeFile(concatFile, `file '${tempVideo1}'\nfile '${tempVideo2}'`);
      
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy'])
          .output(tempStitchedVideo)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 7. Mux stitched video with stitched audio
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(tempStitchedVideo)
          .input(tempStitchedAudio)
          .outputOptions(['-c:v copy', '-c:a aac', '-shortest'])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // Cleanup temp files
      await fs.unlink(tempForwardAudio).catch(() => {});
      await fs.unlink(tempReversedAudio).catch(() => {});
      await fs.unlink(tempStitchedAudio).catch(() => {});
      await fs.unlink(tempVideo1).catch(() => {});
      await fs.unlink(tempVideo2).catch(() => {});
      await fs.unlink(tempStitchedVideo).catch(() => {});
      await fs.unlink(concatFile).catch(() => {});
      
      // Send file
      res.download(outputPath, outputFilename, async (err) => {
        if (err) console.error('Error sending stitched video:', err);
        await fs.unlink(outputPath).catch(() => {});
      });
      
    } else {
      // Audio-only export: Forward first, then Reversed
      const outputFilename = `stitched_audio_${timestamp}.wav`;
      const outputPath = path.join(snippetsDir, outputFilename);
      
      const tempForward = path.join(snippetsDir, `temp_fwd_${timestamp}.wav`);
      const tempReversed = path.join(snippetsDir, `temp_rev_${timestamp}.wav`);
      
      // 1. Speed-adjust FORWARD audio (plays first)
      await new Promise((resolve, reject) => {
        ffmpeg(forwardFilePath)
          .audioFilters(getAtempoFilters(fwdSpeed))
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(tempForward)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 2. Speed-adjust REVERSED audio (plays second)
      await new Promise((resolve, reject) => {
        ffmpeg(reversedFilePath)
          .audioFilters(getAtempoFilters(revSpeed))
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(tempReversed)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // 3. Concatenate: Forward first, then Reversed
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(tempForward)
          .input(tempReversed)
          .complexFilter(['[0:a][1:a]concat=n=2:v=0:a=1[out]'])
          .outputOptions(['-map', '[out]'])
          .audioCodec('pcm_s16le')
          .format('wav')
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      // Cleanup temp files
      await fs.unlink(tempForward).catch(() => {});
      await fs.unlink(tempReversed).catch(() => {});
      
      // Send file
      res.download(outputPath, outputFilename, async (err) => {
        if (err) console.error('Error sending stitched audio:', err);
        await fs.unlink(outputPath).catch(() => {});
      });
    }
    
  } catch (error) {
    console.error('Error stitching snippet:', error);
    res.status(500).json({ error: 'Failed to stitch snippet: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});