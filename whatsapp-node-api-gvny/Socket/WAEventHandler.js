const { EventEmitter } = require('events');

class WAEventHandler extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        this.socket = socket;
        this.options = options;
        
        // Event queues and processing
        this.eventQueue = [];
        this.processingQueue = false;
        this.maxQueueSize = options.maxQueueSize || 1000;
        this.batchSize = options.batchSize || 10;
        this.processInterval = options.processInterval || 100;
        
        // Event handlers registry
        this.handlers = new Map();
        this.middlewares = [];
        this.eventStats = new Map();
        
        // Event filtering and throttling
        this.eventFilters = new Map();
        this.throttleMap = new Map();
        this.debounceMap = new Map();
        
        this.setupEventHandlers();
        this.startEventProcessor();
    }
    
    setupEventHandlers() {
        // Core event handlers
        this.registerHandler('connection.update', this.handleConnectionUpdate.bind(this));
        this.registerHandler('auth.state', this.handleAuthState.bind(this));
        this.registerHandler('qr.code', this.handleQRCode.bind(this));
        this.registerHandler('pairing.code', this.handlePairingCode.bind(this));
        this.registerHandler('messages.upsert', this.handleMessagesUpsert.bind(this));
        this.registerHandler('messages.update', this.handleMessagesUpdate.bind(this));
        this.registerHandler('message.delete', this.handleMessageDelete.bind(this));
        this.registerHandler('message.reaction', this.handleMessageReaction.bind(this));
        this.registerHandler('presence.update', this.handlePresenceUpdate.bind(this));
        this.registerHandler('chats.update', this.handleChatsUpdate.bind(this));
        this.registerHandler('chats.upsert', this.handleChatsUpsert.bind(this));
        this.registerHandler('chats.delete', this.handleChatsDelete.bind(this));
        this.registerHandler('contacts.update', this.handleContactsUpdate.bind(this));
        this.registerHandler('contacts.upsert', this.handleContactsUpsert.bind(this));
        this.registerHandler('groups.update', this.handleGroupsUpdate.bind(this));
        this.registerHandler('group-participants.update', this.handleGroupParticipantsUpdate.bind(this));
        this.registerHandler('blocklist.set', this.handleBlocklistSet.bind(this));
        this.registerHandler('blocklist.update', this.handleBlocklistUpdate.bind(this));
        this.registerHandler('call', this.handleCall.bind(this));
        this.registerHandler('labels.association', this.handleLabelsAssociation.bind(this));
        this.registerHandler('labels.edit', this.handleLabelsEdit.bind(this));
    }
    
    registerHandler(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }
    
    unregisterHandler(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    
    addMiddleware(middleware) {
        this.middlewares.push(middleware);
    }
    
    removeMiddleware(middleware) {
        const index = this.middlewares.indexOf(middleware);
        if (index > -1) {
            this.middlewares.splice(index, 1);
        }
    }
    
    addEventFilter(event, filter) {
        if (!this.eventFilters.has(event)) {
            this.eventFilters.set(event, []);
        }
        this.eventFilters.get(event).push(filter);
    }
    
    setThrottle(event, delay) {
        this.throttleMap.set(event, delay);
    }
    
    setDebounce(event, delay) {
        this.debounceMap.set(event, delay);
    }
    
    emitEvent(event, ...args) {
        // Apply filters
        if (this.eventFilters.has(event)) {
            const filters = this.eventFilters.get(event);
            for (const filter of filters) {
                if (!filter(...args)) {
                    return; // Event filtered out
                }
            }
        }
        
        // Apply throttling
        if (this.throttleMap.has(event)) {
            const delay = this.throttleMap.get(event);
            const now = Date.now();
            const lastEmitted = this.throttleMap.get(`${event}_last`) || 0;
            
            if (now - lastEmitted < delay) {
                return; // Throttled
            }
            
            this.throttleMap.set(`${event}_last`, now);
        }
        
        // Apply debouncing
        if (this.debounceMap.has(event)) {
            const delay = this.debounceMap.get(event);
            const timeoutKey = `${event}_timeout`;
            
            if (this.debounceMap.has(timeoutKey)) {
                clearTimeout(this.debounceMap.get(timeoutKey));
            }
            
            const timeout = setTimeout(() => {
                this.debounceMap.delete(timeoutKey);
                this.processEvent(event, ...args);
            }, delay);
            
            this.debounceMap.set(timeoutKey, timeout);
            return;
        }
        
        this.processEvent(event, ...args);
    }
    
    processEvent(event, ...args) {
        // Add to queue
        this.eventQueue.push({ event, args, timestamp: Date.now() });
        
        // Maintain queue size
        if (this.eventQueue.length > this.maxQueueSize) {
            this.eventQueue.shift(); // Remove oldest event
        }
        
        // Update stats
        if (!this.eventStats.has(event)) {
            this.eventStats.set(event, { count: 0, lastProcessed: 0 });
        }
        const stats = this.eventStats.get(event);
        stats.count++;
        stats.lastProcessed = Date.now();
    }
    
    startEventProcessor() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
        }
        
        this.processingInterval = setInterval(() => {
            this.processEventQueue();
        }, this.processInterval);
    }
    
    stopEventProcessor() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
    }
    
    async processEventQueue() {
        if (this.processingQueue || this.eventQueue.length === 0) {
            return;
        }
        
        this.processingQueue = true;
        
        try {
            const batch = this.eventQueue.splice(0, this.batchSize);
            
            for (const { event, args } of batch) {
                await this.executeEventHandlers(event, ...args);
            }
        } catch (error) {
            this.emit('error', new Error(`Event processing error: ${error.message}`));
        } finally {
            this.processingQueue = false;
        }
    }
    
    async executeEventHandlers(event, ...args) {
        // Apply middlewares
        let processedArgs = args;
        for (const middleware of this.middlewares) {
            try {
                const result = await middleware(event, ...processedArgs);
                if (result === false) {
                    return; // Middleware blocked the event
                }
                if (Array.isArray(result)) {
                    processedArgs = result;
                }
            } catch (error) {
                this.emit('error', new Error(`Middleware error: ${error.message}`));
            }
        }
        
        // Execute registered handlers
        const handlers = this.handlers.get(event) || [];
        for (const handler of handlers) {
            try {
                await handler(...processedArgs);
            } catch (error) {
                this.emit('error', new Error(`Handler error for ${event}: ${error.message}`));
            }
        }
        
        // Emit to EventEmitter
        this.emit(event, ...processedArgs);
    }
    
    // Core event handlers
    handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;
        
        if (connection === 'close') {
            this.emit('connection.close', lastDisconnect);
        } else if (connection === 'connecting') {
            this.emit('connection.connecting');
        } else if (connection === 'open') {
            this.emit('connection.open');
            if (receivedPendingNotifications) {
                this.emit('connection.ready');
            }
        }
        
        if (qr) {
            this.emit('qr', qr);
        }
    }
    
    handleAuthState(state) {
        this.emit('auth.state.update', state);
        
        if (state.creds) {
            this.emit('auth.creds.update', state.creds);
        }
        
        if (state.keys) {
            this.emit('auth.keys.update', state.keys);
        }
    }
    
    handleQRCode(qr) {
        this.emit('qr.generated', qr);
    }
    
    handlePairingCode(code) {
        this.emit('pairing.code.generated', code);
    }
    
    handleMessagesUpsert(messageUpdate) {
        const { messages, type } = messageUpdate;
        
        for (const message of messages) {
            this.emit('message.new', message);
            
            // Handle specific message types
            if (message.message?.conversation) {
                this.emit('message.text', message);
            }
            
            if (message.message?.imageMessage) {
                this.emit('message.image', message);
            }
            
            if (message.message?.videoMessage) {
                this.emit('message.video', message);
            }
            
            if (message.message?.audioMessage) {
                this.emit('message.audio', message);
            }
            
            if (message.message?.documentMessage) {
                this.emit('message.document', message);
            }
            
            if (message.message?.stickerMessage) {
                this.emit('message.sticker', message);
            }
            
            if (message.message?.locationMessage) {
                this.emit('message.location', message);
            }
            
            if (message.message?.contactMessage) {
                this.emit('message.contact', message);
            }
            
            if (message.message?.pollCreationMessage) {
                this.emit('message.poll', message);
            }
        }
        
        this.emit('messages.batch', { messages, type });
    }
    
    handleMessagesUpdate(updates) {
        for (const update of updates) {
            this.emit('message.update', update);
            
            if (update.update.status) {
                this.emit('message.status.update', update);
            }
            
            if (update.update.reactions) {
                this.emit('message.reactions.update', update);
            }
        }
    }
    
    handleMessageDelete(deletion) {
        this.emit('message.deleted', deletion);
    }
    
    handleMessageReaction(reaction) {
        this.emit('message.reaction.update', reaction);
    }
    
    handlePresenceUpdate(presence) {
        const { id, presences } = presence;
        
        for (const [jid, presenceData] of Object.entries(presences)) {
            this.emit('presence.user.update', { jid, presence: presenceData });
            
            if (presenceData.lastKnownPresence === 'composing') {
                this.emit('user.typing', { jid, chatId: id });
            } else if (presenceData.lastKnownPresence === 'recording') {
                this.emit('user.recording', { jid, chatId: id });
            } else if (presenceData.lastKnownPresence === 'available') {
                this.emit('user.online', { jid, chatId: id });
            } else if (presenceData.lastKnownPresence === 'unavailable') {
                this.emit('user.offline', { jid, chatId: id });
            }
        }
    }
    
    handleChatsUpdate(chats) {
        for (const chat of chats) {
            this.emit('chat.update', chat);
            
            if (chat.unreadCount !== undefined) {
                this.emit('chat.unread.update', chat);
            }
            
            if (chat.archived !== undefined) {
                this.emit('chat.archive.update', chat);
            }
            
            if (chat.pinned !== undefined) {
                this.emit('chat.pin.update', chat);
            }
            
            if (chat.muteEndTime !== undefined) {
                this.emit('chat.mute.update', chat);
            }
        }
    }
    
    handleChatsUpsert(chats) {
        for (const chat of chats) {
            this.emit('chat.new', chat);
        }
    }
    
    handleChatsDelete(deletions) {
        for (const deletion of deletions) {
            this.emit('chat.deleted', deletion);
        }
    }
    
    handleContactsUpdate(contacts) {
        for (const contact of contacts) {
            this.emit('contact.update', contact);
            
            if (contact.name !== undefined) {
                this.emit('contact.name.update', contact);
            }
            
            if (contact.status !== undefined) {
                this.emit('contact.status.update', contact);
            }
            
            if (contact.imgUrl !== undefined) {
                this.emit('contact.picture.update', contact);
            }
        }
    }
    
    handleContactsUpsert(contacts) {
        for (const contact of contacts) {
            this.emit('contact.new', contact);
        }
    }
    
    handleGroupsUpdate(groups) {
        for (const group of groups) {
            this.emit('group.update', group);
            
            if (group.subject !== undefined) {
                this.emit('group.subject.update', group);
            }
            
            if (group.desc !== undefined) {
                this.emit('group.description.update', group);
            }
            
            if (group.announce !== undefined) {
                this.emit('group.settings.update', group);
            }
        }
    }
    
    handleGroupParticipantsUpdate(update) {
        const { id, participants, action } = update;
        
        this.emit('group.participants.update', update);
        
        switch (action) {
            case 'add':
                this.emit('group.participants.add', { id, participants });
                break;
            case 'remove':
                this.emit('group.participants.remove', { id, participants });
                break;
            case 'promote':
                this.emit('group.participants.promote', { id, participants });
                break;
            case 'demote':
                this.emit('group.participants.demote', { id, participants });
                break;
        }
    }
    
    handleBlocklistSet(blocklist) {
        this.emit('blocklist.set', blocklist);
    }
    
    handleBlocklistUpdate(update) {
        const { blocklist, type } = update;
        
        this.emit('blocklist.update', update);
        
        if (type === 'add') {
            for (const jid of blocklist) {
                this.emit('contact.blocked', jid);
            }
        } else if (type === 'remove') {
            for (const jid of blocklist) {
                this.emit('contact.unblocked', jid);
            }
        }
    }
    
    handleCall(call) {
        this.emit('call.update', call);
        
        if (call.status === 'offer') {
            this.emit('call.incoming', call);
        } else if (call.status === 'accept') {
            this.emit('call.accepted', call);
        } else if (call.status === 'reject') {
            this.emit('call.rejected', call);
        } else if (call.status === 'timeout') {
            this.emit('call.timeout', call);
        }
    }
    
    handleLabelsAssociation(association) {
        this.emit('labels.association.update', association);
    }
    
    handleLabelsEdit(edit) {
        this.emit('labels.edit', edit);
    }
    
    // Utility methods
    getEventStats() {
        const stats = {};
        for (const [event, data] of this.eventStats) {
            stats[event] = { ...data };
        }
        return stats;
    }
    
    getQueueStats() {
        return {
            queueSize: this.eventQueue.length,
            maxQueueSize: this.maxQueueSize,
            processing: this.processingQueue,
            batchSize: this.batchSize,
            processInterval: this.processInterval
        };
    }
    
    clearEventStats() {
        this.eventStats.clear();
    }
    
    clearEventQueue() {
        this.eventQueue.length = 0;
    }
    
    pauseEventProcessing() {
        this.stopEventProcessor();
    }
    
    resumeEventProcessing() {
        this.startEventProcessor();
    }
    
    cleanup() {
        this.stopEventProcessor();
        this.clearEventQueue();
        this.clearEventStats();
        
        // Clear throttle and debounce timers
        for (const [key, value] of this.debounceMap) {
            if (key.endsWith('_timeout') && typeof value === 'number') {
                clearTimeout(value);
            }
        }
        
        this.handlers.clear();
        this.middlewares.length = 0;
        this.eventFilters.clear();
        this.throttleMap.clear();
        this.debounceMap.clear();
        
        this.removeAllListeners();
    }
}

module.exports = WAEventHandler;