const { EventEmitter } = require('events');
const WAUSyncHistory = require('./WAUSyncHistory');
const WAUSyncContacts = require('./WAUSyncContacts');
const WAUSyncChats = require('./WAUSyncChats');
const WAUSyncMessages = require('./WAUSyncMessages');
const WAUSyncGroups = require('./WAUSyncGroups');
const WAUSyncStatus = require('./WAUSyncStatus');
const WAUSyncSettings = require('./WAUSyncSettings');
const WAUSyncBlocklist = require('./WAUSyncBlocklist');
const WAUSyncLabels = require('./WAUSyncLabels');
const WAUSyncKeys = require('./WAUSyncKeys');
const WAUSyncDevices = require('./WAUSyncDevices');
const WAUSyncCallLogs = require('./WAUSyncCallLogs');
const WAUSyncPayments = require('./WAUSyncPayments');
const WAUSyncBusiness = require('./WAUSyncBusiness');
const WAUSyncCatalog = require('./WAUSyncCatalog');
const WAUSyncNewsletter = require('./WAUSyncNewsletter');
const WAUSyncCommunity = require('./WAUSyncCommunity');
const WAUSyncChannels = require('./WAUSyncChannels');
const WAUSyncPrivacy = require('./WAUSyncPrivacy');
const WAUSyncAppState = require('./WAUSyncAppState');

