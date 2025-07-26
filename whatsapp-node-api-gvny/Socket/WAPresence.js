const crypto = require('crypto');

class WAPresence {
    constructor(socket) {
        this.socket = socket;
        this.presenceCache = new Map();
        this.presenceSubscriptions = new Set();
        this.typingTimeouts = new Map();
        this.lastSeenCache = new Map();
        
        // Presence types
        this.presenceTypes = {
            UNAVAILABLE: 'unavailable',
            AVAILABLE: 'available',
            COMPOSING: 'composing',
            RECORDING: 'recording',
            PAUSED: 'paused'
        };
        
        // Chat states
        this.chatStates = {
            TYPING: 'composing',
            RECORDING_AUDIO: 'recording',
            STOPPED: 'paused'
        };
        
        // Presence intervals
        this.presenceInterval = null;
        this.keepAliveInterval = 30000; // 30 seconds
        this.typingTimeout = 10000; // 10 seconds
    }
    
    async subscribeToPresence(jid) {
        try {
            if (this.presenceSubscriptions.has(jid)) {
                return true;
            }
            
            const subscribeNode = {
                tag: 'presence',
                attrs: {
                    type: 'subscribe',
                    to: jid
                }
            };
            
            await this.socket.sendNode(subscribeNode);
            this.presenceSubscriptions.add(jid);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to subscribe to presence: ${error.message}`);
        }
    }
    
    async unsubscribeFromPresence(jid) {
        try {
            if (!this.presenceSubscriptions.has(jid)) {
                return true;
            }
            
            const unsubscribeNode = {
                tag: 'presence',
                attrs: {
                    type: 'unsubscribe',
                    to: jid
                }
            };
            
            await this.socket.sendNode(unsubscribeNode);
            this.presenceSubscriptions.delete(jid);
            
            // Clean up cache
            this.presenceCache.delete(jid);
            this.lastSeenCache.delete(jid);
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to unsubscribe from presence: ${error.message}`);
        }
    }
    
    async sendPresence(type = 'available', to = null) {
        try {
            const presenceNode = {
                tag: 'presence',
                attrs: {
                    type: type
                }
            };
            
            if (to) {
                presenceNode.attrs.to = to;
            }
            
            await this.socket.sendNode(presenceNode);
            
            // Update own presence cache
            if (!to && this.socket.user?.id) {
                this.presenceCache.set(this.socket.user.id, {
                    presence: type,
                    lastKnownPresence: type,
                    lastSeen: type === 'unavailable' ? Date.now() : null,
                    timestamp: Date.now()
                });
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to send presence: ${error.message}`);
        }
    }
    
    async sendChatState(jid, state) {
        try {
            const chatStateNode = {
                tag: 'chatstate',
                attrs: {
                    to: jid
                },
                content: [{
                    tag: state,
                    attrs: {
                        media: state === 'recording' ? 'audio' : undefined
                    }
                }]
            };
            
            await this.socket.sendNode(chatStateNode);
            
            // Set timeout to stop typing
            if (state === this.chatStates.TYPING || state === this.chatStates.RECORDING_AUDIO) {
                this.setTypingTimeout(jid);
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to send chat state: ${error.message}`);
        }
    }
    
    async sendTyping(jid) {
        return this.sendChatState(jid, this.chatStates.TYPING);
    }
    
    async sendRecording(jid) {
        return this.sendChatState(jid, this.chatStates.RECORDING_AUDIO);
    }
    
    async sendStoppedTyping(jid) {
        return this.sendChatState(jid, this.chatStates.STOPPED);
    }
    
    async setOnline() {
        return this.sendPresence(this.presenceTypes.AVAILABLE);
    }
    
    async setOffline() {
        return this.sendPresence(this.presenceTypes.UNAVAILABLE);
    }
    
    async setLastSeen(timestamp = null) {
        try {
            const lastSeenNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'set',
                    xmlns: 'jabber:iq:last'
                },
                content: [{
                    tag: 'query',
                    attrs: {
                        seconds: timestamp ? Math.floor((Date.now() - timestamp) / 1000).toString() : '0'
                    }
                }]
            };
            
            const response = await this.socket.query(lastSeenNode);
            
            if (response.attrs?.type === 'error') {
                throw new Error('Failed to set last seen');
            }
            
            return true;
            
        } catch (error) {
            throw new Error(`Failed to set last seen: ${error.message}`);
        }
    }
    
    async getLastSeen(jid) {
        try {
            // Check cache first
            if (this.lastSeenCache.has(jid)) {
                return this.lastSeenCache.get(jid);
            }
            
            const lastSeenNode = {
                tag: 'iq',
                attrs: {
                    id: this.generateId(),
                    type: 'get',
                    xmlns: 'jabber:iq:last',
                    to: jid
                },
                content: [{
                    tag: 'query'
                }]
            };
            
            const response = await this.socket.query(lastSeenNode);
            
            if (response.attrs?.type === 'error') {
                return null;
            }
            
            const lastSeen = this.parseLastSeen(response);
            
            // Cache last seen
            if (lastSeen) {
                this.lastSeenCache.set(jid, lastSeen);
            }
            
            return lastSeen;
            
        } catch (error) {
            this.socket.options.logger.error('Error getting last seen:', error);
            return null;
        }
    }
    
    handlePresenceUpdate(node) {
        try {
            const attrs = node.attrs || {};
            const from = attrs.from;
            const type = attrs.type || 'available';
            const timestamp = Date.now();
            
            if (!from) return;
            
            // Parse presence info
            const presenceInfo = {
                presence: type,
                lastKnownPresence: type,
                lastSeen: type === 'unavailable' ? timestamp : null,
                timestamp: timestamp
            };
            
            // Parse additional presence data
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'status':
                                presenceInfo.status = child.content || '';
                                break;
                            case 'show':
                                presenceInfo.show = child.content || '';
                                break;
                            case 'priority':
                                presenceInfo.priority = parseInt(child.content) || 0;
                                break;
                            case 'last':
                                presenceInfo.lastSeen = parseInt(child.attrs?.seconds) * 1000 || null;
                                break;
                        }
                    }
                }
            }
            
            // Update presence cache
            this.presenceCache.set(from, presenceInfo);
            
            // Update last seen cache if user went offline
            if (type === 'unavailable' && presenceInfo.lastSeen) {
                this.lastSeenCache.set(from, {
                    lastSeen: presenceInfo.lastSeen,
                    timestamp: timestamp
                });
            }
            
            // Emit presence update event
            this.socket.emit('presence.update', {
                id: from,
                presences: {
                    [from]: presenceInfo
                }
            });
            
        } catch (error) {
            this.socket.options.logger.error('Error handling presence update:', error);
        }
    }
    
    handleChatState(node) {
        try {
            const attrs = node.attrs || {};
            const from = attrs.from;
            const participant = attrs.participant;
            const timestamp = Date.now();
            
            if (!from) return;
            
            let chatState = null;
            
            // Parse chat state
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag) {
                        switch (child.tag) {
                            case 'composing':
                                chatState = 'typing';
                                break;
                            case 'recording':
                                chatState = 'recording';
                                break;
                            case 'paused':
                                chatState = 'stopped';
                                break;
                        }
                        break;
                    }
                }
            }
            
            if (!chatState) return;
            
            // Update presence with chat state
            let presenceInfo = this.presenceCache.get(from) || {
                presence: 'available',
                lastKnownPresence: 'available',
                lastSeen: null,
                timestamp: timestamp
            };
            
            presenceInfo.chatState = chatState;
            presenceInfo.chatStateTimestamp = timestamp;
            
            if (participant) {
                presenceInfo.participant = participant;
            }
            
            this.presenceCache.set(from, presenceInfo);
            
            // Emit presence update with chat state
            this.socket.emit('presence.update', {
                id: from,
                presences: {
                    [participant || from]: {
                        ...presenceInfo,
                        lastKnownPresence: chatState
                    }
                }
            });
            
            // Set timeout to clear chat state
            this.setChatStateTimeout(from, participant);
            
        } catch (error) {
            this.socket.options.logger.error('Error handling chat state:', error);
        }
    }
    
    parseLastSeen(node) {
        try {
            if (node.content && Array.isArray(node.content)) {
                for (const child of node.content) {
                    if (typeof child === 'object' && child.tag === 'query') {
                        const seconds = parseInt(child.attrs?.seconds) || 0;
                        return {
                            lastSeen: Date.now() - (seconds * 1000),
                            timestamp: Date.now()
                        };
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            this.socket.options.logger.error('Error parsing last seen:', error);
            return null;
        }
    }
    
    setTypingTimeout(jid) {
        // Clear existing timeout
        if (this.typingTimeouts.has(jid)) {
            clearTimeout(this.typingTimeouts.get(jid));
        }
        
        // Set new timeout
        const timeout = setTimeout(async () => {
            try {
                await this.sendStoppedTyping(jid);
                this.typingTimeouts.delete(jid);
            } catch (error) {
                this.socket.options.logger.error('Error sending stopped typing:', error);
            }
        }, this.typingTimeout);
        
        this.typingTimeouts.set(jid, timeout);
    }
    
    setChatStateTimeout(jid, participant = null) {
        const key = participant ? `${jid}_${participant}` : jid;
        
        // Clear existing timeout
        if (this.typingTimeouts.has(key)) {
            clearTimeout(this.typingTimeouts.get(key));
        }
        
        // Set new timeout to clear chat state
        const timeout = setTimeout(() => {
            try {
                const presenceInfo = this.presenceCache.get(jid);
                if (presenceInfo) {
                    delete presenceInfo.chatState;
                    delete presenceInfo.chatStateTimestamp;
                    
                    // Emit updated presence
                    this.socket.emit('presence.update', {
                        id: jid,
                        presences: {
                            [participant || jid]: presenceInfo
                        }
                    });
                }
                
                this.typingTimeouts.delete(key);
            } catch (error) {
                this.socket.options.logger.error('Error clearing chat state:', error);
            }
        }, this.typingTimeout);
        
        this.typingTimeouts.set(key, timeout);
    }
    
    startPresenceUpdates() {
        if (this.presenceInterval) {
            return;
        }
        
        this.presenceInterval = setInterval(async () => {
            try {
                await this.sendPresence(this.presenceTypes.AVAILABLE);
            } catch (error) {
                this.socket.options.logger.error('Error sending keep-alive presence:', error);
            }
        }, this.keepAliveInterval);
    }
    
    stopPresenceUpdates() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
        
        // Clear all typing timeouts
        for (const timeout of this.typingTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.typingTimeouts.clear();
    }
    
    getPresence(jid) {
        return this.presenceCache.get(jid) || null;
    }
    
    getAllPresences() {
        const presences = {};
        for (const [jid, presence] of this.presenceCache) {
            presences[jid] = presence;
        }
        return presences;
    }
    
    isOnline(jid) {
        const presence = this.getPresence(jid);
        return presence && presence.presence === 'available';
    }
    
    isTyping(jid, participant = null) {
        const presence = this.getPresence(jid);
        if (!presence) return false;
        
        if (participant && presence.participant !== participant) {
            return false;
        }
        
        return presence.chatState === 'typing';
    }
    
    isRecording(jid, participant = null) {
        const presence = this.getPresence(jid);
        if (!presence) return false;
        
        if (participant && presence.participant !== participant) {
            return false;
        }
        
        return presence.chatState === 'recording';
    }
    
    getLastSeenTimestamp(jid) {
        const presence = this.getPresence(jid);
        if (presence && presence.lastSeen) {
            return presence.lastSeen;
        }
        
        const lastSeen = this.lastSeenCache.get(jid);
        return lastSeen ? lastSeen.lastSeen : null;
    }
    
    generateId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }
    
    clearCache() {
        this.presenceCache.clear();
        this.lastSeenCache.clear();
        this.presenceSubscriptions.clear();
        
        // Clear timeouts
        for (const timeout of this.typingTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.typingTimeouts.clear();
    }
    
    getSubscriptions() {
        return Array.from(this.presenceSubscriptions);
    }
    
    isSubscribed(jid) {
        return this.presenceSubscriptions.has(jid);
    }
    
    // Utility methods for presence management
    async bulkSubscribeToPresence(jids) {
        const results = [];
        
        for (const jid of jids) {
            try {
                await this.subscribeToPresence(jid);
                results.push({ jid, success: true });
            } catch (error) {
                results.push({ jid, success: false, error: error.message });
            }
        }
        
        return results;
    }
    
    async bulkUnsubscribeFromPresence(jids) {
        const results = [];
        
        for (const jid of jids) {
            try {
                await this.unsubscribeFromPresence(jid);
                results.push({ jid, success: true });
            } catch (error) {
                results.push({ jid, success: false, error: error.message });
            }
        }
        
        return results;
    }
    
    getPresenceStats() {
        const stats = {
            totalSubscriptions: this.presenceSubscriptions.size,
            cachedPresences: this.presenceCache.size,
            cachedLastSeen: this.lastSeenCache.size,
            activeTypingTimeouts: this.typingTimeouts.size,
            onlineContacts: 0,
            typingContacts: 0,
            recordingContacts: 0
        };
        
        for (const presence of this.presenceCache.values()) {
            if (presence.presence === 'available') {
                stats.onlineContacts++;
            }
            if (presence.chatState === 'typing') {
                stats.typingContacts++;
            }
            if (presence.chatState === 'recording') {
                stats.recordingContacts++;
            }
        }
        
        return stats;
    }
}

module.exports = WAPresence;