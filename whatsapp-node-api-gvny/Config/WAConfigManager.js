const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Configuration Manager
 * Handles all configuration settings and preferences
 */
class WAConfigManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            configPath: options.configPath || './wa_config',
            enableAutoSave: options.enableAutoSave !== false,
            saveInterval: options.saveInterval || 10000, // 10 seconds
            enableValidation: options.enableValidation !== false,
            enableEncryption: options.enableEncryption || false,
            encryptionKey: options.encryptionKey,
            ...options
        };

        // Configuration stores
        this.config = new Map();
        this.schemas = new Map();
        this.watchers = new Map();
        this.pendingSaves = new Set();
        
        // Default configurations
        this.defaultConfigs = {
            app: {
                name: 'WhatsApp Node API',
                version: '1.0.0',
                environment: 'development',
                debug: false,
                logLevel: 'info'
            },
            connection: {
                timeout: 30000,
                retryAttempts: 3,
                retryDelay: 5000,
                keepAlive: true,
                reconnectOnFailure: true
            },
            auth: {
                enableQR: true,
                enablePairing: true,
                sessionTimeout: 3600000, // 1 hour
                maxSessions: 10,
                requireAuth: true
            },
            messages: {
                enableReadReceipts: true,
                enableTypingIndicators: true,
                enablePresence: true,
                messageRetention: 604800000, // 7 days
                maxMessageLength: 65536
            },
            media: {
                enableUpload: true,
                enableDownload: true,
                maxFileSize: 100 * 1024 * 1024, // 100MB
                allowedTypes: ['image', 'video', 'audio', 'document'],
                compressionQuality: 80,
                thumbnailSize: 200
            },
            calls: {
                enableVoiceCalls: true,
                enableVideoCalls: true,
                enableGroupCalls: true,
                maxCallDuration: 14400000, // 4 hours
                callTimeout: 60000
            },
            groups: {
                enableGroups: true,
                maxGroupSize: 1024,
                maxGroupNameLength: 25,
                enableGroupInvites: true,
                enableGroupAnnouncements: true
            },
            privacy: {
                enableBlocklist: true,
                enableReadReceipts: true,
                enableTypingIndicators: true,
                enableOnlineStatus: true,
                defaultPrivacyLevel: 'contacts'
            },
            business: {
                enableBusiness: false,
                enableCatalog: false,
                enablePayments: false,
                defaultCurrency: 'USD',
                maxProductsPerCatalog: 1000
            },
            notifications: {
                enableNotifications: true,
                enablePushNotifications: false,
                enableSoundNotifications: true,
                enableDesktopNotifications: true,
                defaultSound: 'default'
            },
            storage: {
                enableDatabase: true,
                databasePath: './wa_database',
                enableBackups: true,
                backupInterval: 86400000, // 24 hours
                maxBackups: 7
            },
            security: {
                enableEncryption: true,
                enableTwoStepVerification: false,
                sessionEncryption: true,
                dataEncryption: false
            },
            performance: {
                enableCaching: true,
                cacheSize: 1000,
                enableCompression: false,
                maxConcurrentConnections: 100
            }
        };

        this.initialize();
    }

    async initialize() {
        try {
            await this.createConfigStructure();
            await this.loadConfigurations();
            this.setupSchemas();
            this.startAutoSave();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Configuration structure creation
    async createConfigStructure() {
        try {
            await fs.mkdir(this.options.configPath, { recursive: true });
            
            // Create subdirectories
            const subdirs = ['schemas', 'backups', 'templates'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.configPath, subdir), { recursive: true });
            }
        } catch (error) {
            throw new Error(`Config structure creation failed: ${error.message}`);
        }
    }

    // Configuration management
    async set(key, value, options = {}) {
        try {
            const { validate = true, save = true, notify = true } = options;
            
            // Validate if enabled
            if (validate && this.options.enableValidation) {
                await this.validateConfig(key, value);
            }

            const oldValue = this.config.get(key);
            this.config.set(key, value);

            // Save if enabled
            if (save && this.options.enableAutoSave) {
                this.scheduleSave(key);
            }

            // Notify watchers
            if (notify) {
                this.notifyWatchers(key, value, oldValue);
            }

            this.emit('config.changed', { key, value, oldValue });
            return true;
        } catch (error) {
            throw new Error(`Set config failed: ${error.message}`);
        }
    }

    get(key, defaultValue = null) {
        if (this.config.has(key)) {
            return this.config.get(key);
        }
        
        // Check default configs
        const keyParts = key.split('.');
        let value = this.defaultConfigs;
        
        for (const part of keyParts) {
            if (value && typeof value === 'object' && value.hasOwnProperty(part)) {
                value = value[part];
            } else {
                return defaultValue;
            }
        }
        
        return value !== undefined ? value : defaultValue;
    }

    has(key) {
        return this.config.has(key) || this.hasDefaultConfig(key);
    }

    async delete(key, options = {}) {
        try {
            const { save = true, notify = true } = options;
            
            if (!this.config.has(key)) {
                return false;
            }

            const oldValue = this.config.get(key);
            this.config.delete(key);

            // Save if enabled
            if (save && this.options.enableAutoSave) {
                this.scheduleSave(key);
            }

            // Notify watchers
            if (notify) {
                this.notifyWatchers(key, undefined, oldValue);
            }

            this.emit('config.deleted', { key, oldValue });
            return true;
        } catch (error) {
            throw new Error(`Delete config failed: ${error.message}`);
        }
    }

    // Bulk operations
    async setMultiple(configs, options = {}) {
        const results = [];
        
        for (const [key, value] of Object.entries(configs)) {
            try {
                await this.set(key, value, { ...options, save: false });
                results.push({ key, success: true });
            } catch (error) {
                results.push({ key, success: false, error: error.message });
            }
        }

        // Save all at once
        if (options.save !== false && this.options.enableAutoSave) {
            await this.saveAll();
        }

        return results;
    }

    getMultiple(keys) {
        const result = {};
        for (const key of keys) {
            result[key] = this.get(key);
        }
        return result;
    }

    // Configuration sections
    async setSection(section, config, options = {}) {
        const results = [];
        
        for (const [key, value] of Object.entries(config)) {
            const fullKey = `${section}.${key}`;
            try {
                await this.set(fullKey, value, { ...options, save: false });
                results.push({ key: fullKey, success: true });
            } catch (error) {
                results.push({ key: fullKey, success: false, error: error.message });
            }
        }

        // Save all at once
        if (options.save !== false && this.options.enableAutoSave) {
            await this.saveAll();
        }

        return results;
    }

    getSection(section) {
        const result = {};
        const prefix = `${section}.`;
        
        // Get from current config
        for (const [key, value] of this.config.entries()) {
            if (key.startsWith(prefix)) {
                const subKey = key.substring(prefix.length);
                result[subKey] = value;
            }
        }
        
        // Get from defaults
        if (this.defaultConfigs[section]) {
            for (const [key, value] of Object.entries(this.defaultConfigs[section])) {
                const fullKey = `${section}.${key}`;
                if (!this.config.has(fullKey)) {
                    result[key] = value;
                }
            }
        }
        
        return result;
    }

    // Schema management
    setSchema(key, schema) {
        this.schemas.set(key, schema);
        this.emit('schema.added', { key, schema });
    }

    getSchema(key) {
        return this.schemas.get(key);
    }

    async validateConfig(key, value) {
        const schema = this.schemas.get(key);
        if (!schema) {
            return true; // No schema, validation passes
        }

        // Basic validation
        if (schema.type && typeof value !== schema.type) {
            throw new Error(`Invalid type for ${key}. Expected ${schema.type}, got ${typeof value}`);
        }

        if (schema.required && (value === null || value === undefined)) {
            throw new Error(`${key} is required`);
        }

        if (schema.enum && !schema.enum.includes(value)) {
            throw new Error(`Invalid value for ${key}. Must be one of: ${schema.enum.join(', ')}`);
        }

        if (schema.min !== undefined && value < schema.min) {
            throw new Error(`${key} must be at least ${schema.min}`);
        }

        if (schema.max !== undefined && value > schema.max) {
            throw new Error(`${key} must be at most ${schema.max}`);
        }

        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
            throw new Error(`${key} does not match required pattern`);
        }

        // Custom validation function
        if (schema.validate && typeof schema.validate === 'function') {
            const result = await schema.validate(value);
            if (result !== true) {
                throw new Error(result || `Custom validation failed for ${key}`);
            }
        }

        return true;
    }

    // Watchers
    watch(key, callback, options = {}) {
        const watcherId = this.generateWatcherId();
        const watcher = {
            id: watcherId,
            key: key,
            callback: callback,
            options: options,
            created: new Date().toISOString()
        };

        if (!this.watchers.has(key)) {
            this.watchers.set(key, []);
        }
        this.watchers.get(key).push(watcher);

        this.emit('watcher.added', watcher);
        return watcherId;
    }

    unwatch(watcherId) {
        for (const [key, watchers] of this.watchers.entries()) {
            const index = watchers.findIndex(w => w.id === watcherId);
            if (index > -1) {
                const watcher = watchers.splice(index, 1)[0];
                if (watchers.length === 0) {
                    this.watchers.delete(key);
                }
                this.emit('watcher.removed', watcher);
                return true;
            }
        }
        return false;
    }

    notifyWatchers(key, newValue, oldValue) {
        const watchers = this.watchers.get(key) || [];
        
        for (const watcher of watchers) {
            try {
                watcher.callback(newValue, oldValue, key);
            } catch (error) {
                this.emit('error', { 
                    message: 'Watcher callback failed', 
                    watcherId: watcher.id, 
                    error 
                });
            }
        }
    }

    // Persistence
    async save(key) {
        try {
            const value = this.config.get(key);
            if (value === undefined) {
                return false;
            }

            const filePath = this.getConfigFilePath(key);
            await this.ensureDirectoryExists(path.dirname(filePath));
            
            const data = {
                key: key,
                value: value,
                saved: new Date().toISOString(),
                version: '1.0.0'
            };

            await this.writeFile(filePath, data);
            this.emit('config.saved', { key, value });
            return true;
        } catch (error) {
            throw new Error(`Save config failed: ${error.message}`);
        }
    }

    async saveAll() {
        const promises = [];
        for (const key of this.config.keys()) {
            promises.push(this.save(key));
        }
        
        await Promise.all(promises);
        this.emit('config.saved.all');
    }

    async load(key) {
        try {
            const filePath = this.getConfigFilePath(key);
            const data = await this.readFile(filePath);
            
            if (data && data.value !== undefined) {
                this.config.set(key, data.value);
                this.emit('config.loaded', { key, value: data.value });
                return data.value;
            }
            
            return null;
        } catch (error) {
            // File doesn't exist or is invalid
            return null;
        }
    }

    async loadAll() {
        try {
            const configFiles = await this.findConfigFiles();
            const loadPromises = configFiles.map(file => this.loadFromFile(file));
            
            await Promise.all(loadPromises);
            this.emit('config.loaded.all');
        } catch (error) {
            throw new Error(`Load all configs failed: ${error.message}`);
        }
    }

    // Configuration templates
    async saveTemplate(name, config) {
        try {
            const templatePath = path.join(this.options.configPath, 'templates', `${name}.json`);
            const template = {
                name: name,
                config: config,
                created: new Date().toISOString(),
                version: '1.0.0'
            };

            await this.writeFile(templatePath, template);
            this.emit('template.saved', { name, config });
            return template;
        } catch (error) {
            throw new Error(`Save template failed: ${error.message}`);
        }
    }

    async loadTemplate(name) {
        try {
            const templatePath = path.join(this.options.configPath, 'templates', `${name}.json`);
            const template = await this.readFile(templatePath);
            
            this.emit('template.loaded', template);
            return template;
        } catch (error) {
            throw new Error(`Load template failed: ${error.message}`);
        }
    }

    async applyTemplate(name, options = {}) {
        try {
            const template = await this.loadTemplate(name);
            const results = await this.setMultiple(template.config, options);
            
            this.emit('template.applied', { name, results });
            return results;
        } catch (error) {
            throw new Error(`Apply template failed: ${error.message}`);
        }
    }

    // Configuration backup and restore
    async createBackup(name = null) {
        try {
            const backupName = name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const backupPath = path.join(this.options.configPath, 'backups', `${backupName}.json`);
            
            const backup = {
                name: backupName,
                config: Object.fromEntries(this.config),
                created: new Date().toISOString(),
                version: '1.0.0'
            };

            await this.ensureDirectoryExists(path.dirname(backupPath));
            await this.writeFile(backupPath, backup);
            
            this.emit('backup.created', backup);
            return backup;
        } catch (error) {
            throw new Error(`Create backup failed: ${error.message}`);
        }
    }

    async restoreBackup(name) {
        try {
            const backupPath = path.join(this.options.configPath, 'backups', `${name}.json`);
            const backup = await this.readFile(backupPath);
            
            // Clear current config
            this.config.clear();
            
            // Restore from backup
            const results = await this.setMultiple(backup.config, { save: false });
            await this.saveAll();
            
            this.emit('backup.restored', { name, results });
            return results;
        } catch (error) {
            throw new Error(`Restore backup failed: ${error.message}`);
        }
    }

    // Utility methods
    hasDefaultConfig(key) {
        const keyParts = key.split('.');
        let value = this.defaultConfigs;
        
        for (const part of keyParts) {
            if (value && typeof value === 'object' && value.hasOwnProperty(part)) {
                value = value[part];
            } else {
                return false;
            }
        }
        
        return true;
    }

    scheduleSave(key) {
        if (!this.pendingSaves.has(key)) {
            this.pendingSaves.add(key);
            
            setTimeout(async () => {
                try {
                    await this.save(key);
                } catch (error) {
                    this.emit('error', { message: 'Scheduled save failed', key, error });
                } finally {
                    this.pendingSaves.delete(key);
                }
            }, this.options.saveInterval);
        }
    }

    startAutoSave() {
        if (this.options.enableAutoSave) {
            setInterval(async () => {
                try {
                    await this.saveAll();
                } catch (error) {
                    this.emit('error', { message: 'Auto save failed', error });
                }
            }, this.options.saveInterval * 10); // Save all every 10x save interval
        }
    }

    getConfigFilePath(key) {
        const safeName = key.replace(/[^a-zA-Z0-9._-]/g, '_');
        return path.join(this.options.configPath, `${safeName}.json`);
    }

    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    async writeFile(filePath, data) {
        const content = JSON.stringify(data, null, 2);
        
        if (this.options.enableEncryption && this.options.encryptionKey) {
            // Simple encryption (in production, use proper encryption)
            const encrypted = Buffer.from(content).toString('base64');
            await fs.writeFile(filePath, encrypted);
        } else {
            await fs.writeFile(filePath, content);
        }
    }

    async readFile(filePath) {
        let content = await fs.readFile(filePath, 'utf8');
        
        if (this.options.enableEncryption && this.options.encryptionKey) {
            // Simple decryption (in production, use proper encryption)
            content = Buffer.from(content, 'base64').toString('utf8');
        }
        
        return JSON.parse(content);
    }

    async findConfigFiles() {
        try {
            const files = await fs.readdir(this.options.configPath);
            return files.filter(file => file.endsWith('.json') && !file.startsWith('backup_'));
        } catch (error) {
            return [];
        }
    }

    async loadFromFile(filename) {
        try {
            const filePath = path.join(this.options.configPath, filename);
            const data = await this.readFile(filePath);
            
            if (data && data.key && data.value !== undefined) {
                this.config.set(data.key, data.value);
            }
        } catch (error) {
            console.warn(`Failed to load config from ${filename}:`, error.message);
        }
    }

    async loadConfigurations() {
        // Load default configurations first
        for (const [section, config] of Object.entries(this.defaultConfigs)) {
            for (const [key, value] of Object.entries(config)) {
                const fullKey = `${section}.${key}`;
                if (!this.config.has(fullKey)) {
                    this.config.set(fullKey, value);
                }
            }
        }

        // Load saved configurations
        await this.loadAll();
    }

    setupSchemas() {
        // Define schemas for default configurations
        this.setSchema('app.debug', { type: 'boolean' });
        this.setSchema('app.logLevel', { type: 'string', enum: ['debug', 'info', 'warn', 'error'] });
        this.setSchema('connection.timeout', { type: 'number', min: 1000, max: 300000 });
        this.setSchema('connection.retryAttempts', { type: 'number', min: 0, max: 10 });
        this.setSchema('auth.sessionTimeout', { type: 'number', min: 60000 });
        this.setSchema('media.maxFileSize', { type: 'number', min: 1024, max: 1024 * 1024 * 1024 });
        this.setSchema('groups.maxGroupSize', { type: 'number', min: 2, max: 1024 });
        this.setSchema('privacy.defaultPrivacyLevel', { 
            type: 'string', 
            enum: ['everyone', 'contacts', 'nobody'] 
        });
    }

    generateWatcherId() {
        return `watcher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getters
    getAllConfigs() {
        const result = {};
        
        // Add current configs
        for (const [key, value] of this.config.entries()) {
            result[key] = value;
        }
        
        return result;
    }

    getWatchers() {
        const result = [];
        for (const watchers of this.watchers.values()) {
            result.push(...watchers);
        }
        return result;
    }

    getSchemas() {
        return Object.fromEntries(this.schemas);
    }

    // Statistics
    getStats() {
        return {
            totalConfigs: this.config.size,
            totalWatchers: this.getWatchers().length,
            totalSchemas: this.schemas.size,
            pendingSaves: this.pendingSaves.size,
            sections: Object.keys(this.defaultConfigs).length
        };
    }

    // Reset and cleanup
    async reset(section = null) {
        if (section) {
            // Reset specific section
            const prefix = `${section}.`;
            const keysToDelete = [];
            
            for (const key of this.config.keys()) {
                if (key.startsWith(prefix)) {
                    keysToDelete.push(key);
                }
            }
            
            for (const key of keysToDelete) {
                await this.delete(key);
            }
            
            // Restore defaults for this section
            if (this.defaultConfigs[section]) {
                await this.setSection(section, this.defaultConfigs[section]);
            }
        } else {
            // Reset all
            this.config.clear();
            await this.loadConfigurations();
        }
        
        this.emit('config.reset', { section });
    }

    cleanup() {
        // Clear all watchers
        this.watchers.clear();
        
        // Clear pending saves
        this.pendingSaves.clear();
        
        // Clear event listeners
        this.removeAllListeners();
    }
}

module.exports = WAConfigManager;