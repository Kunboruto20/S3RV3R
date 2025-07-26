const crypto = require('crypto');
const { Buffer } = require('buffer');

class WAConnection {
    constructor(socket) {
        this.socket = socket;
        this.connectionState = 'closed';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connectionTimeout = 60000;
        this.pingInterval = null;
        this.pongTimeout = null;
        this.lastPingTime = null;
        this.lastPongTime = null;
        this.connectionMetrics = {
            connectTime: null,
            disconnectTime: null,
            totalReconnects: 0,
            totalMessages: 0,
            totalBytes: 0,
            averageLatency: 0,
            latencyHistory: []
        };
        
        // Connection states
        this.states = {
            CLOSED: 'closed',
            CONNECTING: 'connecting',
            CONNECTED: 'connected',
            AUTHENTICATED: 'authenticated',
            READY: 'ready',
            DISCONNECTING: 'disconnecting',
            RECONNECTING: 'reconnecting'
        };
        
        // Error codes
        this.errorCodes = {
            CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
            AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
            PROTOCOL_ERROR: 'PROTOCOL_ERROR',
            NETWORK_ERROR: 'NETWORK_ERROR',
            SERVER_ERROR: 'SERVER_ERROR',
            RATE_LIMITED: 'RATE_LIMITED',
            BANNED: 'BANNED'
        };
    }
    
    async initialize() {
        try {
            this.connectionState = this.states.CONNECTING;
            this.connectionMetrics.connectTime = Date.now();
            
            // Initialize connection components
            await this.setupConnectionHandlers();
            await this.initializeProtocol();
            
            this.socket.options.logger.info('Connection initialized');
            
        } catch (error) {
            this.connectionState = this.states.CLOSED;
            throw new Error(`Failed to initialize connection: ${error.message}`);
        }
    }
    
    async connect() {
        try {
            if (this.connectionState !== this.states.CLOSED && this.connectionState !== this.states.RECONNECTING) {
                throw new Error(`Cannot connect from state: ${this.connectionState}`);
            }
            
            this.connectionState = this.states.CONNECTING;
            this.socket.emit('connection.update', { 
                connection: this.connectionState,
                timestamp: Date.now()
            });
            
            // Establish WebSocket connection
            await this.establishWebSocketConnection();
            
            // Start authentication process
            await this.authenticate();
            
            // Complete connection setup
            await this.completeConnection();
            
            this.connectionState = this.states.READY;
            this.reconnectAttempts = 0;
            
            this.socket.emit('connection.update', { 
                connection: this.connectionState,
                timestamp: Date.now()
            });
            
            this.socket.options.logger.info('Connection established successfully');
            
        } catch (error) {
            await this.handleConnectionError(error);
            throw error;
        }
    }
    
    async disconnect(reason = 'User requested') {
        try {
            this.connectionState = this.states.DISCONNECTING;
            this.connectionMetrics.disconnectTime = Date.now();
            
            // Stop ping/pong
            this.stopPingPong();
            
            // Close WebSocket
            if (this.socket.ws) {
                this.socket.ws.close(1000, reason);
            }
            
            // Clean up
            await this.cleanup();
            
            this.connectionState = this.states.CLOSED;
            
            this.socket.emit('connection.update', { 
                connection: this.connectionState,
                lastDisconnect: {
                    reason: reason,
                    timestamp: Date.now()
                }
            });
            
            this.socket.options.logger.info(`Disconnected: ${reason}`);
            
        } catch (error) {
            this.socket.options.logger.error('Error during disconnect:', error);
        }
    }
    
