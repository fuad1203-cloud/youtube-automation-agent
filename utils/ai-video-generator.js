const OpenAI = require('openai');
const Replicate = require('replicate');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { Logger } = require('./logger');

const execAsync = promisify(exec);

class AIVideoGenerator {
  constructor(credentials) {
    this.logger = new Logger('AIVideoGenerator');
    
    // Initialize AI services with graceful fallback
    const openaiKey = credentials.openai?.apiKey || process.env.OPENAI_API_KEY;
    const replicateKey = credentials.replicate?.apiKey || process.env.REPLICATE_API_KEY;
    
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI service initialized');
    } else {
      this.logger.warn('OpenAI API key not found - AI features will be simulated');
    }
    
    if (replicateKey) {
      this.replicate = new Replicate({ auth: replicateKey });
      this.logger.info('Replicate service initialized');
    } else {
      this.logger.warn('Replicate API key not found - advanced video generation unavailable');
    }
    
    // ElevenLabs configuration
    this.elevenLabsApiKey = credentials.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY;
    this.elevenLabsVoiceId = credentials.elevenLabs?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    
    // Azure Speech configuration
    this.azureSpeechKey = credentials.azure?.speechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = credentials.azure?.speechRegion || process.env.AZURE_SPEECH_REGION;
  }

  async generateTTSAudio(text, outputPath) {
    this.logger.info('Generating TTS audio...');
    
    try {
      // Try ElevenLabs first (higher quality)
      if (this.elevenLabsApiKey && this.elevenLabsVoiceId) {
        return await this.generateElevenLabsTTS(text, outputPath);
      }
      
      // Fallback to OpenAI TTS
      if (this.openai) {
        return await this.generateOpenAITTS(text, outputPath);
      }
      
      // Final fallback to simulation
      return await this.simulateTTSGeneration(text, outputPath);
    } catch (error) {
      this.logger.error('TTS generation failed:', error);
      throw error;
    }
  }

  async generateElevenLabsTTS(text, outputPath) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;
    
    const data = {
      text: text,
      model_id: "eleven_v3",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    const response = await axios({
      method: 'POST',
      url: url,
      data: data,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey
      },
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        this.logger.info('ElevenLabs TTS generation complete');
        resolve(outputPath);
      });
      writer.on('error', reject);
    });
  }

  async generateOpenAITTS(text, outputPath) {
    const response = await this.openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      speed: 1.0,
      instructions: process.env.TTS_VOICE_INSTRUCTIONS ||
        "Speak naturally and conversationally, like a real person casually explaining " +
        "something to a friend. Use natural breathing pauses between sentences, vary your " +
        "pacing and emphasis, and avoid a flat, robotic, or overly formal delivery."
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    this.logger.info('OpenAI TTS generation complete');
    return outputPath;
  }

  async generateVisualAssets(prompt, style = "ethereal", count = 1) {
    this.logger.info(`Generating ${count} visual assets with style: ${style}`);
    
    try {
      if (!this.openai) {
        return await this.simulateVisualAssets(prompt, style, count);
      }

      const enhancedPrompt = this.enhanceVisualPrompt(prompt, style);
      const localPaths = [];

      for (let i = 0; i < count; i++) {
        const response = await this.openai.images.generate({
          model: "gpt-image-2",
          prompt: enhancedPrompt,
          n: 1,
          size: "1536x1024",
          quality: "high",
        });

        const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
        if (response.data[0].b64_json) {
          const buffer = Buffer.from(response.data[0].b64_json, 'base64');
          await fs.writeFile(imagePath, buffer);
        } else {
          await this.downloadImage(response.data[0].url, imagePath);
        }
        localPaths.push(imagePath);
      }

      this.logger.info(`Generated ${localPaths.length} visual assets`);
      return localPaths;
    } catch (error) {
      this.logger.error('Visual asset generation failed:', error);
      return await this.simulateVisualAssets(prompt, style, count);
    }
  }

  enhanceVisualPrompt(prompt, style) {
    const styleEnhancements = {
      ethereal: "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background",
      modern: "modern, clean, minimalist, professional, sleek design, contemporary",
      animated: "animated style, cartoon, vibrant colors, expressive, dynamic",
      cinematic: "cinematic lighting, dramatic, movie poster style, high contrast",
      abstract: "abstract art, geometric shapes, gradient colors, artistic composition",
      "traditional-cartoon": "hand-drawn 2D cartoon illustration in the style of a traditionally " +
        "animated explainer video, flat cel-shaded coloring, bold clean black outlines, warm " +
        "saturated color palette, simple appealing character and prop design, textured paper-like " +
        "background shading. Avoid photorealism, avoid 3D rendering, avoid glossy airbrushed " +
        "digital-art sheen, avoid extra fingers or warped hands, avoid any text or watermark."
    };

    const enhancement = styleEnhancements[style] || styleEnhancements.ethereal;
    const suffix = style === 'traditional-cartoon'
      ? 'high quality, 16:9 aspect ratio'
      : 'high quality, 16:9 aspect ratio, digital art';
    return `${prompt}, ${enhancement}, ${suffix}`;
  }

  async downloadImage(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async generateVideo(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Generating video from assets...');
    
    try {
      // Try Replicate for video generation first
      if (this.replicate && this.replicate.auth) {
        return await this.generateReplicateVideo(script, visualAssets, audioPath, outputPath);
      }
      
      // Fallback to simple slideshow with Playwright
      return await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath);
    } catch (error) {
      this.logger.error('Video generation failed:', error);
      return await this.simulateVideoGeneration(script, visualAssets, audioPath, outputPath);
    }
  }

  async generateReplicateVideo(script, visualAssets, audioPath, outputPath) {
    const output = await this.replicate.run(
      "wan-video/wan-2.7-i2v",
      {
        input: {
          image: visualAssets[0],
          prompt: script.title || "smooth cinematic motion",
          duration: 5,
          resolution: "720p"
        }
      }
    );

    // Download the generated video
    if (output && output.length > 0) {
      await this.downloadVideo(output[0], outputPath);
      
      // Add audio track
      await this.addAudioToVideo(outputPath, audioPath, outputPath);
    }

    return outputPath;
  }

  async generateSlideshowVideo(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Creating slideshow video...');

    // Use the real narration length as the source of truth, not a word-count
    // guess — the estimator undercounts array-shaped section content, which
    // previously produced a visual track far shorter than the actual audio
    // and silently truncated the narration via addAudioToVideo's -shortest.
    const duration = await this.getAudioDuration(audioPath).catch(() => this.calculateScriptDuration(script));

    const images = visualAssets && visualAssets.length > 0
      ? visualAssets
      : [await this.createPlaceholderFrame(outputPath)];

    const visualPath = outputPath.replace('.mp4', '_visual.mp4');
    await this.buildImageSequenceVideo(images, duration, visualPath);

    // Add audio
    await this.addAudioToVideo(visualPath, audioPath, outputPath);
    await fs.unlink(visualPath).catch(() => {});

    return outputPath;
  }

  async getAudioDuration(audioPath) {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
    );
    const seconds = parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('Could not determine audio duration');
    }
    return seconds;
  }

  async createPlaceholderFrame(outputPath) {
    const framePath = outputPath.replace('.mp4', '_placeholder.png');
    await execAsync(
      `ffmpeg -y -f lavfi -i "color=c=0x1a1a2e:s=1920x1080" -frames:v 1 "${framePath}"`
    );
    return framePath;
  }

  async buildImageSequenceVideo(images, totalDuration, outputPath) {
    const perImageDuration = Math.max(1, totalDuration / images.length);
    const concatListPath = outputPath.replace('.mp4', '_concat.txt');

    const lines = images.map(
      img => `file '${img.replace(/'/g, "'\\''")}'\nduration ${perImageDuration.toFixed(2)}`
    );
    // ffmpeg's concat demuxer ignores the final entry's duration unless the
    // last file is repeated once more without one.
    lines.push(`file '${images[images.length - 1].replace(/'/g, "'\\''")}'`);
    await fs.writeFile(concatListPath, lines.join('\n'));

    const ffmpegCommand = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" ` +
      `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" ` +
      `-c:v libx264 -pix_fmt yuv420p -t ${totalDuration.toFixed(2)} "${outputPath}"`;
    await execAsync(ffmpegCommand);
    await fs.unlink(concatListPath).catch(() => {});
  }

  calculateScriptDuration(script) {
    // Estimate duration based on word count (average 150 words per minute)
    let totalWords = 0;
    
    if (script.hook) totalWords += script.hook.text.split(' ').length;
    if (script.introduction) {
      totalWords += (script.introduction.greeting || '').split(' ').length;
      totalWords += (script.introduction.topicIntro || '').split(' ').length;
    }
    
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        if (typeof section.content === 'string') {
          totalWords += section.content.split(' ').length;
        } else if (Array.isArray(section.content)) {
          totalWords += section.content.join(' ').split(' ').length;
        }
        if (section.items) {
          section.items.forEach(item => {
            totalWords += (item.title + ' ' + item.description).split(' ').length;
          });
        }
        if (section.steps) {
          section.steps.forEach(step => {
            totalWords += (step.title + ' ' + step.description).split(' ').length;
          });
        }
      });
    }
    
    if (script.conclusion) {
      totalWords += script.conclusion.finalThought.split(' ').length;
    }
    
    // Convert to duration (150 words per minute)
    return Math.max(30, Math.ceil((totalWords / 150) * 60));
  }

  async addAudioToVideo(videoPath, audioPath, outputPath) {
    const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`;
    await execAsync(command);
    this.logger.info('Audio added to video successfully');
  }

  // Transcribes the real generated narration so caption timing matches actual
  // speech, instead of relying on estimated per-section durations that can
  // drift far from how fast the TTS voice actually speaks.
  async transcribeAudioToSegments(audioPath) {
    if (!this.openai) {
      throw new Error('No OpenAI client available for transcription');
    }

    const fsSync = require('fs');
    const transcription = await this.openai.audio.transcriptions.create({
      file: fsSync.createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    });

    return (transcription.segments || []).map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text.trim()
    }));
  }

  segmentsToSRT(segments) {
    const formatSRTTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };

    return segments
      .map((segment, index) =>
        `${index + 1}\n${formatSRTTime(segment.start)} --> ${formatSRTTime(segment.end)}\n${segment.text}\n`
      )
      .join('\n');
  }

  async burnCaptions(videoPath, srtPath, outputPath) {
    // ffmpeg's subtitles filter needs an escaped path when passed as a filter argument
    const escapedSrtPath = srtPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const style = "FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60";
    const command = `ffmpeg -y -i "${videoPath}" -vf "subtitles='${escapedSrtPath}':force_style='${style}'" -c:a copy "${outputPath}"`;
    await execAsync(command);
    this.logger.info('Captions burned into video successfully');
  }

  async downloadVideo(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  // Simulation methods for when APIs are not available
  async simulateTTSGeneration(text, outputPath) {
    this.logger.info('Simulating TTS generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI TTS audio would be generated here',
      text: text.substring(0, 100) + '...',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateVisualAssets(prompt, style, count) {
    this.logger.info(`Simulating ${count} visual assets...`);
    
    const paths = [];
    for (let i = 0; i < count; i++) {
      const assetPath = path.join(__dirname, '..', 'data', 'assets', `visual_sim_${Date.now()}_${i}.info`);
      
      await fs.writeFile(assetPath, JSON.stringify({
        message: 'AI visual asset would be generated here',
        prompt: prompt,
        style: style,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      paths.push(assetPath);
    }
    
    return paths;
  }

  async simulateVideoGeneration(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Simulating video generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI video would be generated here',
      script: script.title,
      visualAssets: visualAssets.length,
      audioPath: audioPath,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

}

module.exports = { AIVideoGenerator };