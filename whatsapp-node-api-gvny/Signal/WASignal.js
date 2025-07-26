const { EventEmitter } = require('events');
const crypto = require('crypto');
const WASignalStore = require('./WASignalStore');
const WAKeyBundle = require('./WAKeyBundle');
const WASessionBuilder = require('./WASessionBuilder');
const WASessionCipher = require('./WASessionCipher');
const WAPreKeyBundle = require('./WAPreKeyBundle');
const WASignedPreKey = require('./WASignedPreKey');
const WAIdentityKey = require('./WAIdentityKey');
const WASignalProtocol = require('./WASignalProtocol');
const WADoubleRatchet = require('./WADoubleRatchet');
const WAKeyHelper = require('./WAKeyHelper');
const WACurve25519 = require('./WACurve25519');
const WAHKDFUtil = require('./WAHKDFUtil');
const WASignalMessage = require('./WASignalMessage');
const WAPreKeyMessage = require('./WAPreKeyMessage');
const WASenderKeyDistribution = require('./WASenderKeyDistribution');
const WAGroupSessionBuilder = require('./WAGroupSessionBuilder');
const WAGroupCipher = require('./WAGroupCipher');

class WASignal extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            enableGroupEncryption: true,
            enableE2EEncryption: true,
            enableForwardSecrecy: true,
            enableDeniability: true,
            keyRotationInterval: 604800000, // 7 days
            maxSkippedMessages: 1000,
            maxMessageKeys: 2000,
            sessionTimeout: 2592000000, // 30 days
            ...options
        };
        
        // Core Signal components
        this.store = null;
        this.protocol = null;
        this.keyHelper = null;
        this.curve = null;
        this.hkdf = null;
        
        // Session management
        this.sessions = new Map();
        this.groupSessions = new Map();
        this.preKeys = new Map();
        this.signedPreKeys = new Map();
        this.identityKey = null;
        this.registrationId = null;
        
        // Message handling
        this.messageQueue = new Map();
        this.skippedMessages = new Map();
        this.messageKeys = new Map();
        
        // Group encryption
        this.senderKeys = new Map();
        this.groupCiphers = new Map();
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize core components
            this.store = new WASignalStore(this.options);
            this.protocol = new WASignalProtocol(this.options);
            this.keyHelper = new WAKeyHelper();
            this.curve = new WACurve25519();
            this.hkdf = new WAHKDFUtil();
            
            // Generate identity if not exists
            await this.initializeIdentity();
            
            // Load existing sessions
            await this.loadSessions();
            
            // Start key rotation timer
            this.startKeyRotation();
            
            this.emit('signal.ready');
        } catch (error) {
            this.emit('error', new Error(`Signal initialization failed: ${error.message}`));
        }
    }
    
    async initializeIdentity() {
        try {
            // Check if identity exists
            let identityKeyPair = await this.store.getIdentityKeyPair();
            let registrationId = await this.store.getLocalRegistrationId();
            
            if (!identityKeyPair || !registrationId) {
                // Generate new identity
                identityKeyPair = await this.keyHelper.generateIdentityKeyPair();
                registrationId = this.keyHelper.generateRegistrationId();
                
                // Store identity
                await this.store.put('identityKey', identityKeyPair);
                await this.store.put('registrationId', registrationId);
            }
            
            this.identityKey = identityKeyPair;
            this.registrationId = registrationId;
            
            // Generate pre-keys if needed
            await this.generatePreKeys();
            
            this.emit('identity.initialized', {
                identityKey: this.identityKey.pubKey,
                registrationId: this.registrationId
            });
            
        } catch (error) {
            throw new Error(`Identity initialization failed: ${error.message}`);
        }
    }
    
    async generatePreKeys() {
        try {
            const preKeyCount = 100;
            const preKeys = await this.keyHelper.generatePreKeys(1, preKeyCount);
            
            // Store pre-keys
            for (const preKey of preKeys) {
                await this.store.storePreKey(preKey.keyId, preKey.keyPair);
                this.preKeys.set(preKey.keyId, preKey);
            }
            
            // Generate signed pre-key
            const signedPreKey = await this.keyHelper.generateSignedPreKey(
                this.identityKey,
                1
            );
            
            await this.store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);
            this.signedPreKeys.set(signedPreKey.keyId, signedPreKey);
            
            this.emit('prekeys.generated', {
                preKeyCount: preKeys.length,
                signedPreKeyId: signedPreKey.keyId
            });
            
        } catch (error) {
            throw new Error(`Pre-key generation failed: ${error.message}`);
        }
    }
    
    async loadSessions() {
        try {
            const sessionIds = await this.store.getSessionIds();
            
            for (const sessionId of sessionIds) {
                const sessionRecord = await this.store.loadSession(sessionId);
                if (sessionRecord) {
                    this.sessions.set(sessionId, sessionRecord);
                }
            }
            
            this.emit('sessions.loaded', { count: this.sessions.size });
            
        } catch (error) {
            throw new Error(`Session loading failed: ${error.message}`);
        }
    }
    
    async createSession(recipientId, preKeyBundle) {
        try {
            const sessionBuilder = new WASessionBuilder(this.store, recipientId);
            await sessionBuilder.processPreKeyBundle(preKeyBundle);
            
            const sessionCipher = new WASessionCipher(this.store, recipientId);
            this.sessions.set(recipientId, sessionCipher);
            
            this.emit('session.created', { recipientId });
            
            return sessionCipher;
            
        } catch (error) {
            throw new Error(`Session creation failed: ${error.message}`);
        }
    }
    
    async getSession(recipientId) {
        if (this.sessions.has(recipientId)) {
            return this.sessions.get(recipientId);
        }
        
        // Try to load from store
        const sessionRecord = await this.store.loadSession(recipientId);
        if (sessionRecord) {
            const sessionCipher = new WASessionCipher(this.store, recipientId);
            this.sessions.set(recipientId, sessionCipher);
            return sessionCipher;
        }
        
        return null;
    }
    
    async encryptMessage(recipientId, plaintext) {
        try {
            const session = await this.getSession(recipientId);
            if (!session) {
                throw new Error(`No session found for ${recipientId}`);
            }
            
            const ciphertext = await session.encrypt(Buffer.from(plaintext, 'utf8'));
            
            this.emit('message.encrypted', {
                recipientId,
                messageType: ciphertext.type,
                bodyLength: ciphertext.body.length
            });
            
            return ciphertext;
            
        } catch (error) {
            throw new Error(`Message encryption failed: ${error.message}`);
        }
    }
    
    async decryptMessage(senderId, ciphertext) {
        try {
            const session = await this.getSession(senderId);
            if (!session) {
                throw new Error(`No session found for ${senderId}`);
            }
            
            let plaintext;
            
            if (ciphertext.type === 3) { // PreKeyWhisperMessage
                const preKeyMessage = new WAPreKeyMessage(ciphertext.body);
                plaintext = await session.decryptPreKeyWhisperMessage(preKeyMessage);
            } else if (ciphertext.type === 1) { // WhisperMessage
                const signalMessage = new WASignalMessage(ciphertext.body);
                plaintext = await session.decryptWhisperMessage(signalMessage);
            } else {
                throw new Error(`Unknown message type: ${ciphertext.type}`);
            }
            
            this.emit('message.decrypted', {
                senderId,
                messageType: ciphertext.type,
                plaintextLength: plaintext.length
            });
            
            return plaintext.toString('utf8');
            
        } catch (error) {
            throw new Error(`Message decryption failed: ${error.message}`);
        }
    }
    
    async createGroupSession(groupId, senderKeyName) {
        try {
            const groupSessionBuilder = new WAGroupSessionBuilder(this.store);
            const senderKeyDistribution = await groupSessionBuilder.create(
                groupId,
                senderKeyName
            );
            
            const groupCipher = new WAGroupCipher(this.store, senderKeyName);
            this.groupCiphers.set(groupId, groupCipher);
            
            this.emit('group.session.created', { groupId, senderKeyName });
            
            return senderKeyDistribution;
            
        } catch (error) {
            throw new Error(`Group session creation failed: ${error.message}`);
        }
    }
    
    async processGroupMessage(groupId, senderKeyName, senderKeyDistribution) {
        try {
            const groupSessionBuilder = new WAGroupSessionBuilder(this.store);
            await groupSessionBuilder.process(senderKeyName, senderKeyDistribution);
            
            if (!this.groupCiphers.has(groupId)) {
                const groupCipher = new WAGroupCipher(this.store, senderKeyName);
                this.groupCiphers.set(groupId, groupCipher);
            }
            
            this.emit('group.message.processed', { groupId, senderKeyName });
            
        } catch (error) {
            throw new Error(`Group message processing failed: ${error.message}`);
        }
    }
    
    async encryptGroupMessage(groupId, plaintext) {
        try {
            const groupCipher = this.groupCiphers.get(groupId);
            if (!groupCipher) {
                throw new Error(`No group cipher found for ${groupId}`);
            }
            
            const ciphertext = await groupCipher.encrypt(Buffer.from(plaintext, 'utf8'));
            
            this.emit('group.message.encrypted', {
                groupId,
                ciphertextLength: ciphertext.length
            });
            
            return ciphertext;
            
        } catch (error) {
            throw new Error(`Group message encryption failed: ${error.message}`);
        }
    }
    
    async decryptGroupMessage(groupId, senderKeyName, ciphertext) {
        try {
            let groupCipher = this.groupCiphers.get(groupId);
            if (!groupCipher) {
                groupCipher = new WAGroupCipher(this.store, senderKeyName);
                this.groupCiphers.set(groupId, groupCipher);
            }
            
            const plaintext = await groupCipher.decrypt(ciphertext);
            
            this.emit('group.message.decrypted', {
                groupId,
                senderKeyName,
                plaintextLength: plaintext.length
            });
            
            return plaintext.toString('utf8');
            
        } catch (error) {
            throw new Error(`Group message decryption failed: ${error.message}`);
        }
    }
    
    async getPreKeyBundle() {
        try {
            const preKey = Array.from(this.preKeys.values())[0];
            const signedPreKey = Array.from(this.signedPreKeys.values())[0];
            
            if (!preKey || !signedPreKey) {
                await this.generatePreKeys();
                return this.getPreKeyBundle();
            }
            
            return new WAPreKeyBundle(
                this.registrationId,
                1, // deviceId
                preKey.keyId,
                preKey.keyPair.pubKey,
                signedPreKey.keyId,
                signedPreKey.keyPair.pubKey,
                signedPreKey.signature,
                this.identityKey.pubKey
            );
            
        } catch (error) {
            throw new Error(`Pre-key bundle creation failed: ${error.message}`);
        }
    }
    
    async rotateKeys() {
        try {
            // Generate new signed pre-key
            const newSignedPreKeyId = Math.max(...Array.from(this.signedPreKeys.keys())) + 1;
            const newSignedPreKey = await this.keyHelper.generateSignedPreKey(
                this.identityKey,
                newSignedPreKeyId
            );
            
            // Store new signed pre-key
            await this.store.storeSignedPreKey(
                newSignedPreKey.keyId,
                newSignedPreKey.keyPair
            );
            this.signedPreKeys.set(newSignedPreKey.keyId, newSignedPreKey);
            
            // Remove old signed pre-keys (keep last 3)
            const signedPreKeyIds = Array.from(this.signedPreKeys.keys()).sort((a, b) => b - a);
            for (let i = 3; i < signedPreKeyIds.length; i++) {
                const oldId = signedPreKeyIds[i];
                await this.store.removeSignedPreKey(oldId);
                this.signedPreKeys.delete(oldId);
            }
            
            // Generate new pre-keys if running low
            const preKeyIds = Array.from(this.preKeys.keys());
            if (preKeyIds.length < 50) {
                const startId = Math.max(...preKeyIds) + 1;
                const newPreKeys = await this.keyHelper.generatePreKeys(startId, 50);
                
                for (const preKey of newPreKeys) {
                    await this.store.storePreKey(preKey.keyId, preKey.keyPair);
                    this.preKeys.set(preKey.keyId, preKey);
                }
            }
            
            this.emit('keys.rotated', {
                newSignedPreKeyId: newSignedPreKey.keyId,
                newPreKeysCount: preKeyIds.length < 50 ? 50 : 0
            });
            
        } catch (error) {
            this.emit('error', new Error(`Key rotation failed: ${error.message}`));
        }
    }
    
    startKeyRotation() {
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
        }
        
        this.keyRotationTimer = setInterval(() => {
            this.rotateKeys();
        }, this.options.keyRotationInterval);
    }
    
    stopKeyRotation() {
        if (this.keyRotationTimer) {
            clearInterval(this.keyRotationTimer);
            this.keyRotationTimer = null;
        }
    }
    
    async deleteSession(recipientId) {
        try {
            await this.store.deleteSession(recipientId);
            this.sessions.delete(recipientId);
            
            this.emit('session.deleted', { recipientId });
            
        } catch (error) {
            throw new Error(`Session deletion failed: ${error.message}`);
        }
    }
    
    async deleteAllSessions() {
        try {
            for (const recipientId of this.sessions.keys()) {
                await this.store.deleteSession(recipientId);
            }
            
            this.sessions.clear();
            this.emit('sessions.cleared');
            
        } catch (error) {
            throw new Error(`Session clearing failed: ${error.message}`);
        }
    }
    
    async exportSessions() {
        try {
            const sessions = {};
            
            for (const [recipientId, session] of this.sessions) {
                sessions[recipientId] = await this.store.loadSession(recipientId);
            }
            
            return {
                identityKey: this.identityKey,
                registrationId: this.registrationId,
                sessions,
                preKeys: Array.from(this.preKeys.entries()),
                signedPreKeys: Array.from(this.signedPreKeys.entries())
            };
            
        } catch (error) {
            throw new Error(`Session export failed: ${error.message}`);
        }
    }
    
    async importSessions(sessionData) {
        try {
            // Import identity
            this.identityKey = sessionData.identityKey;
            this.registrationId = sessionData.registrationId;
            
            await this.store.put('identityKey', this.identityKey);
            await this.store.put('registrationId', this.registrationId);
            
            // Import sessions
            for (const [recipientId, sessionRecord] of Object.entries(sessionData.sessions)) {
                await this.store.storeSession(recipientId, sessionRecord);
                const sessionCipher = new WASessionCipher(this.store, recipientId);
                this.sessions.set(recipientId, sessionCipher);
            }
            
            // Import pre-keys
            this.preKeys.clear();
            for (const [keyId, preKey] of sessionData.preKeys) {
                await this.store.storePreKey(keyId, preKey.keyPair);
                this.preKeys.set(keyId, preKey);
            }
            
            // Import signed pre-keys
            this.signedPreKeys.clear();
            for (const [keyId, signedPreKey] of sessionData.signedPreKeys) {
                await this.store.storeSignedPreKey(keyId, signedPreKey.keyPair);
                this.signedPreKeys.set(keyId, signedPreKey);
            }
            
            this.emit('sessions.imported', {
                sessionCount: Object.keys(sessionData.sessions).length,
                preKeyCount: sessionData.preKeys.length,
                signedPreKeyCount: sessionData.signedPreKeys.length
            });
            
        } catch (error) {
            throw new Error(`Session import failed: ${error.message}`);
        }
    }
    
    getStats() {
        return {
            sessions: this.sessions.size,
            groupSessions: this.groupSessions.size,
            preKeys: this.preKeys.size,
            signedPreKeys: this.signedPreKeys.size,
            messageQueue: this.messageQueue.size,
            skippedMessages: this.skippedMessages.size,
            hasIdentity: !!this.identityKey,
            registrationId: this.registrationId
        };
    }
    
    async cleanup() {
        this.stopKeyRotation();
        
        // Clear all sessions
        this.sessions.clear();
        this.groupSessions.clear();
        this.groupCiphers.clear();
        
        // Clear message queues
        this.messageQueue.clear();
        this.skippedMessages.clear();
        this.messageKeys.clear();
        
        // Clear keys
        this.preKeys.clear();
        this.signedPreKeys.clear();
        this.senderKeys.clear();
        
        // Cleanup store
        if (this.store) {
            await this.store.cleanup();
        }
        
        this.removeAllListeners();
    }
}

module.exports = WASignal;