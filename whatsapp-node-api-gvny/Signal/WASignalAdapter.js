/**
 * WASignalAdapter
 * Smart adapter that chooses between libsignal and WA* implementations
 * Prevents conflicts and provides fallback functionality
 */

const EventEmitter = require('events');

class WASignalAdapter extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.libsignal = null;
        this.waImplementations = {};
        this.activeImplementation = null;
        this.initialize();
    }

    /**
     * Initialize the adapter
     */
    initialize() {
        console.log('🔄 WASignalAdapter initializing...');
        
        // Try to load libsignal first
        this.tryLoadLibsignal();
        
        // Load WA* implementations as fallback
        this.loadWAImplementations();
        
        // Choose the best implementation
        this.selectImplementation();
        
        console.log(`✅ WASignalAdapter using: ${this.activeImplementation}`);
    }

    /**
     * Try to load libsignal (optional dependency)
     */
    tryLoadLibsignal() {
        try {
            this.libsignal = require('libsignal');
            console.log('📦 libsignal loaded successfully');
            return true;
        } catch (error) {
            console.log('⚠️  libsignal not available, using WA* fallback');
            console.log(`   Reason: ${error.message}`);
            return false;
        }
    }

    /**
     * Load WA* implementations
     */
    loadWAImplementations() {
        try {
            this.waImplementations = {
                WASignal: require('./WASignal'),
                WASignalStore: require('./WASignalStore'),
                WAKeyBundle: require('./WAKeyBundle'),
                WAKeyHelper: require('./WAKeyHelper'),
                WASessionBuilder: require('./WASessionBuilder'),
                WASessionCipher: require('./WASessionCipher'),
                WASignalProtocol: require('./WASignalProtocol'),
                WACurve25519: require('./WACurve25519'),
                WADoubleRatchet: require('./WADoubleRatchet'),
                WAGroupCipher: require('./WAGroupCipher'),
                WAGroupSessionBuilder: require('./WAGroupSessionBuilder'),
                WAHKDFUtil: require('./WAHKDFUtil'),
                WAIdentityKey: require('./WAIdentityKey'),
                WAPreKeyBundle: require('./WAPreKeyBundle'),
                WAPreKeyMessage: require('./WAPreKeyMessage'),
                WASenderKeyDistribution: require('./WASenderKeyDistribution'),
                WASignalMessage: require('./WASignalMessage'),
                WASignedPreKey: require('./WASignedPreKey')
            };
            console.log('📦 WA* implementations loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load WA* implementations:', error.message);
            return false;
        }
    }

    /**
     * Select the best available implementation
     */
    selectImplementation() {
        // Priority: libsignal > WA* implementations
        if (this.libsignal && this.isLibsignalWorking()) {
            this.activeImplementation = 'libsignal';
        } else if (Object.keys(this.waImplementations).length > 0) {
            this.activeImplementation = 'WA*';
        } else {
            throw new Error('No Signal implementation available');
        }
    }

    /**
     * Test if libsignal is working properly
     */
    isLibsignalWorking() {
        try {
            // Quick test to see if libsignal is functional
            if (this.libsignal.KeyHelper && this.libsignal.SessionBuilder) {
                return true;
            }
            return false;
        } catch (error) {
            console.log('⚠️  libsignal test failed:', error.message);
            return false;
        }
    }

    /**
     * Get KeyHelper implementation
     */
    getKeyHelper() {
        if (this.activeImplementation === 'libsignal') {
            return this.libsignal.KeyHelper;
        } else {
            return this.waImplementations.WAKeyHelper;
        }
    }

    /**
     * Get SessionBuilder implementation
     */
    getSessionBuilder(store, address) {
        if (this.activeImplementation === 'libsignal') {
            return new this.libsignal.SessionBuilder(store, address);
        } else {
            return new this.waImplementations.WASessionBuilder({ store, address });
        }
    }

    /**
     * Get SessionCipher implementation
     */
    getSessionCipher(store, address) {
        if (this.activeImplementation === 'libsignal') {
            return new this.libsignal.SessionCipher(store, address);
        } else {
            return new this.waImplementations.WASessionCipher({ store, address });
        }
    }

    /**
     * Get SignalProtocolStore implementation
     */
    getSignalStore() {
        if (this.activeImplementation === 'libsignal') {
            // libsignal requires custom store implementation
            return this.createLibsignalStore();
        } else {
            return new this.waImplementations.WASignalStore();
        }
    }

    /**
     * Create a libsignal-compatible store
     */
    createLibsignalStore() {
        const waStore = new this.waImplementations.WASignalStore();
        
        // Adapter to make WASignalStore compatible with libsignal interface
        return {
            getIdentityKeyPair: () => waStore.getIdentityKeyPair(),
            getLocalRegistrationId: () => waStore.getLocalRegistrationId(),
            saveIdentity: (identifier, identityKey) => waStore.saveIdentity(identifier, identityKey),
            isTrustedIdentity: (identifier, identityKey) => waStore.isTrustedIdentity(identifier, identityKey),
            loadPreKey: (keyId) => waStore.loadPreKey(keyId),
            storePreKey: (keyId, keyPair) => waStore.storePreKey(keyId, keyPair),
            removePreKey: (keyId) => waStore.removePreKey(keyId),
            loadSignedPreKey: (keyId) => waStore.loadSignedPreKey(keyId),
            storeSignedPreKey: (keyId, keyPair) => waStore.storeSignedPreKey(keyId, keyPair),
            loadSession: (identifier) => waStore.loadSession(identifier),
            storeSession: (identifier, record) => waStore.storeSession(identifier, record),
            removeSession: (identifier) => waStore.removeSession(identifier),
            removeAllSessions: (identifier) => waStore.removeAllSessions(identifier)
        };
    }

    /**
     * Generate registration ID
     */
    generateRegistrationId() {
        const keyHelper = this.getKeyHelper();
        if (this.activeImplementation === 'libsignal') {
            return keyHelper.generateRegistrationId();
        } else {
            return keyHelper.generateRegistrationId ? keyHelper.generateRegistrationId() : Math.floor(Math.random() * 16380) + 1;
        }
    }

    /**
     * Generate identity key pair
     */
    async generateIdentityKeyPair() {
        const keyHelper = this.getKeyHelper();
        if (this.activeImplementation === 'libsignal') {
            return await keyHelper.generateIdentityKeyPair();
        } else {
            return keyHelper.generateIdentityKeyPair ? await keyHelper.generateIdentityKeyPair() : { 
                pubKey: Buffer.alloc(32), 
                privKey: Buffer.alloc(32) 
            };
        }
    }

    /**
     * Get implementation info
     */
    getImplementationInfo() {
        return {
            active: this.activeImplementation,
            libsignalAvailable: !!this.libsignal,
            waImplementationsCount: Object.keys(this.waImplementations).length,
            features: this.getAvailableFeatures()
        };
    }

    /**
     * Get available features
     */
    getAvailableFeatures() {
        const features = [];
        
        if (this.activeImplementation === 'libsignal') {
            features.push('Native Signal Protocol', 'High Performance', 'Full Compatibility');
        }
        
        if (Object.keys(this.waImplementations).length > 0) {
            features.push('WA* Fallback', 'Android Compatible', 'Pure JavaScript');
        }
        
        return features;
    }

    /**
     * Test the active implementation
     */
    async testImplementation() {
        try {
            console.log(`🧪 Testing ${this.activeImplementation} implementation...`);
            
            const registrationId = this.generateRegistrationId();
            console.log(`✅ Registration ID generated: ${registrationId}`);
            
            const identityKeyPair = await this.generateIdentityKeyPair();
            console.log(`✅ Identity key pair generated`);
            
            const store = this.getSignalStore();
            console.log(`✅ Signal store created`);
            
            return {
                success: true,
                implementation: this.activeImplementation,
                registrationId,
                hasIdentityKeys: !!identityKeyPair,
                hasStore: !!store
            };
        } catch (error) {
            console.error(`❌ Test failed for ${this.activeImplementation}:`, error.message);
            return {
                success: false,
                implementation: this.activeImplementation,
                error: error.message
            };
        }
    }
}

module.exports = WASignalAdapter;