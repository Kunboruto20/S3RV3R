const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class WAStore extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            persistData: options.persistData || false,
            storePath: options.storePath || './wa-store',
            maxCacheSize: options.maxCacheSize || 10000,
            autoSave: options.autoSave !== false,
            saveInterval: options.saveInterval || 30000,
            ...options
        };
        
        // In-memory stores
        this.contacts = new Map();
        this.chats = new Map();
        this.messages = new Map();
        this.groups = new Map();
        this.presence = new Map();
        this.blocklist = new Set();
        this.labels = new Map();
        this.keys = new Map();
        this.devices = new Map();
        this.callLogs = new Map();
        this.payments = new Map();
        this.business = new Map();
        this.catalog = new Map();
        this.newsletter = new Map();
        this.community = new Map();
        this.channels = new Map();
        this.privacy = new Map();
        this.appState = new Map();
        
        // Metadata
        this.user = null;
        this.authState = null;
        this.connectionState = 'close';
        this.lastSeen = new Map();
        this.profilePictures = new Map();
        this.status = new Map();
        
        // Cache management
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
        
        this.saveTimer = null;
        this.isLoading = false;
        this.isSaving = false;
        
        this.init();
    }
    
    async init() {
        if (this.options.persistData) {
            await this.ensureStorePath();
            await this.loadData();
            
            if (this.options.autoSave) {
                this.startAutoSave();
            }
        }
        
        this.emit('store.ready');
    }
    
    async ensureStorePath() {
        try {
            await fs.mkdir(this.options.storePath, { recursive: true });
        } catch (error) {
            this.emit('error', new Error(`Failed to create store path: ${error.message}`));
        }
    }
    
    startAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        
        this.saveTimer = setInterval(() => {
            this.saveData().catch(error => {
                this.emit('error', new Error(`Auto-save failed: ${error.message}`));
            });
        }, this.options.saveInterval);
    }
    
    stopAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }
    
    // Contact management
    setContact(jid, contact) {
        this.contacts.set(jid, {
            ...contact,
            jid,
            updatedAt: Date.now()
        });
        this.emit('contact.set', jid, contact);
        this.cacheStats.hits++;
    }
    
    getContact(jid) {
        const contact = this.contacts.get(jid);
        if (contact) {
            this.cacheStats.hits++;
        } else {
            this.cacheStats.misses++;
        }
        return contact;
    }
    
    getAllContacts() {
        return Array.from(this.contacts.values());
    }
    
    removeContact(jid) {
        const removed = this.contacts.delete(jid);
        if (removed) {
            this.emit('contact.removed', jid);
        }
        return removed;
    }
    
    // Chat management
    setChat(jid, chat) {
        this.chats.set(jid, {
            ...chat,
            jid,
            updatedAt: Date.now()
        });
        this.emit('chat.set', jid, chat);
    }
    
    getChat(jid) {
        const chat = this.chats.get(jid);
        if (chat) {
            this.cacheStats.hits++;
        } else {
            this.cacheStats.misses++;
        }
        return chat;
    }
    
    getAllChats() {
        return Array.from(this.chats.values());
    }
    
    removeChat(jid) {
        const removed = this.chats.delete(jid);
        if (removed) {
            this.emit('chat.removed', jid);
        }
        return removed;
    }
    
    // Message management
    setMessage(key, message) {
        const messageKey = this.generateMessageKey(key);
        this.messages.set(messageKey, {
            ...message,
            key,
            updatedAt: Date.now()
        });
        this.emit('message.set', key, message);
        
        // Maintain cache size
        if (this.messages.size > this.options.maxCacheSize) {
            this.evictOldMessages();
        }
    }
    
    getMessage(key) {
        const messageKey = this.generateMessageKey(key);
        const message = this.messages.get(messageKey);
        if (message) {
            this.cacheStats.hits++;
        } else {
            this.cacheStats.misses++;
        }
        return message;
    }
    
    getMessages(jid, limit = 50) {
        const messages = [];
        for (const [key, message] of this.messages) {
            if (message.key.remoteJid === jid) {
                messages.push(message);
            }
            if (messages.length >= limit) break;
        }
        return messages.sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));
    }
    
    removeMessage(key) {
        const messageKey = this.generateMessageKey(key);
        const removed = this.messages.delete(messageKey);
        if (removed) {
            this.emit('message.removed', key);
        }
        return removed;
    }
    
    generateMessageKey(key) {
        return `${key.remoteJid}-${key.id}`;
    }
    
    evictOldMessages() {
        const messages = Array.from(this.messages.entries());
        messages.sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
        
        const toRemove = messages.slice(0, Math.floor(this.options.maxCacheSize * 0.1));
        for (const [key, message] of toRemove) {
            this.messages.delete(key);
            this.cacheStats.evictions++;
        }
    }
    
    // Group management
    setGroup(jid, group) {
        this.groups.set(jid, {
            ...group,
            jid,
            updatedAt: Date.now()
        });
        this.emit('group.set', jid, group);
    }
    
    getGroup(jid) {
        return this.groups.get(jid);
    }
    
    getAllGroups() {
        return Array.from(this.groups.values());
    }
    
    removeGroup(jid) {
        const removed = this.groups.delete(jid);
        if (removed) {
            this.emit('group.removed', jid);
        }
        return removed;
    }
    
    // Presence management
    setPresence(jid, presence) {
        this.presence.set(jid, {
            ...presence,
            jid,
            updatedAt: Date.now()
        });
        this.emit('presence.set', jid, presence);
    }
    
    getPresence(jid) {
        return this.presence.get(jid);
    }
    
    removePresence(jid) {
        return this.presence.delete(jid);
    }
    
    // Blocklist management
    addToBlocklist(jid) {
        this.blocklist.add(jid);
        this.emit('blocklist.add', jid);
    }
    
    removeFromBlocklist(jid) {
        const removed = this.blocklist.delete(jid);
        if (removed) {
            this.emit('blocklist.remove', jid);
        }
        return removed;
    }
    
    isBlocked(jid) {
        return this.blocklist.has(jid);
    }
    
    getBlocklist() {
        return Array.from(this.blocklist);
    }
    
    // Key management
    setKeys(jid, keys) {
        this.keys.set(jid, {
            ...keys,
            jid,
            updatedAt: Date.now()
        });
        this.emit('keys.set', jid, keys);
    }
    
    getKeys(jid) {
        return this.keys.get(jid);
    }
    
    removeKeys(jid) {
        return this.keys.delete(jid);
    }
    
    // Device management
    setDevice(jid, device) {
        this.devices.set(jid, {
            ...device,
            jid,
            updatedAt: Date.now()
        });
        this.emit('device.set', jid, device);
    }
    
    getDevice(jid) {
        return this.devices.get(jid);
    }
    
    getAllDevices() {
        return Array.from(this.devices.values());
    }
    
    // User and auth state
    setUser(user) {
        this.user = user;
        this.emit('user.set', user);
    }
    
    getUser() {
        return this.user;
    }
    
    setAuthState(state) {
        this.authState = state;
        this.emit('auth.state.set', state);
    }
    
    getAuthState() {
        return this.authState;
    }
    
    setConnectionState(state) {
        this.connectionState = state;
        this.emit('connection.state.set', state);
    }
    
    getConnectionState() {
        return this.connectionState;
    }
    
    // Profile pictures
    setProfilePicture(jid, url) {
        this.profilePictures.set(jid, {
            url,
            jid,
            updatedAt: Date.now()
        });
        this.emit('profile.picture.set', jid, url);
    }
    
    getProfilePicture(jid) {
        return this.profilePictures.get(jid);
    }
    
    // Status
    setStatus(jid, status) {
        this.status.set(jid, {
            ...status,
            jid,
            updatedAt: Date.now()
        });
        this.emit('status.set', jid, status);
    }
    
    getStatus(jid) {
        return this.status.get(jid);
    }
    
    // Last seen
    setLastSeen(jid, lastSeen) {
        this.lastSeen.set(jid, {
            lastSeen,
            jid,
            updatedAt: Date.now()
        });
        this.emit('last.seen.set', jid, lastSeen);
    }
    
    getLastSeen(jid) {
        return this.lastSeen.get(jid);
    }
    
    // Data persistence
    async saveData() {
        if (!this.options.persistData || this.isSaving) {
            return;
        }
        
        this.isSaving = true;
        
        try {
            const data = {
                contacts: Array.from(this.contacts.entries()),
                chats: Array.from(this.chats.entries()),
                messages: Array.from(this.messages.entries()),
                groups: Array.from(this.groups.entries()),
                presence: Array.from(this.presence.entries()),
                blocklist: Array.from(this.blocklist),
                labels: Array.from(this.labels.entries()),
                keys: Array.from(this.keys.entries()),
                devices: Array.from(this.devices.entries()),
                user: this.user,
                authState: this.authState,
                profilePictures: Array.from(this.profilePictures.entries()),
                status: Array.from(this.status.entries()),
                lastSeen: Array.from(this.lastSeen.entries()),
                timestamp: Date.now()
            };
            
            const dataPath = path.join(this.options.storePath, 'store.json');
            await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
            
            this.emit('data.saved');
        } catch (error) {
            this.emit('error', new Error(`Failed to save data: ${error.message}`));
        } finally {
            this.isSaving = false;
        }
    }
    
    async loadData() {
        if (this.isLoading) {
            return;
        }
        
        this.isLoading = true;
        
        try {
            const dataPath = path.join(this.options.storePath, 'store.json');
            const dataStr = await fs.readFile(dataPath, 'utf8');
            const data = JSON.parse(dataStr);
            
            // Restore data
            this.contacts = new Map(data.contacts || []);
            this.chats = new Map(data.chats || []);
            this.messages = new Map(data.messages || []);
            this.groups = new Map(data.groups || []);
            this.presence = new Map(data.presence || []);
            this.blocklist = new Set(data.blocklist || []);
            this.labels = new Map(data.labels || []);
            this.keys = new Map(data.keys || []);
            this.devices = new Map(data.devices || []);
            this.profilePictures = new Map(data.profilePictures || []);
            this.status = new Map(data.status || []);
            this.lastSeen = new Map(data.lastSeen || []);
            
            this.user = data.user;
            this.authState = data.authState;
            
            this.emit('data.loaded');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.emit('error', new Error(`Failed to load data: ${error.message}`));
            }
        } finally {
            this.isLoading = false;
        }
    }
    
    // Search functionality
    searchContacts(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const contact of this.contacts.values()) {
            if (contact.name?.toLowerCase().includes(lowerQuery) ||
                contact.pushName?.toLowerCase().includes(lowerQuery) ||
                contact.jid.includes(query)) {
                results.push(contact);
            }
        }
        
        return results;
    }
    
    searchChats(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const chat of this.chats.values()) {
            if (chat.name?.toLowerCase().includes(lowerQuery) ||
                chat.jid.includes(query)) {
                results.push(chat);
            }
        }
        
        return results;
    }
    
    searchMessages(query, jid = null) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const message of this.messages.values()) {
            if (jid && message.key.remoteJid !== jid) {
                continue;
            }
            
            const content = message.message?.conversation ||
                           message.message?.extendedTextMessage?.text ||
                           '';
            
            if (content.toLowerCase().includes(lowerQuery)) {
                results.push(message);
            }
        }
        
        return results.sort((a, b) => (b.messageTimestamp || 0) - (a.messageTimestamp || 0));
    }
    
    // Statistics
    getStats() {
        return {
            cache: this.cacheStats,
            counts: {
                contacts: this.contacts.size,
                chats: this.chats.size,
                messages: this.messages.size,
                groups: this.groups.size,
                presence: this.presence.size,
                blocklist: this.blocklist.size,
                keys: this.keys.size,
                devices: this.devices.size
            },
            memory: {
                contacts: this.getMapMemoryUsage(this.contacts),
                chats: this.getMapMemoryUsage(this.chats),
                messages: this.getMapMemoryUsage(this.messages)
            }
        };
    }
    
    getMapMemoryUsage(map) {
        let size = 0;
        for (const [key, value] of map) {
            size += JSON.stringify({ key, value }).length;
        }
        return size;
    }
    
    // Cleanup
    clear() {
        this.contacts.clear();
        this.chats.clear();
        this.messages.clear();
        this.groups.clear();
        this.presence.clear();
        this.blocklist.clear();
        this.labels.clear();
        this.keys.clear();
        this.devices.clear();
        this.profilePictures.clear();
        this.status.clear();
        this.lastSeen.clear();
        
        this.user = null;
        this.authState = null;
        
        this.emit('store.cleared');
    }
    
    async cleanup() {
        this.stopAutoSave();
        
        if (this.options.persistData && this.options.autoSave) {
            await this.saveData();
        }
        
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = WAStore;