const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * WhatsApp Session Manager
 * Handles session management and authentication state persistence
 */
class WASessionManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
            maxSessions: options.maxSessions || 10,
            enableEncryption: options.enableEncryption || false,
            encryptionKey: options.encryptionKey,
            ...options
        };

        this.sessions = new Map();
        this.activeSession = null;

        this.initialize();
    }

    initialize() {
        this.startSessionCleanup();
        this.emit('session:manager:ready');
    }

    async createSession(sessionData) {
        try {
            if (this.sessions.size >= this.options.maxSessions) {
                throw new Error('Maximum sessions limit reached');
            }

            const session = {
                id: this.generateSessionId(),
                created: new Date().toISOString(),
                lastAccess: new Date().toISOString(),
                data: sessionData,
                active: true
            };

            this.sessions.set(session.id, session);
            this.activeSession = session.id;
            
            this.emit('session:created', session);
            return session;
        } catch (error) {
            this.emit('session:error', error);
            throw error;
        }
    }

    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    startSessionCleanup() {
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, this.options.sessionTimeout);
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];

        for (const [sessionId, session] of this.sessions.entries()) {
            const lastAccess = new Date(session.lastAccess).getTime();
            if (now - lastAccess > this.options.sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        }

        expiredSessions.forEach(sessionId => {
            this.sessions.delete(sessionId);
            this.emit('session:expired', sessionId);
        });
    }
}

module.exports = WASessionManager;