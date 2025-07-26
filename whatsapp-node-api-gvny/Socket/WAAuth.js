const crypto = require('crypto');
const { Buffer } = require('buffer');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');

const WANoiseHandler = require('./WANoiseHandler');
const WAKeyHandler = require('./WAKeyHandler');
const WACredentials = require('./WACredentials');
const WAHandshake = require('./WAHandshake');
const WAPairingCode = require('./WAPairingCode');
const WAQRCode = require('./WAQRCode');
const WATokenHandler = require('./WATokenHandler');
const WARegistration = require('./WARegistration');
const WAAuthState = require('./WAAuthState');
const WASessionManager = require('./WASessionManager');

class WAAuth {
    constructor(options = {}) {
        this.options = {
            printQRInTerminal: true,
            qrTimeout: 60000,
            pairingCodeTimeout: 60000,
            maxQRRetries: 5,
            maxPairingRetries: 5,
            authTimeout: 300000,
            ...options
        };
        
        this.authState = null;
        this.credentials = null;
        this.noiseHandler = new WANoiseHandler();
        this.keyHandler = new WAKeyHandler();
        this.credentialsHandler = new WACredentials();
        this.handshakeHandler = new WAHandshake();
        this.pairingCodeHandler = new WAPairingCode();
        this.qrCodeHandler = new WAQRCode();
        this.tokenHandler = new WATokenHandler();
        this.registrationHandler = new WARegistration();
        this.authStateHandler = new WAAuthState();
        this.sessionManager = new WASessionManager();
        
        // Authentication state
        this.isAuthenticated = false;
        this.authMethod = null; // 'qr' or 'pairing'
        this.qrCode = null;
        this.pairingCode = null;
        this.phoneNumber = null;
        this.registrationId = null;
        this.identityKey = null;
        this.preKey = null;
        this.signedPreKey = null;
        this.serverToken = null;
        this.clientToken = null;
        this.encKey = null;
        this.macKey = null;
        
        // Connection state
        this.connectionState = 'closed';
        this.lastAuthTime = null;
        this.authRetries = 0;
        this.qrRetries = 0;
        this.pairingRetries = 0;
        
        // Noise protocol state
        this.noiseState = null;
        this.ephemeralKeyPair = null;
        this.staticKeyPair = null;
        this.remoteStaticKey = null;
        this.handshakeHash = null;
        this.chainKey = null;
        
        // Session data
        this.sessionData = {
            creds: null,
            keys: new Map(),
            chats: new Map(),
            contacts: new Map(),
            messages: new Map(),
            groups: new Map(),
            blocklist: new Set(),
            appState: new Map()
        };
        
        this.initializeAuth();
    }
    
    async initializeAuth() {
        try {
            // Generate initial keys
            this.staticKeyPair = await this.keyHandler.generateKeyPair();
            this.ephemeralKeyPair = await this.keyHandler.generateKeyPair();
            this.identityKey = await this.keyHandler.generateIdentityKey();
            this.registrationId = this.generateRegistrationId();
            
            // Initialize noise protocol
            this.noiseState = await this.noiseHandler.initialize({
                staticKeyPair: this.staticKeyPair,
                ephemeralKeyPair: this.ephemeralKeyPair
            });
            
            // Initialize session manager
            await this.sessionManager.initialize();
            
        } catch (error) {
            throw new Error(`Failed to initialize auth: ${error.message}`);
        }
    }
    
    async initialize(authState = null) {
        try {
            if (authState) {
                this.authState = authState;
                this.credentials = authState.creds;
                this.sessionData = authState;
                
                // Restore authentication state
                if (this.credentials) {
                    await this.restoreAuthState();
                }
            } else {
                // Create new auth state
                this.authState = await this.authStateHandler.create();
                this.credentials = this.authState.creds;
            }
            
            return this.authState;
        } catch (error) {
            throw new Error(`Failed to initialize auth state: ${error.message}`);
        }
    }
    
    async restoreAuthState() {
        try {
            // Validate credentials
            if (!this.credentials || !this.credentials.noiseKey || !this.credentials.signedIdentityKey) {
                throw new Error('Invalid credentials');
            }
            
            // Restore noise state
            this.noiseState = await this.noiseHandler.restore(this.credentials.noiseKey);
            
            // Restore keys
            this.identityKey = this.credentials.signedIdentityKey;
            this.registrationId = this.credentials.registrationId;
            this.serverToken = this.credentials.serverToken;
            this.clientToken = this.credentials.clientToken;
            
            // Mark as authenticated
            this.isAuthenticated = true;
            this.connectionState = 'authenticated';
            this.lastAuthTime = new Date();
            
        } catch (error) {
            throw new Error(`Failed to restore auth state: ${error.message}`);
        }
    }
    
