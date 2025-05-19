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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

const upload = multer({ dest: 'uploads/' });
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.json());
const outputDir = path.join(__dirname, '../outputs');
await fs.mkdir(outputDir, { recursive: true });

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const outputFileName = `reversed_${Date.now()}.wav`;
    const outputPath = path.join(outputDir, outputFileName);
    const analysisId = Date.now();

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilter('areverse')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const audioData = await fs.readFile(outputPath);
    const decoded = await WavDecoder.decode(audioData);
    const signal = decoded.channelData[0];
    const sampleRate = decoded.sampleRate;

    const bufferSize = 512;
    const hopSize = 4096; // Increased to reduce frame count
    const mfccFeatures = [];
    const energyValues = [];
    const chromaValues = [];
    const spectrogramData = [];

    for (let i = 0; i < signal.length; i += bufferSize) {
      const frame = signal.slice(i, i + bufferSize);
      if (frame.length === bufferSize) {
        const features = Meyda.extract(['mfcc', 'energy', 'chroma', 'amplitudeSpectrum'], frame, {
          sampleRate,
          bufferSize,
        });
        if (!features.amplitudeSpectrum) {
          console.error('amplitudeSpectrum missing in features:', features);
          continue;
        }
        mfccFeatures.push(features.mfcc);
        energyValues.push(features.energy);
        chromaValues.push(features.chroma);
        spectrogramData.push(Array.from(features.amplitudeSpectrum.slice(0, 50)));
      }
    }

    console.log('Spectrogram Data Length:', spectrogramData.length);
    console.log('Spectrogram Data Sample:', spectrogramData.slice(0, 2));

    const formantValues = chromaValues[0]?.slice(0, 5) || [];
    const formantShifts = [];
    for (let i = 1; i < chromaValues.length; i++) {
      formantShifts.push(Math.abs(chromaValues[i][0] - chromaValues[i - 1][0]));
    }

    // Normalize energyValues and formantShifts for more robust detection
    const maxEnergy = Math.max(...energyValues);
    const maxFormantShift = Math.max(...formantShifts);
    const normalizedEnergyValues = energyValues.map(v => v / (maxEnergy || 1));
    const normalizedFormantShifts = formantShifts.map(v => v / (maxFormantShift || 1));

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

    const detectedSegments = detectSegments();

    const analysisPath = path.join(outputDir, `analysis_${analysisId}.json`);
    const analysisData = {
      mfcc: mfccFeatures,
      pitch: [],
      formants: formantValues,
      spectrogram: spectrogramData,
      detectedSegments,
      snippets: [],
      originalAudioPath: inputPath,
      reversedAudioUrl: `/outputs/${outputFileName}`, // Save the URL in the analysis data
    };
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));

    res.json({
      reversedAudioUrl: `/outputs/${outputFileName}`,
      analysisFile: `/outputs/${path.basename(analysisPath)}`,
      analysisId,
      mfccSummary: mfccFeatures.slice(0, 5),
      pitchSummary: [],
      formantSummary: formantValues,
      spectrogramData: spectrogramData.slice(0, 1000), // Limit for display
      detectedSegments,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.post('/api/redetect', async (req, res) => {
  try {
    const { analysisId, energyThreshold, formantShiftThreshold } = req.body;
    const analysisPath = path.join(outputDir, `analysis_${analysisId}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath));
    
    // Fix: Use the correct path to the reversed audio file
    const outputFileName = path.basename(analysisData.reversedAudioUrl || `reversed_${analysisId}.wav`);
    const audioPath = path.join(outputDir, outputFileName);

    const audioData = await fs.readFile(audioPath);
    const decoded = await WavDecoder.decode(audioData);
    const signal = decoded.channelData[0];
    const sampleRate = decoded.sampleRate;

    const bufferSize = 512;
    const hopSize = 4096; // Use the same hop size as in the original analysis
    const energyValues = [];
    const chromaValues = [];

    for (let i = 0; i < signal.length; i += bufferSize) {
      const frame = signal.slice(i, i + bufferSize);
      if (frame.length === bufferSize) {
        const features = Meyda.extract(['energy', 'chroma'], frame, {
          sampleRate,
          bufferSize,
        });
        energyValues.push(features.energy);
        chromaValues.push(features.chroma);
      }
    }

    const formantShifts = [];
    for (let i = 1; i < chromaValues.length; i++) {
      formantShifts.push(Math.abs(chromaValues[i][0] - chromaValues[i - 1][0]));
    }

    // Normalize values to match the original detection logic
    const maxEnergy = Math.max(...energyValues);
    const maxFormantShift = Math.max(...formantShifts);
    const normalizedEnergyValues = energyValues.map(v => v / (maxEnergy || 1));
    const normalizedFormantShifts = formantShifts.map(v => v / (maxFormantShift || 1));

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

    // Add reversedAudioUrl if it doesn't exist in the analysis data
    if (!analysisData.reversedAudioUrl) {
      analysisData.reversedAudioUrl = `/outputs/${outputFileName}`;
    }
    
    analysisData.detectedSegments = detectedSegments;
    await fs.writeFile(analysisPath, JSON.stringify(analysisData, null, 2));

    res.json({ detectedSegments });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to re-detect segments' });
  }
});

app.post('/api/extract-segment', upload.none(), async (req, res) => {
  try {
    const { audioUrl, start, end, analysisId, playbackSpeed } = req.body;
    const audioPath = path.join(outputDir, path.basename(audioUrl));
    const analysisPath = path.join(outputDir, `analysis_${analysisId}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath));
    const originalAudioPath = analysisData.originalAudioPath;

    // Ensure the audio paths exist
    try {
      await fs.access(audioPath);
      await fs.access(originalAudioPath);
    } catch (err) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const snippetFileName = `snippet_${Date.now()}.wav`;
    const snippetPath = path.join(outputDir, snippetFileName);
    const forwardSnippetFileName = `forward_snippet_${Date.now()}.wav`;
    const forwardSnippetPath = path.join(outputDir, forwardSnippetFileName);

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
      url: `/outputs/${snippetFileName}`,
      forwardUrl: `/outputs/${forwardSnippetFileName}`,
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

    res.json(snippet);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to extract segment' });
  }
});

app.post('/api/save-annotation', async (req, res) => {
  try {
    const { analysisId, segmentIndex, annotation, isSnippet } = req.body;
    const analysisPath = path.join(outputDir, `analysis_${analysisId}.json`);
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
    const files = await fs.readdir(outputDir);
    const analysisFiles = files.filter(file => file.startsWith('analysis_') && file.endsWith('.json'));
    const snippets = [];

    for (const analysisFile of analysisFiles) {
      const analysisPath = path.join(outputDir, analysisFile);
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
          const snippetPath = path.join(outputDir, snippet.file);
          const forwardSnippetPath = path.join(outputDir, snippet.forwardFile);
          try {
            await fs.access(snippetPath);
            await fs.access(forwardSnippetPath);
            snippets.push({
              url: `/outputs/${snippet.file}`,
              forwardUrl: `/outputs/${snippet.forwardFile}`,
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

app.use('/outputs', express.static(outputDir));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});