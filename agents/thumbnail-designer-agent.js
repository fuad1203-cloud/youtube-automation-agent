const sharp = require('sharp');
const OpenAI = require('openai');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('../utils/logger');
const { FLAT_SKETCH_STYLES, getCurrentStyle, getStyleEnhancement } = require('../utils/visual-styles');

class ThumbnailDesignerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ThumbnailDesigner');
    this.templatesPath = path.join(__dirname, '..', 'data', 'thumbnail-templates');

    const rawCreds = credentials?.credentials || credentials || {};
    const openaiKey = rawCreds.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    } else {
      this.logger.warn('OpenAI API key not found - thumbnail background art will be simulated');
    }
  }

  async initialize() {
    this.logger.info('Initializing Thumbnail Designer Agent...');
    await this.ensureTemplatesDirectory();
    return true;
  }

  async ensureTemplatesDirectory() {
    try {
      await fs.mkdir(this.templatesPath, { recursive: true });
      await fs.mkdir(path.join(__dirname, '..', 'uploads', 'thumbnails'), { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create directories:', error);
    }
  }

  async generateThumbnail(script) {
    try {
      this.logger.info(`Generating thumbnail for: ${script.title}`);
      
      // Generate thumbnail concept
      const concept = await this.generateConcept(script);

      // Create thumbnail prompt for AI generation
      const prompt = await this.createPrompt(concept);

      // Generate base thumbnail (AI background art if available, gradient fallback otherwise)
      const thumbnailPath = await this.createThumbnail(concept, prompt);
      
      // Add text overlay
      const finalThumbnail = await this.addTextOverlay(thumbnailPath, concept);
      
      // Optimize for YouTube
      const optimizedThumbnail = await this.optimizeForYouTube(finalThumbnail);
      
      const thumbnailData = {
        path: optimizedThumbnail,
        concept,
        prompt,
        dimensions: { width: 1280, height: 720 },
        fileSize: await this.getFileSize(optimizedThumbnail),
        createdAt: new Date().toISOString()
      };
      
      // Save to database
      await this.db.saveThumbnail(thumbnailData);
      
      this.logger.info('Thumbnail generated successfully');
      return thumbnailData;
    } catch (error) {
      this.logger.error('Failed to generate thumbnail:', error);
      throw error;
    }
  }

  async generateConcept(script) {
    const concepts = {
      tutorial: {
        style: 'clean',
        elements: ['step numbers', 'arrows', 'progress indicators'],
        colors: ['blue', 'white', 'green'],
        emotion: 'helpful'
      },
      explainer: {
        style: 'informative',
        elements: ['icons', 'diagrams', 'question marks'],
        colors: ['purple', 'yellow', 'white'],
        emotion: 'curious'
      },
      list: {
        style: 'numbered',
        elements: ['large numbers', 'countdown', 'highlights'],
        colors: ['red', 'yellow', 'black'],
        emotion: 'exciting'
      },
      review: {
        style: 'comparative',
        elements: ['product image', 'rating stars', 'vs symbol'],
        colors: ['orange', 'gray', 'white'],
        emotion: 'analytical'
      },
      story: {
        style: 'dramatic',
        elements: ['faces', 'emotion', 'journey path'],
        colors: ['dark blue', 'gold', 'white'],
        emotion: 'intriguing'
      }
    };

    const baseConcept = concepts[script.metadata?.strategy?.contentType?.toLowerCase()] || concepts.explainer;
    const strategy = script.metadata?.strategy || {};

    return {
      title: this.formatThumbnailTitle(script.title),
      subject: strategy.topic || script.title,
      angle: strategy.angle || '',
      style: baseConcept.style,
      primaryText: this.extractPrimaryText(script.title),
      secondaryText: this.generateSecondaryText(script),
      elements: baseConcept.elements,
      colors: {
        primary: baseConcept.colors[0],
        secondary: baseConcept.colors[1],
        accent: baseConcept.colors[2]
      },
      emotion: baseConcept.emotion,
      composition: this.selectComposition(),
      effects: this.selectEffects()
    };
  }

  formatThumbnailTitle(title) {
    // Shorten title for thumbnail
    const words = title.split(' ');
    if (words.length > 5) {
      return words.slice(0, 5).join(' ') + '...';
    }
    return title;
  }

  extractPrimaryText(title) {
    // Extract most impactful words
    const impactWords = ['ultimate', 'complete', 'secret', 'truth', 'how', 'why', 'best', 'top', 'guide', 'master'];
    const titleWords = title.toLowerCase().split(' ');
    
    const foundImpactWords = titleWords.filter(word => impactWords.includes(word));
    
    if (foundImpactWords.length > 0) {
      return foundImpactWords[0].toUpperCase();
    }
    
    // Extract numbers if present
    const numbers = title.match(/\d+/);
    if (numbers) {
      return numbers[0];
    }
    
    // Use first significant word
    return titleWords.find(word => word.length > 4)?.toUpperCase() || 'WATCH';
  }

  generateSecondaryText(script) {
    if (script.metadata && script.metadata.strategy) {
      const strategy = script.metadata.strategy;

      if (strategy.contentType === 'Tutorial') {
        return 'STEP BY STEP';
      } else if (strategy.contentType === 'List') {
        return 'YOU WON\'T BELIEVE #1';
      } else if (strategy.contentType === 'Review') {
        return 'HONEST REVIEW';
      } else if (strategy.keywords && strategy.keywords[0]) {
        return String(strategy.keywords[0]).toUpperCase().slice(0, 30);
      }
    }

    return 'MUST WATCH';
  }

  selectComposition() {
    const compositions = [
      'rule-of-thirds',
      'centered',
      'diagonal',
      'golden-ratio',
      'symmetrical'
    ];
    
    return compositions[Math.floor(Math.random() * compositions.length)];
  }

  selectEffects() {
    return {
      blur: Math.random() > 0.5,
      vignette: Math.random() > 0.7,
      glow: Math.random() > 0.6,
      shadow: true,
      border: Math.random() > 0.8
    };
  }

  async createPrompt(concept) {
    const visualStyle = getCurrentStyle();
    const artDirection = FLAT_SKETCH_STYLES.has(visualStyle)
      ? getStyleEnhancement(visualStyle)
      : 'A photorealistic, dramatic YouTube thumbnail background scene, ' + getStyleEnhancement(visualStyle);

    return `${artDirection} Depicting: ${concept.subject}. ${concept.angle}
    Emotional tone: ${concept.emotion}, ${concept.style}
    Composition: ${concept.composition}, optimized for high click-through rate.
    Do not include any text, letters, words, captions, or logos in the image — leave clear negative space for a text overlay to be added separately.
    Resolution: 1280x720px, 16:9 aspect ratio.`;
  }

  async createThumbnail(concept, prompt) {
    const aiBackground = await this.generateAIBackground(prompt);
    if (aiBackground) {
      return aiBackground;
    }

    // Fallback: gradient background using Sharp when no AI image is available
    const width = 1280;
    const height = 720;

    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);

    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${this.hexToRgb(concept.colors.primary)};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.hexToRgb(concept.colors.secondary)};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#gradient)" />
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .resize(width, height)
      .png()
      .toFile(outputPath);

    return outputPath;
  }

  async generateAIBackground(prompt) {
    if (!this.openai) {
      return null;
    }

    try {
      const response = await this.openai.images.generate({
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'high'
      });

      const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_ai_${Date.now()}.png`);

      if (response.data[0].b64_json) {
        await fs.writeFile(outputPath, Buffer.from(response.data[0].b64_json, 'base64'));
      } else {
        const imageResponse = await axios.get(response.data[0].url, { responseType: 'arraybuffer' });
        await fs.writeFile(outputPath, imageResponse.data);
      }

      return outputPath;
    } catch (error) {
      this.logger.warn(`AI thumbnail background failed; using gradient fallback: ${error.message}`);
      return null;
    }
  }

  hexToRgb(color) {
    // Color name to hex mapping
    const colors = {
      'blue': '#0066CC',
      'red': '#CC0000',
      'green': '#00CC66',
      'yellow': '#FFCC00',
      'purple': '#6600CC',
      'orange': '#FF6600',
      'white': '#FFFFFF',
      'black': '#000000',
      'gray': '#808080',
      'dark blue': '#003366',
      'gold': '#FFD700'
    };
    
    return colors[color] || '#000000';
  }

  async addTextOverlay(imagePath, concept) {
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_final_${Date.now()}.png`);
    
    // Create text overlay SVG. A dark scrim sits behind the text so it stays
    // legible over a busy AI-generated photo background, not just a flat gradient.
    const textSvg = `
      <svg width="1280" height="720">
        <defs>
          <linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:black;stop-opacity:0" />
            <stop offset="100%" style="stop-color:black;stop-opacity:0.75" />
          </linearGradient>
        </defs>
        <style>
          .primary {
            fill: white;
            font-size: 110px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            text-anchor: middle;
          }
          .secondary {
            fill: ${concept.colors.accent};
            font-size: 56px;
            font-weight: bold;
            font-family: Arial, sans-serif;
            text-anchor: middle;
          }
          .shadow {
            fill: black;
            opacity: 0.6;
          }
        </style>

        <rect x="0" y="440" width="1280" height="280" fill="url(#scrim)" />

        <!-- Shadow -->
        <text x="642" y="572" class="primary shadow">${concept.primaryText}</text>
        <text x="642" y="652" class="secondary shadow">${concept.secondaryText}</text>

        <!-- Main text -->
        <text x="640" y="570" class="primary">${concept.primaryText}</text>
        <text x="640" y="650" class="secondary">${concept.secondaryText}</text>
      </svg>
    `;
    
    const textOverlay = await sharp(Buffer.from(textSvg)).png().toBuffer();

    await sharp(imagePath)
      .resize(1280, 720, { fit: 'cover', position: 'centre' })
      .composite([{
        input: textOverlay,
        top: 0,
        left: 0
      }])
      .toFile(outputPath);
    
    return outputPath;
  }

  async optimizeForYouTube(imagePath) {
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_optimized_${Date.now()}.jpg`);
    
    // YouTube optimization: JPEG format, proper compression
    await sharp(imagePath)
      .resize(1280, 720, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({
        quality: 90,
        progressive: true,
        optimizeScans: true
      })
      .toFile(outputPath);
    
    // Verify file size (YouTube limit is 2MB)
    const stats = await fs.stat(outputPath);
    if (stats.size > 2 * 1024 * 1024) {
      // Re-compress if too large
      await sharp(imagePath)
        .resize(1280, 720)
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    }
    
    return outputPath;
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async generateABVariants(concept) {
    // Generate multiple thumbnail variants for A/B testing
    const variants = [];
    
    // Variant 1: Different color scheme
    const variant1 = { ...concept };
    variant1.colors = {
      primary: concept.colors.secondary,
      secondary: concept.colors.primary,
      accent: concept.colors.accent
    };
    variants.push(await this.createThumbnail(variant1));
    
    // Variant 2: Different text
    const variant2 = { ...concept };
    variant2.primaryText = this.generateAlternativeText(concept.primaryText);
    variants.push(await this.createThumbnail(variant2));
    
    // Variant 3: Different composition
    const variant3 = { ...concept };
    variant3.composition = 'centered';
    variants.push(await this.createThumbnail(variant3));
    
    return variants;
  }

  generateAlternativeText(originalText) {
    const alternatives = {
      'HOW': 'WHY',
      'BEST': 'TOP',
      'GUIDE': 'SECRETS',
      'TRUTH': 'FACTS',
      'ULTIMATE': 'COMPLETE'
    };
    
    return alternatives[originalText] || originalText + '!';
  }
}

module.exports = { ThumbnailDesignerAgent };