    async reconnect() {
        try {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                throw new Error('Maximum reconnection attempts reached');
            }
            
            this.connectionState = this.states.RECONNECTING;
            this.reconnectAttempts++;
            this.connectionMetrics.totalReconnects++;
            
            this.socket.emit('connection.update', { 
                connection: this.connectionState,
                reconnectAttempt: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts,
                timestamp: Date.now()
            });
            
            // Wait before reconnecting
            const delay = this.calculateReconnectDelay();
            await this.sleep(delay);
            
            // Attempt reconnection
            await this.connect();
            
            this.socket.options.logger.info(`Reconnected successfully (attempt ${this.reconnectAttempts})`);
            
        } catch (error) {
            this.socket.options.logger.error(`Reconnection failed (attempt ${this.reconnectAttempts}):`, error);
            
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                // Schedule next reconnection attempt
                setTimeout(() => {
                    this.reconnect().catch(err => {
                        this.socket.options.logger.error('Reconnection scheduling failed:', err);
                    });
                }, this.calculateReconnectDelay());
            } else {
                this.connectionState = this.states.CLOSED;
                this.socket.emit('connection.update', { 
                    connection: this.connectionState,
                    lastDisconnect: {
                        reason: 'Max reconnection attempts reached',
                        timestamp: Date.now()
                    }
                });
            }
            
