const WAConnectionDefaults = require('./WAConnectionDefaults');
const WAMessageDefaults = require('./WAMessageDefaults');
const WAMediaDefaults = require('./WAMediaDefaults');
const WAAuthDefaults = require('./WAAuthDefaults');
const WAGroupDefaults = require('./WAGroupDefaults');
const WAContactDefaults = require('./WAContactDefaults');
const WAPresenceDefaults = require('./WAPresenceDefaults');
const WACallDefaults = require('./WACallDefaults');
const WABusinessDefaults = require('./WABusinessDefaults');
const WAPrivacyDefaults = require('./WAPrivacyDefaults');
const WAStoreDefaults = require('./WAStoreDefaults');
const WAEncryptionDefaults = require('./WAEncryptionDefaults');
const WAQRDefaults = require('./WAQRDefaults');
const WAPairingDefaults = require('./WAPairingDefaults');
const WAEventDefaults = require('./WAEventDefaults');

class WADefaults {
    static get version() {
        return [2, 2147, 10];
    }
    
    static get platform() {
        return 'web';
    }
    
    static get userAgent() {
        return 'WhatsApp/2.2147.10 Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    
    static get endpoints() {
        return {
            websocket: 'wss://web.whatsapp.com/ws/chat',
            media: 'https://mmg.whatsapp.net',
            upload: 'https://web.whatsapp.com/upload',
            profile: 'https://web.whatsapp.com/pp',
            status: 'https://web.whatsapp.com/status',
            business: 'https://web.whatsapp.com/business',
            catalog: 'https://web.whatsapp.com/catalog',
            newsletter: 'https://web.whatsapp.com/newsletter',
            community: 'https://web.whatsapp.com/community',
            channels: 'https://web.whatsapp.com/channels'
        };
    }
    
    static get connectionOptions() {
        return {
            ...WAConnectionDefaults.getDefaults(),
            version: this.version,
            platform: this.platform,
            userAgent: this.userAgent,
            endpoints: this.endpoints
        };
    }
    
    static get messageOptions() {
        return WAMessageDefaults.getDefaults();
    }
    
    static get mediaOptions() {
        return WAMediaDefaults.getDefaults();
    }
    
    static get authOptions() {
        return WAAuthDefaults.getDefaults();
    }
    
    static get groupOptions() {
        return WAGroupDefaults.getDefaults();
    }
    
    static get contactOptions() {
        return WAContactDefaults.getDefaults();
    }
    
    static get presenceOptions() {
        return WAPresenceDefaults.getDefaults();
    }
    
    static get callOptions() {
        return WACallDefaults.getDefaults();
    }
    
    static get businessOptions() {
        return WABusinessDefaults.getDefaults();
    }
    
    static get privacyOptions() {
        return WAPrivacyDefaults.getDefaults();
    }
    
    static get storeOptions() {
        return WAStoreDefaults.getDefaults();
    }
    
    static get encryptionOptions() {
        return WAEncryptionDefaults.getDefaults();
    }
    
    static get qrOptions() {
        return WAQRDefaults.getDefaults();
    }
    
    static get pairingOptions() {
        return WAPairingDefaults.getDefaults();
    }
    
    static get eventOptions() {
        return WAEventDefaults.getDefaults();
    }
    
    static get constants() {
        return {
            // Protocol constants
            NOISE_PROTOCOL: 'Noise_XX_25519_AESGCM_SHA256',
            WA_VERSION: this.version,
            PLATFORM: this.platform,
            
            // Message types
            MESSAGE_TYPES: {
                TEXT: 'conversation',
                IMAGE: 'imageMessage',
                VIDEO: 'videoMessage',
                AUDIO: 'audioMessage',
                DOCUMENT: 'documentMessage',
                STICKER: 'stickerMessage',
                LOCATION: 'locationMessage',
                CONTACT: 'contactMessage',
                POLL: 'pollCreationMessage',
                REACTION: 'reactionMessage',
                EXTENDED_TEXT: 'extendedTextMessage'
            },
            
            // Chat types
            CHAT_TYPES: {
                INDIVIDUAL: 'individual',
                GROUP: 'group',
                BROADCAST: 'broadcast',
                STATUS: 'status'
            },
            
            // Presence states
            PRESENCE_STATES: {
                AVAILABLE: 'available',
                UNAVAILABLE: 'unavailable',
                COMPOSING: 'composing',
                RECORDING: 'recording',
                PAUSED: 'paused'
            },
            
            // Connection states
            CONNECTION_STATES: {
                CLOSE: 'close',
                CONNECTING: 'connecting',
                OPEN: 'open'
            },
            
            // Message status
            MESSAGE_STATUS: {
                PENDING: 0,
                SENT: 1,
                DELIVERED: 2,
                READ: 3,
                PLAYED: 4,
                ERROR: -1
            },
            
            // Media types
            MEDIA_TYPES: {
                IMAGE: 'image',
                VIDEO: 'video',
                AUDIO: 'audio',
                DOCUMENT: 'document',
                STICKER: 'sticker'
            },
            
            // Group roles
            GROUP_ROLES: {
                MEMBER: 'member',
                ADMIN: 'admin',
                SUPER_ADMIN: 'superadmin'
            },
            
            // Group actions
            GROUP_ACTIONS: {
                ADD: 'add',
                REMOVE: 'remove',
                PROMOTE: 'promote',
                DEMOTE: 'demote',
                LEAVE: 'leave',
                CREATE: 'create',
                UPDATE: 'update'
            },
            
            // Call types
            CALL_TYPES: {
                VOICE: 'voice',
                VIDEO: 'video'
            },
            
            // Call status
            CALL_STATUS: {
                OFFER: 'offer',
                ACCEPT: 'accept',
                REJECT: 'reject',
                TIMEOUT: 'timeout',
                END: 'end'
            },
            
            // Business types
            BUSINESS_TYPES: {
                CATALOG: 'catalog',
                PRODUCT: 'product',
                ORDER: 'order',
                INVOICE: 'invoice',
                COLLECTION: 'collection'
            },
            
            // Privacy settings
            PRIVACY_SETTINGS: {
                LAST_SEEN: 'last_seen',
                PROFILE_PHOTO: 'profile_photo',
                STATUS: 'status',
                READ_RECEIPTS: 'read_receipts',
                GROUPS: 'groups',
                CALLS: 'calls'
            },
            
            // Privacy values
            PRIVACY_VALUES: {
                EVERYONE: 'all',
                CONTACTS: 'contacts',
                NOBODY: 'none'
            }
        };
    }
    
    static get limits() {
        return {
            // Message limits
            MESSAGE_TEXT_MAX_LENGTH: 4096,
            MESSAGE_CAPTION_MAX_LENGTH: 1024,
            MESSAGE_BATCH_SIZE: 50,
            
            // Media limits
            MEDIA_IMAGE_MAX_SIZE: 16 * 1024 * 1024, // 16MB
            MEDIA_VIDEO_MAX_SIZE: 64 * 1024 * 1024, // 64MB
            MEDIA_AUDIO_MAX_SIZE: 16 * 1024 * 1024, // 16MB
            MEDIA_DOCUMENT_MAX_SIZE: 100 * 1024 * 1024, // 100MB
            MEDIA_STICKER_MAX_SIZE: 500 * 1024, // 500KB
            
            // Group limits
            GROUP_PARTICIPANTS_MAX: 1024,
            GROUP_ADMINS_MAX: 50,
            GROUP_NAME_MAX_LENGTH: 25,
            GROUP_DESCRIPTION_MAX_LENGTH: 512,
            
            // Contact limits
            CONTACT_NAME_MAX_LENGTH: 25,
            CONTACT_STATUS_MAX_LENGTH: 139,
            
            // Business limits
            BUSINESS_NAME_MAX_LENGTH: 75,
            BUSINESS_DESCRIPTION_MAX_LENGTH: 256,
            CATALOG_PRODUCTS_MAX: 1000,
            PRODUCT_NAME_MAX_LENGTH: 60,
            PRODUCT_DESCRIPTION_MAX_LENGTH: 300,
            
            // Connection limits
            CONNECTION_RETRY_MAX: 5,
            CONNECTION_TIMEOUT: 30000,
            PING_INTERVAL: 30000,
            PONG_TIMEOUT: 10000,
            
            // Cache limits
            CACHE_MESSAGE_MAX: 10000,
            CACHE_CONTACT_MAX: 5000,
            CACHE_CHAT_MAX: 1000,
            CACHE_GROUP_MAX: 500,
            
            // Rate limits
            RATE_LIMIT_MESSAGES_PER_MINUTE: 60,
            RATE_LIMIT_MEDIA_PER_MINUTE: 10,
            RATE_LIMIT_GROUPS_PER_HOUR: 5,
            RATE_LIMIT_CONTACTS_PER_MINUTE: 30
        };
    }
    
    static get timeouts() {
        return {
            CONNECTION_TIMEOUT: 30000,
            AUTH_TIMEOUT: 60000,
            MESSAGE_TIMEOUT: 30000,
            MEDIA_UPLOAD_TIMEOUT: 120000,
            MEDIA_DOWNLOAD_TIMEOUT: 60000,
            QR_REFRESH_INTERVAL: 20000,
            QR_EXPIRATION_TIME: 60000,
            PAIRING_CODE_EXPIRATION: 300000,
            PRESENCE_UPDATE_INTERVAL: 10000,
            PING_INTERVAL: 30000,
            PONG_TIMEOUT: 10000,
            RETRY_DELAY: 5000,
            RECONNECT_DELAY: 2000,
            KEEP_ALIVE_INTERVAL: 25000
        };
    }
    
    static get retrySettings() {
        return {
            CONNECTION_MAX_RETRIES: 5,
            AUTH_MAX_RETRIES: 3,
            MESSAGE_MAX_RETRIES: 3,
            MEDIA_MAX_RETRIES: 2,
            QR_MAX_RETRIES: 5,
            PAIRING_MAX_RETRIES: 3,
            EXPONENTIAL_BACKOFF: true,
            BACKOFF_MULTIPLIER: 2,
            MAX_BACKOFF_DELAY: 30000
        };
    }
    
    static get features() {
        return {
            // Core features
            MESSAGING: true,
            MEDIA_SHARING: true,
            GROUP_CHAT: true,
            VOICE_CALLS: true,
            VIDEO_CALLS: true,
            STATUS_UPDATES: true,
            
            // Advanced features
            END_TO_END_ENCRYPTION: true,
            MESSAGE_REACTIONS: true,
            MESSAGE_REPLIES: true,
            MESSAGE_FORWARDING: true,
            MESSAGE_DELETION: true,
            MESSAGE_EDITING: false,
            
            // Business features
            BUSINESS_PROFILES: true,
            CATALOGS: true,
            PRODUCTS: true,
            ORDERS: true,
            INVOICES: true,
            COLLECTIONS: true,
            
            // Privacy features
            PRIVACY_SETTINGS: true,
            BLOCK_CONTACTS: true,
            MUTE_CHATS: true,
            ARCHIVE_CHATS: true,
            PIN_CHATS: true,
            
            // Sync features
            MULTI_DEVICE: true,
            CLOUD_SYNC: true,
            BACKUP_RESTORE: true,
            HISTORY_SYNC: true,
            
            // Media features
            IMAGE_COMPRESSION: true,
            VIDEO_COMPRESSION: true,
            AUDIO_COMPRESSION: true,
            DOCUMENT_PREVIEW: true,
            STICKER_SUPPORT: true,
            GIF_SUPPORT: true,
            
            // Group features
            GROUP_INVITES: true,
            GROUP_ANNOUNCEMENTS: true,
            GROUP_DESCRIPTIONS: true,
            GROUP_ADMIN_CONTROLS: true,
            GROUP_PARTICIPANT_LIMITS: true,
            
            // Notification features
            PUSH_NOTIFICATIONS: true,
            DESKTOP_NOTIFICATIONS: true,
            SOUND_NOTIFICATIONS: true,
            VIBRATION_NOTIFICATIONS: true
        };
    }
    
    static getAllDefaults() {
        return {
            connection: this.connectionOptions,
            message: this.messageOptions,
            media: this.mediaOptions,
            auth: this.authOptions,
            group: this.groupOptions,
            contact: this.contactOptions,
            presence: this.presenceOptions,
            call: this.callOptions,
            business: this.businessOptions,
            privacy: this.privacyOptions,
            store: this.storeOptions,
            encryption: this.encryptionOptions,
            qr: this.qrOptions,
            pairing: this.pairingOptions,
            event: this.eventOptions,
            constants: this.constants,
            limits: this.limits,
            timeouts: this.timeouts,
            retrySettings: this.retrySettings,
            features: this.features
        };
    }
    
    static mergeOptions(userOptions = {}) {
        const defaults = this.getAllDefaults();
        
        return {
            connection: { ...defaults.connection, ...userOptions.connection },
            message: { ...defaults.message, ...userOptions.message },
            media: { ...defaults.media, ...userOptions.media },
            auth: { ...defaults.auth, ...userOptions.auth },
            group: { ...defaults.group, ...userOptions.group },
            contact: { ...defaults.contact, ...userOptions.contact },
            presence: { ...defaults.presence, ...userOptions.presence },
            call: { ...defaults.call, ...userOptions.call },
            business: { ...defaults.business, ...userOptions.business },
            privacy: { ...defaults.privacy, ...userOptions.privacy },
            store: { ...defaults.store, ...userOptions.store },
            encryption: { ...defaults.encryption, ...userOptions.encryption },
            qr: { ...defaults.qr, ...userOptions.qr },
            pairing: { ...defaults.pairing, ...userOptions.pairing },
            event: { ...defaults.event, ...userOptions.event },
            constants: defaults.constants,
            limits: defaults.limits,
            timeouts: { ...defaults.timeouts, ...userOptions.timeouts },
            retrySettings: { ...defaults.retrySettings, ...userOptions.retrySettings },
            features: { ...defaults.features, ...userOptions.features }
        };
    }
    
    static validateOptions(options) {
        const errors = [];
        
        // Validate connection options
        if (options.connection) {
            if (options.connection.timeout && options.connection.timeout < 1000) {
                errors.push('Connection timeout must be at least 1000ms');
            }
            
            if (options.connection.retries && options.connection.retries < 0) {
                errors.push('Connection retries must be non-negative');
            }
        }
        
        // Validate message options
        if (options.message) {
            if (options.message.maxLength && options.message.maxLength > this.limits.MESSAGE_TEXT_MAX_LENGTH) {
                errors.push(`Message max length cannot exceed ${this.limits.MESSAGE_TEXT_MAX_LENGTH}`);
            }
        }
        
        // Validate media options
        if (options.media) {
            if (options.media.maxSize && options.media.maxSize > this.limits.MEDIA_DOCUMENT_MAX_SIZE) {
                errors.push(`Media max size cannot exceed ${this.limits.MEDIA_DOCUMENT_MAX_SIZE}`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    static getEnvironmentDefaults() {
        const isNode = typeof window === 'undefined';
        const isBrowser = typeof window !== 'undefined';
        
        return {
            environment: isNode ? 'node' : 'browser',
            platform: this.platform,
            userAgent: this.userAgent,
            features: {
                ...this.features,
                FILE_SYSTEM: isNode,
                LOCAL_STORAGE: isBrowser,
                NOTIFICATIONS: isBrowser,
                CLIPBOARD: isBrowser
            }
        };
    }
}

module.exports = WADefaults;