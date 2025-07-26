const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Data Store
 * Manages all WhatsApp data including messages, chats, contacts, groups
 */
class WAStore extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            storePath: options.storePath || './wa_store',
            autoSave: options.autoSave !== false,
            saveInterval: options.saveInterval || 30000, // 30 seconds
            maxMessages: options.maxMessages || 10000,
            maxChats: options.maxChats || 1000,
            ...options
        };

        // Data stores
        this.messages = new Map();
        this.chats = new Map();
        this.contacts = new Map();
        this.groups = new Map();
        this.groupMetadata = new Map();
        this.presences = new Map();
        this.blocklist = new Set();
        this.labels = new Map();
        this.status = new Map();
        this.calls = new Map();
        this.reactions = new Map();
        this.polls = new Map();
        this.newsletters = new Map();
        this.communities = new Map();
        this.channels = new Map();
        this.businessProfiles = new Map();
        this.catalogs = new Map();
        this.products = new Map();
        this.orders = new Map();
        this.payments = new Map();
        this.devices = new Map();
        this.sessions = new Map();

        // Indexes for fast lookups
        this.messagesByChat = new Map();
        this.messagesByType = new Map();
        this.chatsByType = new Map();
        this.contactsByName = new Map();
        this.groupsByName = new Map();

        // State
        this.user = null;
        this.lastSaveTime = Date.now();
        this.isLoaded = false;
        this.saveTimer = null;

        this.initialize();
    }

    async initialize() {
        try {
            await this.ensureStorePath();
            await this.loadData();
            this.startAutoSave();
            this.isLoaded = true;
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    async ensureStorePath() {
        try {
            await fs.mkdir(this.options.storePath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    // Message operations
    addMessage(message) {
        if (!message || !message.key) return null;

        const messageId = this.getMessageId(message.key);
        const chatId = message.key.remoteJid;

        // Store message
        this.messages.set(messageId, {
            ...message,
            timestamp: message.messageTimestamp || Date.now()
        });

        // Update chat index
        if (!this.messagesByChat.has(chatId)) {
            this.messagesByChat.set(chatId, new Set());
        }
        this.messagesByChat.get(chatId).add(messageId);

        // Update type index
        const messageType = this.getMessageType(message);
        if (!this.messagesByType.has(messageType)) {
            this.messagesByType.set(messageType, new Set());
        }
        this.messagesByType.get(messageType).add(messageId);

        // Cleanup old messages if limit exceeded
        this.cleanupMessages(chatId);

        this.emit('message.add', message);
        return message;
    }

    getMessage(messageKey) {
        const messageId = this.getMessageId(messageKey);
        return this.messages.get(messageId);
    }

    getMessages(chatId, limit = 25, before = null) {
        const chatMessages = this.messagesByChat.get(chatId);
        if (!chatMessages) return [];

        let messages = Array.from(chatMessages)
            .map(id => this.messages.get(id))
            .filter(msg => msg)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (before) {
            const beforeIndex = messages.findIndex(msg => 
                this.getMessageId(msg.key) === this.getMessageId(before)
            );
            if (beforeIndex > -1) {
                messages = messages.slice(beforeIndex + 1);
            }
        }

        return messages.slice(0, limit);
    }

    updateMessage(messageKey, updates) {
        const messageId = this.getMessageId(messageKey);
        const message = this.messages.get(messageId);
        
        if (message) {
            Object.assign(message, updates);
            this.emit('message.update', message);
            return message;
        }
        
        return null;
    }

    deleteMessage(messageKey) {
        const messageId = this.getMessageId(messageKey);
        const message = this.messages.get(messageId);
        
        if (message) {
            this.messages.delete(messageId);
            
            // Remove from indexes
            const chatId = message.key.remoteJid;
            const chatMessages = this.messagesByChat.get(chatId);
            if (chatMessages) {
                chatMessages.delete(messageId);
            }
            
            const messageType = this.getMessageType(message);
            const typeMessages = this.messagesByType.get(messageType);
            if (typeMessages) {
                typeMessages.delete(messageId);
            }
            
            this.emit('message.delete', message);
            return true;
        }
        
        return false;
    }

    // Chat operations
    addChat(chat) {
        if (!chat || !chat.id) return null;

        this.chats.set(chat.id, {
            ...chat,
            lastUpdated: Date.now()
        });

        // Update type index
        const chatType = this.getChatType(chat);
        if (!this.chatsByType.has(chatType)) {
            this.chatsByType.set(chatType, new Set());
        }
        this.chatsByType.get(chatType).add(chat.id);

        this.emit('chat.add', chat);
        return chat;
    }

    getChat(chatId) {
        return this.chats.get(chatId);
    }

    getChats(type = null) {
        if (type) {
            const chatIds = this.chatsByType.get(type) || new Set();
            return Array.from(chatIds).map(id => this.chats.get(id)).filter(chat => chat);
        }
        
        return Array.from(this.chats.values());
    }

    updateChat(chatId, updates) {
        const chat = this.chats.get(chatId);
        if (chat) {
            Object.assign(chat, updates, { lastUpdated: Date.now() });
            this.emit('chat.update', chat);
            return chat;
        }
        return null;
    }

    deleteChat(chatId) {
        const chat = this.chats.get(chatId);
        if (chat) {
            this.chats.delete(chatId);
            
            // Remove from type index
            const chatType = this.getChatType(chat);
            const typeChats = this.chatsByType.get(chatType);
            if (typeChats) {
                typeChats.delete(chatId);
            }
            
            // Remove all messages from this chat
            const chatMessages = this.messagesByChat.get(chatId);
            if (chatMessages) {
                chatMessages.forEach(messageId => {
                    this.messages.delete(messageId);
                });
                this.messagesByChat.delete(chatId);
            }
            
            this.emit('chat.delete', chat);
            return true;
        }
        return false;
    }

    // Contact operations
    addContact(contact) {
        if (!contact || !contact.id) return null;

        this.contacts.set(contact.id, {
            ...contact,
            lastUpdated: Date.now()
        });

        // Update name index
        if (contact.name || contact.pushName) {
            const name = (contact.name || contact.pushName).toLowerCase();
            if (!this.contactsByName.has(name)) {
                this.contactsByName.set(name, new Set());
            }
            this.contactsByName.get(name).add(contact.id);
        }

        this.emit('contact.add', contact);
        return contact;
    }

    getContact(contactId) {
        return this.contacts.get(contactId);
    }

    getContacts() {
        return Array.from(this.contacts.values());
    }

    searchContacts(query) {
        const lowerQuery = query.toLowerCase();
        const results = new Set();

        // Search by name
        for (const [name, contactIds] of this.contactsByName) {
            if (name.includes(lowerQuery)) {
                contactIds.forEach(id => results.add(id));
            }
        }

        // Search by phone number
        for (const contact of this.contacts.values()) {
            if (contact.id.includes(query) || 
                (contact.phone && contact.phone.includes(query))) {
                results.add(contact.id);
            }
        }

        return Array.from(results).map(id => this.contacts.get(id));
    }

    updateContact(contactId, updates) {
        const contact = this.contacts.get(contactId);
        if (contact) {
            // Update name index if name changed
            if (updates.name && updates.name !== contact.name) {
                const oldName = (contact.name || '').toLowerCase();
                const newName = updates.name.toLowerCase();
                
                if (oldName && this.contactsByName.has(oldName)) {
                    this.contactsByName.get(oldName).delete(contactId);
                }
                
                if (!this.contactsByName.has(newName)) {
                    this.contactsByName.set(newName, new Set());
                }
                this.contactsByName.get(newName).add(contactId);
            }

            Object.assign(contact, updates, { lastUpdated: Date.now() });
            this.emit('contact.update', contact);
            return contact;
        }
        return null;
    }

    // Group operations
    addGroup(group) {
        if (!group || !group.id) return null;

        this.groups.set(group.id, {
            ...group,
            lastUpdated: Date.now()
        });

        // Update name index
        if (group.subject) {
            const name = group.subject.toLowerCase();
            if (!this.groupsByName.has(name)) {
                this.groupsByName.set(name, new Set());
            }
            this.groupsByName.get(name).add(group.id);
        }

        this.emit('group.add', group);
        return group;
    }

    getGroup(groupId) {
        return this.groups.get(groupId);
    }

    getGroups() {
        return Array.from(this.groups.values());
    }

    updateGroup(groupId, updates) {
        const group = this.groups.get(groupId);
        if (group) {
            Object.assign(group, updates, { lastUpdated: Date.now() });
            this.emit('group.update', group);
            return group;
        }
        return null;
    }

    // Presence operations
    updatePresence(jid, presence) {
        this.presences.set(jid, {
            ...presence,
            lastUpdated: Date.now()
        });
        this.emit('presence.update', { jid, presence });
    }

    getPresence(jid) {
        return this.presences.get(jid);
    }

    // Reaction operations
    addReaction(messageKey, reaction) {
        const messageId = this.getMessageId(messageKey);
        if (!this.reactions.has(messageId)) {
            this.reactions.set(messageId, new Map());
        }
        
        const messageReactions = this.reactions.get(messageId);
        messageReactions.set(reaction.key.participant || reaction.key.remoteJid, reaction);
        
        this.emit('reaction.add', { messageKey, reaction });
    }

    getReactions(messageKey) {
        const messageId = this.getMessageId(messageKey);
        const reactions = this.reactions.get(messageId);
        return reactions ? Array.from(reactions.values()) : [];
    }

    // Utility methods
    getMessageId(messageKey) {
        return `${messageKey.remoteJid}_${messageKey.id}_${messageKey.fromMe}`;
    }

    getMessageType(message) {
        if (message.message) {
            const messageTypes = Object.keys(message.message);
            return messageTypes.find(type => message.message[type]) || 'unknown';
        }
        return 'unknown';
    }

    getChatType(chat) {
        if (chat.id.endsWith('@g.us')) return 'group';
        if (chat.id.endsWith('@broadcast')) return 'broadcast';
        if (chat.id === 'status@broadcast') return 'status';
        return 'individual';
    }

    cleanupMessages(chatId) {
        const chatMessages = this.messagesByChat.get(chatId);
        if (chatMessages && chatMessages.size > this.options.maxMessages) {
            const messages = Array.from(chatMessages)
                .map(id => ({ id, message: this.messages.get(id) }))
                .filter(item => item.message)
                .sort((a, b) => a.message.timestamp - b.message.timestamp);

            const toDelete = messages.slice(0, messages.length - this.options.maxMessages);
            toDelete.forEach(item => {
                this.messages.delete(item.id);
                chatMessages.delete(item.id);
            });
        }
    }

    // Persistence
    async saveData() {
        try {
            const data = {
                messages: Array.from(this.messages.entries()),
                chats: Array.from(this.chats.entries()),
                contacts: Array.from(this.contacts.entries()),
                groups: Array.from(this.groups.entries()),
                groupMetadata: Array.from(this.groupMetadata.entries()),
                presences: Array.from(this.presences.entries()),
                blocklist: Array.from(this.blocklist),
                labels: Array.from(this.labels.entries()),
                status: Array.from(this.status.entries()),
                calls: Array.from(this.calls.entries()),
                reactions: Array.from(this.reactions.entries()).map(([key, value]) => [
                    key, Array.from(value.entries())
                ]),
                user: this.user,
                timestamp: Date.now()
            };

            const filePath = path.join(this.options.storePath, 'store.json');
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            
            this.lastSaveTime = Date.now();
            this.emit('save', { timestamp: this.lastSaveTime });
        } catch (error) {
            this.emit('error', error);
        }
    }

    async loadData() {
        try {
            const filePath = path.join(this.options.storePath, 'store.json');
            const data = JSON.parse(await fs.readFile(filePath, 'utf8'));

            // Restore data
            this.messages = new Map(data.messages || []);
            this.chats = new Map(data.chats || []);
            this.contacts = new Map(data.contacts || []);
            this.groups = new Map(data.groups || []);
            this.groupMetadata = new Map(data.groupMetadata || []);
            this.presences = new Map(data.presences || []);
            this.blocklist = new Set(data.blocklist || []);
            this.labels = new Map(data.labels || []);
            this.status = new Map(data.status || []);
            this.calls = new Map(data.calls || []);
            
            // Restore reactions
            if (data.reactions) {
                this.reactions = new Map(
                    data.reactions.map(([key, value]) => [key, new Map(value)])
                );
            }

            this.user = data.user;

            // Rebuild indexes
            this.rebuildIndexes();

            this.emit('load', { timestamp: data.timestamp });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.emit('error', error);
            }
        }
    }

    rebuildIndexes() {
        // Rebuild message indexes
        this.messagesByChat.clear();
        this.messagesByType.clear();
        
        for (const [messageId, message] of this.messages) {
            const chatId = message.key.remoteJid;
            if (!this.messagesByChat.has(chatId)) {
                this.messagesByChat.set(chatId, new Set());
            }
            this.messagesByChat.get(chatId).add(messageId);

            const messageType = this.getMessageType(message);
            if (!this.messagesByType.has(messageType)) {
                this.messagesByType.set(messageType, new Set());
            }
            this.messagesByType.get(messageType).add(messageId);
        }

        // Rebuild chat indexes
        this.chatsByType.clear();
        for (const [chatId, chat] of this.chats) {
            const chatType = this.getChatType(chat);
            if (!this.chatsByType.has(chatType)) {
                this.chatsByType.set(chatType, new Set());
            }
            this.chatsByType.get(chatType).add(chatId);
        }

        // Rebuild contact name index
        this.contactsByName.clear();
        for (const [contactId, contact] of this.contacts) {
            if (contact.name || contact.pushName) {
                const name = (contact.name || contact.pushName).toLowerCase();
                if (!this.contactsByName.has(name)) {
                    this.contactsByName.set(name, new Set());
                }
                this.contactsByName.get(name).add(contactId);
            }
        }

        // Rebuild group name index
        this.groupsByName.clear();
        for (const [groupId, group] of this.groups) {
            if (group.subject) {
                const name = group.subject.toLowerCase();
                if (!this.groupsByName.has(name)) {
                    this.groupsByName.set(name, new Set());
                }
                this.groupsByName.get(name).add(groupId);
            }
        }
    }

    startAutoSave() {
        if (this.options.autoSave && !this.saveTimer) {
            this.saveTimer = setInterval(() => {
                this.saveData();
            }, this.options.saveInterval);
        }
    }

    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    // Statistics
    getStats() {
        return {
            messages: this.messages.size,
            chats: this.chats.size,
            contacts: this.contacts.size,
            groups: this.groups.size,
            presences: this.presences.size,
            reactions: this.reactions.size,
            lastSaveTime: this.lastSaveTime,
            isLoaded: this.isLoaded
        };
    }

    // Cleanup
    clear() {
        this.messages.clear();
        this.chats.clear();
        this.contacts.clear();
        this.groups.clear();
        this.groupMetadata.clear();
        this.presences.clear();
        this.blocklist.clear();
        this.labels.clear();
        this.status.clear();
        this.calls.clear();
        this.reactions.clear();
        
        this.messagesByChat.clear();
        this.messagesByType.clear();
        this.chatsByType.clear();
        this.contactsByName.clear();
        this.groupsByName.clear();
        
        this.user = null;
        this.emit('clear');
    }

    async destroy() {
        this.stopAutoSave();
        if (this.options.autoSave) {
            await this.saveData();
        }
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = WAStore;