            throw error;
        }
    }
    
    async establishWebSocketConnection() {
        try {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WebSocket connection timeout'));
                }, this.connectionTimeout);
                
                this.socket.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connectionState = this.states.CONNECTED;
                    this.startPingPong();
                    resolve();
                };
                
                this.socket.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    reject(new Error(`WebSocket error: ${error.message}`));
                };
                
                this.socket.ws.onclose = (event) => {
                    clearTimeout(timeout);
                    this.handleWebSocketClose(event);
                };
            });
            
        } catch (error) {
            throw new Error(`Failed to establish WebSocket connection: ${error.message}`);
        }
    }
    
    async authenticate() {
        try {
            this.connectionState = this.states.CONNECTING;
            
            // Send authentication handshake
            const authNode = await this.socket.auth.createHandshakeNode();
            await this.socket.sendNode(authNode);
            
            // Wait for authentication response
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Authentication timeout'));
                }, this.connectionTimeout);
                
                const handleAuthResponse = (update) => {
                    clearTimeout(timeout);
                    this.socket.off('connection.update', handleAuthResponse);
                    
                    if (update.connection === 'authenticated') {
                        this.connectionState = this.states.AUTHENTICATED;
                        resolve();
                    } else if (update.lastDisconnect?.error) {
                        reject(update.lastDisconnect.error);
                    }
                };
                
                this.socket.on('connection.update', handleAuthResponse);
            });
            
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }
    
    async completeConnection() {
        try {
            // Send initial queries
            await this.sendInitialQueries();
            
            // Subscribe to presence updates
            if (this.socket.options.markOnlineOnConnect) {
                await this.socket.presence.setOnline();
            }
            
            // Start presence updates
            this.socket.presence.startPresenceUpdates();
            
            this.socket.options.logger.info('Connection setup completed');
            
        } catch (error) {
            throw new Error(`Failed to complete connection setup: ${error.message}`);
        }
    }
    
    async sendInitialQueries() {
        try {
            if (!this.socket.options.fireInitQueries) {
                return;
            }
            
            const queries = [];
            
            // Query for chats
            queries.push(this.queryChats());
            
            // Query for contacts
            queries.push(this.queryContacts());
            
            // Query for blocklist
            queries.push(this.queryBlocklist());
            
            // Execute queries in parallel
            await Promise.allSettled(queries);
            
        } catch (error) {
            this.socket.options.logger.error('Error sending initial queries:', error);
        }
    }
    
    async queryChats() {
        try {
            const chatsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:chat'
                },
                content: [{
                    tag: 'chats'
                }]
            };
            
            const response = await this.socket.query(chatsNode);
            this.parseChatsResponse(response);
            
        } catch (error) {
            this.socket.options.logger.error('Error querying chats:', error);
        }
    }
    
    async queryContacts() {
        try {
            const contactsNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'w:contacts'
                },
                content: [{
                    tag: 'contacts'
                }]
            };
            
            const response = await this.socket.query(contactsNode);
            this.parseContactsResponse(response);
            
        } catch (error) {
            this.socket.options.logger.error('Error querying contacts:', error);
        }
    }
    
    async queryBlocklist() {
        try {
            const blocklistNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'list'
                }]
            };
            
            const response = await this.socket.query(blocklistNode);
            this.parseBlocklistResponse(response);
            
        } catch (error) {
            this.socket.options.logger.error('Error querying blocklist:', error);
        }
    }
    
    parseChatsResponse(node) {
        try {
            const chats = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'chats') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const chatChild of child.content) {
                                if (typeof chatChild === 'object' && chatChild.tag === 'chat') {
                                    const chat = this.parseChatInfo(chatChild);
                                    if (chat) {
                                        chats.push(chat);
                                        this.socket.chats.set(chat.id, chat);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (chats.length > 0) {
                this.socket.emit('chats.upsert', chats);
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing chats response:', error);
        }
    }
    
    parseContactsResponse(node) {
        try {
            const contacts = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'contacts') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const contactChild of child.content) {
                                if (typeof contactChild === 'object' && contactChild.tag === 'contact') {
                                    const contact = this.parseContactInfo(contactChild);
                                    if (contact) {
                                        contacts.push(contact);
                                        this.socket.contacts.set(contact.id, contact);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (contacts.length > 0) {
                this.socket.emit('contacts.upsert', contacts);
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing contacts response:', error);
        }
    }
    
    parseBlocklistResponse(node) {
        try {
            const blockedJids = [];
            
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'list') {
                        if (child.content && Array.isArray(child.content)) {
                            for (const itemChild of child.content) {
                                if (typeof itemChild === 'object' && itemChild.tag === 'item') {
                                    const jid = itemChild.attrs?.jid;
                                    if (jid) {
                                        blockedJids.push(jid);
                                        this.socket.blocklist.add(jid);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (blockedJids.length > 0) {
                this.socket.emit('blocklist.set', {
                    blocklist: blockedJids
                });
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing blocklist response:', error);
        }
    }
    
    parseChatInfo(node) {
        try {
            const attrs = node.attrs || {};
            return {
                id: attrs.jid || '',
                name: attrs.name || '',
                unreadCount: parseInt(attrs.count) || 0,
                lastMessageTime: parseInt(attrs.t) * 1000 || 0,
                pinned: attrs.pin === '1',
                archived: attrs.archive === 'true',
                muted: attrs.mute ? parseInt(attrs.mute) * 1000 : null
            };
        } catch (error) {
            return null;
        }
    }
    
    parseContactInfo(node) {
        try {
            const attrs = node.attrs || {};
            return {
                id: attrs.jid || '',
                name: attrs.name || '',
                notify: attrs.notify || '',
                status: attrs.status || ''
            };
        } catch (error) {
            return null;
        }
    }
    
    startPingPong() {
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 30000); // 30 seconds
    }
    
    stopPingPong() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
    }
    
    sendPing() {
        try {
            if (this.socket.ws && this.socket.ws.readyState === 1) {
                this.lastPingTime = Date.now();
                this.socket.ws.ping();
                
                // Set pong timeout
                this.pongTimeout = setTimeout(() => {
                    this.socket.options.logger.warn('Pong timeout - connection may be lost');
                    this.handleConnectionTimeout();
                }, 10000); // 10 seconds
            }
        } catch (error) {
            this.socket.options.logger.error('Error sending ping:', error);
        }
    }
    
    handlePong() {
        try {
            this.lastPongTime = Date.now();
            
            if (this.pongTimeout) {
                clearTimeout(this.pongTimeout);
                this.pongTimeout = null;
            }
            
            // Calculate latency
            if (this.lastPingTime) {
                const latency = this.lastPongTime - this.lastPingTime;
                this.updateLatencyMetrics(latency);
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling pong:', error);
        }
    }
    
    updateLatencyMetrics(latency) {
        this.connectionMetrics.latencyHistory.push(latency);
        
        // Keep only last 10 latency measurements
        if (this.connectionMetrics.latencyHistory.length > 10) {
            this.connectionMetrics.latencyHistory.shift();
        }
        
        // Calculate average latency
        const sum = this.connectionMetrics.latencyHistory.reduce((a, b) => a + b, 0);
        this.connectionMetrics.averageLatency = sum / this.connectionMetrics.latencyHistory.length;
    }
    
    handleWebSocketClose(event) {
        try {
            this.stopPingPong();
            this.connectionMetrics.disconnectTime = Date.now();
            
            const { code, reason } = event;
            
            this.socket.options.logger.info(`WebSocket closed: ${code} ${reason}`);
            
            // Determine if we should reconnect
            if (this.shouldReconnect(code)) {
                this.reconnect().catch(error => {
                    this.socket.options.logger.error('Auto-reconnection failed:', error);
                });
            } else {
                this.connectionState = this.states.CLOSED;
                this.socket.emit('connection.update', { 
                    connection: this.connectionState,
                    lastDisconnect: {
                        reason: `WebSocket closed: ${code} ${reason}`,
                        timestamp: Date.now()
                    }
                });
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling WebSocket close:', error);
        }
    }
    
    handleConnectionError(error) {
        try {
            this.connectionState = this.states.CLOSED;
            this.connectionMetrics.disconnectTime = Date.now();
            
            this.socket.emit('connection.update', { 
                connection: this.connectionState,
                lastDisconnect: {
                    error: error,
                    timestamp: Date.now()
                }
            });
            
            this.socket.options.logger.error('Connection error:', error);
            
        } catch (err) {
            this.socket.options.logger.error('Error handling connection error:', err);
        }
    }
    
    handleConnectionTimeout() {
        try {
            this.socket.options.logger.warn('Connection timeout detected');
            
            if (this.socket.ws) {
                this.socket.ws.close(1000, 'Connection timeout');
            }
            
        } catch (error) {
            this.socket.options.logger.error('Error handling connection timeout:', error);
        }
    }
    
    shouldReconnect(code) {
        // Don't reconnect on normal closure or authentication failures
        if (code === 1000 || code === 1001 || code === 4401 || code === 4403) {
            return false;
        }
        
        return this.reconnectAttempts < this.maxReconnectAttempts;
    }
    
    calculateReconnectDelay() {
        // Exponential backoff with jitter
        const baseDelay = this.reconnectDelay;
        const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
        const jitter = Math.random() * 1000; // 0-1000ms jitter
        
        return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
    }
    
    async setupConnectionHandlers() {
        // Set up event handlers for connection management
        this.socket.on('connection.update', this.handleConnectionUpdate.bind(this));
    }
    
    async initializeProtocol() {
        // Initialize protocol-specific components
        this.socket.options.logger.info('Protocol initialized');
    }
    
    async cleanup() {
        try {
            // Stop intervals and timeouts
            this.stopPingPong();
            
            // Clear caches if needed
            // this.socket.clearCache();
            
            this.socket.options.logger.info('Connection cleanup completed');
            
        } catch (error) {
            this.socket.options.logger.error('Error during cleanup:', error);
        }
    }
    
    handleConnectionUpdate(update) {
        // Handle connection state updates
        this.socket.options.logger.debug('Connection update:', update);
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getConnectionState() {
        return this.connectionState;
    }
    
    getConnectionMetrics() {
        return {
            ...this.connectionMetrics,
            currentState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            isConnected: this.connectionState === this.states.READY,
            uptime: this.connectionMetrics.connectTime ? Date.now() - this.connectionMetrics.connectTime : 0
        };
    }
    
    isConnected() {
        return this.connectionState === this.states.READY;
    }
    
    isConnecting() {
        return this.connectionState === this.states.CONNECTING || 
               this.connectionState === this.states.RECONNECTING;
    }
    
    updateMessageMetrics(messageSize) {
        this.connectionMetrics.totalMessages++;
        this.connectionMetrics.totalBytes += messageSize;
    }
}

module.exports = WAConnection;