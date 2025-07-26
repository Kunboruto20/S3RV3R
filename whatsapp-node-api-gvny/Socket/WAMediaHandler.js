const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const fetch = require('node-fetch');

class WAMediaHandler {
    constructor(socket) {
        this.socket = socket;
        this.mediaCache = new Map();
        this.uploadQueue = [];
        this.downloadQueue = [];
        this.isProcessing = false;
        
        // Media types
        this.mediaTypes = {
            IMAGE: 'image',
            VIDEO: 'video',
            AUDIO: 'audio',
            DOCUMENT: 'document',
            STICKER: 'sticker'
        };
        
        // Supported mime types
        this.supportedMimeTypes = {
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            video: ['video/mp4', 'video/3gpp', 'video/quicktime', 'video/avi'],
            audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/mp4'],
            document: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            sticker: ['image/webp']
        };
        
        // Upload endpoints
        this.uploadEndpoints = {
            image: 'https://mmg.whatsapp.net/v/t62.7118-24/',
            video: 'https://mmg.whatsapp.net/v/t62.7161-24/',
            audio: 'https://mmg.whatsapp.net/v/t62.7114-24/',
            document: 'https://mmg.whatsapp.net/v/t62.7119-24/',
            sticker: 'https://mmg.whatsapp.net/v/t62.15575-24/'
        };
        
        // Max file sizes (in bytes)
        this.maxFileSizes = {
            image: 16 * 1024 * 1024, // 16MB
            video: 64 * 1024 * 1024, // 64MB
            audio: 16 * 1024 * 1024, // 16MB
            document: 100 * 1024 * 1024, // 100MB
            sticker: 1 * 1024 * 1024 // 1MB
        };
    }
    
    async uploadMedia(media, mediaType, options = {}) {
        try {
            // Validate media type
            if (!this.mediaTypes[mediaType.toUpperCase()]) {
                throw new Error(`Unsupported media type: ${mediaType}`);
            }
            
            const type = mediaType.toLowerCase();
            
            // Process media input
            const mediaData = await this.processMediaInput(media, type);
            
            // Validate file size
            if (mediaData.size > this.maxFileSizes[type]) {
                throw new Error(`File size exceeds limit for ${type}: ${mediaData.size} > ${this.maxFileSizes[type]}`);
            }
            
            // Validate mime type
            if (!this.supportedMimeTypes[type].includes(mediaData.mimetype)) {
                throw new Error(`Unsupported mime type for ${type}: ${mediaData.mimetype}`);
            }
            
            // Generate media key and encrypt
            const mediaKey = crypto.randomBytes(32);
            const encryptedMedia = await this.encryptMedia(mediaData.data, mediaKey);
            
            // Generate file hashes
            const fileSha256 = crypto.createHash('sha256').update(mediaData.data).digest();
            const fileEncSha256 = crypto.createHash('sha256').update(encryptedMedia).digest();
            
            // Upload to WhatsApp servers
            const uploadResult = await this.uploadToServer(encryptedMedia, type, {
                fileSha256: fileSha256.toString('base64'),
                fileEncSha256: fileEncSha256.toString('base64'),
                mediaKey: mediaKey.toString('base64'),
                mimetype: mediaData.mimetype,
                fileLength: encryptedMedia.length
            });
            
            // Generate thumbnail if needed
            const thumbnail = await this.generateThumbnail(mediaData.data, type);
            
            // Prepare upload result
            const result = {
                url: uploadResult.url,
                directPath: uploadResult.directPath,
                mediaKey: mediaKey.toString('base64'),
                mediaKeyTimestamp: Date.now(),
                fileSha256: fileSha256.toString('base64'),
                fileEncSha256: fileEncSha256.toString('base64'),
                fileLength: encryptedMedia.length,
                mimetype: mediaData.mimetype,
                jpegThumbnail: thumbnail ? thumbnail.toString('base64') : null,
                ...mediaData.metadata
            };
            
            // Cache result
            this.mediaCache.set(uploadResult.directPath, result);
            
            return result;
            
        } catch (error) {
            throw new Error(`Failed to upload media: ${error.message}`);
        }
    }
    
