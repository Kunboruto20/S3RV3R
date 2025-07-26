const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Media Processor
 * Handles media processing, optimization, and format conversion
 */
class WAMediaProcessor {
    constructor(options = {}) {
        this.options = {
            imageQuality: options.imageQuality || 80,
            thumbnailSize: options.thumbnailSize || 200,
            maxImageSize: options.maxImageSize || 16 * 1024 * 1024, // 16MB
            maxVideoSize: options.maxVideoSize || 64 * 1024 * 1024, // 64MB
            maxAudioSize: options.maxAudioSize || 16 * 1024 * 1024, // 16MB
            supportedImageFormats: options.supportedImageFormats || ['jpeg', 'jpg', 'png', 'webp', 'gif'],
            supportedVideoFormats: options.supportedVideoFormats || ['mp4', 'avi', 'mov', 'mkv', 'webm'],
            supportedAudioFormats: options.supportedAudioFormats || ['mp3', 'wav', 'ogg', 'aac', 'm4a'],
            ...options
        };

        // Processing settings
        this.imageSettings = {
            jpeg: { quality: this.options.imageQuality, progressive: true },
            png: { compressionLevel: 9, adaptiveFiltering: true },
            webp: { quality: this.options.imageQuality, effort: 6 }
        };

        this.videoSettings = {
            codec: 'libx264',
            preset: 'medium',
            crf: 23,
            maxrate: '1M',
            bufsize: '2M'
        };

        this.audioSettings = {
            codec: 'aac',
            bitrate: '128k',
            sampleRate: 44100
        };
    }

