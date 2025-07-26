const EventEmitter = require('events');
const WebSocket = require('ws');
const crypto = require('crypto');
const { Buffer } = require('buffer');

const WAAuth = require('./WAAuth');
const WAConnection = require('./WAConnection');
const WAMessageHandler = require('./WAMessageHandler');
const WAPresence = require('./WAPresence');
const WAGroupHandler = require('./WAGroupHandler');
const WAContactHandler = require('./WAContactHandler');
const WAChatHandler = require('./WAChatHandler');
const WAMediaHandler = require('./WAMediaHandler');
const WACallHandler = require('./WACallHandler');
const WABusinessHandler = require('./WABusinessHandler');
const WAStatusHandler = require('./WAStatusHandler');
const WAPrivacyHandler = require('./WAPrivacyHandler');
const WANotificationHandler = require('./WANotificationHandler');
const WAStoryHandler = require('./WAStoryHandler');
const WANewsletterHandler = require('./WANewsletterHandler');
const WACommunityHandler = require('./WACommunityHandler');
const WAChannelHandler = require('./WAChannelHandler');
const WAPaymentHandler = require('./WAPaymentHandler');
const WACatalogHandler = require('./WACatalogHandler');
const WADeviceHandler = require('./WADeviceHandler');
const WALabelHandler = require('./WALabelHandler');
const WABlocklistHandler = require('./WABlocklistHandler');

class WASocket extends EventEmitter {
    constructor(options = {}, dependencies = {}) {
        super();
        
        this.options = {
            printQRInTerminal: true,
            browser: ['WhatsApp-Node-API-GVNY', 'Chrome', '110.0.0.0'],
            version: [2, 2413, 1],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            logger: console,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            fireInitQueries: true,
            emitOwnEvents: true,
            maxMsgRetryCount: 5,
            msgRetryCounterMap: new Map(),
            shouldSyncHistoryMessage: () => true,
            shouldIgnoreJid: () => false,
            linkPreviewImageThumbnailWidth: 192,
            transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
            generateHighQualityLinkPreview: false,
            ...options
        };
        
        this.dependencies = dependencies;
        this.ws = null;
        this.isConnected = false;
        this.connectionState = 'close';
        this.lastDisconnectReason = null;
        this.lastDisconnectTime = null;
        this.connectTime = null;
        this.pingInterval = null;
        this.keepAliveInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // Message and query handling
        this.queries = new Map();
        this.queryTimeout = this.options.defaultQueryTimeoutMs;
        this.msgRetryCounterMap = this.options.msgRetryCounterMap;
        this.pendingRequestMap = new Map();
        this.responseWaiters = new Map();
        
        // Connection and authentication
        this.authState = null;
        this.user = null;
        this.qrCode = null;
        this.pairingCode = null;
        this.clientToken = null;
        this.serverToken = null;
        this.encKey = null;
        this.macKey = null;
        this.noise = null;
        
        // Handlers
        this.auth = new WAAuth(this.options);
        this.connection = new WAConnection(this);
        this.messageHandler = new WAMessageHandler(this);
        this.presence = new WAPresence(this);
        this.groupHandler = new WAGroupHandler(this);
        this.contactHandler = new WAContactHandler(this);
        this.chatHandler = new WAChatHandler(this);
        this.mediaHandler = new WAMediaHandler(this);
        this.callHandler = new WACallHandler(this);
        this.businessHandler = new WABusinessHandler(this);
        this.statusHandler = new WAStatusHandler(this);
        this.privacyHandler = new WAPrivacyHandler(this);
        this.notificationHandler = new WANotificationHandler(this);
        this.storyHandler = new WAStoryHandler(this);
        this.newsletterHandler = new WANewsletterHandler(this);
        this.communityHandler = new WACommunityHandler(this);
        this.channelHandler = new WAChannelHandler(this);
        this.paymentHandler = new WAPaymentHandler(this);
        this.catalogHandler = new WACatalogHandler(this);
        this.deviceHandler = new WADeviceHandler(this);
        this.labelHandler = new WALabelHandler(this);
        this.blocklistHandler = new WABlocklistHandler(this);
        
        // Data stores
        this.chats = new Map();
        this.contacts = new Map();
        this.messages = new Map();
        this.groups = new Map();
        this.presences = new Map();
        this.blocklist = new Set();
        this.labels = new Map();
        this.devices = new Map();
        this.keys = new Map();
        this.appState = new Map();
        
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.on('connection.update', this.handleConnectionUpdate.bind(this));
        this.on('creds.update', this.handleCredsUpdate.bind(this));
        this.on('messages.upsert', this.handleMessagesUpsert.bind(this));
        this.on('messages.update', this.handleMessagesUpdate.bind(this));
        this.on('message.delete', this.handleMessageDelete.bind(this));
        this.on('message.reaction', this.handleMessageReaction.bind(this));
        this.on('presence.update', this.handlePresenceUpdate.bind(this));
        this.on('chats.upsert', this.handleChatsUpsert.bind(this));
        this.on('chats.update', this.handleChatsUpdate.bind(this));
        this.on('chats.delete', this.handleChatsDelete.bind(this));
        this.on('contacts.upsert', this.handleContactsUpsert.bind(this));
        this.on('contacts.update', this.handleContactsUpdate.bind(this));
        this.on('groups.upsert', this.handleGroupsUpsert.bind(this));
        this.on('groups.update', this.handleGroupsUpdate.bind(this));
        this.on('group-participants.update', this.handleGroupParticipantsUpdate.bind(this));
        this.on('blocklist.set', this.handleBlocklistSet.bind(this));
        this.on('blocklist.update', this.handleBlocklistUpdate.bind(this));
        this.on('call', this.handleCall.bind(this));
        this.on('labels.association', this.handleLabelsAssociation.bind(this));
        this.on('labels.edit', this.handleLabelsEdit.bind(this));
    }
    