    async downloadMedia(messageMedia, options = {}) {
        try {
            const { url, directPath, mediaKey, fileEncSha256, mimetype } = messageMedia;
            
            if (!url && !directPath) {
                throw new Error('No download URL or direct path provided');
            }
            
            // Check cache first
            if (this.mediaCache.has(directPath)) {
                const cached = this.mediaCache.get(directPath);
                if (cached.decryptedData) {
                    return cached.decryptedData;
                }
            }
            
            // Download encrypted media
            const downloadUrl = url || `${this.getDownloadBaseUrl(mimetype)}${directPath}`;
            const encryptedData = await this.downloadFromServer(downloadUrl);
            
            // Verify file hash
            const downloadedHash = crypto.createHash('sha256').update(encryptedData).digest('base64');
            if (downloadedHash !== fileEncSha256) {
                throw new Error('Downloaded file hash mismatch');
            }
            
            // Decrypt media
            const mediaKeyBuffer = Buffer.from(mediaKey, 'base64');
            const decryptedData = await this.decryptMedia(encryptedData, mediaKeyBuffer);
            
            // Cache decrypted data
            if (this.mediaCache.has(directPath)) {
                this.mediaCache.get(directPath).decryptedData = decryptedData;
            } else {
                this.mediaCache.set(directPath, { decryptedData });
            }
            
            return decryptedData;
            
        } catch (error) {
            throw new Error(`Failed to download media: ${error.message}`);
        }
    }
    
