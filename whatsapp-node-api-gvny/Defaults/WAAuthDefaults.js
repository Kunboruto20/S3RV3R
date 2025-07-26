class WAAuthDefaults {
    static getDefaults() {
        return {
            // Authentication methods
            enableQRAuth: true,
            enablePairingCodeAuth: true,
            enableMultiDevice: true,
            enableWebAuth: true,
            enableBusinessAuth: true,
            
            // QR Code settings
            qrCode: {
                refreshInterval: 20000, // 20 seconds
                expirationTime: 60000, // 1 minute
                maxRetries: 5,
                displayInTerminal: true,
                generateImage: true,
                imageFormat: 'png',
                imageSize: 256,
                errorCorrectionLevel: 'M',
                margin: 1,
                darkColor: '#000000',
                lightColor: '#FFFFFF'
            },
            
            // Pairing Code settings
            pairingCode: {
                codeLength: 8,
                expirationTime: 300000, // 5 minutes
                maxRetries: 3,
                retryDelay: 5000,
                displayInTerminal: true,
                allowedCharacters: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                enablePhoneValidation: true,
                minPhoneLength: 10,
                maxPhoneLength: 15
            },
            
            // Session management
            session: {
                enablePersistence: true,
                sessionPath: './wa-session',
                sessionTimeout: 86400000, // 24 hours
                enableEncryption: true,
                encryptionAlgorithm: 'aes-256-gcm',
                enableCompression: true,
                compressionLevel: 6,
                autoSave: true,
                saveInterval: 30000, // 30 seconds
                maxSessionSize: 50 * 1024 * 1024 // 50MB
            },
            
            // Credentials management
            credentials: {
                enableAutoSave: true,
                saveInterval: 10000, // 10 seconds
                enableBackup: true,
                backupInterval: 3600000, // 1 hour
                maxBackups: 5,
                enableEncryption: true,
                encryptionKey: null,
                enableValidation: true,
                validationInterval: 300000 // 5 minutes
            },
            
            // Key management
            keys: {
                enableAutoGeneration: true,
                keySize: 32,
                enableRotation: true,
                rotationInterval: 604800000, // 7 days
                enableBackup: true,
                maxKeyAge: 2592000000, // 30 days
                enableValidation: true,
                validationAlgorithm: 'sha256'
            },
            
            // Noise Protocol settings
            noise: {
                protocol: 'Noise_XX_25519_AESGCM_SHA256',
                enableHandshake: true,
                handshakeTimeout: 30000,
                enableEncryption: true,
                enableAuthentication: true,
                enableForwardSecrecy: true,
                maxHandshakeAttempts: 3,
                handshakeRetryDelay: 5000
            },
            
            // Certificate settings
            certificates: {
                enableValidation: true,
                enablePinning: false,
                pinnedCertificates: [],
                enableOCSP: false,
                enableCRL: false,
                validationTimeout: 10000,
                allowSelfSigned: false,
                requireSNI: true
            },
            
            // Token management
            tokens: {
                enableAutoRefresh: true,
                refreshThreshold: 300000, // 5 minutes
                maxTokenAge: 3600000, // 1 hour
                enableValidation: true,
                validationInterval: 60000, // 1 minute
                enableRevocation: true,
                revocationCheckInterval: 600000 // 10 minutes
            },
            
            // Device management
            device: {
                enableRegistration: true,
                deviceName: 'WhatsApp Web',
                deviceType: 'desktop',
                platform: 'web',
                enableFingerprinting: true,
                fingerprintAlgorithm: 'sha256',
                enableDeviceVerification: true,
                verificationTimeout: 60000
            },
            
            // Multi-device settings
            multiDevice: {
                enabled: true,
                maxDevices: 4,
                enableSyncAcrossDevices: true,
                syncInterval: 30000, // 30 seconds
                enableDeviceNotifications: true,
                enableDeviceManagement: true,
                deviceTrustLevel: 'medium'
            },
            
            // Security settings
            security: {
                enableTwoFactor: false,
                twoFactorMethod: 'totp',
                enableBiometric: false,
                biometricType: 'fingerprint',
                enablePasswordPolicy: false,
                minPasswordLength: 8,
                requireSpecialChars: false,
                requireNumbers: false,
                requireUppercase: false
            },
            
            // Rate limiting
            rateLimiting: {
                enabled: true,
                maxAuthAttempts: 5,
                authCooldown: 300000, // 5 minutes
                maxQRRequests: 10,
                qrCooldown: 60000, // 1 minute
                maxPairingAttempts: 3,
                pairingCooldown: 600000 // 10 minutes
            },
            
            // Validation settings
            validation: {
                enableInputValidation: true,
                enableOutputValidation: true,
                enableStateValidation: true,
                enableIntegrityChecks: true,
                integrityAlgorithm: 'hmac-sha256',
                enableTimestampValidation: true,
                maxClockSkew: 300000 // 5 minutes
            },
            
            // Logging and monitoring
            logging: {
                enabled: false,
                level: 'info',
                logAuthAttempts: true,
                logFailures: true,
                logSuccesses: false,
                logSensitiveData: false,
                maxLogSize: 10 * 1024 * 1024, // 10MB
                logRotation: true
            },
            
            // Error handling
            errorHandling: {
                enableRetry: true,
                maxRetries: 3,
                retryDelay: 5000,
                exponentialBackoff: true,
                backoffMultiplier: 2,
                maxBackoffDelay: 30000,
                enableFallback: true,
                fallbackMethod: 'qr'
            },
            
            // Timeout settings
            timeouts: {
                authTimeout: 60000, // 1 minute
                handshakeTimeout: 30000,
                keyExchangeTimeout: 20000,
                challengeTimeout: 15000,
                responseTimeout: 10000,
                connectionTimeout: 30000
            },
            
            // Encryption settings
            encryption: {
                algorithm: 'aes-256-gcm',
                keyDerivation: 'pbkdf2',
                iterations: 100000,
                saltLength: 32,
                ivLength: 12,
                tagLength: 16,
                enableKeyStretching: true,
                stretchingRounds: 1000
            },
            
            // Challenge-response settings
            challenge: {
                enableChallengeResponse: true,
                challengeLength: 32,
                challengeTimeout: 30000,
                maxChallengeAttempts: 3,
                challengeAlgorithm: 'sha256',
                enableNonceValidation: true,
                nonceLength: 16
            },
            
            // Business authentication
            business: {
                enableBusinessAuth: true,
                requireBusinessVerification: false,
                businessVerificationTimeout: 60000,
                enableCatalogAuth: false,
                enablePaymentAuth: false,
                businessApiVersion: '1.0'
            },
            
            // WebAuth settings
            webAuth: {
                enableWebAuthn: false,
                relyingPartyName: 'WhatsApp Web',
                relyingPartyId: 'web.whatsapp.com',
                enableResidentKeys: false,
                userVerification: 'preferred',
                attestation: 'none',
                timeout: 60000
            },
            
            // Backup and recovery
            backup: {
                enableAuthBackup: true,
                backupInterval: 3600000, // 1 hour
                maxBackups: 10,
                backupCompression: true,
                backupEncryption: true,
                enableAutoRecovery: true,
                recoveryTimeout: 300000 // 5 minutes
            },
            
            // Analytics and metrics
            analytics: {
                enabled: false,
                trackAuthAttempts: true,
                trackFailures: true,
                trackPerformance: true,
                retentionPeriod: 2592000000, // 30 days
                enableAnonymization: true
            },
            
            // Compliance settings
            compliance: {
                enableGDPR: false,
                enableCCPA: false,
                dataRetentionPeriod: 2592000000, // 30 days
                enableDataExport: false,
                enableDataDeletion: false,
                enableConsentManagement: false
            },
            
            // Development settings
            development: {
                enableDebugMode: false,
                enableVerboseLogging: false,
                enableTestMode: false,
                testCredentials: null,
                mockAuthentication: false,
                bypassValidation: false
            }
        };
    }
    
    static getProductionDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            security: {
                ...defaults.security,
                enableTwoFactor: true,
                enablePasswordPolicy: true,
                minPasswordLength: 12,
                requireSpecialChars: true,
                requireNumbers: true,
                requireUppercase: true
            },
            rateLimiting: {
                ...defaults.rateLimiting,
                maxAuthAttempts: 3,
                authCooldown: 900000, // 15 minutes
                maxQRRequests: 5,
                maxPairingAttempts: 2
            },
            logging: {
                ...defaults.logging,
                enabled: true,
                level: 'warn',
                logAuthAttempts: true,
                logFailures: true
            },
            certificates: {
                ...defaults.certificates,
                enableValidation: true,
                enablePinning: true,
                enableOCSP: true
            }
        };
    }
    
    static getDevelopmentDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            development: {
                ...defaults.development,
                enableDebugMode: true,
                enableVerboseLogging: true,
                enableTestMode: true
            },
            logging: {
                ...defaults.logging,
                enabled: true,
                level: 'debug',
                logAuthAttempts: true,
                logFailures: true,
                logSuccesses: true
            },
            rateLimiting: {
                ...defaults.rateLimiting,
                enabled: false
            },
            validation: {
                ...defaults.validation,
                enableTimestampValidation: false
            }
        };
    }
    
    static getMinimalDefaults() {
        return {
            enableQRAuth: true,
            enablePairingCodeAuth: true,
            qrCode: {
                refreshInterval: 20000,
                expirationTime: 60000,
                maxRetries: 5
            },
            pairingCode: {
                codeLength: 8,
                expirationTime: 300000,
                maxRetries: 3
            },
            session: {
                enablePersistence: true,
                sessionPath: './wa-session'
            },
            timeouts: {
                authTimeout: 60000,
                handshakeTimeout: 30000
            }
        };
    }
    
    static validateDefaults(options) {
        const errors = [];
        
        if (options.qrCode?.refreshInterval < 5000) {
            errors.push('QR refresh interval must be at least 5000ms');
        }
        
        if (options.pairingCode?.codeLength < 4) {
            errors.push('Pairing code length must be at least 4 characters');
        }
        
        if (options.pairingCode?.expirationTime < 60000) {
            errors.push('Pairing code expiration time must be at least 60000ms');
        }
        
        if (options.session?.sessionTimeout < 60000) {
            errors.push('Session timeout must be at least 60000ms');
        }
        
        if (options.keys?.keySize < 16) {
            errors.push('Key size must be at least 16 bytes');
        }
        
        if (options.security?.minPasswordLength < 6) {
            errors.push('Minimum password length must be at least 6 characters');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WAAuthDefaults;