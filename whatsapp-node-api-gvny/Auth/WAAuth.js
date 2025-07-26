const EventEmitter = require('events');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Authentication State Manager
 * Handles authentication state, session management, and credential storage
 */
class WAAuth extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            authPath: options.authPath || './wa_auth',
            enableAutoSave: options.enableAutoSave !== false,
            saveInterval: options.saveInterval || 30000, // 30 seconds
            enableEncryption: options.enableEncryption || false,
            encryptionKey: options.encryptionKey,
            sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
            maxSessions: options.maxSessions || 10,
            ...options
        };

        // Auth state
        this.authState = {
            creds: null,
            keys: null,
            registered: false,
            registration: null,
            pairingCode: null,
            qr: null,
            connection: 'close',
            lastDisconnect: null,
            isNewLogin: false
        };

        // Session management
        this.sessions = new Map();
        this.activeSession = null;
        this.sessionTimer = null;

        this.initialize();
    }

    async initialize() {
        try {
            await this.createAuthStructure();
            await this.loadAuthState();
            this.startSessionTimer();
            this.emit('auth:ready');
        } catch (error) {
            this.emit('auth:error', error);
        }
    }

    // Create auth directory structure
    async createAuthStructure() {
        try {
            await fs.mkdir(this.options.authPath, { recursive: true });
            
            const subdirs = ['sessions', 'keys', 'backups'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.authPath, subdir), { recursive: true });
            }
        } catch (error) {
            throw new Error(`Auth structure creation failed: ${error.message}`);
        }
    }

    // Authentication state management
    async updateAuthState(update) {
        try {
            this.authState = { ...this.authState, ...update };
            
            if (this.options.enableAutoSave) {
                await this.saveAuthState();
            }

            this.emit('auth:state:update', this.authState);
            return this.authState;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async saveAuthState() {
        try {
            const authFile = path.join(this.options.authPath, 'auth_state.json');
            let data = JSON.stringify(this.authState, null, 2);

            if (this.options.enableEncryption && this.options.encryptionKey) {
                data = this.encryptData(data);
            }

            await fs.writeFile(authFile, data);
            this.emit('auth:state:saved');
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async loadAuthState() {
        try {
            const authFile = path.join(this.options.authPath, 'auth_state.json');
            
            try {
                let data = await fs.readFile(authFile, 'utf8');

                if (this.options.enableEncryption && this.options.encryptionKey) {
                    data = this.decryptData(data);
                }

                this.authState = { ...this.authState, ...JSON.parse(data) };
                this.emit('auth:state:loaded', this.authState);
            } catch (error) {
                // Auth state file doesn't exist or is corrupted
                console.warn('Auth state not found, using defaults');
            }
        } catch (error) {
            this.emit('auth:error', error);
        }
    }

    // Credentials management
    async saveCredentials(creds) {
        try {
            this.authState.creds = creds;
            
            const credsFile = path.join(this.options.authPath, 'credentials.json');
            let data = JSON.stringify(creds, null, 2);

            if (this.options.enableEncryption && this.options.encryptionKey) {
                data = this.encryptData(data);
            }

            await fs.writeFile(credsFile, data);
            await this.updateAuthState({ creds });
            
            this.emit('auth:credentials:saved', creds);
            return true;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async loadCredentials() {
        try {
            const credsFile = path.join(this.options.authPath, 'credentials.json');
            
            try {
                let data = await fs.readFile(credsFile, 'utf8');

                if (this.options.enableEncryption && this.options.encryptionKey) {
                    data = this.decryptData(data);
                }

                const creds = JSON.parse(data);
                this.authState.creds = creds;
                
                this.emit('auth:credentials:loaded', creds);
                return creds;
            } catch (error) {
                this.emit('auth:credentials:not_found');
                return null;
            }
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // Keys management
    async saveKeys(keys) {
        try {
            this.authState.keys = keys;
            
            const keysFile = path.join(this.options.authPath, 'keys', 'session_keys.json');
            let data = JSON.stringify(keys, null, 2);

            if (this.options.enableEncryption && this.options.encryptionKey) {
                data = this.encryptData(data);
            }

            await fs.writeFile(keysFile, data);
            await this.updateAuthState({ keys });
            
            this.emit('auth:keys:saved', keys);
            return true;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async loadKeys() {
        try {
            const keysFile = path.join(this.options.authPath, 'keys', 'session_keys.json');
            
            try {
                let data = await fs.readFile(keysFile, 'utf8');

                if (this.options.enableEncryption && this.options.encryptionKey) {
                    data = this.decryptData(data);
                }

                const keys = JSON.parse(data);
                this.authState.keys = keys;
                
                this.emit('auth:keys:loaded', keys);
                return keys;
            } catch (error) {
                this.emit('auth:keys:not_found');
                return null;
            }
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // Session management
    async createSession(sessionId, sessionData) {
        try {
            if (this.sessions.size >= this.options.maxSessions) {
                throw new Error('Maximum number of sessions reached');
            }

            const session = {
                id: sessionId,
                created: new Date().toISOString(),
                lastAccess: new Date().toISOString(),
                data: sessionData,
                active: true
            };

            this.sessions.set(sessionId, session);
            this.activeSession = sessionId;

            await this.saveSession(sessionId, session);
            this.emit('auth:session:created', session);
            
            return session;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async getSession(sessionId) {
        try {
            let session = this.sessions.get(sessionId);
            
            if (!session) {
                session = await this.loadSession(sessionId);
            }

            if (session) {
                session.lastAccess = new Date().toISOString();
                this.sessions.set(sessionId, session);
                await this.saveSession(sessionId, session);
            }

            return session;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async saveSession(sessionId, session) {
        try {
            const sessionFile = path.join(this.options.authPath, 'sessions', `${sessionId}.json`);
            let data = JSON.stringify(session, null, 2);

            if (this.options.enableEncryption && this.options.encryptionKey) {
                data = this.encryptData(data);
            }

            await fs.writeFile(sessionFile, data);
            this.emit('auth:session:saved', sessionId);
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async loadSession(sessionId) {
        try {
            const sessionFile = path.join(this.options.authPath, 'sessions', `${sessionId}.json`);
            
            try {
                let data = await fs.readFile(sessionFile, 'utf8');

                if (this.options.enableEncryption && this.options.encryptionKey) {
                    data = this.decryptData(data);
                }

                const session = JSON.parse(data);
                this.emit('auth:session:loaded', sessionId);
                return session;
            } catch (error) {
                return null;
            }
        } catch (error) {
            this.emit('auth:error', error);
            return null;
        }
    }

    async deleteSession(sessionId) {
        try {
            this.sessions.delete(sessionId);
            
            const sessionFile = path.join(this.options.authPath, 'sessions', `${sessionId}.json`);
            await fs.unlink(sessionFile).catch(() => {}); // Ignore if file doesn't exist

            if (this.activeSession === sessionId) {
                this.activeSession = null;
            }

            this.emit('auth:session:deleted', sessionId);
            return true;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // QR Code management
    async generateQR() {
        try {
            const qrData = {
                ref: crypto.randomBytes(16).toString('base64'),
                publicKey: crypto.randomBytes(32).toString('base64'),
                identityKey: crypto.randomBytes(32).toString('base64'),
                timestamp: Date.now()
            };

            this.authState.qr = qrData;
            await this.updateAuthState({ qr: qrData });

            this.emit('auth:qr:generated', qrData);
            return qrData;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // Pairing code management
    async generatePairingCode() {
        try {
            const pairingCode = Math.random().toString(36).substr(2, 8).toUpperCase();
            
            this.authState.pairingCode = {
                code: pairingCode,
                generated: new Date().toISOString(),
                expires: new Date(Date.now() + 300000).toISOString() // 5 minutes
            };

            await this.updateAuthState({ pairingCode: this.authState.pairingCode });

            this.emit('auth:pairing:generated', this.authState.pairingCode);
            return this.authState.pairingCode;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // Registration management
    async startRegistration(phoneNumber) {
        try {
            const registration = {
                phoneNumber: phoneNumber,
                started: new Date().toISOString(),
                status: 'pending',
                attempts: 0,
                maxAttempts: 3
            };

            this.authState.registration = registration;
            await this.updateAuthState({ registration });

            this.emit('auth:registration:started', registration);
            return registration;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    async completeRegistration(verificationCode) {
        try {
            if (!this.authState.registration) {
                throw new Error('No registration in progress');
            }

            this.authState.registration.status = 'completed';
            this.authState.registration.completed = new Date().toISOString();
            this.authState.registration.verificationCode = verificationCode;
            this.authState.registered = true;

            await this.updateAuthState({
                registration: this.authState.registration,
                registered: true
            });

            this.emit('auth:registration:completed', this.authState.registration);
            return this.authState.registration;
        } catch (error) {
            this.emit('auth:error', error);
            throw error;
        }
    }

    // Utility methods
    encryptData(data) {
        try {
            const cipher = crypto.createCipher('aes-256-cbc', this.options.encryptionKey);
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return encrypted;
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decryptData(encryptedData) {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', this.options.encryptionKey);
            let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    startSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
        }

        this.sessionTimer = setInterval(() => {
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
            this.deleteSession(sessionId);
        });

        if (expiredSessions.length > 0) {
            this.emit('auth:sessions:cleaned', expiredSessions);
        }
    }

    // State getters
    isAuthenticated() {
        return this.authState.registered && this.authState.creds !== null;
    }

    getAuthState() {
        return { ...this.authState };
    }

    getActiveSession() {
        return this.activeSession ? this.sessions.get(this.activeSession) : null;
    }

    // Cleanup
    async cleanup() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }

        if (this.options.enableAutoSave) {
            await this.saveAuthState();
        }

        this.emit('auth:cleanup');
    }
}

module.exports = WAAuth;