    async generateQRCode() {
        try {
            this.authMethod = 'qr';
            this.connectionState = 'qr-generation';
            
            // Generate QR data
            const qrData = await this.qrCodeHandler.generate({
                publicKey: this.staticKeyPair.publicKey,
                identityKey: this.identityKey.publicKey,
                registrationId: this.registrationId,
                ephemeralKey: this.ephemeralKeyPair.publicKey
            });
            
            this.qrCode = qrData.code;
            
            // Print QR code in terminal if enabled
            if (this.options.printQRInTerminal) {
                qrTerminal.generate(this.qrCode, { small: true });
                console.log('Scan the QR code above with WhatsApp');
            }
            
            // Generate QR code image
            const qrImage = await QRCode.toDataURL(this.qrCode);
            
            return {
                code: this.qrCode,
                image: qrImage,
                data: qrData
            };
            
        } catch (error) {
            this.qrRetries++;
            throw new Error(`Failed to generate QR code: ${error.message}`);
        }
    }
    
    async generatePairingCode(phoneNumber) {
        try {
            this.authMethod = 'pairing';
            this.phoneNumber = phoneNumber;
            this.connectionState = 'pairing-generation';
            
            // Validate phone number
            if (!this.isValidPhoneNumber(phoneNumber)) {
                throw new Error('Invalid phone number format');
            }
            
            // Generate pairing code
            const pairingData = await this.pairingCodeHandler.generate({
                phoneNumber: phoneNumber,
                publicKey: this.staticKeyPair.publicKey,
                identityKey: this.identityKey.publicKey,
                registrationId: this.registrationId,
                ephemeralKey: this.ephemeralKeyPair.publicKey
            });
            
            this.pairingCode = pairingData.code;
            
            console.log(`Pairing code for ${phoneNumber}: ${this.pairingCode}`);
            console.log('Enter this code in WhatsApp > Linked Devices > Link a Device');
            
            return {
                code: this.pairingCode,
                phoneNumber: phoneNumber,
                data: pairingData
            };
            
        } catch (error) {
            this.pairingRetries++;
            throw new Error(`Failed to generate pairing code: ${error.message}`);
        }
    }
    
