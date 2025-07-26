class WAConnectionDefaults {
    static getDefaults() {
        return {
            // WebSocket connection settings
            websocketUrl: 'wss://web.whatsapp.com/ws/chat',
            websocketProtocols: ['xmpp'],
            websocketOptions: {
                handshakeTimeout: 30000,
                perMessageDeflate: false,
                maxPayload: 100 * 1024 * 1024, // 100MB
                skipUTF8Validation: false
            },
            
            // Connection timeouts
            connectionTimeout: 30000,
            handshakeTimeout: 20000,
            authTimeout: 60000,
            reconnectTimeout: 5000,
            pingInterval: 30000,
            pongTimeout: 10000,
            keepAliveInterval: 25000,
            
            // Retry settings
            maxRetries: 5,
            retryDelay: 2000,
            exponentialBackoff: true,
            backoffMultiplier: 2,
            maxBackoffDelay: 30000,
            jitterEnabled: true,
            jitterMaxDelay: 1000,
            
            // Connection states
            autoReconnect: true,
            reconnectOnClose: true,
            reconnectOnError: true,
            maxReconnectAttempts: 10,
            reconnectInterval: 5000,
            
            // Protocol settings
            protocolVersion: [2, 2147, 10],
            clientVersion: '2.2147.10',
            platform: 'web',
            browser: 'Chrome',
            browserVersion: '120.0.0.0',
            os: 'Windows',
            osVersion: '10',
            
            // Headers
            headers: {
                'User-Agent': 'WhatsApp/2.2147.10 Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                'Sec-WebSocket-Protocol': 'xmpp',
                'Sec-WebSocket-Version': '13'
            },
            
            // Connection features
            features: {
                compression: true,
                encryption: true,
                multiDevice: true,
                webSync: true,
                voipRelay: true,
                mediaConn: true,
                fbAppId: '567310203415052',
                fbCat: 'wa_web'
            },
            
            // Buffer settings
            bufferSize: 64 * 1024, // 64KB
            maxBufferSize: 1024 * 1024, // 1MB
            bufferTimeout: 5000,
            
            // Rate limiting
            rateLimiting: {
                enabled: true,
                maxRequestsPerSecond: 10,
                maxRequestsPerMinute: 100,
                burstLimit: 20,
                windowSize: 60000
            },
            
            // Connection pooling
            pooling: {
                enabled: false,
                maxConnections: 5,
                idleTimeout: 300000,
                connectionTimeout: 30000
            },
            
            // Proxy settings
            proxy: {
                enabled: false,
                type: 'http', // 'http', 'https', 'socks4', 'socks5'
                host: null,
                port: null,
                username: null,
                password: null,
                timeout: 30000
            },
            
            // SSL/TLS settings
            ssl: {
                enabled: true,
                rejectUnauthorized: true,
                checkServerIdentity: true,
                minVersion: 'TLS1.2',
                ciphers: 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
                honorCipherOrder: true
            },
            
            // Logging settings
            logging: {
                enabled: false,
                level: 'info', // 'debug', 'info', 'warn', 'error'
                logConnections: true,
                logMessages: false,
                logErrors: true,
                logRetries: true,
                maxLogSize: 10 * 1024 * 1024, // 10MB
                logRotation: true
            },
            
            // Metrics and monitoring
            metrics: {
                enabled: false,
                collectConnectionStats: true,
                collectMessageStats: true,
                collectErrorStats: true,
                metricsInterval: 60000,
                retentionPeriod: 86400000 // 24 hours
            },
            
            // Connection validation
            validation: {
                validateOnConnect: true,
                validatePeriodically: true,
                validationInterval: 300000, // 5 minutes
                maxValidationFailures: 3,
                reconnectOnValidationFailure: true
            },
            
            // Connection events
            events: {
                emitConnectionEvents: true,
                emitDataEvents: false,
                emitErrorEvents: true,
                emitMetricEvents: false,
                maxEventListeners: 100
            },
            
            // Advanced settings
            advanced: {
                tcpNoDelay: true,
                tcpKeepAlive: true,
                tcpKeepAliveInitialDelay: 30000,
                socketTimeout: 0,
                maxSockets: 100,
                maxFreeSockets: 10,
                freeSocketTimeout: 15000
            },
            
            // Platform specific settings
            platformSpecific: {
                web: {
                    enableServiceWorker: false,
                    enableWebWorkers: false,
                    enableSharedArrayBuffer: false,
                    enableWebAssembly: false
                },
                node: {
                    enableCluster: false,
                    enableWorkerThreads: false,
                    maxMemoryUsage: 512 * 1024 * 1024, // 512MB
                    gcInterval: 300000 // 5 minutes
                }
            },
            
            // Error handling
            errorHandling: {
                retryOnError: true,
                retryableErrors: [
                    'ECONNRESET',
                    'ECONNREFUSED',
                    'ETIMEDOUT',
                    'ENOTFOUND',
                    'EHOSTUNREACH',
                    'ENETUNREACH'
                ],
                nonRetryableErrors: [
                    'EACCES',
                    'EPERM',
                    'ENOENT',
                    'EMFILE',
                    'ENFILE'
                ],
                errorTimeout: 5000,
                maxErrorsPerMinute: 10
            },
            
            // Connection security
            security: {
                enableCertificatePinning: false,
                allowInsecureConnections: false,
                validateHostname: true,
                requireSNI: true,
                enableHSTS: true,
                enableCSP: true
            },
            
            // Performance optimization
            performance: {
                enableCompression: true,
                compressionLevel: 6,
                enableCaching: true,
                cacheSize: 100,
                cacheTTL: 300000, // 5 minutes
                enablePipelining: false,
                maxPipelineRequests: 10
            },
            
            // Connection limits
            limits: {
                maxConcurrentConnections: 1,
                maxConnectionsPerHost: 1,
                maxRequestSize: 100 * 1024 * 1024, // 100MB
                maxResponseSize: 100 * 1024 * 1024, // 100MB
                maxHeaderSize: 8192,
                maxUrlLength: 2048
            },
            
            // Development settings
            development: {
                enableDebugMode: false,
                enableVerboseLogging: false,
                enableConnectionTracing: false,
                enablePerformanceMonitoring: false,
                enableMemoryProfiling: false
            }
        };
    }
    
    static getProductionDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            logging: {
                ...defaults.logging,
                enabled: true,
                level: 'warn',
                logMessages: false,
                logErrors: true
            },
            metrics: {
                ...defaults.metrics,
                enabled: true,
                collectConnectionStats: true,
                collectErrorStats: true
            },
            errorHandling: {
                ...defaults.errorHandling,
                maxErrorsPerMinute: 5
            },
            performance: {
                ...defaults.performance,
                enableCaching: true,
                cacheSize: 1000,
                enableCompression: true
            }
        };
    }
    
    static getDevelopmentDefaults() {
        const defaults = this.getDefaults();
        
        return {
            ...defaults,
            logging: {
                ...defaults.logging,
                enabled: true,
                level: 'debug',
                logConnections: true,
                logMessages: true,
                logErrors: true,
                logRetries: true
            },
            development: {
                ...defaults.development,
                enableDebugMode: true,
                enableVerboseLogging: true,
                enableConnectionTracing: true,
                enablePerformanceMonitoring: true
            },
            metrics: {
                ...defaults.metrics,
                enabled: true,
                collectConnectionStats: true,
                collectMessageStats: true,
                collectErrorStats: true
            }
        };
    }
    
    static getMinimalDefaults() {
        return {
            websocketUrl: 'wss://web.whatsapp.com/ws/chat',
            connectionTimeout: 30000,
            maxRetries: 3,
            retryDelay: 2000,
            autoReconnect: true,
            protocolVersion: [2, 2147, 10],
            platform: 'web'
        };
    }
    
    static validateDefaults(options) {
        const errors = [];
        
        if (options.connectionTimeout < 1000) {
            errors.push('Connection timeout must be at least 1000ms');
        }
        
        if (options.maxRetries < 0) {
            errors.push('Max retries must be non-negative');
        }
        
        if (options.retryDelay < 100) {
            errors.push('Retry delay must be at least 100ms');
        }
        
        if (options.pingInterval < 5000) {
            errors.push('Ping interval must be at least 5000ms');
        }
        
        if (options.bufferSize < 1024) {
            errors.push('Buffer size must be at least 1024 bytes');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = WAConnectionDefaults;