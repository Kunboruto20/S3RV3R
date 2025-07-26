/**
 * WhatsApp Node API - Main Entry Point
 * A comprehensive WhatsApp Web API library for Node.js
 */

// Core modules
const WASocket = require('./Socket/WASocket');
const WAConnection = require('./Socket/WAConnection');
const WAAuth = require('./Auth/WAAuth');
const WASessionManager = require('./Auth/WASessionManager');
const WAAuthValidator = require('./Auth/WAAuthValidator');

// Utility modules
const WAUtils = require('./Utils/WAUtils');
const WAValidator = require('./Utils/WAValidator');
const WALogger = require('./Utils/WALogger');
const WAHelper = require('./Utils/WAHelper');

// Crypto modules
const WAEncryption = require('./Crypto/WAEncryption');

// Message modules
const WAMessages = require('./Messages/WAMessages');
const WAMessageHandler = require('./Messages/WAMessageHandler');

// Group modules
const WAGroupManager = require('./Groups/WAGroupManager');
const WAGroupHandler = require('./Groups/WAGroupHandler');

// Call modules
const WACallManager = require('./Calls/WACallManager');
const WACallHandler = require('./Calls/WACallHandler');

// Status modules
const WAStatusManager = require('./Status/WAStatusManager');
const WAStoryManager = require('./Stories/WAStoryManager');

// Business modules
const WABusiness = require('./Business/WABusiness');
const WABusinessManager = require('./Business/WABusinessManager');

// Configuration modules
const WAConfigManager = require('./Config/WAConfigManager');
const WADatabaseManager = require('./Database/WADatabaseManager');

// Store modules
const WAStore = require('./Store/WAStore');

// Event modules
const WAEventManager = require('./Events/WAEventManager');

// Privacy modules
const WAPrivacyManager = require('./Privacy/WAPrivacyManager');

// Notification modules
const WANotificationManager = require('./Notifications/WANotificationManager');

// Payment modules
const WAPaymentManager = require('./Payments/WAPaymentManager');

// Middleware modules
const WAMiddlewareManager = require('./Middleware/WAMiddlewareManager');

// Plugin modules
const WAPluginManager = require('./Plugins/WAPluginManager');

// WebHook modules
const WAWebHookManager = require('./WebHooks/WAWebHookManager');

// Type definitions
const WATypes = require('./Types/WATypes');

// Blocklist modules
const WABlocklist = require('./Blocklist/WABlocklist');

// Contact modules
const WAContacts = require('./Contacts/WAContacts');

// Device modules
const WADevice = require('./Device/WADevice');

// Label modules
const WALabels = require('./Labels/WALabels');

// Newsletter modules
const WANewsletter = require('./Newsletter/WANewsletter');

// Test modules
const WATests = require('./Tests/WATests');

// Catalog modules
const WACatalog = require('./Catalog/WACatalog');

// Channel modules
const WAChannel = require('./Channel/WAChannel');

// Community modules
const WACommunity = require('./Community/WACommunity');

// Default configurations
const WADefaults = require('./Defaults/WADefaults');
const WAAuthDefaults = require('./Defaults/WAAuthDefaults');
const WAConnectionDefaults = require('./Defaults/WAConnectionDefaults');
const WAGroupDefaults = require('./Defaults/WAGroupDefaults');
const WAMediaDefaults = require('./Defaults/WAMediaDefaults');
const WAMessageDefaults = require('./Defaults/WAMessageDefaults');

// Binary modules
const WABinary = require('./WABINARY/WABinary');

// WAM modules
const WAM = require('./WAM/WAM');

// WAUSYNC modules
const WAUSYNC = require('./WAUSYNC/WAUSYNC');

// Signal modules
const WASignal = require('./Signal/WASignal');
const WAKeyHelper = require('./Signal/WAKeyHelper');

/**
 * Main WhatsApp API Class
 */
class WhatsAppAPI {
    constructor(options = {}) {
        this.options = {
            // Default options
            enableLogging: options.enableLogging !== false,
            logLevel: options.logLevel || 'info',
            enableAuth: options.enableAuth !== false,
            enableStore: options.enableStore !== false,
            enableEvents: options.enableEvents !== false,
            ...options
        };

        // Initialize core components
        this.logger = new WALogger(this.options);
        this.utils = new WAUtils();
        this.helper = new WAHelper();
        this.validator = new WAValidator();
        this.encryption = new WAEncryption();
        this.types = new WATypes();

        // Initialize managers
        this.auth = null;
        this.socket = null;
        this.store = null;
        this.events = null;
        this.config = null;
        this.database = null;

        this.logger.info('WhatsApp API initialized');
    }

