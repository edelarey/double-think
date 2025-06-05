import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import Meyda from 'meyda';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the 'outputs' directory
const outputDir = path.join(__dirname, '../outputs');
app.use('/outputs', express.static(outputDir));

const snippetsDir = path.join(outputDir, 'snippets');
const reversedDir = path.join(outputDir, 'reversed');
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(snippetsDir, { recursive: true });
await fs.mkdir(reversedDir, { recursive: true });

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
    try {
      await fs.access(filePath); // Check if file exists
    } catch (err) {
      return res.status(404).json({ error: 'File not found', details: `File ${file} does not exist in ${reversedDir}` });
    }
    await fs.unlink(filePath);
    res.json({ success: true, message: `File ${file} deleted successfully.` });
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
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});