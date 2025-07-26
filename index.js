const { WASocket } = require('./Socket');
const { WABinary } = require('./WABINARY');
const { WASignal } = require('./Signal');
const { WAUtils } = require('./Utils');
const { WATypes } = require('./Types');
const { WADefaults } = require('./Defaults');
const { WAUSYNC } = require('./WAUSYNC');
const { WAM } = require('./WAM');

/**
 * WhatsApp Node API - Complete WhatsApp Web implementation
 * @author GVNY
 * @version 1.0.0
 */
class WhatsAppNodeAPI {
    constructor(options = {}) {
        this.options = {
            ...WADefaults.CONNECTION_OPTIONS,
            ...options
        };
        
        this.socket = null;
        this.signal = null;
        this.binary = null;
        this.utils = null;
        this.types = null;
        this.sync = null;
        this.wam = null;
        
        this.isConnected = false;
        this.authState = null;
        this.user = null;
        this.qrCode = null;
        this.pairingCode = null;
        
        this.initialize();
    }

    /**
     * Initialize all components
     */
    initialize() {
        this.utils = new WAUtils(this.options);
        this.types = new WATypes();
        this.binary = new WABinary(this.utils);
        this.signal = new WASignal(this.options, this.utils);
        this.sync = new WAUSYNC(this.utils);
        this.wam = new WAM(this.utils);
        this.socket = new WASocket(this.options, {
            signal: this.signal,
            binary: this.binary,
            utils: this.utils,
            types: this.types,
            sync: this.sync,
            wam: this.wam
        });
        
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.socket.on('connection.update', (update) => {
            this.handleConnectionUpdate(update);
        });

        this.socket.on('auth.state', (state) => {
            this.authState = state;
        });

        this.socket.on('qr.code', (qr) => {
            this.qrCode = qr;
            this.emit('qr', qr);
        });

        this.socket.on('pairing.code', (code) => {
            this.pairingCode = code;
            this.emit('pairing-code', code);
        });

        this.socket.on('messages.upsert', (messageUpdate) => {
            this.emit('messages.upsert', messageUpdate);
        });

        this.socket.on('message.reaction', (reaction) => {
            this.emit('message.reaction', reaction);
        });

        this.socket.on('presence.update', (presence) => {
            this.emit('presence.update', presence);
        });

        this.socket.on('chats.update', (chats) => {
            this.emit('chats.update', chats);
        });

        this.socket.on('contacts.update', (contacts) => {
            this.emit('contacts.update', contacts);
        });
    }

    /**
     * Handle connection updates
     */
    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;
        
        if (qr) {
            this.qrCode = qr;
            this.emit('qr', qr);
        }

        if (connection === 'close') {
            this.isConnected = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            if (shouldReconnect) {
                this.connect();
            }
        } else if (connection === 'open') {
            this.isConnected = true;
            this.user = this.socket.user;
            this.emit('ready', this.user);
        }

        this.emit('connection.update', update);
    }

    /**
     * Connect to WhatsApp Web
     */
    async connect() {
        try {
            await this.socket.connect();
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Disconnect from WhatsApp Web
     */
    async disconnect() {
        if (this.socket) {
            await this.socket.disconnect();
            this.isConnected = false;
        }
    }

    /**
     * Request pairing code for phone number
     */
    async requestPairingCode(phoneNumber) {
        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }
        
        const formattedNumber = this.utils.formatPhoneNumber(phoneNumber);
        return await this.socket.requestPairingCode(formattedNumber);
    }

    /**
     * Send text message
     */
    async sendMessage(jid, content, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.sendMessage(jid, content, options);
    }

    /**
     * Send media message (image, video, audio, document)
     */
    async sendMedia(jid, media, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.sendMedia(jid, media, options);
    }

    /**
     * Send reaction to message
     */
    async sendReaction(jid, messageKey, emoji) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.sendReaction(jid, messageKey, emoji);
    }

    /**
     * Get chat messages
     */
    async getMessages(jid, count = 25, before = null) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.getMessages(jid, count, before);
    }

    /**
     * Get chat list
     */
    async getChats() {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.getChats();
    }

    /**
     * Get contacts
     */
    async getContacts() {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.getContacts();
    }

    /**
     * Update presence
     */
    async updatePresence(jid, presence) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.updatePresence(jid, presence);
    }

    /**
     * Mark message as read
     */
    async readMessage(jid, messageKey) {
        if (!this.isConnected) {
            throw new Error('Not connected to WhatsApp');
        }
        
        return await this.socket.readMessage(jid, messageKey);
    }

    /**
     * Event emitter methods
     */
    on(event, listener) {
        if (!this.eventListeners) {
            this.eventListeners = new Map();
        }
        
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        
        this.eventListeners.get(event).push(listener);
    }

    emit(event, ...args) {
        if (this.eventListeners && this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get current auth state
     */
    getAuthState() {
        return this.authState;
    }

    /**
     * Set auth state
     */
    setAuthState(state) {
        this.authState = state;
        if (this.socket) {
            this.socket.setAuthState(state);
        }
    }

    /**
     * Get user info
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if connected
     */
    isConnectedToWA() {
        return this.isConnected;
    }
}

// Export main class and utilities
module.exports = {
    WhatsAppNodeAPI,
    WASocket,
    WABinary,
    WASignal,
    WAUtils,
    WATypes,
    WADefaults,
    WAUSYNC,
    WAM
};

// Export default instance creator
module.exports.default = (options) => new WhatsAppNodeAPI(options);
module.exports.create = (options) => new WhatsAppNodeAPI(options);