    /**
     * Connect to WhatsApp
     */
    async connect(authOptions = {}) {
        try {
            this.logger.info('Connecting to WhatsApp...');

            // Initialize authentication
            this.auth = new WAAuth({ ...this.options, ...authOptions });
            
            // Initialize configuration
            this.config = new WAConfigManager(this.options);
            
            // Initialize database if enabled
            if (this.options.enableStore) {
                this.database = new WADatabaseManager(this.options);
                this.store = new WAStore(this.options);
            }

            // Initialize socket connection
            this.socket = new WAConnection({
                ...this.options,
                auth: this.auth,
                logger: this.logger
            });

            // Initialize event manager
            if (this.options.enableEvents) {
                this.events = new WAEventManager(this.socket, this.options);
            }

            this.logger.info('WhatsApp connection established');
            return true;
        } catch (error) {
            this.logger.error('Failed to connect to WhatsApp:', error);
            throw error;
        }
    }

    /**
     * Disconnect from WhatsApp
     */
    async disconnect() {
        try {
            this.logger.info('Disconnecting from WhatsApp...');

            if (this.socket) {
                await this.socket.close();
            }

            if (this.auth) {
                await this.auth.cleanup();
            }

            if (this.database) {
                // Database cleanup if needed
            }

            this.logger.info('WhatsApp disconnected');
            return true;
        } catch (error) {
            this.logger.error('Failed to disconnect from WhatsApp:', error);
            throw error;
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.socket ? this.socket.isConnected() : false,
            authenticated: this.auth ? this.auth.isAuthenticated() : false,
            ready: this.socket && this.auth ? (this.socket.isConnected() && this.auth.isAuthenticated()) : false
        };
    }

    /**
     * Send a message
     */
    async sendMessage(jid, message, options = {}) {
        if (!this.socket) {
            throw new Error('Not connected to WhatsApp');
        }

        return await this.socket.sendMessage(jid, message, options);
    }

    /**
     * Get messages
     */
    async getMessages(jid, options = {}) {
        if (!this.store) {
            throw new Error('Store not enabled');
        }

        return await this.store.getMessages(jid, options);
    }

    /**
     * Get chats
     */
    async getChats(options = {}) {
        if (!this.store) {
            throw new Error('Store not enabled');
        }

        return await this.store.getChats(options);
    }

    /**
     * Get contacts
     */
    async getContacts(options = {}) {
        if (!this.store) {
            throw new Error('Store not enabled');
        }

        return await this.store.getContacts(options);
    }
}

// Export main class and all modules
module.exports = {
    // Main API class
    WhatsAppAPI,
    
    // Core modules
    WASocket,
    WAConnection,
    WAAuth,
    WASessionManager,
    WAAuthValidator,
    
    // Utility modules
    WAUtils,
    WAValidator,
    WALogger,
    WAHelper,
    
    // Crypto modules
    WAEncryption,
    
    // Message modules
    WAMessages,
    WAMessageHandler,
    
    // Group modules
    WAGroupManager,
    WAGroupHandler,
    
    // Call modules
    WACallManager,
    WACallHandler,
    
    // Status modules
    WAStatusManager,
    WAStoryManager,
    
    // Business modules
    WABusiness,
    WABusinessManager,
    
    // Configuration modules
    WAConfigManager,
    WADatabaseManager,
    
    // Store modules
    WAStore,
    
    // Event modules
    WAEventManager,
    
    // Privacy modules
    WAPrivacyManager,
    
    // Notification modules
    WANotificationManager,
    
    // Payment modules
    WAPaymentManager,
    
    // Middleware modules
    WAMiddlewareManager,
    
    // Plugin modules
    WAPluginManager,
    
    // WebHook modules
    WAWebHookManager,
    
    // Type definitions
    WATypes,
    
    // Other modules
    WABlocklist,
    WAContacts,
    WADevice,
    WALabels,
    WANewsletter,
    WATests,
    WACatalog,
    WAChannel,
    WACommunity,
    
    // Default configurations
    WADefaults,
    WAAuthDefaults,
    WAConnectionDefaults,
    WAGroupDefaults,
    WAMediaDefaults,
    WAMessageDefaults,
    
    // Binary modules
    WABinary,
    WAM,
    WAUSYNC,
    
    // Signal modules
    WASignal,
    WAKeyHelper
};