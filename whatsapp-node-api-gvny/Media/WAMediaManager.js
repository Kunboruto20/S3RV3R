const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const sharp = require('sharp');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const FormData = require('form-data');

/**
 * WhatsApp Media Manager
 * Handles all media operations including upload, download, processing, and encryption
 */
class WAMediaManager {
    constructor(options = {}) {
        this.options = {
            mediaPath: options.mediaPath || './wa_media',
            maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
            thumbnailSize: options.thumbnailSize || 200,
            imageQuality: options.imageQuality || 80,
            videoQuality: options.videoQuality || 'medium',
            audioQuality: options.audioQuality || 128, // kbps
            ffmpegPath: options.ffmpegPath || ffmpeg,
            ...options
        };

        this.supportedFormats = {
            image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
            video: ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'flv'],
            audio: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus'],
            document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar']
        };

        this.mimeTypes = {
            // Images
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            
            // Videos
            'mp4': 'video/mp4',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska',
            'webm': 'video/webm',
            '3gp': 'video/3gpp',
            'flv': 'video/x-flv',
            
            // Audio
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'aac': 'audio/aac',
            'flac': 'audio/flac',
            'm4a': 'audio/mp4',
            'opus': 'audio/opus',
            
            // Documents
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };

        this.initialize();
    }

    async initialize() {
        try {
            await fs.mkdir(this.options.mediaPath, { recursive: true });
            await fs.mkdir(path.join(this.options.mediaPath, 'temp'), { recursive: true });
            await fs.mkdir(path.join(this.options.mediaPath, 'thumbnails'), { recursive: true });
            await fs.mkdir(path.join(this.options.mediaPath, 'processed'), { recursive: true });
        } catch (error) {
            console.error('Failed to initialize media directories:', error);
        }
    }

    // Media validation
    validateMedia(filePath, mediaType) {
        const extension = path.extname(filePath).toLowerCase().substring(1);
        const supportedExts = this.supportedFormats[mediaType] || [];
        
        if (!supportedExts.includes(extension)) {
            throw new Error(`Unsupported ${mediaType} format: ${extension}`);
        }

        return {
            extension,
            mimeType: this.mimeTypes[extension] || 'application/octet-stream'
        };
    }

    // Get media info
    async getMediaInfo(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const extension = path.extname(filePath).toLowerCase().substring(1);
            const mediaType = this.getMediaType(extension);
            
            let info = {
                size: stats.size,
                extension,
                mediaType,
                mimeType: this.mimeTypes[extension] || 'application/octet-stream',
                lastModified: stats.mtime
            };

            // Get specific info based on media type
            switch (mediaType) {
                case 'image':
                    info = { ...info, ...(await this.getImageInfo(filePath)) };
                    break;
                case 'video':
                    info = { ...info, ...(await this.getVideoInfo(filePath)) };
                    break;
                case 'audio':
                    info = { ...info, ...(await this.getAudioInfo(filePath)) };
                    break;
            }

            return info;
        } catch (error) {
            throw new Error(`Failed to get media info: ${error.message}`);
        }
    }

    // Get image information
    async getImageInfo(filePath) {
        try {
            const metadata = await sharp(filePath).metadata();
            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                hasAlpha: metadata.hasAlpha,
                density: metadata.density
            };
        } catch (error) {
            throw new Error(`Failed to get image info: ${error.message}`);
        }
    }

    // Get video information
    async getVideoInfo(filePath) {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ]);

            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('ffprobe failed'));
                    return;
                }

                try {
                    const info = JSON.parse(output);
                    const videoStream = info.streams.find(s => s.codec_type === 'video');
                    const audioStream = info.streams.find(s => s.codec_type === 'audio');

                    resolve({
                        duration: parseFloat(info.format.duration),
                        bitrate: parseInt(info.format.bit_rate),
                        width: videoStream?.width,
                        height: videoStream?.height,
                        fps: videoStream ? eval(videoStream.r_frame_rate) : null,
                        videoCodec: videoStream?.codec_name,
                        audioCodec: audioStream?.codec_name,
                        hasAudio: !!audioStream,
                        hasVideo: !!videoStream
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse video info: ${error.message}`));
                }
            });

            ffprobe.on('error', reject);
        });
    }

    // Get audio information
    async getAudioInfo(filePath) {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ]);

            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error('ffprobe failed'));
                    return;
                }

                try {
                    const info = JSON.parse(output);
                    const audioStream = info.streams.find(s => s.codec_type === 'audio');

                    resolve({
                        duration: parseFloat(info.format.duration),
                        bitrate: parseInt(info.format.bit_rate),
                        codec: audioStream?.codec_name,
                        sampleRate: audioStream?.sample_rate,
                        channels: audioStream?.channels
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse audio info: ${error.message}`));
                }
            });

            ffprobe.on('error', reject);
        });
    }

    // Generate thumbnail
    async generateThumbnail(filePath, mediaType) {
        const thumbnailPath = path.join(
            this.options.mediaPath,
            'thumbnails',
            `${crypto.randomUUID()}.jpg`
        );

        try {
            switch (mediaType) {
                case 'image':
                    await sharp(filePath)
                        .resize(this.options.thumbnailSize, this.options.thumbnailSize, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: this.options.imageQuality })
                        .toFile(thumbnailPath);
                    break;

                case 'video':
                    await this.generateVideoThumbnail(filePath, thumbnailPath);
                    break;

                default:
                    return null;
            }

            return await fs.readFile(thumbnailPath);
        } catch (error) {
            throw new Error(`Failed to generate thumbnail: ${error.message}`);
        } finally {
            // Cleanup thumbnail file
            try {
                await fs.unlink(thumbnailPath);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    // Generate video thumbnail
    async generateVideoThumbnail(videoPath, thumbnailPath) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.options.ffmpegPath, [
                '-i', videoPath,
                '-ss', '00:00:01',
                '-vframes', '1',
                '-vf', `scale=${this.options.thumbnailSize}:${this.options.thumbnailSize}:force_original_aspect_ratio=decrease`,
                '-y',
                thumbnailPath
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('FFmpeg thumbnail generation failed'));
                }
            });

            ffmpeg.on('error', reject);
        });
    }

    // Process image
    async processImage(inputPath, options = {}) {
        const outputPath = path.join(
            this.options.mediaPath,
            'processed',
            `${crypto.randomUUID()}.jpg`
        );

        try {
            let processor = sharp(inputPath);

            // Resize if specified
            if (options.width || options.height) {
                processor = processor.resize(options.width, options.height, {
                    fit: options.fit || 'inside',
                    withoutEnlargement: true
                });
            }

            // Convert to JPEG with quality
            processor = processor.jpeg({ 
                quality: options.quality || this.options.imageQuality 
            });

            await processor.toFile(outputPath);
            return await fs.readFile(outputPath);
        } catch (error) {
            throw new Error(`Failed to process image: ${error.message}`);
        } finally {
            // Cleanup processed file
            try {
                await fs.unlink(outputPath);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    // Process video
    async processVideo(inputPath, options = {}) {
        const outputPath = path.join(
            this.options.mediaPath,
            'processed',
            `${crypto.randomUUID()}.mp4`
        );

        return new Promise((resolve, reject) => {
            const args = [
                '-i', inputPath,
                '-c:v', 'libx264',
                '-preset', options.preset || 'medium',
                '-crf', options.crf || '23',
                '-c:a', 'aac',
                '-b:a', `${options.audioBitrate || this.options.audioQuality}k`,
                '-movflags', '+faststart',
                '-y',
                outputPath
            ];

            // Add resolution if specified
            if (options.width && options.height) {
                args.splice(-2, 0, '-vf', `scale=${options.width}:${options.height}`);
            }

            const ffmpeg = spawn(this.options.ffmpegPath, args);

            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const processedData = await fs.readFile(outputPath);
                        await fs.unlink(outputPath); // Cleanup
                        resolve(processedData);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('FFmpeg video processing failed'));
                }
            });

            ffmpeg.on('error', reject);
        });
    }

    // Process audio
    async processAudio(inputPath, options = {}) {
        const outputPath = path.join(
            this.options.mediaPath,
            'processed',
            `${crypto.randomUUID()}.mp3`
        );

        return new Promise((resolve, reject) => {
            const args = [
                '-i', inputPath,
                '-c:a', 'mp3',
                '-b:a', `${options.bitrate || this.options.audioQuality}k`,
                '-y',
                outputPath
            ];

            const ffmpeg = spawn(this.options.ffmpegPath, args);

            ffmpeg.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const processedData = await fs.readFile(outputPath);
                        await fs.unlink(outputPath); // Cleanup
                        resolve(processedData);
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    reject(new Error('FFmpeg audio processing failed'));
                }
            });

            ffmpeg.on('error', reject);
        });
    }

    // Upload media to WhatsApp servers
    async uploadMedia(mediaData, mediaType, mimeType) {
        try {
            // Create form data
            const form = new FormData();
            form.append('file', mediaData, {
                filename: `media.${this.getExtensionFromMimeType(mimeType)}`,
                contentType: mimeType
            });

            // Upload to WhatsApp media servers
            const response = await fetch('https://mmg.whatsapp.net/v1/media', {
                method: 'POST',
                body: form,
                headers: {
                    'User-Agent': 'WhatsApp/2.2413.1 Mozilla/5.0',
                    ...form.getHeaders()
                }
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return {
                url: result.url,
                mediaKey: result.media_key,
                directPath: result.direct_path,
                fileEncSha256: result.file_enc_sha256,
                fileSha256: result.file_sha256,
                fileLength: mediaData.length
            };
        } catch (error) {
            throw new Error(`Failed to upload media: ${error.message}`);
        }
    }

    // Download media from WhatsApp servers
    async downloadMedia(mediaInfo) {
        try {
            const response = await fetch(mediaInfo.url, {
                headers: {
                    'User-Agent': 'WhatsApp/2.2413.1 Mozilla/5.0'
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }

            return await response.buffer();
        } catch (error) {
            throw new Error(`Failed to download media: ${error.message}`);
        }
    }

    // Create media message
    async createMediaMessage(filePath, mediaType, options = {}) {
        try {
            // Validate media
            const validation = this.validateMedia(filePath, mediaType);
            
            // Get media info
            const mediaInfo = await this.getMediaInfo(filePath);
            
            // Check file size
            if (mediaInfo.size > this.options.maxFileSize) {
                throw new Error(`File too large: ${mediaInfo.size} bytes (max: ${this.options.maxFileSize})`);
            }

            // Read media data
            let mediaData = await fs.readFile(filePath);
            
            // Process media if needed
            if (options.process) {
                switch (mediaType) {
                    case 'image':
                        mediaData = await this.processImage(filePath, options.processOptions);
                        break;
                    case 'video':
                        mediaData = await this.processVideo(filePath, options.processOptions);
                        break;
                    case 'audio':
                        mediaData = await this.processAudio(filePath, options.processOptions);
                        break;
                }
            }

            // Generate thumbnail
            let thumbnail = null;
            if (['image', 'video'].includes(mediaType)) {
                thumbnail = await this.generateThumbnail(filePath, mediaType);
            }

            // Upload media
            const uploadResult = await this.uploadMedia(mediaData, mediaType, validation.mimeType);

            // Create message object
            const message = {
                [`${mediaType}Message`]: {
                    url: uploadResult.url,
                    mediaKey: uploadResult.mediaKey,
                    mimetype: validation.mimeType,
                    fileEncSha256: uploadResult.fileEncSha256,
                    fileSha256: uploadResult.fileSha256,
                    fileLength: uploadResult.fileLength,
                    directPath: uploadResult.directPath,
                    ...mediaInfo
                }
            };

            // Add thumbnail if available
            if (thumbnail) {
                message[`${mediaType}Message`].jpegThumbnail = thumbnail;
            }

            // Add caption if provided
            if (options.caption) {
                message[`${mediaType}Message`].caption = options.caption;
            }

            return message;
        } catch (error) {
            throw new Error(`Failed to create media message: ${error.message}`);
        }
    }

    // Utility methods
    getMediaType(extension) {
        for (const [type, extensions] of Object.entries(this.supportedFormats)) {
            if (extensions.includes(extension)) {
                return type;
            }
        }
        return 'document';
    }

    getExtensionFromMimeType(mimeType) {
        for (const [ext, mime] of Object.entries(this.mimeTypes)) {
            if (mime === mimeType) {
                return ext;
            }
        }
        return 'bin';
    }

    // Generate media hash
    generateMediaHash(mediaData) {
        return crypto.createHash('sha256').update(mediaData).digest();
    }

    // Cleanup temporary files
    async cleanup() {
        try {
            const tempDir = path.join(this.options.mediaPath, 'temp');
            const files = await fs.readdir(tempDir);
            
            for (const file of files) {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                
                // Delete files older than 1 hour
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }

    // Get supported formats
    getSupportedFormats() {
        return this.supportedFormats;
    }

    // Get MIME types
    getMimeTypes() {
        return this.mimeTypes;
    }
}

module.exports = WAMediaManager;