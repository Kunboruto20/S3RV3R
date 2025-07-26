const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Database Manager
 * Handles data persistence and database operations for WhatsApp
 */
class WADatabaseManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            databasePath: options.databasePath || './wa_database',
            enableEncryption: options.enableEncryption || false,
            encryptionKey: options.encryptionKey,
            enableBackups: options.enableBackups !== false,
            backupInterval: options.backupInterval || 86400000, // 24 hours
            maxBackups: options.maxBackups || 7,
            enableCompression: options.enableCompression || false,
            syncInterval: options.syncInterval || 30000, // 30 seconds
            enableWAL: options.enableWAL !== false, // Write-Ahead Logging
            ...options
        };

        // Database collections
        this.collections = {
            messages: 'messages.json',
            chats: 'chats.json',
            contacts: 'contacts.json',
            groups: 'groups.json',
            media: 'media.json',
            calls: 'calls.json',
            status: 'status.json',
            settings: 'settings.json',
            auth: 'auth.json',
            blocklist: 'blocklist.json',
            labels: 'labels.json',
            reactions: 'reactions.json',
            polls: 'polls.json',
            newsletters: 'newsletters.json',
            communities: 'communities.json',
            channels: 'channels.json',
            business: 'business.json',
            payments: 'payments.json',
            stories: 'stories.json'
        };

        // In-memory cache
        this.cache = new Map();
        this.pendingWrites = new Map();
        this.isInitialized = false;
        this.syncTimer = null;
        this.backupTimer = null;

        this.initialize();
    }

    async initialize() {
        try {
            await this.createDatabaseStructure();
            await this.loadCollections();
            this.startSyncTimer();
            this.startBackupTimer();
            this.isInitialized = true;
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    // Database structure creation
    async createDatabaseStructure() {
        try {
            // Create main database directory
            await fs.mkdir(this.options.databasePath, { recursive: true });
            
            // Create subdirectories
            const subdirs = ['collections', 'backups', 'wal', 'indexes', 'temp'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.databasePath, subdir), { recursive: true });
            }

            // Create metadata file
            const metadata = {
                version: '1.0.0',
                created: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                collections: Object.keys(this.collections),
                options: {
                    encryption: this.options.enableEncryption,
                    compression: this.options.enableCompression,
                    wal: this.options.enableWAL
                }
            };

            await this.writeFile('metadata.json', metadata);
        } catch (error) {
            throw new Error(`Database structure creation failed: ${error.message}`);
        }
    }

    // Collection operations
    async createCollection(name, schema = null) {
        try {
            if (this.collections[name]) {
                throw new Error(`Collection ${name} already exists`);
            }

            const filename = `${name}.json`;
            this.collections[name] = filename;

            const collection = {
                name: name,
                schema: schema,
                data: [],
                indexes: {},
                metadata: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    count: 0
                }
            };

            await this.writeCollection(name, collection);
            this.cache.set(name, collection);

            this.emit('collection.created', { name, schema });
            return collection;
        } catch (error) {
            throw new Error(`Collection creation failed: ${error.message}`);
        }
    }

    async dropCollection(name) {
        try {
            if (!this.collections[name]) {
                throw new Error(`Collection ${name} does not exist`);
            }

            // Remove file
            const filePath = this.getCollectionPath(name);
            await fs.unlink(filePath);

            // Remove from collections and cache
            delete this.collections[name];
            this.cache.delete(name);

            this.emit('collection.dropped', { name });
            return true;
        } catch (error) {
            throw new Error(`Collection drop failed: ${error.message}`);
        }
    }

    async getCollection(name) {
        try {
            if (!this.collections[name]) {
                throw new Error(`Collection ${name} does not exist`);
            }

            // Check cache first
            if (this.cache.has(name)) {
                return this.cache.get(name);
            }

            // Load from file
            const collection = await this.readCollection(name);
            this.cache.set(name, collection);
            return collection;
        } catch (error) {
            throw new Error(`Get collection failed: ${error.message}`);
        }
    }

    // Document operations
    async insert(collectionName, document) {
        try {
            const collection = await this.getCollection(collectionName);
            
            // Generate ID if not provided
            if (!document.id) {
                document.id = this.generateId();
            }

            // Add metadata
            document._created = new Date().toISOString();
            document._modified = new Date().toISOString();

            // Add to collection
            collection.data.push(document);
            collection.metadata.count++;
            collection.metadata.lastModified = new Date().toISOString();

            // Update cache
            this.cache.set(collectionName, collection);

            // Schedule write
            this.scheduleWrite(collectionName);

            this.emit('document.inserted', { collection: collectionName, document });
            return document;
        } catch (error) {
            throw new Error(`Insert failed: ${error.message}`);
        }
    }

    async insertMany(collectionName, documents) {
        try {
            const collection = await this.getCollection(collectionName);
            const insertedDocs = [];

            for (const document of documents) {
                // Generate ID if not provided
                if (!document.id) {
                    document.id = this.generateId();
                }

                // Add metadata
                document._created = new Date().toISOString();
                document._modified = new Date().toISOString();

                collection.data.push(document);
                insertedDocs.push(document);
            }

            collection.metadata.count += documents.length;
            collection.metadata.lastModified = new Date().toISOString();

            // Update cache
            this.cache.set(collectionName, collection);

            // Schedule write
            this.scheduleWrite(collectionName);

            this.emit('documents.inserted', { collection: collectionName, documents: insertedDocs });
            return insertedDocs;
        } catch (error) {
            throw new Error(`Insert many failed: ${error.message}`);
        }
    }

    async findOne(collectionName, query = {}) {
        try {
            const collection = await this.getCollection(collectionName);
            
            for (const document of collection.data) {
                if (this.matchesQuery(document, query)) {
                    return document;
                }
            }

            return null;
        } catch (error) {
            throw new Error(`Find one failed: ${error.message}`);
        }
    }

    async find(collectionName, query = {}, options = {}) {
        try {
            const collection = await this.getCollection(collectionName);
            let results = [];

            // Filter documents
            for (const document of collection.data) {
                if (this.matchesQuery(document, query)) {
                    results.push(document);
                }
            }

            // Apply sorting
            if (options.sort) {
                results = this.sortDocuments(results, options.sort);
            }

            // Apply pagination
            if (options.skip) {
                results = results.slice(options.skip);
            }
            if (options.limit) {
                results = results.slice(0, options.limit);
            }

            return results;
        } catch (error) {
            throw new Error(`Find failed: ${error.message}`);
        }
    }

    async updateOne(collectionName, query, update) {
        try {
            const collection = await this.getCollection(collectionName);
            
            for (let i = 0; i < collection.data.length; i++) {
                if (this.matchesQuery(collection.data[i], query)) {
                    const originalDoc = { ...collection.data[i] };
                    
                    // Apply update
                    this.applyUpdate(collection.data[i], update);
                    collection.data[i]._modified = new Date().toISOString();
                    
                    collection.metadata.lastModified = new Date().toISOString();
                    
                    // Update cache
                    this.cache.set(collectionName, collection);
                    
                    // Schedule write
                    this.scheduleWrite(collectionName);
                    
                    this.emit('document.updated', { 
                        collection: collectionName, 
                        original: originalDoc, 
                        updated: collection.data[i] 
                    });
                    
                    return collection.data[i];
                }
            }

            return null;
        } catch (error) {
            throw new Error(`Update one failed: ${error.message}`);
        }
    }

    async updateMany(collectionName, query, update) {
        try {
            const collection = await this.getCollection(collectionName);
            const updatedDocs = [];
            
            for (let i = 0; i < collection.data.length; i++) {
                if (this.matchesQuery(collection.data[i], query)) {
                    const originalDoc = { ...collection.data[i] };
                    
                    // Apply update
                    this.applyUpdate(collection.data[i], update);
                    collection.data[i]._modified = new Date().toISOString();
                    
                    updatedDocs.push({
                        original: originalDoc,
                        updated: collection.data[i]
                    });
                }
            }

            if (updatedDocs.length > 0) {
                collection.metadata.lastModified = new Date().toISOString();
                
                // Update cache
                this.cache.set(collectionName, collection);
                
                // Schedule write
                this.scheduleWrite(collectionName);
                
                this.emit('documents.updated', { 
                    collection: collectionName, 
                    documents: updatedDocs 
                });
            }

            return updatedDocs.length;
        } catch (error) {
            throw new Error(`Update many failed: ${error.message}`);
        }
    }

    async deleteOne(collectionName, query) {
        try {
            const collection = await this.getCollection(collectionName);
            
            for (let i = 0; i < collection.data.length; i++) {
                if (this.matchesQuery(collection.data[i], query)) {
                    const deletedDoc = collection.data.splice(i, 1)[0];
                    
                    collection.metadata.count--;
                    collection.metadata.lastModified = new Date().toISOString();
                    
                    // Update cache
                    this.cache.set(collectionName, collection);
                    
                    // Schedule write
                    this.scheduleWrite(collectionName);
                    
                    this.emit('document.deleted', { 
                        collection: collectionName, 
                        document: deletedDoc 
                    });
                    
                    return deletedDoc;
                }
            }

            return null;
        } catch (error) {
            throw new Error(`Delete one failed: ${error.message}`);
        }
    }

    async deleteMany(collectionName, query) {
        try {
            const collection = await this.getCollection(collectionName);
            const deletedDocs = [];
            
            for (let i = collection.data.length - 1; i >= 0; i--) {
                if (this.matchesQuery(collection.data[i], query)) {
                    const deletedDoc = collection.data.splice(i, 1)[0];
                    deletedDocs.push(deletedDoc);
                }
            }

            if (deletedDocs.length > 0) {
                collection.metadata.count -= deletedDocs.length;
                collection.metadata.lastModified = new Date().toISOString();
                
                // Update cache
                this.cache.set(collectionName, collection);
                
                // Schedule write
                this.scheduleWrite(collectionName);
                
                this.emit('documents.deleted', { 
                    collection: collectionName, 
                    documents: deletedDocs 
                });
            }

            return deletedDocs.length;
        } catch (error) {
            throw new Error(`Delete many failed: ${error.message}`);
        }
    }

    // Index operations
    async createIndex(collectionName, field, options = {}) {
        try {
            const collection = await this.getCollection(collectionName);
            
            if (!collection.indexes) {
                collection.indexes = {};
            }

            const index = {
                field: field,
                unique: options.unique || false,
                sparse: options.sparse || false,
                created: new Date().toISOString()
            };

            // Build index
            const indexData = new Map();
            for (const document of collection.data) {
                const value = this.getFieldValue(document, field);
                if (value !== undefined) {
                    if (index.unique && indexData.has(value)) {
                        throw new Error(`Duplicate value for unique index: ${value}`);
                    }
                    indexData.set(value, document.id);
                }
            }

            collection.indexes[field] = {
                ...index,
                data: Object.fromEntries(indexData)
            };

            // Update cache
            this.cache.set(collectionName, collection);
            
            // Schedule write
            this.scheduleWrite(collectionName);

            this.emit('index.created', { collection: collectionName, field, options });
            return index;
        } catch (error) {
            throw new Error(`Create index failed: ${error.message}`);
        }
    }

    async dropIndex(collectionName, field) {
        try {
            const collection = await this.getCollection(collectionName);
            
            if (!collection.indexes || !collection.indexes[field]) {
                throw new Error(`Index ${field} does not exist`);
            }

            delete collection.indexes[field];

            // Update cache
            this.cache.set(collectionName, collection);
            
            // Schedule write
            this.scheduleWrite(collectionName);

            this.emit('index.dropped', { collection: collectionName, field });
            return true;
        } catch (error) {
            throw new Error(`Drop index failed: ${error.message}`);
        }
    }

    // Backup operations
    async createBackup(name = null) {
        try {
            const backupName = name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            const backupPath = path.join(this.options.databasePath, 'backups', backupName);
            
            await fs.mkdir(backupPath, { recursive: true });

            // Copy all collections
            for (const [collectionName, filename] of Object.entries(this.collections)) {
                const sourcePath = this.getCollectionPath(collectionName);
                const destPath = path.join(backupPath, filename);
                
                try {
                    await fs.copyFile(sourcePath, destPath);
                } catch (error) {
                    // Collection might not exist yet
                    console.warn(`Could not backup collection ${collectionName}:`, error.message);
                }
            }

            // Copy metadata
            const metadataSource = path.join(this.options.databasePath, 'metadata.json');
            const metadataDest = path.join(backupPath, 'metadata.json');
            await fs.copyFile(metadataSource, metadataDest);

            // Create backup info
            const backupInfo = {
                name: backupName,
                created: new Date().toISOString(),
                collections: Object.keys(this.collections),
                size: await this.calculateDirectorySize(backupPath)
            };

            await fs.writeFile(
                path.join(backupPath, 'backup_info.json'),
                JSON.stringify(backupInfo, null, 2)
            );

            this.emit('backup.created', backupInfo);
            return backupInfo;
        } catch (error) {
            throw new Error(`Backup creation failed: ${error.message}`);
        }
    }

    async restoreBackup(backupName) {
        try {
            const backupPath = path.join(this.options.databasePath, 'backups', backupName);
            
            // Check if backup exists
            try {
                await fs.access(backupPath);
            } catch (error) {
                throw new Error(`Backup ${backupName} not found`);
            }

            // Clear current cache
            this.cache.clear();

            // Restore collections
            for (const [collectionName, filename] of Object.entries(this.collections)) {
                const backupFile = path.join(backupPath, filename);
                const destPath = this.getCollectionPath(collectionName);
                
                try {
                    await fs.copyFile(backupFile, destPath);
                } catch (error) {
                    console.warn(`Could not restore collection ${collectionName}:`, error.message);
                }
            }

            // Restore metadata
            const metadataBackup = path.join(backupPath, 'metadata.json');
            const metadataDest = path.join(this.options.databasePath, 'metadata.json');
            await fs.copyFile(metadataBackup, metadataDest);

            // Reload collections
            await this.loadCollections();

            this.emit('backup.restored', { backupName });
            return true;
        } catch (error) {
            throw new Error(`Backup restoration failed: ${error.message}`);
        }
    }

    async listBackups() {
        try {
            const backupsPath = path.join(this.options.databasePath, 'backups');
            const backups = [];
            
            try {
                const entries = await fs.readdir(backupsPath);
                
                for (const entry of entries) {
                    const backupInfoPath = path.join(backupsPath, entry, 'backup_info.json');
                    try {
                        const backupInfo = JSON.parse(await fs.readFile(backupInfoPath, 'utf8'));
                        backups.push(backupInfo);
                    } catch (error) {
                        // Skip invalid backups
                        console.warn(`Invalid backup ${entry}:`, error.message);
                    }
                }
            } catch (error) {
                // Backups directory doesn't exist
                return [];
            }

            return backups.sort((a, b) => new Date(b.created) - new Date(a.created));
        } catch (error) {
            throw new Error(`List backups failed: ${error.message}`);
        }
    }

    async deleteBackup(backupName) {
        try {
            const backupPath = path.join(this.options.databasePath, 'backups', backupName);
            await this.deleteDirectory(backupPath);
            
            this.emit('backup.deleted', { backupName });
            return true;
        } catch (error) {
            throw new Error(`Backup deletion failed: ${error.message}`);
        }
    }

    // Utility methods
    matchesQuery(document, query) {
        for (const [key, value] of Object.entries(query)) {
            if (typeof value === 'object' && value !== null) {
                // Handle operators
                for (const [operator, operatorValue] of Object.entries(value)) {
                    switch (operator) {
                        case '$eq':
                            if (document[key] !== operatorValue) return false;
                            break;
                        case '$ne':
                            if (document[key] === operatorValue) return false;
                            break;
                        case '$gt':
                            if (document[key] <= operatorValue) return false;
                            break;
                        case '$gte':
                            if (document[key] < operatorValue) return false;
                            break;
                        case '$lt':
                            if (document[key] >= operatorValue) return false;
                            break;
                        case '$lte':
                            if (document[key] > operatorValue) return false;
                            break;
                        case '$in':
                            if (!operatorValue.includes(document[key])) return false;
                            break;
                        case '$nin':
                            if (operatorValue.includes(document[key])) return false;
                            break;
                        case '$exists':
                            const exists = document.hasOwnProperty(key);
                            if (exists !== operatorValue) return false;
                            break;
                        case '$regex':
                            const regex = new RegExp(operatorValue);
                            if (!regex.test(document[key])) return false;
                            break;
                    }
                }
            } else {
                // Simple equality check
                if (document[key] !== value) return false;
            }
        }
        return true;
    }

    applyUpdate(document, update) {
        for (const [operator, operations] of Object.entries(update)) {
            switch (operator) {
                case '$set':
                    Object.assign(document, operations);
                    break;
                case '$unset':
                    for (const field of Object.keys(operations)) {
                        delete document[field];
                    }
                    break;
                case '$inc':
                    for (const [field, value] of Object.entries(operations)) {
                        document[field] = (document[field] || 0) + value;
                    }
                    break;
                case '$push':
                    for (const [field, value] of Object.entries(operations)) {
                        if (!Array.isArray(document[field])) {
                            document[field] = [];
                        }
                        document[field].push(value);
                    }
                    break;
                case '$pull':
                    for (const [field, value] of Object.entries(operations)) {
                        if (Array.isArray(document[field])) {
                            document[field] = document[field].filter(item => item !== value);
                        }
                    }
                    break;
            }
        }
    }

    sortDocuments(documents, sort) {
        return documents.sort((a, b) => {
            for (const [field, direction] of Object.entries(sort)) {
                const aVal = this.getFieldValue(a, field);
                const bVal = this.getFieldValue(b, field);
                
                if (aVal < bVal) return direction === 1 ? -1 : 1;
                if (aVal > bVal) return direction === 1 ? 1 : -1;
            }
            return 0;
        });
    }

    getFieldValue(document, field) {
        const parts = field.split('.');
        let value = document;
        
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getCollectionPath(name) {
        return path.join(this.options.databasePath, 'collections', this.collections[name]);
    }

    async writeFile(filename, data) {
        const filePath = path.join(this.options.databasePath, filename);
        const content = JSON.stringify(data, null, 2);
        
        if (this.options.enableEncryption && this.options.encryptionKey) {
            // Encrypt content (simplified - in production use proper encryption)
            const encrypted = Buffer.from(content).toString('base64');
            await fs.writeFile(filePath, encrypted);
        } else {
            await fs.writeFile(filePath, content);
        }
    }

    async readFile(filename) {
        const filePath = path.join(this.options.databasePath, filename);
        let content = await fs.readFile(filePath, 'utf8');
        
        if (this.options.enableEncryption && this.options.encryptionKey) {
            // Decrypt content (simplified - in production use proper encryption)
            content = Buffer.from(content, 'base64').toString('utf8');
        }
        
        return JSON.parse(content);
    }

    async writeCollection(name, collection) {
        const filePath = this.getCollectionPath(name);
        const content = JSON.stringify(collection, null, 2);
        
        if (this.options.enableEncryption && this.options.encryptionKey) {
            const encrypted = Buffer.from(content).toString('base64');
            await fs.writeFile(filePath, encrypted);
        } else {
            await fs.writeFile(filePath, content);
        }
    }

    async readCollection(name) {
        const filePath = this.getCollectionPath(name);
        
        try {
            let content = await fs.readFile(filePath, 'utf8');
            
            if (this.options.enableEncryption && this.options.encryptionKey) {
                content = Buffer.from(content, 'base64').toString('utf8');
            }
            
            return JSON.parse(content);
        } catch (error) {
            // Collection doesn't exist, create empty one
            const collection = {
                name: name,
                data: [],
                indexes: {},
                metadata: {
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    count: 0
                }
            };
            
            await this.writeCollection(name, collection);
            return collection;
        }
    }

    async loadCollections() {
        for (const collectionName of Object.keys(this.collections)) {
            try {
                const collection = await this.readCollection(collectionName);
                this.cache.set(collectionName, collection);
            } catch (error) {
                console.warn(`Failed to load collection ${collectionName}:`, error.message);
            }
        }
    }

    scheduleWrite(collectionName) {
        if (!this.pendingWrites.has(collectionName)) {
            this.pendingWrites.set(collectionName, setTimeout(async () => {
                try {
                    const collection = this.cache.get(collectionName);
                    if (collection) {
                        await this.writeCollection(collectionName, collection);
                    }
                } catch (error) {
                    this.emit('error', { message: 'Write failed', collection: collectionName, error });
                } finally {
                    this.pendingWrites.delete(collectionName);
                }
            }, 1000)); // Write after 1 second delay
        }
    }

    startSyncTimer() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        
        this.syncTimer = setInterval(async () => {
            await this.syncToStorage();
        }, this.options.syncInterval);
    }

    startBackupTimer() {
        if (this.options.enableBackups && this.backupTimer) {
            clearInterval(this.backupTimer);
        }
        
        if (this.options.enableBackups) {
            this.backupTimer = setInterval(async () => {
                try {
                    await this.createBackup();
                    await this.cleanupOldBackups();
                } catch (error) {
                    this.emit('error', { message: 'Backup failed', error });
                }
            }, this.options.backupInterval);
        }
    }

    async syncToStorage() {
        try {
            for (const [collectionName, collection] of this.cache.entries()) {
                await this.writeCollection(collectionName, collection);
            }
            this.emit('sync.completed');
        } catch (error) {
            this.emit('error', { message: 'Sync failed', error });
        }
    }

    async cleanupOldBackups() {
        const backups = await this.listBackups();
        if (backups.length > this.options.maxBackups) {
            const toDelete = backups.slice(this.options.maxBackups);
            for (const backup of toDelete) {
                await this.deleteBackup(backup.name);
            }
        }
    }

    async calculateDirectorySize(dirPath) {
        let size = 0;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += await this.calculateDirectorySize(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                size += stats.size;
            }
        }
        
        return size;
    }

    async deleteDirectory(dirPath) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                await this.deleteDirectory(fullPath);
            } else {
                await fs.unlink(fullPath);
            }
        }
        
        await fs.rmdir(dirPath);
    }

    // Statistics
    async getStats() {
        const stats = {
            collections: Object.keys(this.collections).length,
            totalDocuments: 0,
            cacheSize: this.cache.size,
            pendingWrites: this.pendingWrites.size,
            databaseSize: 0
        };

        // Count documents
        for (const collection of this.cache.values()) {
            stats.totalDocuments += collection.metadata.count;
        }

        // Calculate database size
        try {
            stats.databaseSize = await this.calculateDirectorySize(this.options.databasePath);
        } catch (error) {
            stats.databaseSize = 0;
        }

        return stats;
    }

    // Cleanup
    async cleanup() {
        // Stop timers
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
        }

        // Clear pending writes
        for (const timer of this.pendingWrites.values()) {
            clearTimeout(timer);
        }
        this.pendingWrites.clear();

        // Sync final state
        await this.syncToStorage();

        // Clear cache
        this.cache.clear();

        this.removeAllListeners();
    }
}

module.exports = WADatabaseManager;