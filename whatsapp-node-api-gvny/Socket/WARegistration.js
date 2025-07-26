const crypto = require('crypto');

/**
 * WhatsApp Registration Handler
 * Manages the registration process for new WhatsApp clients
 */
class WARegistration {
    constructor(options = {}) {
        this.options = {
            timeout: 30000,
            maxRetries: 3,
            ...options
        };
        
        this.registrationState = 'idle';
        this.registrationData = null;
    }

    /**
     * Start registration process
     */
    async startRegistration(phoneNumber, keyHandler) {
        try {
            this.registrationState = 'starting';
            
            const registrationId = keyHandler.getRegistrationId();
            const identityKeyPair = keyHandler.getIdentityKeyPair();
            const signedPreKey = keyHandler.getSignedPreKey();
            const preKeys = keyHandler.getAllPreKeys().slice(0, 100);
            
            this.registrationData = {
                phoneNumber,
                registrationId,
                identityKey: identityKeyPair.publicKey.toString('base64'),
                signedPreKey: {
                    keyId: signedPreKey.keyId,
                    publicKey: signedPreKey.publicKey.toString('base64'),
                    signature: signedPreKey.signature.toString('base64')
                },
                preKeys: preKeys.map(key => ({
                    keyId: key.keyId,
                    publicKey: key.publicKey.toString('base64')
                })),
                timestamp: Date.now()
            };
            
            this.registrationState = 'ready';
            return this.registrationData;
        } catch (error) {
            this.registrationState = 'error';
            throw new Error(`Registration failed: ${error.message}`);
        }
    }

    /**
     * Get registration data
     */
    getRegistrationData() {
        return this.registrationData;
    }

    /**
     * Complete registration
     */
    completeRegistration(serverResponse) {
        try {
            this.registrationState = 'completed';
            return {
                success: true,
                registrationId: this.registrationData.registrationId,
                timestamp: Date.now(),
                serverResponse
            };
        } catch (error) {
            this.registrationState = 'error';
            throw new Error(`Failed to complete registration: ${error.message}`);
        }
    }

    /**
     * Get registration state
     */
    getState() {
        return {
            state: this.registrationState,
            hasData: !!this.registrationData,
            timestamp: this.registrationData?.timestamp
        };
    }

    /**
     * Reset registration
     */
    reset() {
        this.registrationState = 'idle';
        this.registrationData = null;
    }
}

module.exports = WARegistration;