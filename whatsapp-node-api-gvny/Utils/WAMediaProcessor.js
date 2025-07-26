const crypto = require('crypto');
const { Buffer } = require('buffer');
const fs = require('fs').promises;
const path = require('path');

class WAMediaProcessor {
    constructor(options = {}) {
        this.options = {
            maxImageSize: options.maxImageSize || 16 * 1024 * 1024, // 16MB
            maxVideoSize: options.maxVideoSize || 64 * 1024 * 1024, // 64MB
            maxAudioSize: options.maxAudioSize || 16 * 1024 * 1024, // 16MB
            maxDocumentSize: options.maxDocumentSize || 100 * 1024 * 1024, // 100MB
            maxStickerSize: options.maxStickerSize || 500 * 1024, // 500KB
            enableThumbnails: options.enableThumbnails !== false,
            thumbnailSize: options.thumbnailSize || { width: 320, height: 320 },
            enableCompression: options.enableCompression !== false,
            compressionQuality: options.compressionQuality || 0.8,
            tempDir: options.tempDir || './temp',
            enableCaching: options.enableCaching !== false,
            cacheDir: options.cacheDir || './cache',
            maxCacheSize: options.maxCacheSize || 1024 * 1024 * 1024, // 1GB
            ...options
        };
        
        // Media type mappings
        this.mimeTypes = {
            // Images
            'image/jpeg': { ext: 'jpg', type: 'image', maxSize: this.options.maxImageSize },
            'image/jpg': { ext: 'jpg', type: 'image', maxSize: this.options.maxImageSize },
            'image/png': { ext: 'png', type: 'image', maxSize: this.options.maxImageSize },
            'image/gif': { ext: 'gif', type: 'image', maxSize: this.options.maxImageSize },
            'image/webp': { ext: 'webp', type: 'image', maxSize: this.options.maxImageSize },
            'image/bmp': { ext: 'bmp', type: 'image', maxSize: this.options.maxImageSize },
            'image/tiff': { ext: 'tiff', type: 'image', maxSize: this.options.maxImageSize },
            
            // Videos
            'video/mp4': { ext: 'mp4', type: 'video', maxSize: this.options.maxVideoSize },
            'video/avi': { ext: 'avi', type: 'video', maxSize: this.options.maxVideoSize },
            'video/mkv': { ext: 'mkv', type: 'video', maxSize: this.options.maxVideoSize },
            'video/mov': { ext: 'mov', type: 'video', maxSize: this.options.maxVideoSize },
            'video/wmv': { ext: 'wmv', type: 'video', maxSize: this.options.maxVideoSize },
            'video/flv': { ext: 'flv', type: 'video', maxSize: this.options.maxVideoSize },
            'video/webm': { ext: 'webm', type: 'video', maxSize: this.options.maxVideoSize },
            'video/3gp': { ext: '3gp', type: 'video', maxSize: this.options.maxVideoSize },
            
            // Audio
            'audio/mpeg': { ext: 'mp3', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/mp3': { ext: 'mp3', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/wav': { ext: 'wav', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/ogg': { ext: 'ogg', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/aac': { ext: 'aac', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/flac': { ext: 'flac', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/m4a': { ext: 'm4a', type: 'audio', maxSize: this.options.maxAudioSize },
            'audio/opus': { ext: 'opus', type: 'audio', maxSize: this.options.maxAudioSize },
            
            // Documents
            'application/pdf': { ext: 'pdf', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/msword': { ext: 'doc', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/vnd.ms-excel': { ext: 'xls', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/vnd.ms-powerpoint': { ext: 'ppt', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', type: 'document', maxSize: this.options.maxDocumentSize },
            'text/plain': { ext: 'txt', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/zip': { ext: 'zip', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/x-rar-compressed': { ext: 'rar', type: 'document', maxSize: this.options.maxDocumentSize },
            'application/x-7z-compressed': { ext: '7z', type: 'document', maxSize: this.options.maxDocumentSize }
        };
        
        // Cache for processed media
        this.mediaCache = new Map();
        this.cacheSize = 0;
        
        this.init();
    }
    
    async init() {
        // Ensure directories exist
        await this.ensureDirectories();
        
        // Load existing cache if enabled
        if (this.options.enableCaching) {
            await this.loadCache();
        }
    }
    
    async ensureDirectories() {
        try {
            await fs.mkdir(this.options.tempDir, { recursive: true });
            if (this.options.enableCaching) {
                await fs.mkdir(this.options.cacheDir, { recursive: true });
            }
        } catch (error) {
            // Directory might already exist
        }
    }
    
    // Process media based on input type
    async processMedia(input, options = {}) {
        try {
            const mediaData = await this.parseMediaInput(input);
            const mediaInfo = this.validateMedia(mediaData);
            
            const processedMedia = {
                ...mediaData,
                ...mediaInfo,
                processedAt: Date.now()
            };
            
            // Generate thumbnail if needed
            if (this.options.enableThumbnails && this.shouldGenerateThumbnail(mediaInfo.type)) {
                processedMedia.thumbnail = await this.generateThumbnail(mediaData.buffer, mediaInfo.type);
            }
            
            // Compress if needed
            if (this.options.enableCompression && this.shouldCompress(mediaInfo.type, mediaData.buffer.length)) {
                processedMedia.compressed = await this.compressMedia(mediaData.buffer, mediaInfo.type);
            }
            
            // Generate media key and encrypt
            processedMedia.mediaKey = this.generateMediaKey();
            processedMedia.encrypted = await this.encryptMedia(processedMedia.buffer, processedMedia.mediaKey);
            
            // Calculate hashes
            processedMedia.fileSha256 = this.calculateSha256(processedMedia.buffer);
            processedMedia.fileEncSha256 = this.calculateSha256(processedMedia.encrypted);
            
            // Cache if enabled
            if (this.options.enableCaching) {
                await this.cacheMedia(processedMedia);
            }
            
            return processedMedia;
            
        } catch (error) {
            throw new Error(`Media processing failed: ${error.message}`);
        }
    }
    
    // Parse different input types
    async parseMediaInput(input) {
        if (Buffer.isBuffer(input)) {
            return {
                buffer: input,
                source: 'buffer'
            };
        }
        
        if (typeof input === 'string') {
            if (input.startsWith('data:')) {
                return this.parseDataURL(input);
            } else if (input.startsWith('http://') || input.startsWith('https://')) {
                return this.downloadFromURL(input);
            } else {
                return this.readFromFile(input);
            }
        }
        
        if (input && typeof input === 'object') {
            if (input.buffer) {
                return {
                    buffer: Buffer.from(input.buffer),
                    filename: input.filename,
                    mimetype: input.mimetype,
                    source: 'object'
                };
            }
        }
        
        throw new Error('Invalid media input format');
    }
    
    // Parse data URL
    parseDataURL(dataURL) {
        const matches = dataURL.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid data URL format');
        }
        
        const mimetype = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        return {
            buffer,
            mimetype,
            source: 'dataURL'
        };
    }
    
    // Download from URL
    async downloadFromURL(url) {
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            const mimetype = response.headers.get('content-type');
            const filename = this.extractFilenameFromURL(url);
            
            return {
                buffer,
                mimetype,
                filename,
                source: 'url',
                url
            };
        } catch (error) {
            throw new Error(`Failed to download from URL: ${error.message}`);
        }
    }
    
    // Read from file
    async readFromFile(filePath) {
        try {
            const buffer = await fs.readFile(filePath);
            const mimetype = this.getMimeTypeFromExtension(path.extname(filePath));
            const filename = path.basename(filePath);
            
            return {
                buffer,
                mimetype,
                filename,
                source: 'file',
                filePath
            };
        } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }
    
    // Validate media
    validateMedia(mediaData) {
        const mimetype = mediaData.mimetype || this.detectMimeType(mediaData.buffer);
        const mediaInfo = this.mimeTypes[mimetype];
        
        if (!mediaInfo) {
            throw new Error(`Unsupported media type: ${mimetype}`);
        }
        
        if (mediaData.buffer.length > mediaInfo.maxSize) {
            throw new Error(`File too large: ${mediaData.buffer.length} bytes (max: ${mediaInfo.maxSize})`);
        }
        
        return {
            mimetype,
            type: mediaInfo.type,
            extension: mediaInfo.ext,
            fileLength: mediaData.buffer.length,
            filename: mediaData.filename || `media.${mediaInfo.ext}`
        };
    }
    
    // Detect MIME type from buffer
    detectMimeType(buffer) {
        // Basic magic number detection
        const header = buffer.slice(0, 12);
        
        // JPEG
        if (header[0] === 0xFF && header[1] === 0xD8) {
            return 'image/jpeg';
        }
        
        // PNG
        if (header.toString('hex', 0, 8) === '89504e470d0a1a0a') {
            return 'image/png';
        }
        
        // GIF
        if (header.toString('ascii', 0, 6) === 'GIF87a' || header.toString('ascii', 0, 6) === 'GIF89a') {
            return 'image/gif';
        }
        
        // WebP
        if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') {
            return 'image/webp';
        }
        
        // MP4
        if (header.toString('ascii', 4, 8) === 'ftyp') {
            return 'video/mp4';
        }
        
        // PDF
        if (header.toString('ascii', 0, 4) === '%PDF') {
            return 'application/pdf';
        }
        
        // Default to binary
        return 'application/octet-stream';
    }
    
    // Get MIME type from file extension
    getMimeTypeFromExtension(ext) {
        const extension = ext.toLowerCase().replace('.', '');
        
        for (const [mimetype, info] of Object.entries(this.mimeTypes)) {
            if (info.ext === extension) {
                return mimetype;
            }
        }
        
        return 'application/octet-stream';
    }
    
    // Generate thumbnail
    async generateThumbnail(buffer, mediaType) {
        try {
            if (mediaType !== 'image' && mediaType !== 'video') {
                return null;
            }
            
            // For now, return a placeholder thumbnail
            // In a real implementation, you would use libraries like sharp for images
            // or ffmpeg for video thumbnails
            
            const thumbnailData = {
                buffer: this.generatePlaceholderThumbnail(),
                width: this.options.thumbnailSize.width,
                height: this.options.thumbnailSize.height,
                mimetype: 'image/jpeg'
            };
            
            return thumbnailData;
            
        } catch (error) {
            console.warn(`Thumbnail generation failed: ${error.message}`);
            return null;
        }
    }
    
    // Generate placeholder thumbnail
    generatePlaceholderThumbnail() {
        // Generate a simple colored rectangle as placeholder
        const width = this.options.thumbnailSize.width;
        const height = this.options.thumbnailSize.height;
        
        // Create a minimal JPEG header + data
        const jpegHeader = Buffer.from([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43
        ]);
        
        const jpegFooter = Buffer.from([0xFF, 0xD9]);
        
        // Simple placeholder data
        const placeholderData = Buffer.alloc(100, 0x80);
        
        return Buffer.concat([jpegHeader, placeholderData, jpegFooter]);
    }
    
    // Compress media
    async compressMedia(buffer, mediaType) {
        try {
            if (mediaType === 'image') {
                return this.compressImage(buffer);
            } else if (mediaType === 'video') {
                return this.compressVideo(buffer);
            } else if (mediaType === 'audio') {
                return this.compressAudio(buffer);
            }
            
            return buffer; // No compression for other types
            
        } catch (error) {
            console.warn(`Media compression failed: ${error.message}`);
            return buffer; // Return original on failure
        }
    }
    
    // Compress image (placeholder implementation)
    compressImage(buffer) {
        // In a real implementation, you would use libraries like sharp
        // For now, return the original buffer
        return buffer;
    }
    
    // Compress video (placeholder implementation)
    compressVideo(buffer) {
        // In a real implementation, you would use ffmpeg
        // For now, return the original buffer
        return buffer;
    }
    
    // Compress audio (placeholder implementation)
    compressAudio(buffer) {
        // In a real implementation, you would use audio compression libraries
        // For now, return the original buffer
        return buffer;
    }
    
    // Check if thumbnail should be generated
    shouldGenerateThumbnail(mediaType) {
        return mediaType === 'image' || mediaType === 'video';
    }
    
    // Check if media should be compressed
    shouldCompress(mediaType, fileSize) {
        const compressionThresholds = {
            image: 1024 * 1024, // 1MB
            video: 10 * 1024 * 1024, // 10MB
            audio: 5 * 1024 * 1024 // 5MB
        };
        
        const threshold = compressionThresholds[mediaType];
        return threshold && fileSize > threshold;
    }
    
    // Generate media key
    generateMediaKey() {
        return crypto.randomBytes(32);
    }
    
    // Encrypt media
    async encryptMedia(buffer, mediaKey) {
        try {
            // Derive encryption keys
            const keys = this.deriveMediaKeys(mediaKey);
            
            // Encrypt with AES-256-CBC
            const cipher = crypto.createCipher('aes-256-cbc', keys.cipherKey, keys.iv);
            let encrypted = cipher.update(buffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Calculate MAC
            const mac = crypto.createHmac('sha256', keys.macKey).update(encrypted).digest();
            
            return Buffer.concat([encrypted, mac.slice(0, 10)]);
            
        } catch (error) {
            throw new Error(`Media encryption failed: ${error.message}`);
        }
    }
    
    // Decrypt media
    async decryptMedia(encryptedBuffer, mediaKey) {
        try {
            // Extract encrypted data and MAC
            const encrypted = encryptedBuffer.slice(0, -10);
            const mac = encryptedBuffer.slice(-10);
            
            // Derive encryption keys
            const keys = this.deriveMediaKeys(mediaKey);
            
            // Verify MAC
            const expectedMac = crypto.createHmac('sha256', keys.macKey).update(encrypted).digest().slice(0, 10);
            if (!crypto.timingSafeEqual(mac, expectedMac)) {
                throw new Error('MAC verification failed');
            }
            
            // Decrypt
            const decipher = crypto.createDecipher('aes-256-cbc', keys.cipherKey, keys.iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            return decrypted;
            
        } catch (error) {
            throw new Error(`Media decryption failed: ${error.message}`);
        }
    }
    
    // Derive media encryption keys
    deriveMediaKeys(mediaKey) {
        const encInfo = Buffer.from('WhatsApp Media Keys');
        const macInfo = Buffer.from('WhatsApp Media MAC');
        const ivInfo = Buffer.from('WhatsApp Media IV');
        
        return {
            cipherKey: this.hkdf(mediaKey, Buffer.alloc(32), encInfo, 32),
            macKey: this.hkdf(mediaKey, Buffer.alloc(32), macInfo, 32),
            iv: this.hkdf(mediaKey, Buffer.alloc(32), ivInfo, 16)
        };
    }
    
    // HKDF implementation
    hkdf(ikm, salt, info, length) {
        // HKDF Extract
        const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
        
        // HKDF Expand
        const hashLength = 32; // SHA-256 output length
        const n = Math.ceil(length / hashLength);
        
        let t = Buffer.alloc(0);
        let okm = Buffer.alloc(0);
        
        for (let i = 1; i <= n; i++) {
            const hmac = crypto.createHmac('sha256', prk);
            hmac.update(t);
            hmac.update(info);
            hmac.update(Buffer.from([i]));
            t = hmac.digest();
            okm = Buffer.concat([okm, t]);
        }
        
        return okm.slice(0, length);
    }
    
    // Calculate SHA-256 hash
    calculateSha256(buffer) {
        return crypto.createHash('sha256').update(buffer).digest();
    }
    
    // Extract filename from URL
    extractFilenameFromURL(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            return path.basename(pathname) || 'download';
        } catch (error) {
            return 'download';
        }
    }
    
    // Cache management
    async cacheMedia(mediaData) {
        if (!this.options.enableCaching) {
            return;
        }
        
        const cacheKey = this.generateCacheKey(mediaData);
        const cacheSize = mediaData.buffer.length;
        
        // Check cache size limit
        if (this.cacheSize + cacheSize > this.options.maxCacheSize) {
            await this.evictCache(cacheSize);
        }
        
        this.mediaCache.set(cacheKey, {
            data: mediaData,
            size: cacheSize,
            timestamp: Date.now()
        });
        
        this.cacheSize += cacheSize;
    }
    
    // Generate cache key
    generateCacheKey(mediaData) {
        const hash = crypto.createHash('sha256');
        hash.update(mediaData.buffer);
        return hash.digest('hex');
    }
    
    // Evict cache entries
    async evictCache(requiredSize) {
        // Sort by timestamp (oldest first)
        const entries = Array.from(this.mediaCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        let freedSize = 0;
        for (const [key, entry] of entries) {
            this.mediaCache.delete(key);
            this.cacheSize -= entry.size;
            freedSize += entry.size;
            
            if (freedSize >= requiredSize) {
                break;
            }
        }
    }
    
    // Load cache from disk
    async loadCache() {
        // Implementation would load cached media from disk
        // For now, start with empty cache
    }
    
    // Get media info
    getMediaInfo(buffer, mimetype = null) {
        const detectedMimetype = mimetype || this.detectMimeType(buffer);
        const mediaInfo = this.mimeTypes[detectedMimetype];
        
        if (!mediaInfo) {
            throw new Error(`Unsupported media type: ${detectedMimetype}`);
        }
        
        return {
            mimetype: detectedMimetype,
            type: mediaInfo.type,
            extension: mediaInfo.ext,
            fileLength: buffer.length,
            maxSize: mediaInfo.maxSize
        };
    }
    
    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Get processing stats
    getStats() {
        return {
            cacheSize: this.cacheSize,
            cachedItems: this.mediaCache.size,
            maxCacheSize: this.options.maxCacheSize,
            supportedTypes: Object.keys(this.mimeTypes).length,
            options: { ...this.options }
        };
    }
    
    // Cleanup
    async cleanup() {
        this.mediaCache.clear();
        this.cacheSize = 0;
        
        // Clean up temp files
        try {
            const tempFiles = await fs.readdir(this.options.tempDir);
            for (const file of tempFiles) {
                await fs.unlink(path.join(this.options.tempDir, file));
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}

module.exports = WAMediaProcessor;