    async processMediaInput(media, type) {
        try {
            let data, mimetype, metadata = {};
            
            if (Buffer.isBuffer(media)) {
                // Buffer input
                data = media;
                mimetype = this.detectMimeType(data, type);
            } else if (typeof media === 'string') {
                if (media.startsWith('data:')) {
                    // Data URL
                    const matches = media.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matches) {
                        throw new Error('Invalid data URL format');
                    }
                    mimetype = matches[1];
                    data = Buffer.from(matches[2], 'base64');
                } else if (fs.existsSync(media)) {
                    // File path
                    data = fs.readFileSync(media);
                    mimetype = this.detectMimeType(data, type);
                    metadata.fileName = path.basename(media);
                } else {
                    // URL
                    const response = await fetch(media);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch media from URL: ${response.statusText}`);
                    }
                    data = Buffer.from(await response.arrayBuffer());
                    mimetype = response.headers.get('content-type') || this.detectMimeType(data, type);
                }
            } else if (media && typeof media === 'object') {
                // Object with data and metadata
                if (media.data) {
                    data = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data);
                    mimetype = media.mimetype || this.detectMimeType(data, type);
                    metadata = { ...media };
                    delete metadata.data;
                    delete metadata.mimetype;
                } else {
                    throw new Error('Invalid media object: missing data property');
                }
            } else {
                throw new Error('Unsupported media input type');
            }
            
            // Extract additional metadata based on type
            if (type === 'image' || type === 'video') {
                const dimensions = await this.getMediaDimensions(data, type);
                if (dimensions) {
                    metadata.width = dimensions.width;
                    metadata.height = dimensions.height;
                }
            }
            
            if (type === 'video' || type === 'audio') {
                const duration = await this.getMediaDuration(data, type);
                if (duration) {
                    metadata.seconds = Math.floor(duration);
                }
            }
            
            if (type === 'audio') {
                const waveform = await this.generateWaveform(data);
                if (waveform) {
                    metadata.waveform = waveform;
                }
            }
            
            return {
                data,
                mimetype,
                size: data.length,
                metadata
            };
            
        } catch (error) {
            throw new Error(`Failed to process media input: ${error.message}`);
        }
    }
    
    async encryptMedia(data, mediaKey) {
        try {
            // Derive encryption keys
            const keys = await this.deriveMediaKeys(mediaKey);
            
            // Generate IV
            const iv = crypto.randomBytes(16);
            
            // Encrypt data
            const cipher = crypto.createCipherGCM('aes-256-gcm', keys.cipherKey);
            cipher.setIVLength(12);
            cipher.setAAD(keys.macKey);
            
            const encrypted = Buffer.concat([
                cipher.update(data),
                cipher.final()
            ]);
            
            const authTag = cipher.getAuthTag();
            
            // Combine IV + encrypted data + auth tag
            return Buffer.concat([iv.slice(0, 12), encrypted, authTag]);
            
        } catch (error) {
            throw new Error(`Failed to encrypt media: ${error.message}`);
        }
    }
    
    async decryptMedia(encryptedData, mediaKey) {
        try {
            // Derive decryption keys
            const keys = await this.deriveMediaKeys(mediaKey);
            
            // Extract components
            const iv = encryptedData.slice(0, 12);
            const authTag = encryptedData.slice(-16);
            const encrypted = encryptedData.slice(12, -16);
            
            // Decrypt data
            const decipher = crypto.createDecipherGCM('aes-256-gcm', keys.cipherKey);
            decipher.setIVLength(12);
            decipher.setAAD(keys.macKey);
            decipher.setAuthTag(authTag);
            
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);
            
            return decrypted;
            
        } catch (error) {
            throw new Error(`Failed to decrypt media: ${error.message}`);
        }
    }
    
    async deriveMediaKeys(mediaKey) {
        try {
            const expanded = crypto.hkdfSync('sha256', mediaKey, Buffer.alloc(0), 'WhatsApp Media Keys', 112);
            
            return {
                iv: expanded.slice(0, 16),
                cipherKey: expanded.slice(16, 48),
                macKey: expanded.slice(48, 80),
                refKey: expanded.slice(80, 112)
            };
            
        } catch (error) {
            throw new Error(`Failed to derive media keys: ${error.message}`);
        }
    }
    
    async uploadToServer(encryptedData, type, metadata) {
        try {
            const endpoint = this.uploadEndpoints[type];
            if (!endpoint) {
                throw new Error(`No upload endpoint for type: ${type}`);
            }
            
            // Generate upload parameters
            const uploadParams = await this.generateUploadParams(metadata);
            const uploadUrl = `${endpoint}${uploadParams.path}`;
            
            // Upload file
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'User-Agent': 'WhatsApp/2.2413.1',
                    'Accept': '*/*',
                    ...uploadParams.headers
                },
                body: encryptedData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            
            return {
                url: result.url,
                directPath: result.direct_path || uploadParams.path
            };
            
        } catch (error) {
            throw new Error(`Failed to upload to server: ${error.message}`);
        }
    }
    
    async downloadFromServer(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'WhatsApp/2.2413.1',
                    'Accept': '*/*'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }
            
            return Buffer.from(await response.arrayBuffer());
            
        } catch (error) {
            throw new Error(`Failed to download from server: ${error.message}`);
        }
    }
    
    async generateUploadParams(metadata) {
        try {
            const timestamp = Date.now();
            const random = crypto.randomBytes(8).toString('hex');
            const path = `${timestamp}_${random}`;
            
            const headers = {
                'X-WA-MediaKey': metadata.mediaKey,
                'X-WA-FileSha256': metadata.fileSha256,
                'X-WA-FileEncSha256': metadata.fileEncSha256,
                'X-WA-FileLength': metadata.fileLength.toString(),
                'X-WA-MimeType': metadata.mimetype
            };
            
            return { path, headers };
            
        } catch (error) {
            throw new Error(`Failed to generate upload params: ${error.message}`);
        }
    }
    
    detectMimeType(data, type) {
        try {
            // Check file signatures
            const signatures = {
                image: {
                    'image/jpeg': [0xFF, 0xD8, 0xFF],
                    'image/png': [0x89, 0x50, 0x4E, 0x47],
                    'image/gif': [0x47, 0x49, 0x46],
                    'image/webp': [0x52, 0x49, 0x46, 0x46]
                },
                video: {
                    'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
                    'video/3gpp': [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70]
                },
                audio: {
                    'audio/mpeg': [0xFF, 0xFB],
                    'audio/ogg': [0x4F, 0x67, 0x67, 0x53],
                    'audio/wav': [0x52, 0x49, 0x46, 0x46]
                }
            };
            
            const typeSignatures = signatures[type];
            if (typeSignatures) {
                for (const [mimetype, signature] of Object.entries(typeSignatures)) {
                    if (data.length >= signature.length) {
                        let match = true;
                        for (let i = 0; i < signature.length; i++) {
                            if (data[i] !== signature[i]) {
                                match = false;
                                break;
                            }
                        }
                        if (match) {
                            return mimetype;
                        }
                    }
                }
            }
            
            // Default mime types
            const defaults = {
                image: 'image/jpeg',
                video: 'video/mp4',
                audio: 'audio/mpeg',
                document: 'application/octet-stream',
                sticker: 'image/webp'
            };
            
            return defaults[type] || 'application/octet-stream';
            
        } catch (error) {
            return 'application/octet-stream';
        }
    }
    
    async getMediaDimensions(data, type) {
        try {
            // This is a simplified implementation
            // In a real implementation, you would use libraries like sharp or ffprobe
            
            if (type === 'image') {
                // Basic PNG dimension detection
                if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
                    const width = data.readUInt32BE(16);
                    const height = data.readUInt32BE(20);
                    return { width, height };
                }
                
                // Basic JPEG dimension detection would be more complex
                // For now, return default dimensions
                return { width: 640, height: 480 };
            }
            
            if (type === 'video') {
                // Video dimension detection would require parsing video metadata
                // For now, return default dimensions
                return { width: 640, height: 480 };
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    async getMediaDuration(data, type) {
        try {
            // This is a simplified implementation
            // In a real implementation, you would use libraries like ffprobe
            
            if (type === 'audio' || type === 'video') {
                // For now, return a default duration
                // Real implementation would parse media metadata
                return 30; // 30 seconds
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    async generateWaveform(audioData) {
        try {
            // This is a simplified implementation
            // In a real implementation, you would analyze the audio data
            
            const waveform = [];
            const samples = 64; // Standard WhatsApp waveform has 64 samples
            
            for (let i = 0; i < samples; i++) {
                // Generate random waveform data for demo
                waveform.push(Math.floor(Math.random() * 100));
            }
            
            return Buffer.from(waveform);
            
        } catch (error) {
            return null;
        }
    }
    
    async generateThumbnail(data, type) {
        try {
            if (type === 'image') {
                // For images, we could generate a smaller version
                // For now, just return the first part of the image as thumbnail
                return data.slice(0, Math.min(data.length, 20000));
            }
            
            if (type === 'video') {
                // For videos, we would extract a frame
                // For now, return null
                return null;
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }
    
    getDownloadBaseUrl(mimetype) {
        if (mimetype.startsWith('image/')) {
            return 'https://mmg.whatsapp.net';
        } else if (mimetype.startsWith('video/')) {
            return 'https://mmg.whatsapp.net';
        } else if (mimetype.startsWith('audio/')) {
            return 'https://mmg.whatsapp.net';
        } else {
            return 'https://mmg.whatsapp.net';
        }
    }
    
    async saveMediaToFile(mediaData, filePath) {
        try {
            fs.writeFileSync(filePath, mediaData);
            return filePath;
        } catch (error) {
            throw new Error(`Failed to save media to file: ${error.message}`);
        }
    }
    
    clearCache() {
        this.mediaCache.clear();
    }
    
    getCacheSize() {
        return this.mediaCache.size;
    }
    
    getCacheKeys() {
        return Array.from(this.mediaCache.keys());
    }
}

module.exports = WAMediaHandler;