    // Image processing
    async processImage(inputBuffer, options = {}) {
        try {
            const settings = { ...this.options, ...options };
            let processor = sharp(inputBuffer);

            // Get image metadata
            const metadata = await processor.metadata();
            
            // Resize if needed
            if (settings.maxWidth || settings.maxHeight) {
                processor = processor.resize(settings.maxWidth, settings.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Optimize based on format
            switch (metadata.format) {
                case 'jpeg':
                case 'jpg':
                    processor = processor.jpeg(this.imageSettings.jpeg);
                    break;
                case 'png':
                    processor = processor.png(this.imageSettings.png);
                    break;
                case 'webp':
                    processor = processor.webp(this.imageSettings.webp);
                    break;
                default:
                    processor = processor.jpeg(this.imageSettings.jpeg);
            }

            const processedBuffer = await processor.toBuffer();
            
            return {
                buffer: processedBuffer,
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                size: processedBuffer.length,
                optimized: true
            };
        } catch (error) {
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }

    // Generate image thumbnail
    async generateImageThumbnail(inputBuffer, size = null) {
        try {
            const thumbnailSize = size || this.options.thumbnailSize;
            
            const thumbnail = await sharp(inputBuffer)
                .resize(thumbnailSize, thumbnailSize, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 70 })
                .toBuffer();

            return {
                buffer: thumbnail,
                width: thumbnailSize,
                height: thumbnailSize,
                size: thumbnail.length,
                format: 'jpeg'
            };
        } catch (error) {
            throw new Error(`Thumbnail generation failed: ${error.message}`);
        }
    }

    // Video processing
    async processVideo(inputPath, outputPath, options = {}) {
        return new Promise((resolve, reject) => {
            const settings = { ...this.videoSettings, ...options };
            
            const args = [
                '-i', inputPath,
                '-c:v', settings.codec,
                '-preset', settings.preset,
                '-crf', settings.crf.toString(),
                '-maxrate', settings.maxrate,
                '-bufsize', settings.bufsize,
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-y', // Overwrite output file
                outputPath
            ];

            const ffmpegProcess = spawn(ffmpeg, args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        outputPath: outputPath,
                        settings: settings
                    });
                } else {
                    reject(new Error(`Video processing failed: ${stderr}`));
                }
            });

            ffmpegProcess.on('error', (error) => {
                reject(new Error(`FFmpeg error: ${error.message}`));
            });
        });
    }

    // Generate video thumbnail
    async generateVideoThumbnail(inputPath, outputPath, timeOffset = '00:00:01') {
        return new Promise((resolve, reject) => {
            const args = [
                '-i', inputPath,
                '-ss', timeOffset,
                '-vframes', '1',
                '-vf', `scale=${this.options.thumbnailSize}:${this.options.thumbnailSize}:force_original_aspect_ratio=increase,crop=${this.options.thumbnailSize}:${this.options.thumbnailSize}`,
                '-y',
                outputPath
            ];

            const ffmpegProcess = spawn(ffmpeg, args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        thumbnailPath: outputPath,
                        timeOffset: timeOffset
                    });
                } else {
                    reject(new Error(`Video thumbnail generation failed: ${stderr}`));
                }
            });

            ffmpegProcess.on('error', (error) => {
                reject(new Error(`FFmpeg error: ${error.message}`));
            });
        });
    }

    // Audio processing
    async processAudio(inputPath, outputPath, options = {}) {
        return new Promise((resolve, reject) => {
            const settings = { ...this.audioSettings, ...options };
            
            const args = [
                '-i', inputPath,
                '-c:a', settings.codec,
                '-b:a', settings.bitrate,
                '-ar', settings.sampleRate.toString(),
                '-y',
                outputPath
            ];

            const ffmpegProcess = spawn(ffmpeg, args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        outputPath: outputPath,
                        settings: settings
                    });
                } else {
                    reject(new Error(`Audio processing failed: ${stderr}`));
                }
            });

            ffmpegProcess.on('error', (error) => {
                reject(new Error(`FFmpeg error: ${error.message}`));
            });
        });
    }

    // Get media information
    async getMediaInfo(filePath) {
        return new Promise((resolve, reject) => {
            const args = [
                '-i', filePath,
                '-f', 'null',
                '-'
            ];

            const ffmpegProcess = spawn(ffmpeg, args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', () => {
                try {
                    const info = this.parseMediaInfo(stderr);
                    resolve(info);
                } catch (error) {
                    reject(new Error(`Failed to parse media info: ${error.message}`));
                }
            });

            ffmpegProcess.on('error', (error) => {
                reject(new Error(`FFmpeg error: ${error.message}`));
            });
        });
    }

    // Parse media information from FFmpeg output
    parseMediaInfo(ffmpegOutput) {
        const info = {
            duration: null,
            bitrate: null,
            video: null,
            audio: null,
            format: null
        };

        // Extract duration
        const durationMatch = ffmpegOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
            const hours = parseInt(durationMatch[1]);
            const minutes = parseInt(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            info.duration = hours * 3600 + minutes * 60 + seconds;
        }

        // Extract bitrate
        const bitrateMatch = ffmpegOutput.match(/bitrate: (\d+) kb\/s/);
        if (bitrateMatch) {
            info.bitrate = parseInt(bitrateMatch[1]);
        }

        // Extract video info
        const videoMatch = ffmpegOutput.match(/Video: ([^,]+), ([^,]+), (\d+x\d+)/);
        if (videoMatch) {
            info.video = {
                codec: videoMatch[1],
                pixelFormat: videoMatch[2],
                resolution: videoMatch[3]
            };
        }

        // Extract audio info
        const audioMatch = ffmpegOutput.match(/Audio: ([^,]+), (\d+) Hz/);
        if (audioMatch) {
            info.audio = {
                codec: audioMatch[1],
                sampleRate: parseInt(audioMatch[2])
            };
        }

        return info;
    }

    // Convert image format
    async convertImageFormat(inputBuffer, targetFormat) {
        try {
            let processor = sharp(inputBuffer);

            switch (targetFormat.toLowerCase()) {
                case 'jpeg':
                case 'jpg':
                    processor = processor.jpeg(this.imageSettings.jpeg);
                    break;
                case 'png':
                    processor = processor.png(this.imageSettings.png);
                    break;
                case 'webp':
                    processor = processor.webp(this.imageSettings.webp);
                    break;
                default:
                    throw new Error(`Unsupported target format: ${targetFormat}`);
            }

            const convertedBuffer = await processor.toBuffer();
            
            return {
                buffer: convertedBuffer,
                format: targetFormat,
                size: convertedBuffer.length
            };
        } catch (error) {
            throw new Error(`Format conversion failed: ${error.message}`);
        }
    }

    // Validate media file
    async validateMedia(filePath, type) {
        try {
            const stats = await fs.stat(filePath);
            const fileSize = stats.size;
            const extension = path.extname(filePath).toLowerCase().substring(1);

            let maxSize, supportedFormats;

            switch (type) {
                case 'image':
                    maxSize = this.options.maxImageSize;
                    supportedFormats = this.options.supportedImageFormats;
                    break;
                case 'video':
                    maxSize = this.options.maxVideoSize;
                    supportedFormats = this.options.supportedVideoFormats;
                    break;
                case 'audio':
                    maxSize = this.options.maxAudioSize;
                    supportedFormats = this.options.supportedAudioFormats;
                    break;
                default:
                    throw new Error(`Unsupported media type: ${type}`);
            }

            // Check file size
            if (fileSize > maxSize) {
                return {
                    valid: false,
                    error: `File size (${fileSize}) exceeds maximum allowed size (${maxSize})`
                };
            }

            // Check format
            if (!supportedFormats.includes(extension)) {
                return {
                    valid: false,
                    error: `Unsupported format: ${extension}. Supported formats: ${supportedFormats.join(', ')}`
                };
            }

            return {
                valid: true,
                fileSize: fileSize,
                format: extension
            };
        } catch (error) {
            return {
                valid: false,
                error: `Validation failed: ${error.message}`
            };
        }
    }

    // Optimize media for WhatsApp
    async optimizeForWhatsApp(inputPath, type, options = {}) {
        try {
            const validation = await this.validateMedia(inputPath, type);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const outputDir = options.outputDir || path.dirname(inputPath);
            const filename = path.basename(inputPath, path.extname(inputPath));
            
            let result;

            switch (type) {
                case 'image':
                    const imageBuffer = await fs.readFile(inputPath);
                    const processedImage = await this.processImage(imageBuffer, {
                        maxWidth: 1600,
                        maxHeight: 1600
                    });
                    
                    const outputImagePath = path.join(outputDir, `${filename}_optimized.jpg`);
                    await fs.writeFile(outputImagePath, processedImage.buffer);
                    
                    result = {
                        type: 'image',
                        originalPath: inputPath,
                        optimizedPath: outputImagePath,
                        originalSize: validation.fileSize,
                        optimizedSize: processedImage.size,
                        compressionRatio: (1 - processedImage.size / validation.fileSize) * 100
                    };
                    break;

                case 'video':
                    const outputVideoPath = path.join(outputDir, `${filename}_optimized.mp4`);
                    await this.processVideo(inputPath, outputVideoPath, {
                        crf: 28,
                        maxrate: '500k',
                        bufsize: '1M'
                    });
                    
                    const videoStats = await fs.stat(outputVideoPath);
                    result = {
                        type: 'video',
                        originalPath: inputPath,
                        optimizedPath: outputVideoPath,
                        originalSize: validation.fileSize,
                        optimizedSize: videoStats.size,
                        compressionRatio: (1 - videoStats.size / validation.fileSize) * 100
                    };
                    break;

                case 'audio':
                    const outputAudioPath = path.join(outputDir, `${filename}_optimized.aac`);
                    await this.processAudio(inputPath, outputAudioPath, {
                        bitrate: '64k'
                    });
                    
                    const audioStats = await fs.stat(outputAudioPath);
                    result = {
                        type: 'audio',
                        originalPath: inputPath,
                        optimizedPath: outputAudioPath,
                        originalSize: validation.fileSize,
                        optimizedSize: audioStats.size,
                        compressionRatio: (1 - audioStats.size / validation.fileSize) * 100
                    };
                    break;

                default:
                    throw new Error(`Unsupported media type: ${type}`);
            }

            return result;
        } catch (error) {
            throw new Error(`WhatsApp optimization failed: ${error.message}`);
        }
    }
}

module.exports = WAMediaProcessor;