class WAUSYNC extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            enableSync: options.enableSync !== false,
            enableHistory: options.enableHistory !== false,
            enableContacts: options.enableContacts !== false,
            enableChats: options.enableChats !== false,
            enableMessages: options.enableMessages !== false,
            enableGroups: options.enableGroups !== false,
            enableStatus: options.enableStatus !== false,
            enableSettings: options.enableSettings !== false,
            enableBlocklist: options.enableBlocklist !== false,
            enableLabels: options.enableLabels !== false,
            enableKeys: options.enableKeys !== false,
            enableDevices: options.enableDevices !== false,
            enableCallLogs: options.enableCallLogs !== false,
            enablePayments: options.enablePayments !== false,
            enableBusiness: options.enableBusiness !== false,
            enableCatalog: options.enableCatalog !== false,
            enableNewsletter: options.enableNewsletter !== false,
            enableCommunity: options.enableCommunity !== false,
            enableChannels: options.enableChannels !== false,
            enablePrivacy: options.enablePrivacy !== false,
            enableAppState: options.enableAppState !== false,
            syncInterval: options.syncInterval || 300000, // 5 minutes
            batchSize: options.batchSize || 100,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000,
            enableCompression: options.enableCompression !== false,
            enableEncryption: options.enableEncryption !== false,
            ...options
        };
        
        // Sync modules
        this.history = null;
        this.contacts = null;
        this.chats = null;
        this.messages = null;
        this.groups = null;
        this.status = null;
        this.settings = null;
        this.blocklist = null;
        this.labels = null;
        this.keys = null;
        this.devices = null;
        this.callLogs = null;
        this.payments = null;
        this.business = null;
        this.catalog = null;
        this.newsletter = null;
        this.community = null;
        this.channels = null;
        this.privacy = null;
        this.appState = null;
        
        // State management
        this.isInitialized = false;
        this.isSyncing = false;
        this.lastSync = null;
        this.syncQueue = [];
        this.syncStats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            lastSyncDuration: 0,
            totalSyncTime: 0
        };
        
        // Timers
        this.syncTimer = null;
        this.retryTimer = null;
        
        this.init();
    }
    
    async init() {
        if (!this.options.enableSync) {
            return;
        }
        
        try {
            // Initialize sync modules
            if (this.options.enableHistory) {
                this.history = new WAUSyncHistory(this.options);
                this.history.on('sync.complete', (data) => this.emit('history.synced', data));
            }
            
            if (this.options.enableContacts) {
                this.contacts = new WAUSyncContacts(this.options);
                this.contacts.on('sync.complete', (data) => this.emit('contacts.synced', data));
            }
            
            if (this.options.enableChats) {
                this.chats = new WAUSyncChats(this.options);
                this.chats.on('sync.complete', (data) => this.emit('chats.synced', data));
            }
            
            if (this.options.enableMessages) {
                this.messages = new WAUSyncMessages(this.options);
                this.messages.on('sync.complete', (data) => this.emit('messages.synced', data));
            }
            
            if (this.options.enableGroups) {
                this.groups = new WAUSyncGroups(this.options);
                this.groups.on('sync.complete', (data) => this.emit('groups.synced', data));
            }
            
            if (this.options.enableStatus) {
                this.status = new WAUSyncStatus(this.options);
                this.status.on('sync.complete', (data) => this.emit('status.synced', data));
            }
            
            if (this.options.enableSettings) {
                this.settings = new WAUSyncSettings(this.options);
                this.settings.on('sync.complete', (data) => this.emit('settings.synced', data));
            }
            
            if (this.options.enableBlocklist) {
                this.blocklist = new WAUSyncBlocklist(this.options);
                this.blocklist.on('sync.complete', (data) => this.emit('blocklist.synced', data));
            }
            
            if (this.options.enableLabels) {
                this.labels = new WAUSyncLabels(this.options);
                this.labels.on('sync.complete', (data) => this.emit('labels.synced', data));
            }
            
            if (this.options.enableKeys) {
                this.keys = new WAUSyncKeys(this.options);
                this.keys.on('sync.complete', (data) => this.emit('keys.synced', data));
            }
            
            if (this.options.enableDevices) {
                this.devices = new WAUSyncDevices(this.options);
                this.devices.on('sync.complete', (data) => this.emit('devices.synced', data));
            }
            
            if (this.options.enableCallLogs) {
                this.callLogs = new WAUSyncCallLogs(this.options);
                this.callLogs.on('sync.complete', (data) => this.emit('callLogs.synced', data));
            }
            
            if (this.options.enablePayments) {
                this.payments = new WAUSyncPayments(this.options);
                this.payments.on('sync.complete', (data) => this.emit('payments.synced', data));
            }
            
            if (this.options.enableBusiness) {
                this.business = new WAUSyncBusiness(this.options);
                this.business.on('sync.complete', (data) => this.emit('business.synced', data));
            }
            
            if (this.options.enableCatalog) {
                this.catalog = new WAUSyncCatalog(this.options);
                this.catalog.on('sync.complete', (data) => this.emit('catalog.synced', data));
            }
            
            if (this.options.enableNewsletter) {
                this.newsletter = new WAUSyncNewsletter(this.options);
                this.newsletter.on('sync.complete', (data) => this.emit('newsletter.synced', data));
            }
            
            if (this.options.enableCommunity) {
                this.community = new WAUSyncCommunity(this.options);
                this.community.on('sync.complete', (data) => this.emit('community.synced', data));
            }
            
            if (this.options.enableChannels) {
                this.channels = new WAUSyncChannels(this.options);
                this.channels.on('sync.complete', (data) => this.emit('channels.synced', data));
            }
            
            if (this.options.enablePrivacy) {
                this.privacy = new WAUSyncPrivacy(this.options);
                this.privacy.on('sync.complete', (data) => this.emit('privacy.synced', data));
            }
            
            if (this.options.enableAppState) {
                this.appState = new WAUSyncAppState(this.options);
                this.appState.on('sync.complete', (data) => this.emit('appState.synced', data));
            }
            
            this.isInitialized = true;
            this.emit('wausync.initialized');
            
        } catch (error) {
            this.emit('error', new Error(`WAUSYNC initialization failed: ${error.message}`));
        }
    }
    
    start() {
        if (!this.isInitialized || this.syncTimer) {
            return;
        }
        
        // Start periodic sync
        this.syncTimer = setInterval(() => {
            this.syncAll();
        }, this.options.syncInterval);
        
        // Initial sync
        setTimeout(() => {
            this.syncAll();
        }, 1000);
        
        this.emit('wausync.started');
    }
    
    stop() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        
        this.emit('wausync.stopped');
    }
    
    async syncAll() {
        if (this.isSyncing) {
            return;
        }
        
        this.isSyncing = true;
        const startTime = Date.now();
        
        try {
            this.emit('sync.started');
            this.syncStats.totalSyncs++;
            
            const syncPromises = [];
            
            // Create sync promises for all enabled modules
            if (this.history) syncPromises.push(this.syncHistory());
            if (this.contacts) syncPromises.push(this.syncContacts());
            if (this.chats) syncPromises.push(this.syncChats());
            if (this.messages) syncPromises.push(this.syncMessages());
            if (this.groups) syncPromises.push(this.syncGroups());
            if (this.status) syncPromises.push(this.syncStatus());
            if (this.settings) syncPromises.push(this.syncSettings());
            if (this.blocklist) syncPromises.push(this.syncBlocklist());
            if (this.labels) syncPromises.push(this.syncLabels());
            if (this.keys) syncPromises.push(this.syncKeys());
            if (this.devices) syncPromises.push(this.syncDevices());
            if (this.callLogs) syncPromises.push(this.syncCallLogs());
            if (this.payments) syncPromises.push(this.syncPayments());
            if (this.business) syncPromises.push(this.syncBusiness());
            if (this.catalog) syncPromises.push(this.syncCatalog());
            if (this.newsletter) syncPromises.push(this.syncNewsletter());
            if (this.community) syncPromises.push(this.syncCommunity());
            if (this.channels) syncPromises.push(this.syncChannels());
            if (this.privacy) syncPromises.push(this.syncPrivacy());
            if (this.appState) syncPromises.push(this.syncAppState());
            
            // Execute all syncs in parallel
            const results = await Promise.allSettled(syncPromises);
            
            // Process results
            let successCount = 0;
            let failureCount = 0;
            const errors = [];
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    failureCount++;
                    errors.push(result.reason);
                }
            });
            
            const duration = Date.now() - startTime;
            this.syncStats.lastSyncDuration = duration;
            this.syncStats.totalSyncTime += duration;
            this.syncStats.successfulSyncs++;
            this.lastSync = Date.now();
            
            this.emit('sync.completed', {
                duration,
                successCount,
                failureCount,
                errors,
                timestamp: this.lastSync
            });
            
        } catch (error) {
            this.syncStats.failedSyncs++;
            this.emit('sync.failed', error);
            this.emit('error', new Error(`Sync failed: ${error.message}`));
        } finally {
            this.isSyncing = false;
        }
    }
    
    // Individual sync methods
    async syncHistory() {
        if (!this.history) return;
        return this.history.sync();
    }
    
    async syncContacts() {
        if (!this.contacts) return;
        return this.contacts.sync();
    }
    
    async syncChats() {
        if (!this.chats) return;
        return this.chats.sync();
    }
    
    async syncMessages() {
        if (!this.messages) return;
        return this.messages.sync();
    }
    
    async syncGroups() {
        if (!this.groups) return;
        return this.groups.sync();
    }
    
    async syncStatus() {
        if (!this.status) return;
        return this.status.sync();
    }
    
    async syncSettings() {
        if (!this.settings) return;
        return this.settings.sync();
    }
    
    async syncBlocklist() {
        if (!this.blocklist) return;
        return this.blocklist.sync();
    }
    
    async syncLabels() {
        if (!this.labels) return;
        return this.labels.sync();
    }
    
    async syncKeys() {
        if (!this.keys) return;
        return this.keys.sync();
    }
    
    async syncDevices() {
        if (!this.devices) return;
        return this.devices.sync();
    }
    
    async syncCallLogs() {
        if (!this.callLogs) return;
        return this.callLogs.sync();
    }
    
    async syncPayments() {
        if (!this.payments) return;
        return this.payments.sync();
    }
    
    async syncBusiness() {
        if (!this.business) return;
        return this.business.sync();
    }
    
    async syncCatalog() {
        if (!this.catalog) return;
        return this.catalog.sync();
    }
    
    async syncNewsletter() {
        if (!this.newsletter) return;
        return this.newsletter.sync();
    }
    
    async syncCommunity() {
        if (!this.community) return;
        return this.community.sync();
    }
    
    async syncChannels() {
        if (!this.channels) return;
        return this.channels.sync();
    }
    
    async syncPrivacy() {
        if (!this.privacy) return;
        return this.privacy.sync();
    }
    
    async syncAppState() {
        if (!this.appState) return;
        return this.appState.sync();
    }
    
    // Manual sync triggers
    async forceSyncAll() {
        if (this.isSyncing) {
            throw new Error('Sync already in progress');
        }
        
        return this.syncAll();
    }
    
    async forceSyncModule(moduleName) {
        if (this.isSyncing) {
            throw new Error('Sync already in progress');
        }
        
        const syncMethod = `sync${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`;
        
        if (typeof this[syncMethod] === 'function') {
            return this[syncMethod]();
        } else {
            throw new Error(`Unknown module: ${moduleName}`);
        }
    }
    
    // Queue management
    addToSyncQueue(item) {
        this.syncQueue.push({
            ...item,
            timestamp: Date.now(),
            retries: 0
        });
        
        this.emit('queue.item.added', item);
    }
    
    processSyncQueue() {
        if (this.syncQueue.length === 0 || this.isSyncing) {
            return;
        }
        
        const batch = this.syncQueue.splice(0, this.options.batchSize);
        
        batch.forEach(async (item) => {
            try {
                await this.processQueueItem(item);
            } catch (error) {
                if (item.retries < this.options.maxRetries) {
                    item.retries++;
                    this.syncQueue.push(item);
                } else {
                    this.emit('queue.item.failed', { item, error });
                }
            }
        });
    }
    
    async processQueueItem(item) {
        switch (item.type) {
            case 'contact':
                return this.contacts ? this.contacts.syncItem(item) : null;
            case 'chat':
                return this.chats ? this.chats.syncItem(item) : null;
            case 'message':
                return this.messages ? this.messages.syncItem(item) : null;
            case 'group':
                return this.groups ? this.groups.syncItem(item) : null;
            default:
                throw new Error(`Unknown queue item type: ${item.type}`);
        }
    }
    
    // State management
    getSyncState() {
        return {
            isInitialized: this.isInitialized,
            isSyncing: this.isSyncing,
            lastSync: this.lastSync,
            queueSize: this.syncQueue.length,
            stats: { ...this.syncStats },
            modules: {
                history: !!this.history,
                contacts: !!this.contacts,
                chats: !!this.chats,
                messages: !!this.messages,
                groups: !!this.groups,
                status: !!this.status,
                settings: !!this.settings,
                blocklist: !!this.blocklist,
                labels: !!this.labels,
                keys: !!this.keys,
                devices: !!this.devices,
                callLogs: !!this.callLogs,
                payments: !!this.payments,
                business: !!this.business,
                catalog: !!this.catalog,
                newsletter: !!this.newsletter,
                community: !!this.community,
                channels: !!this.channels,
                privacy: !!this.privacy,
                appState: !!this.appState
            }
        };
    }
    
    getModuleState(moduleName) {
        const module = this[moduleName];
        return module ? module.getState() : null;
    }
    
    // Configuration
    updateConfig(newConfig) {
        this.options = { ...this.options, ...newConfig };
        
        // Update module configs
        Object.keys(this.options).forEach(key => {
            if (this[key] && typeof this[key].updateConfig === 'function') {
                this[key].updateConfig(newConfig);
            }
        });
        
        this.emit('config.updated', newConfig);
    }
    
    // Statistics and monitoring
    getStats() {
        return {
            ...this.syncStats,
            averageSyncDuration: this.syncStats.totalSyncs > 0 ? 
                this.syncStats.totalSyncTime / this.syncStats.totalSyncs : 0,
            successRate: this.syncStats.totalSyncs > 0 ? 
                (this.syncStats.successfulSyncs / this.syncStats.totalSyncs) * 100 : 0,
            lastSyncAge: this.lastSync ? Date.now() - this.lastSync : null
        };
    }
    
    getDetailedStats() {
        const stats = this.getStats();
        const moduleStats = {};
        
        // Get stats from each module
        ['history', 'contacts', 'chats', 'messages', 'groups', 'status', 
         'settings', 'blocklist', 'labels', 'keys', 'devices', 'callLogs',
         'payments', 'business', 'catalog', 'newsletter', 'community', 
         'channels', 'privacy', 'appState'].forEach(moduleName => {
            if (this[moduleName] && typeof this[moduleName].getStats === 'function') {
                moduleStats[moduleName] = this[moduleName].getStats();
            }
        });
        
        return {
            overall: stats,
            modules: moduleStats,
            queue: {
                size: this.syncQueue.length,
                oldestItem: this.syncQueue.length > 0 ? 
                    Math.min(...this.syncQueue.map(item => item.timestamp)) : null
            }
        };
    }
    
    // Health check
    async healthCheck() {
        const health = {
            healthy: true,
            issues: [],
            modules: {}
        };
        
        // Check overall state
        if (!this.isInitialized) {
            health.healthy = false;
            health.issues.push('Not initialized');
        }
        
        if (this.syncQueue.length > 1000) {
            health.healthy = false;
            health.issues.push(`Large sync queue: ${this.syncQueue.length} items`);
        }
        
        // Check module health
        for (const moduleName of Object.keys(this.getSyncState().modules)) {
            if (this[moduleName] && typeof this[moduleName].healthCheck === 'function') {
                try {
                    const moduleHealth = await this[moduleName].healthCheck();
                    health.modules[moduleName] = moduleHealth;
                    
                    if (!moduleHealth.healthy) {
                        health.healthy = false;
                        health.issues.push(`${moduleName}: ${moduleHealth.issues.join(', ')}`);
                    }
                } catch (error) {
                    health.healthy = false;
                    health.issues.push(`${moduleName}: Health check failed - ${error.message}`);
                    health.modules[moduleName] = { healthy: false, error: error.message };
                }
            }
        }
        
        return health;
    }
    
    // Cleanup
    async cleanup() {
        this.stop();
        
        // Cleanup modules
        const modules = ['history', 'contacts', 'chats', 'messages', 'groups', 
                        'status', 'settings', 'blocklist', 'labels', 'keys', 
                        'devices', 'callLogs', 'payments', 'business', 'catalog',
                        'newsletter', 'community', 'channels', 'privacy', 'appState'];
        
        for (const moduleName of modules) {
            if (this[moduleName] && typeof this[moduleName].cleanup === 'function') {
                try {
                    await this[moduleName].cleanup();
                } catch (error) {
                    this.emit('error', new Error(`${moduleName} cleanup failed: ${error.message}`));
                }
            }
        }
        
        // Clear queue
        this.syncQueue.length = 0;
        
        this.removeAllListeners();
    }
}

module.exports = WAUSYNC;