class WAMediaDefaults {
    static getDefaults() {
        return {
            // General media settings
            enableMediaUpload: true,
            enableMediaDownload: true,
            enableMediaPreview: true,
            enableMediaCompression: true,
            enableMediaEncryption: true,
            enableMediaCaching: true,
            enableProgressTracking: true,
            
            // Upload settings
            upload: {
                maxConcurrentUploads: 3,
                chunkSize: 64 * 1024, // 64KB
                timeout: 120000, // 2 minutes
                retries: 2,
                retryDelay: 5000,
                enableResumable: true,
                resumeChunkSize: 256 * 1024, // 256KB
                enableChecksumValidation: true,
                checksumAlgorithm: 'sha256'
            },
            
            // Download settings
            download: {
                maxConcurrentDownloads: 5,
                chunkSize: 64 * 1024, // 64KB
                timeout: 60000, // 1 minute
                retries: 3,
                retryDelay: 3000,
                enableResumable: true,
                enableRangeRequests: true,
                enableChecksumValidation: true
            },
            
            // Image settings
            image: {
                maxSize: 16 * 1024 * 1024, // 16MB
                maxWidth: 1920,
                maxHeight: 1920,
                supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'tiff'],
                outputFormat: 'jpeg',
                
                // Compression settings
                compression: {
                    enabled: true,
                    quality: 0.8,
                    progressive: true,
                    optimizeScans: true,
                    enableLossless: false,
                    preserveMetadata: false
                },
                
                // Thumbnail settings
                thumbnail: {
                    enabled: true,
                    width: 200,
                    height: 200,
                    quality: 0.6,
                    format: 'jpeg',
                    preserveAspectRatio: true,
                    enableCrop: false,
                    cropPosition: 'center'
                },
                
                // Processing settings
                processing: {
                    enableAutoRotation: true,
                    enableColorCorrection: false,
                    enableSharpening: false,
                    enableNoiseReduction: false,
                    enableWatermark: false,
                    watermarkOpacity: 0.5,
                    watermarkPosition: 'bottom-right'
                }
            },
            
            // Video settings
            video: {
                maxSize: 64 * 1024 * 1024, // 64MB
                maxDuration: 900, // 15 minutes
                maxWidth: 1280,
                maxHeight: 720,
                maxBitrate: 1000000, // 1Mbps
                maxFrameRate: 30,
                supportedFormats: ['mp4', 'avi', 'mov', 'mkv', '3gp', 'webm', 'flv'],
                outputFormat: 'mp4',
                
                // Compression settings
                compression: {
                    enabled: true,
                    codec: 'h264',
                    quality: 0.7,
                    bitrate: 800000, // 800kbps
                    audioBitrate: 128000, // 128kbps
                    audioCodec: 'aac',
                    enableTwoPass: false,
                    preset: 'medium'
                },
                
                // Thumbnail settings
                thumbnail: {
                    enabled: true,
                    width: 200,
                    height: 200,
                    quality: 0.6,
                    format: 'jpeg',
                    timeOffset: 1, // 1 second
                    enableMultiple: false,
                    multipleCount: 3
                },
                
                // Processing settings
                processing: {
                    enableStabilization: false,
                    enableNoiseReduction: false,
                    enableColorCorrection: false,
                    enableWatermark: false,
                    watermarkOpacity: 0.5,
                    watermarkPosition: 'bottom-right',
                    enableSubtitles: false
                }
            },
            
            // Audio settings
            audio: {
                maxSize: 16 * 1024 * 1024, // 16MB
                maxDuration: 900, // 15 minutes
                maxBitrate: 320000, // 320kbps
                supportedFormats: ['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac', 'wma'],
                outputFormat: 'mp3',
                
                // Compression settings
                compression: {
                    enabled: true,
                    bitrate: 128000, // 128kbps
                    sampleRate: 44100,
                    channels: 2,
                    codec: 'mp3',
                    quality: 'high',
                    enableVBR: true
                },
                
                // Waveform settings
                waveform: {
                    enabled: true,
                    points: 64,
                    width: 400,
                    height: 60,
                    color: '#1976d2',
                    backgroundColor: '#f5f5f5',
                    enableAnimation: false
                },
                
                // Processing settings
                processing: {
                    enableNoiseReduction: false,
                    enableNormalization: false,
                    enableEqualizer: false,
                    enableVoiceEnhancement: false,
                    enableEchoRemoval: false,
                    enableSilenceDetection: true,
                    silenceThreshold: -50 // dB
                }
            },
            
            // Document settings
            document: {
                maxSize: 100 * 1024 * 1024, // 100MB
                supportedFormats: [
                    // Text formats
                    'txt', 'rtf', 'doc', 'docx', 'odt',
                    // Spreadsheet formats
                    'xls', 'xlsx', 'ods', 'csv',
                    // Presentation formats
                    'ppt', 'pptx', 'odp',
                    // PDF formats
                    'pdf',
                    // Archive formats
                    'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
                    // Code formats
                    'js', 'html', 'css', 'json', 'xml', 'sql',
                    // Other formats
                    'epub', 'mobi'
                ],
                
                // Preview settings
                preview: {
                    enabled: true,
                    timeout: 30000,
                    maxPages: 5,
                    imageFormat: 'png',
                    imageQuality: 0.8,
                    enableTextExtraction: true,
                    enableMetadataExtraction: true
                },
                
                // Thumbnail settings
                thumbnail: {
                    enabled: true,
                    width: 200,
                    height: 200,
                    format: 'png',
                    quality: 0.8,
                    pageNumber: 1
                },
                
                // Security settings
                security: {
                    enableVirusScanning: false,
                    scanTimeout: 60000,
                    enablePasswordProtection: false,
                    maxPasswordAttempts: 3,
                    enableContentFiltering: false
                }
            },
            
            // Sticker settings
            sticker: {
                maxSize: 500 * 1024, // 500KB
                maxWidth: 512,
                maxHeight: 512,
                supportedFormats: ['webp', 'png', 'gif'],
                outputFormat: 'webp',
                
                // Animation settings
                animation: {
                    enabled: true,
                    maxFrames: 30,
                    maxFPS: 15,
                    maxDuration: 3, // 3 seconds
                    enableLoop: true,
                    enableOptimization: true
                },
                
                // Processing settings
                processing: {
                    enableTransparency: true,
                    enableBackgroundRemoval: false,
                    backgroundColor: 'transparent',
                    enableBorderRadius: false,
                    borderRadius: 0,
                    enableShadow: false
                },
                
                // Pack settings
                pack: {
                    enableCustomPacks: true,
                    maxStickersPerPack: 30,
                    maxPackSize: 50 * 1024 * 1024, // 50MB
                    enablePackSharing: true,
                    enablePackImport: true,
                    enablePackExport: true
                }
            },
            
            // Storage settings
            storage: {
                enableLocalStorage: true,
                localStoragePath: './media-cache',
                maxLocalStorageSize: 1024 * 1024 * 1024, // 1GB
                enableCloudStorage: false,
                cloudStorageProvider: 's3',
                cloudStorageConfig: {},
                
                // Cleanup settings
                cleanup: {
                    enabled: true,
                    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                    cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
                    enableSizeBasedCleanup: true,
                    maxStorageSize: 500 * 1024 * 1024 // 500MB
                }
            },
            
            // CDN settings
            cdn: {
                enabled: false,
                provider: 'cloudflare',
                baseUrl: '',
                enableCaching: true,
                cacheMaxAge: 86400, // 24 hours
                enableCompression: true,
                enableOptimization: true
            },
            
            // Security settings
            security: {
                enableEncryption: true,
                encryptionAlgorithm: 'aes-256-gcm',
                enableSignature: true,
                signatureAlgorithm: 'hmac-sha256',
                enableAccessControl: true,
                maxDownloadAttempts: 10,
                downloadCooldown: 60000 // 1 minute
            },
            
            // Metadata settings
            metadata: {
                enableExtraction: true,
                enableStripping: true,
                preserveFields: ['title', 'author', 'created'],
                stripFields: ['location', 'camera', 'software'],
                enableCustomMetadata: true,
                customFields: []
            },
            
            // Performance settings
            performance: {
                enableLazyLoading: true,
                enablePreloading: false,
                preloadCount: 3,
                enableMemoryOptimization: true,
                maxMemoryUsage: 256 * 1024 * 1024, // 256MB
                enableWorkerThreads: false,
                maxWorkerThreads: 2
            },
            
            // Quality settings
            quality: {
                enableAdaptiveQuality: true,
                qualityLevels: ['low', 'medium', 'high', 'original'],
                defaultQuality: 'medium',
                enableAutoQuality: true,
                bandwidthThreshold: 1000000, // 1Mbps
                enableQualitySelection: true
            },
            
            // Streaming settings
            streaming: {
                enabled: false,
                chunkDuration: 10, // 10 seconds
                enableAdaptiveBitrate: true,
                bitrateVariants: [400000, 800000, 1200000],
                enableLowLatency: false,
                bufferSize: 30 // 30 seconds
            },
            
            // Analytics settings
            analytics: {
                enabled: false,
                trackUploads: true,
                trackDownloads: true,
                trackViews: true,
                trackErrors: true,
                enablePerformanceMetrics: true,
                retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
            },
            
            // Error handling
            errorHandling: {
                enableRetry: true,
                maxRetries: 3,
                retryDelay: 5000,
                enableFallback: true,
                fallbackQuality: 'low',
                enableErrorReporting: true,
                logErrors: true
            },
            
            // Validation settings
            validation: {
                enableTypeValidation: true,
                enableSizeValidation: true,
                enableDimensionValidation: true,
                enableDurationValidation: true,
                enableContentValidation: false,
                enableMalwareScanning: false,
                scanTimeout: 30000
            }
        };
    }
    
    static getMobileDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            image: {
                ...defaults.image,
                maxWidth: 1080,
                maxHeight: 1080,
                compression: {
                    ...defaults.image.compression,
                    quality: 0.7
                }
            },
            video: {
                ...defaults.video,
                maxWidth: 720,
                maxHeight: 720,
                compression: {
                    ...defaults.video.compression,
                    bitrate: 500000 // 500kbps
                }
            },
            performance: {
                ...defaults.performance,
                maxMemoryUsage: 128 * 1024 * 1024 // 128MB
            }
        };
    }
    
    static getHighQualityDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            image: {
                ...defaults.image,
                maxWidth: 4096,
                maxHeight: 4096,
                compression: {
                    ...defaults.image.compression,
                    quality: 0.95
                }
            },
            video: {
                ...defaults.video,
                maxWidth: 1920,
                maxHeight: 1080,
                compression: {
                    ...defaults.video.compression,
                    bitrate: 2000000 // 2Mbps
                }
            },
            audio: {
                ...defaults.audio,
                compression: {
                    ...defaults.audio.compression,
                    bitrate: 320000 // 320kbps
                }
            }
        };
    }
    
    static validateDefaults(options) {
        const errors = [];
        
        if (options.image?.maxSize > 100 * 1024 * 1024) {
            errors.push('Image max size cannot exceed 100MB');
        }
        
        if (options.video?.maxSize > 1024 * 1024 * 1024) {
            errors.push('Video max size cannot exceed 1GB');
        }
        
        if (options.audio?.maxSize > 100 * 1024 * 1024) {
            errors.push('Audio max size cannot exceed 100MB');
        }
        
        if (options.document?.maxSize > 1024 * 1024 * 1024) {
            errors.push('Document max size cannot exceed 1GB');
        }
        
        if (options.upload?.chunkSize < 1024) {
            errors.push('Upload chunk size must be at least 1KB');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WAMediaDefaults;