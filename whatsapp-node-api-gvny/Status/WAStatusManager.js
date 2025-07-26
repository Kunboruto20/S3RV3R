const EventEmitter = require('events');

/**
 * WhatsApp Status Manager
 * Handles status updates, presence, and activity management
 */
class WAStatusManager extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            enableStatus: options.enableStatus !== false,
            enablePresence: options.enablePresence !== false,
            enableActivity: options.enableActivity !== false,
            statusTimeout: options.statusTimeout || 300000, // 5 minutes
            presenceInterval: options.presenceInterval || 30000, // 30 seconds
            ...options
        };

        // Status data
        this.currentStatus = null;
        this.presenceState = 'unavailable';
        this.lastSeen = null;
        this.statusHistory = [];
        this.presenceSubscriptions = new Set();

        // Status types
        this.statusTypes = {
            AVAILABLE: 'available',
            BUSY: 'busy',
            AWAY: 'away',
            UNAVAILABLE: 'unavailable',
            COMPOSING: 'composing',
            RECORDING: 'recording',
            PAUSED: 'paused'
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.loadStatusHistory();
            this.setupSocketEventHandlers();
            this.startPresenceUpdates();
            this.emit('status:ready');
        } catch (error) {
            this.emit('status:error', error);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Presence updates
        this.socket.on('presence.update', (presence) => {
            this.handlePresenceUpdate(presence);
        });

        // Status updates
        this.socket.on('status.update', (status) => {
            this.handleStatusUpdate(status);
        });
    }

    // Status management
    async setStatus(status, message = '') {
        try {
            const statusData = {
                status: status,
                message: message,
                timestamp: new Date().toISOString()
            };

            const query = {
                tag: 'presence',
                attrs: {
                    type: status,
                    ...(message && { status: message })
                }
            };

            await this.socket.sendNode(query);
            
            this.currentStatus = statusData;
            this.statusHistory.push(statusData);
            
            // Keep only last 100 status updates
            if (this.statusHistory.length > 100) {
                this.statusHistory = this.statusHistory.slice(-100);
            }

            this.emit('status:updated', statusData);
            return statusData;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    async setPresence(jid, presence) {
        try {
            const query = {
                tag: 'presence',
                attrs: {
                    to: jid,
                    type: presence
                }
            };

            await this.socket.sendNode(query);
            this.emit('presence:sent', { jid, presence });
            return true;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    // Typing indicators
    async sendTyping(jid, isTyping = true) {
        try {
            const presence = isTyping ? this.statusTypes.COMPOSING : this.statusTypes.PAUSED;
            await this.setPresence(jid, presence);
            return true;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    async sendRecording(jid, isRecording = true) {
        try {
            const presence = isRecording ? this.statusTypes.RECORDING : this.statusTypes.PAUSED;
            await this.setPresence(jid, presence);
            return true;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    // Presence subscription
    async subscribeToPresence(jid) {
        try {
            const query = {
                tag: 'presence',
                attrs: {
                    to: jid,
                    type: 'subscribe'
                }
            };

            await this.socket.sendNode(query);
            this.presenceSubscriptions.add(jid);
            this.emit('presence:subscribed', jid);
            return true;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    async unsubscribeFromPresence(jid) {
        try {
            const query = {
                tag: 'presence',
                attrs: {
                    to: jid,
                    type: 'unsubscribe'
                }
            };

            await this.socket.sendNode(query);
            this.presenceSubscriptions.delete(jid);
            this.emit('presence:unsubscribed', jid);
            return true;
        } catch (error) {
            this.emit('status:error', error);
            throw error;
        }
    }

    // Event handlers
    handlePresenceUpdate(presence) {
        this.emit('presence:update', presence);
    }

    handleStatusUpdate(status) {
        this.emit('status:received', status);
    }

    // Presence updates
    startPresenceUpdates() {
        if (this.presenceTimer) {
            clearInterval(this.presenceTimer);
        }

        this.presenceTimer = setInterval(() => {
            this.updatePresence();
        }, this.options.presenceInterval);
    }

    async updatePresence() {
        try {
            if (this.options.enablePresence) {
                await this.setStatus(this.statusTypes.AVAILABLE);
            }
        } catch (error) {
            // Silent fail for presence updates
        }
    }

    // Utility methods
    async loadStatusHistory() {
        // Load from persistent storage if needed
        this.statusHistory = [];
    }

    getCurrentStatus() {
        return this.currentStatus;
    }

    getPresenceState() {
        return this.presenceState;
    }

    getStatusHistory() {
        return [...this.statusHistory];
    }

    getPresenceSubscriptions() {
        return [...this.presenceSubscriptions];
    }

    // Cleanup
    cleanup() {
        if (this.presenceTimer) {
            clearInterval(this.presenceTimer);
            this.presenceTimer = null;
        }
        this.emit('status:cleanup');
    }
}

module.exports = WAStatusManager;