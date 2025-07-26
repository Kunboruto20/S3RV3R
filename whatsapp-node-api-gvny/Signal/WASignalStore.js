/**
 * WASignalStore
 * WhatsApp Signal Protocol Store
 */

const { EventEmitter } = require('events');

class WASignalStore extends EventEmitter {
    constructor() {
        super();
        this.identityKeys = new Map();
        this.preKeys = new Map();
        this.signedPreKeys = new Map();
        this.sessions = new Map();
        this.initialize();
    }

    initialize() {
        console.log('🔐 WASignalStore initialized');
    }

    // Identity Key Store
    async getIdentityKeyPair() {
        return this.identityKeys.get('local') || null;
    }

    async getLocalRegistrationId() {
        return this.identityKeys.get('registrationId') || 1;
    }

    async saveIdentity(identifier, identityKey) {
        this.identityKeys.set(identifier, identityKey);
        return true;
    }

    async isTrustedIdentity(identifier, identityKey) {
        return true; // Simplified for demo
    }

    // PreKey Store
    async loadPreKey(keyId) {
        return this.preKeys.get(keyId) || null;
    }

    async storePreKey(keyId, keyPair) {
        this.preKeys.set(keyId, keyPair);
    }

    async removePreKey(keyId) {
        this.preKeys.delete(keyId);
    }

    // Signed PreKey Store
    async loadSignedPreKey(keyId) {
        return this.signedPreKeys.get(keyId) || null;
    }

    async storeSignedPreKey(keyId, keyPair) {
        this.signedPreKeys.set(keyId, keyPair);
    }

    // Session Store
    async loadSession(identifier) {
        return this.sessions.get(identifier) || null;
    }

    async storeSession(identifier, record) {
        this.sessions.set(identifier, record);
    }

    async removeSession(identifier) {
        this.sessions.delete(identifier);
    }

    async removeAllSessions(identifier) {
        const keys = Array.from(this.sessions.keys());
        keys.forEach(key => {
            if (key.startsWith(identifier)) {
                this.sessions.delete(key);
            }
        });
    }

    // Utility methods
    clear() {
        this.identityKeys.clear();
        this.preKeys.clear();
        this.signedPreKeys.clear();
        this.sessions.clear();
    }

    getStats() {
        return {
            identityKeys: this.identityKeys.size,
            preKeys: this.preKeys.size,
            signedPreKeys: this.signedPreKeys.size,
            sessions: this.sessions.size
        };
    }
}

module.exports = WASignalStore;
