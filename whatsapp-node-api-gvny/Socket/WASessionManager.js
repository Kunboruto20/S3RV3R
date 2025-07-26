const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Session Manager
 * Manages session data, persistence, and lifecycle
 */
class WASessionManager {
    constructor(options = {}) {
        this.options = {
            sessionPath: './wa_session',
            autoSave: true,
            saveInterval: 30000, // 30 seconds
            ...options
        };
        
        this.session = {
            id: null,
            isActive: false,
            createdAt: null,
            lastActivity: null,
            data: {}
        };
        
        this.saveTimer = null;
        this.isDirty = false;
    }

    /**
     * Initialize session manager
     */
    async initialize(sessionId = null) {
        try {
            this.session.id = sessionId || this.generateSessionId();
            this.session.createdAt = Date.now();
            this.session.lastActivity = Date.now();
            
            await this.loadSession();
            
            if (this.options.autoSave) {
                this.startAutoSave();
            }
            
            return true;
        } catch (error) {
            throw new Error(`Failed to initialize session: ${error.message}`);
        }
    }

    /**
     * Generate session ID
     */
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Start session
     */
    startSession() {
        this.session.isActive = true;
        this.session.lastActivity = Date.now();
        this.markDirty();
    }

    /**
     * End session
     */
    endSession() {
        this.session.isActive = false;
        this.session.lastActivity = Date.now();
        this.markDirty();
        
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
        
        return this.saveSession();
    }

    /**
     * Update session activity
     */
    updateActivity() {
        this.session.lastActivity = Date.now();
        this.markDirty();
    }

    /**
     * Set session data
     */
    setData(key, value) {
        this.session.data[key] = value;
        this.updateActivity();
        this.markDirty();
    }

    /**
     * Get session data
     */
    getData(key) {
        this.updateActivity();
        return this.session.data[key];
    }

    /**
     * Remove session data
     */
    removeData(key) {
        delete this.session.data[key];
        this.updateActivity();
        this.markDirty();
    }

    /**
     * Get all session data
     */
    getAllData() {
        this.updateActivity();
        return { ...this.session.data };
    }

    /**
     * Clear session data
     */
    clearData() {
        this.session.data = {};
        this.updateActivity();
        this.markDirty();
    }

    /**
     * Get session info
     */
    getSessionInfo() {
        return {
            id: this.session.id,
            isActive: this.session.isActive,
            createdAt: this.session.createdAt,
            lastActivity: this.session.lastActivity,
            dataKeys: Object.keys(this.session.data),
            isDirty: this.isDirty
        };
    }

    /**
     * Mark session as dirty (needs saving)
     */
    markDirty() {
        this.isDirty = true;
    }

    /**
     * Mark session as clean (saved)
     */
    markClean() {
        this.isDirty = false;
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
        
        this.saveTimer = setInterval(async () => {
            if (this.isDirty) {
                try {
                    await this.saveSession();
                } catch (error) {
                    console.error('Auto-save failed:', error);
                }
            }
        }, this.options.saveInterval);
    }

    /**
     * Save session to file
     */
    async saveSession() {
        try {
            const sessionDir = path.dirname(this.options.sessionPath);
            await fs.mkdir(sessionDir, { recursive: true });
            
            const sessionData = {
                ...this.session,
                savedAt: Date.now()
            };
            
            await fs.writeFile(
                this.options.sessionPath,
                JSON.stringify(sessionData, null, 2),
                'utf8'
            );
            
            this.markClean();
            return true;
        } catch (error) {
            throw new Error(`Failed to save session: ${error.message}`);
        }
    }

    /**
     * Load session from file
     */
    async loadSession() {
        try {
            const data = await fs.readFile(this.options.sessionPath, 'utf8');
            const sessionData = JSON.parse(data);
            
            // Merge loaded data with current session
            this.session = {
                ...this.session,
                ...sessionData,
                lastActivity: Date.now() // Update activity on load
            };
            
            this.markClean();
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create new session
                return this.saveSession();
            }
            throw new Error(`Failed to load session: ${error.message}`);
        }
    }

    /**
     * Delete session file
     */
    async deleteSession() {
        try {
            await fs.unlink(this.options.sessionPath);
            this.session = {
                id: null,
                isActive: false,
                createdAt: null,
                lastActivity: null,
                data: {}
            };
            this.markClean();
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return true; // File doesn't exist, consider it deleted
            }
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    /**
     * Check if session exists
     */
    async sessionExists() {
        try {
            await fs.access(this.options.sessionPath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get session age
     */
    getSessionAge() {
        if (!this.session.createdAt) {
            return 0;
        }
        return Date.now() - this.session.createdAt;
    }

    /**
     * Get time since last activity
     */
    getTimeSinceLastActivity() {
        if (!this.session.lastActivity) {
            return 0;
        }
        return Date.now() - this.session.lastActivity;
    }

    /**
     * Check if session is expired
     */
    isExpired(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
        return this.getSessionAge() > maxAge;
    }

    /**
     * Check if session is idle
     */
    isIdle(maxIdleTime = 30 * 60 * 1000) { // 30 minutes default
        return this.getTimeSinceLastActivity() > maxIdleTime;
    }

    /**
     * Get session statistics
     */
    getStatistics() {
        return {
            id: this.session.id,
            isActive: this.session.isActive,
            age: this.getSessionAge(),
            timeSinceLastActivity: this.getTimeSinceLastActivity(),
            dataSize: Object.keys(this.session.data).length,
            isDirty: this.isDirty,
            autoSaveEnabled: !!this.saveTimer,
            saveInterval: this.options.saveInterval
        };
    }

    /**
     * Cleanup and destroy session manager
     */
    async destroy() {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
        
        if (this.isDirty) {
            await this.saveSession();
        }
        
        await this.endSession();
    }
}

module.exports = WASessionManager;