    async connect(authState = null) {
        try {
            this.authState = authState;
            this.connectionState = 'connecting';
            this.emit('connection.update', { connection: 'connecting' });
            
            // Initialize authentication
            await this.auth.initialize(authState);
            
            // Create WebSocket connection
            const wsUrl = await this.auth.getWebSocketUrl();
            this.ws = new WebSocket(wsUrl, {
                headers: this.auth.getHeaders(),
                timeout: this.options.connectTimeoutMs
            });
            
            this.setupWebSocketHandlers();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, this.options.connectTimeoutMs);
                
                this.once('connection.update', (update) => {
                    clearTimeout(timeout);
                    if (update.connection === 'open') {
                        resolve(update);
                    } else if (update.connection === 'close') {
                        reject(new Error(update.lastDisconnect?.error?.message || 'Connection failed'));
                    }
                });
            });
        } catch (error) {
            this.connectionState = 'close';
            this.emit('connection.update', { 
                connection: 'close', 
                lastDisconnect: { error, date: new Date() }
            });
            throw error;
        }
    }
    
    setupWebSocketHandlers() {
        this.ws.on('open', this.handleWebSocketOpen.bind(this));
        this.ws.on('message', this.handleWebSocketMessage.bind(this));
        this.ws.on('close', this.handleWebSocketClose.bind(this));
        this.ws.on('error', this.handleWebSocketError.bind(this));
        this.ws.on('ping', this.handleWebSocketPing.bind(this));
        this.ws.on('pong', this.handleWebSocketPong.bind(this));
    }
    
    handleWebSocketOpen() {
        this.isConnected = true;
        this.connectionState = 'open';
        this.connectTime = new Date();
        this.reconnectAttempts = 0;
        
        this.startKeepAlive();
        this.emit('connection.update', { connection: 'open' });
        
        // Send initial handshake
        this.sendHandshake();
    }
    
    handleWebSocketMessage(data) {
        try {
            const decrypted = this.auth.decrypt(data);
            const node = this.dependencies.binary.decode(decrypted);
            this.processIncomingNode(node);
        } catch (error) {
            this.options.logger.error('Error processing message:', error);
        }
    }
    
    handleWebSocketClose(code, reason) {
        this.isConnected = false;
        this.connectionState = 'close';
        this.lastDisconnectTime = new Date();
        this.lastDisconnectReason = { code, reason: reason.toString() };
        
        this.stopKeepAlive();
        this.clearPendingQueries();
        
        this.emit('connection.update', { 
            connection: 'close',
            lastDisconnect: {
                error: new Error(`WebSocket closed: ${code} ${reason}`),
                date: this.lastDisconnectTime
            }
        });
        
        // Auto-reconnect logic
        if (this.shouldReconnect(code)) {
            this.scheduleReconnect();
        }
    }
    
    handleWebSocketError(error) {
        this.options.logger.error('WebSocket error:', error);
        this.emit('connection.update', { 
            connection: 'close',
            lastDisconnect: { error, date: new Date() }
        });
    }
    
    handleWebSocketPing(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.pong(data);
        }
    }
    
    handleWebSocketPong() {
        // Handle pong response
    }
    
    shouldReconnect(code) {
        return code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts;
    }
    
    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        setTimeout(() => {
            if (this.connectionState === 'close') {
                this.connect(this.authState);
            }
        }, delay);
    }
    
    startKeepAlive() {
        this.keepAliveInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, this.options.keepAliveIntervalMs);
    }
    
    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }
    
    clearPendingQueries() {
        for (const [id, query] of this.queries) {
            if (query.timeout) {
                clearTimeout(query.timeout);
            }
            if (query.reject) {
                query.reject(new Error('Connection closed'));
            }
        }
        this.queries.clear();
    }
    
    async sendHandshake() {
        const handshakeNode = this.auth.createHandshakeNode();
        await this.sendNode(handshakeNode);
    }
    
    async sendNode(node) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        
        const encoded = this.dependencies.binary.encode(node);
        const encrypted = this.auth.encrypt(encoded);
        this.ws.send(encrypted);
    }
    
    async query(node, timeoutMs = this.queryTimeout) {
        const id = node.attrs?.id || this.generateMessageId();
        if (!node.attrs) node.attrs = {};
        node.attrs.id = id;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.queries.delete(id);
                reject(new Error('Query timeout'));
            }, timeoutMs);
            
            this.queries.set(id, { resolve, reject, timeout });
            this.sendNode(node);
        });
    }
    
    processIncomingNode(node) {
        const id = node.attrs?.id;
        
        // Handle query responses
        if (id && this.queries.has(id)) {
            const query = this.queries.get(id);
            this.queries.delete(id);
            
            if (query.timeout) {
                clearTimeout(query.timeout);
            }
            
            if (node.attrs?.type === 'error') {
                query.reject(new Error(node.content || 'Query failed'));
            } else {
                query.resolve(node);
            }
            return;
        }
        
        // Route to appropriate handler based on node tag
        switch (node.tag) {
            case 'message':
                this.messageHandler.handleIncomingMessage(node);
                break;
            case 'presence':
                this.presence.handlePresenceUpdate(node);
                break;
            case 'chatstate':
                this.chatHandler.handleChatState(node);
                break;
            case 'receipt':
                this.messageHandler.handleReceipt(node);
                break;
            case 'notification':
                this.notificationHandler.handleNotification(node);
                break;
            case 'call':
                this.callHandler.handleCall(node);
                break;
            case 'ib':
                this.handleInfoBroadcast(node);
                break;
            case 'stream:error':
                this.handleStreamError(node);
                break;
            case 'success':
                this.handleSuccess(node);
                break;
            case 'failure':
                this.handleFailure(node);
                break;
            default:
                this.options.logger.debug('Unhandled node:', node);
        }
    }
    
    handleInfoBroadcast(node) {
        // Handle info broadcasts
        this.emit('info.broadcast', node);
    }
    
    handleStreamError(node) {
        const error = new Error(node.attrs?.code || 'Stream error');
        this.emit('connection.update', { 
            connection: 'close',
            lastDisconnect: { error, date: new Date() }
        });
    }
    
    handleSuccess(node) {
        this.emit('connection.success', node);
    }
    
    handleFailure(node) {
        const error = new Error(node.attrs?.reason || 'Connection failure');
        this.emit('connection.update', { 
            connection: 'close',
            lastDisconnect: { error, date: new Date() }
        });
    }
    
    generateMessageId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    // Event handlers
    handleConnectionUpdate(update) {
        // Override in subclasses or handle externally
    }
    
    handleCredsUpdate(creds) {
        // Override in subclasses or handle externally
    }
    
    handleMessagesUpsert(messageUpdate) {
        // Override in subclasses or handle externally
    }
    
    handleMessagesUpdate(messageUpdate) {
        // Override in subclasses or handle externally
    }
    
    handleMessageDelete(deleteInfo) {
        // Override in subclasses or handle externally
    }
    
    handleMessageReaction(reaction) {
        // Override in subclasses or handle externally
    }
    
    handlePresenceUpdate(presence) {
        // Override in subclasses or handle externally
    }
    
    handleChatsUpsert(chats) {
        // Override in subclasses or handle externally
    }
    
    handleChatsUpdate(chats) {
        // Override in subclasses or handle externally
    }
    
    handleChatsDelete(chats) {
        // Override in subclasses or handle externally
    }
    
    handleContactsUpsert(contacts) {
        // Override in subclasses or handle externally
    }
    
    handleContactsUpdate(contacts) {
        // Override in subclasses or handle externally
    }
    
    handleGroupsUpsert(groups) {
        // Override in subclasses or handle externally
    }
    
    handleGroupsUpdate(groups) {
        // Override in subclasses or handle externally
    }
    
    handleGroupParticipantsUpdate(update) {
        // Override in subclasses or handle externally
    }
    
    handleBlocklistSet(blocklist) {
        // Override in subclasses or handle externally
    }
    
    handleBlocklistUpdate(update) {
        // Override in subclasses or handle externally
    }
    
    handleCall(call) {
        // Override in subclasses or handle externally
    }
    
    handleLabelsAssociation(association) {
        // Override in subclasses or handle externally
    }
    
    handleLabelsEdit(edit) {
        // Override in subclasses or handle externally
    }
    
    async disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
        }
        this.stopKeepAlive();
        this.clearPendingQueries();
    }
    
    getConnectionState() {
        return {
            connection: this.connectionState,
            isConnected: this.isConnected,
            lastDisconnectReason: this.lastDisconnectReason,
            lastDisconnectTime: this.lastDisconnectTime,
            connectTime: this.connectTime,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

module.exports = WASocket;