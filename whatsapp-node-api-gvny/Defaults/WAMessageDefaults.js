class WAMessageDefaults {
    static getDefaults() {
        return {
            // Message content limits
            maxTextLength: 4096,
            maxCaptionLength: 1024,
            maxQuotedTextLength: 1024,
            maxButtonTextLength: 20,
            maxButtonCount: 3,
            maxListItemCount: 10,
            maxPollOptionCount: 12,
            maxPollOptionLength: 100,
            
            // Message timing
            messageTimeout: 30000,
            deliveryTimeout: 60000,
            readReceiptTimeout: 120000,
            retryDelay: 5000,
            maxRetries: 3,
            
            // Message features
            enableReadReceipts: true,
            enableDeliveryReceipts: true,
            enableTypingIndicators: true,
            enableMessageReactions: true,
            enableMessageReplies: true,
            enableMessageForwarding: true,
            enableMessageDeletion: true,
            enableMessageEditing: false,
            enableMessageStarring: true,
            enableMessageSearch: true,
            
            // Message formatting
            formatting: {
                enableMarkdown: true,
                enableBold: true,
                enableItalic: true,
                enableStrikethrough: true,
                enableMonospace: true,
                enableMentions: true,
                enableLinks: true,
                enableEmojis: true,
                autoLinkDetection: true,
                autoEmojiConversion: true
            },
            
            // Message types
            supportedTypes: {
                text: true,
                image: true,
                video: true,
                audio: true,
                document: true,
                sticker: true,
                location: true,
                contact: true,
                poll: true,
                reaction: true,
                extendedText: true,
                button: true,
                list: true,
                template: true
            },
            
            // Text message settings
            textMessage: {
                enablePreview: true,
                previewTimeout: 10000,
                maxPreviewSize: 1024 * 1024, // 1MB
                enableLinkPreview: true,
                linkPreviewTimeout: 15000,
                autoDetectLanguage: false,
                enableTranslation: false,
                enableSpellCheck: false
            },
            
            // Media message settings
            mediaMessage: {
                enableCompression: true,
                compressionQuality: 0.8,
                enableThumbnails: true,
                thumbnailSize: 200,
                thumbnailQuality: 0.6,
                enableProgressTracking: true,
                chunkSize: 64 * 1024, // 64KB
                maxConcurrentUploads: 3,
                enableRetry: true,
                retryAttempts: 2
            },
            
            // Image message settings
            imageMessage: {
                maxSize: 16 * 1024 * 1024, // 16MB
                supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
                enableCompression: true,
                compressionQuality: 0.8,
                maxWidth: 1920,
                maxHeight: 1920,
                thumbnailWidth: 200,
                thumbnailHeight: 200,
                enableExifStripping: true,
                enableWatermark: false
            },
            
            // Video message settings
            videoMessage: {
                maxSize: 64 * 1024 * 1024, // 64MB
                maxDuration: 900, // 15 minutes
                supportedFormats: ['mp4', 'avi', 'mov', 'mkv', '3gp'],
                enableCompression: true,
                compressionQuality: 0.7,
                maxWidth: 1280,
                maxHeight: 720,
                maxBitrate: 1000000, // 1Mbps
                enableThumbnail: true,
                thumbnailTime: 1, // 1 second
                enableStreaming: false
            },
            
            // Audio message settings
            audioMessage: {
                maxSize: 16 * 1024 * 1024, // 16MB
                maxDuration: 900, // 15 minutes
                supportedFormats: ['mp3', 'wav', 'aac', 'ogg', 'm4a'],
                enableCompression: true,
                compressionBitrate: 128000, // 128kbps
                enableWaveform: true,
                waveformPoints: 64,
                enableVoiceRecognition: false,
                enableNoiseReduction: false
            },
            
            // Document message settings
            documentMessage: {
                maxSize: 100 * 1024 * 1024, // 100MB
                supportedFormats: [
                    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
                    'txt', 'rtf', 'csv', 'zip', 'rar', '7z', 'tar', 'gz'
                ],
                enablePreview: true,
                previewTimeout: 30000,
                enableThumbnail: true,
                enableVirusScanning: false,
                scanTimeout: 60000
            },
            
            // Sticker message settings
            stickerMessage: {
                maxSize: 500 * 1024, // 500KB
                supportedFormats: ['webp'],
                maxWidth: 512,
                maxHeight: 512,
                enableAnimated: true,
                maxFrames: 30,
                maxFPS: 15,
                enableCustomStickers: true,
                enableStickerPacks: true
            },
            
            // Location message settings
            locationMessage: {
                enableLiveLocation: true,
                liveLocationDuration: 3600, // 1 hour
                liveLocationUpdateInterval: 60, // 1 minute
                enablePlaceName: true,
                enableAddress: true,
                enableDirections: false,
                accuracyThreshold: 100 // meters
            },
            
            // Contact message settings
            contactMessage: {
                maxContacts: 5,
                enableVCard: true,
                vCardVersion: '3.0',
                enableProfilePicture: true,
                enableBusinessInfo: true,
                enableSocialProfiles: false
            },
            
            // Poll message settings
            pollMessage: {
                maxOptions: 12,
                maxOptionLength: 100,
                maxQuestionLength: 255,
                enableMultipleChoice: true,
                enableAnonymous: false,
                defaultDuration: 604800, // 1 week
                maxDuration: 2592000, // 30 days
                enableResultsVisibility: true
            },
            
            // Reaction message settings
            reactionMessage: {
                enabledEmojis: [
                    '👍', '👎', '❤️', '😂', '😮', '😢', '😡',
                    '🔥', '👏', '🙏', '💯', '🎉', '✅', '❌'
                ],
                maxReactionsPerMessage: 1,
                enableCustomEmojis: false,
                reactionTimeout: 5000,
                enableReactionHistory: true
            },
            
            // Button message settings
            buttonMessage: {
                maxButtons: 3,
                maxButtonTextLength: 20,
                maxHeaderLength: 60,
                maxBodyLength: 1024,
                maxFooterLength: 60,
                buttonTypes: ['reply', 'url', 'call'],
                enableImages: true,
                enableVideos: false
            },
            
            // List message settings
            listMessage: {
                maxSections: 10,
                maxItemsPerSection: 10,
                maxTitleLength: 24,
                maxDescriptionLength: 72,
                maxButtonTextLength: 20,
                maxHeaderLength: 60,
                maxBodyLength: 1024,
                maxFooterLength: 60,
                enableMultiSelect: false
            },
            
            // Template message settings
            templateMessage: {
                enableBusinessTemplates: true,
                maxTemplateLength: 1024,
                enableVariables: true,
                maxVariables: 10,
                enableMediaTemplates: true,
                enableButtonTemplates: true,
                enableListTemplates: true
            },
            
            // Message queue settings
            queue: {
                enabled: true,
                maxSize: 1000,
                batchSize: 10,
                processingInterval: 100,
                priorityLevels: 3,
                enablePersistence: false,
                persistencePath: './message-queue'
            },
            
            // Message caching
            cache: {
                enabled: true,
                maxMessages: 10000,
                ttl: 3600000, // 1 hour
                enableLRU: true,
                enableCompression: false,
                compressionLevel: 6
            },
            
            // Message encryption
            encryption: {
                enabled: true,
                algorithm: 'aes-256-gcm',
                keyDerivation: 'pbkdf2',
                iterations: 100000,
                saltLength: 32,
                ivLength: 12,
                tagLength: 16
            },
            
            // Message validation
            validation: {
                enabled: true,
                validateContent: true,
                validateMedia: true,
                validateContacts: true,
                validateLocations: true,
                sanitizeInput: true,
                enableXSSProtection: true,
                enableSQLInjectionProtection: true
            },
            
            // Message rate limiting
            rateLimiting: {
                enabled: true,
                maxMessagesPerMinute: 60,
                maxMediaPerMinute: 10,
                maxReactionsPerMinute: 30,
                burstLimit: 10,
                windowSize: 60000,
                enableWhitelist: true,
                whitelistedJids: []
            },
            
            // Message delivery
            delivery: {
                enableDeliveryTracking: true,
                enableReadTracking: true,
                enablePlayedTracking: true,
                deliveryRetries: 3,
                deliveryTimeout: 60000,
                enableOfflineQueue: true,
                offlineQueueSize: 500
            },
            
            // Message notifications
            notifications: {
                enabled: true,
                enableSound: true,
                enableVibration: true,
                enableDesktop: true,
                enablePush: true,
                soundFile: 'notification.mp3',
                vibrationPattern: [200, 100, 200],
                desktopTimeout: 5000
            },
            
            // Message search
            search: {
                enabled: true,
                indexContent: true,
                indexMedia: false,
                enableFullText: true,
                enableFuzzy: true,
                maxResults: 100,
                enableHighlighting: true,
                cacheResults: true
            },
            
            // Message backup
            backup: {
                enabled: false,
                backupInterval: 86400000, // 24 hours
                backupPath: './message-backup',
                enableCompression: true,
                compressionLevel: 6,
                retentionDays: 30,
                enableEncryption: true
            },
            
            // Message analytics
            analytics: {
                enabled: false,
                trackSentMessages: true,
                trackReceivedMessages: true,
                trackDeliveryStatus: true,
                trackReadStatus: true,
                trackReactions: true,
                retentionPeriod: 2592000000 // 30 days
            }
        };
    }
    
    static getMinimalDefaults() {
        return {
            maxTextLength: 4096,
            messageTimeout: 30000,
            maxRetries: 3,
            enableReadReceipts: true,
            enableDeliveryReceipts: true,
            supportedTypes: {
                text: true,
                image: true,
                video: true,
                audio: true,
                document: true
            }
        };
    }
    
    static getBusinessDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            templateMessage: {
                ...defaults.templateMessage,
                enableBusinessTemplates: true,
                enableVariables: true,
                enableMediaTemplates: true
            },
            buttonMessage: {
                ...defaults.buttonMessage,
                maxButtons: 3,
                buttonTypes: ['reply', 'url', 'call']
            },
            listMessage: {
                ...defaults.listMessage,
                maxSections: 10,
                maxItemsPerSection: 10
            },
            analytics: {
                ...defaults.analytics,
                enabled: true,
                trackSentMessages: true,
                trackDeliveryStatus: true
            }
        };
    }
    
    static validateDefaults(options) {
        const errors = [];
        
        if (options.maxTextLength > 4096) {
            errors.push('Max text length cannot exceed 4096 characters');
        }
        
        if (options.messageTimeout < 1000) {
            errors.push('Message timeout must be at least 1000ms');
        }
        
        if (options.maxRetries < 0) {
            errors.push('Max retries must be non-negative');
        }
        
        if (options.imageMessage?.maxSize > 16 * 1024 * 1024) {
            errors.push('Image max size cannot exceed 16MB');
        }
        
        if (options.videoMessage?.maxSize > 64 * 1024 * 1024) {
            errors.push('Video max size cannot exceed 64MB');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WAMessageDefaults;