    async waitForAuth() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Authentication timeout'));
            }, this.options.authTimeout);
            
            const checkAuth = () => {
                if (this.isAuthenticated) {
                    clearTimeout(timeout);
                    resolve(this.authState);
                } else {
                    setTimeout(checkAuth, 1000);
                }
            };
            
            checkAuth();
        });
    }
    
    async handleAuthChallenge(challenge) {
        try {
            this.connectionState = 'auth-challenge';
            
            // Process authentication challenge
            const response = await this.handshakeHandler.processChallenge({
                challenge: challenge,
                staticKeyPair: this.staticKeyPair,
                ephemeralKeyPair: this.ephemeralKeyPair,
                identityKey: this.identityKey,
                noiseState: this.noiseState
            });
            
            // Update noise state
            this.noiseState = response.noiseState;
            this.encKey = response.encKey;
            this.macKey = response.macKey;
            this.serverToken = response.serverToken;
            this.clientToken = response.clientToken;
            
            return response;
            
        } catch (error) {
            throw new Error(`Failed to handle auth challenge: ${error.message}`);
        }
    }
    
    async completeAuth(authData) {
        try {
            this.connectionState = 'auth-completion';
            
            // Complete authentication process
            const completion = await this.handshakeHandler.complete({
                authData: authData,
                noiseState: this.noiseState,
                encKey: this.encKey,
                macKey: this.macKey,
                serverToken: this.serverToken,
                clientToken: this.clientToken
            });
            
            // Update credentials
            this.credentials = {
                noiseKey: this.noiseState.key,
                signedIdentityKey: this.identityKey,
                registrationId: this.registrationId,
                serverToken: this.serverToken,
                clientToken: this.clientToken,
                encKey: this.encKey,
                macKey: this.macKey,
                me: completion.me,
                platform: completion.platform,
                lastAccountSyncTimestamp: Date.now()
            };
            
            // Update auth state
            this.authState.creds = this.credentials;
            this.authState.keys = completion.keys || new Map();
            
            // Mark as authenticated
            this.isAuthenticated = true;
            this.connectionState = 'authenticated';
            this.lastAuthTime = new Date();
            this.authRetries = 0;
            this.qrRetries = 0;
            this.pairingRetries = 0;
            
            return this.authState;
            
        } catch (error) {
            this.authRetries++;
            throw new Error(`Failed to complete authentication: ${error.message}`);
        }
    }
    
    encrypt(data) {
        try {
            if (!this.encKey || !this.macKey) {
                throw new Error('Encryption keys not available');
            }
            
            return this.noiseHandler.encrypt(data, this.encKey, this.macKey);
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }
    
    decrypt(data) {
        try {
            if (!this.encKey || !this.macKey) {
                throw new Error('Decryption keys not available');
            }
            
            return this.noiseHandler.decrypt(data, this.encKey, this.macKey);
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
    
    async getWebSocketUrl() {
        try {
            const baseUrl = 'wss://web.whatsapp.com/ws/chat';
            const params = new URLSearchParams({
                ed: '25519',
                v: '2,2413,1',
                r: this.registrationId.toString(),
                s: this.sessionManager.getSessionId()
            });
            
            return `${baseUrl}?${params.toString()}`;
        } catch (error) {
            throw new Error(`Failed to get WebSocket URL: ${error.message}`);
        }
    }
    
    getHeaders() {
        return {
            'Origin': 'https://web.whatsapp.com',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits'
        };
    }
    
    createHandshakeNode() {
        return this.handshakeHandler.createInitialNode({
            staticKeyPair: this.staticKeyPair,
            ephemeralKeyPair: this.ephemeralKeyPair,
            identityKey: this.identityKey,
            registrationId: this.registrationId,
            clientToken: this.clientToken
        });
    }
    
    isValidPhoneNumber(phoneNumber) {
        // Basic phone number validation
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phoneNumber.replace(/\s+/g, ''));
    }
    
    generateRegistrationId() {
        return crypto.randomInt(1, 16777216); // 24-bit random number
    }
    
    async refreshAuth() {
        try {
            if (!this.isAuthenticated) {
                throw new Error('Not authenticated');
            }
            
            // Refresh authentication tokens
            const refreshData = await this.tokenHandler.refresh({
                serverToken: this.serverToken,
                clientToken: this.clientToken,
                credentials: this.credentials
            });
            
            this.serverToken = refreshData.serverToken;
            this.clientToken = refreshData.clientToken;
            
            // Update credentials
            this.credentials.serverToken = this.serverToken;
            this.credentials.clientToken = this.clientToken;
            this.credentials.lastAccountSyncTimestamp = Date.now();
            
            // Update auth state
            this.authState.creds = this.credentials;
            
            return this.authState;
            
        } catch (error) {
            throw new Error(`Failed to refresh auth: ${error.message}`);
        }
    }
    
    async logout() {
        try {
            // Clear authentication state
            this.isAuthenticated = false;
            this.authState = null;
            this.credentials = null;
            this.connectionState = 'logged-out';
            
            // Clear sensitive data
            this.serverToken = null;
            this.clientToken = null;
            this.encKey = null;
            this.macKey = null;
            this.noiseState = null;
            
            // Clear session data
            this.sessionData = {
                creds: null,
                keys: new Map(),
                chats: new Map(),
                contacts: new Map(),
                messages: new Map(),
                groups: new Map(),
                blocklist: new Set(),
                appState: new Map()
            };
            
            // Notify session manager
            await this.sessionManager.clear();
            
        } catch (error) {
            throw new Error(`Failed to logout: ${error.message}`);
        }
    }
    
    getAuthState() {
        return {
            isAuthenticated: this.isAuthenticated,
            authMethod: this.authMethod,
            connectionState: this.connectionState,
            phoneNumber: this.phoneNumber,
            lastAuthTime: this.lastAuthTime,
            authRetries: this.authRetries,
            qrRetries: this.qrRetries,
            pairingRetries: this.pairingRetries,
            credentials: this.credentials ? {
                hasNoiseKey: !!this.credentials.noiseKey,
                hasIdentityKey: !!this.credentials.signedIdentityKey,
                hasTokens: !!(this.credentials.serverToken && this.credentials.clientToken),
                registrationId: this.credentials.registrationId,
                me: this.credentials.me,
                platform: this.credentials.platform
            } : null
        };
    }
    
    async saveAuthState() {
        try {
            return await this.authStateHandler.save(this.authState);
        } catch (error) {
            throw new Error(`Failed to save auth state: ${error.message}`);
        }
    }
    
    async loadAuthState() {
        try {
            const authState = await this.authStateHandler.load();
            if (authState) {
                await this.initialize(authState);
            }
            return authState;
        } catch (error) {
            throw new Error(`Failed to load auth state: ${error.message}`);
        }
    }
}

module.exports = WAAuth;