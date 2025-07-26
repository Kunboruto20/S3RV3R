const EventEmitter = require('events');

/**
 * WhatsApp Middleware Manager
 * Handles middleware for processing messages, events, and requests
 */
class WAMiddlewareManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableMiddleware: options.enableMiddleware !== false,
            enableAsync: options.enableAsync !== false,
            enableErrorHandling: options.enableErrorHandling !== false,
            maxExecutionTime: options.maxExecutionTime || 30000, // 30 seconds
            enableLogging: options.enableLogging !== false,
            enableMetrics: options.enableMetrics !== false,
            ...options
        };

        // Middleware stores
        this.middleware = new Map();
        this.globalMiddleware = [];
        this.eventMiddleware = new Map();
        this.routeMiddleware = new Map();
        this.errorHandlers = [];
        this.metrics = new Map();
        
        // Middleware types
        this.middlewareTypes = {
            GLOBAL: 'global',
            EVENT: 'event',
            ROUTE: 'route',
            ERROR: 'error',
            BEFORE: 'before',
            AFTER: 'after'
        };

        // Built-in middleware
        this.builtInMiddleware = {
            logger: this.createLoggerMiddleware(),
            rateLimit: this.createRateLimitMiddleware(),
            auth: this.createAuthMiddleware(),
            validation: this.createValidationMiddleware(),
            transform: this.createTransformMiddleware(),
            filter: this.createFilterMiddleware(),
            cache: this.createCacheMiddleware(),
            metrics: this.createMetricsMiddleware()
        };

        this.initialize();
    }

    initialize() {
        this.setupBuiltInMiddleware();
        this.emit('ready');
    }

    // Middleware registration
    use(middleware, options = {}) {
        try {
            const middlewareId = this.generateMiddlewareId();
            const middlewareConfig = {
                id: middlewareId,
                middleware: middleware,
                type: options.type || this.middlewareTypes.GLOBAL,
                priority: options.priority || 0,
                enabled: options.enabled !== false,
                name: options.name || middleware.name || `middleware_${middlewareId}`,
                description: options.description || '',
                options: options,
                created: new Date().toISOString()
            };

            // Store middleware
            this.middleware.set(middlewareId, middlewareConfig);

            // Add to appropriate collection
            switch (middlewareConfig.type) {
                case this.middlewareTypes.GLOBAL:
                    this.globalMiddleware.push(middlewareConfig);
                    this.sortMiddleware(this.globalMiddleware);
                    break;
                    
                case this.middlewareTypes.EVENT:
                    const eventName = options.event;
                    if (!eventName) {
                        throw new Error('Event name is required for event middleware');
                    }
                    if (!this.eventMiddleware.has(eventName)) {
                        this.eventMiddleware.set(eventName, []);
                    }
                    this.eventMiddleware.get(eventName).push(middlewareConfig);
                    this.sortMiddleware(this.eventMiddleware.get(eventName));
                    break;
                    
                case this.middlewareTypes.ROUTE:
                    const route = options.route;
                    if (!route) {
                        throw new Error('Route is required for route middleware');
                    }
                    if (!this.routeMiddleware.has(route)) {
                        this.routeMiddleware.set(route, []);
                    }
                    this.routeMiddleware.get(route).push(middlewareConfig);
                    this.sortMiddleware(this.routeMiddleware.get(route));
                    break;
                    
                case this.middlewareTypes.ERROR:
                    this.errorHandlers.push(middlewareConfig);
                    this.sortMiddleware(this.errorHandlers);
                    break;
            }

            this.emit('middleware.registered', middlewareConfig);
            return middlewareId;
        } catch (error) {
            throw new Error(`Middleware registration failed: ${error.message}`);
        }
    }

    // Remove middleware
    remove(middlewareId) {
        try {
            const middlewareConfig = this.middleware.get(middlewareId);
            if (!middlewareConfig) {
                return false;
            }

            // Remove from appropriate collection
            switch (middlewareConfig.type) {
                case this.middlewareTypes.GLOBAL:
                    this.removeFromArray(this.globalMiddleware, middlewareConfig);
                    break;
                    
                case this.middlewareTypes.EVENT:
                    const eventMiddleware = this.eventMiddleware.get(middlewareConfig.options.event);
                    if (eventMiddleware) {
                        this.removeFromArray(eventMiddleware, middlewareConfig);
                        if (eventMiddleware.length === 0) {
                            this.eventMiddleware.delete(middlewareConfig.options.event);
                        }
                    }
                    break;
                    
                case this.middlewareTypes.ROUTE:
                    const routeMiddleware = this.routeMiddleware.get(middlewareConfig.options.route);
                    if (routeMiddleware) {
                        this.removeFromArray(routeMiddleware, middlewareConfig);
                        if (routeMiddleware.length === 0) {
                            this.routeMiddleware.delete(middlewareConfig.options.route);
                        }
                    }
                    break;
                    
                case this.middlewareTypes.ERROR:
                    this.removeFromArray(this.errorHandlers, middlewareConfig);
                    break;
            }

            // Remove from main store
            this.middleware.delete(middlewareId);

            this.emit('middleware.removed', middlewareConfig);
            return true;
        } catch (error) {
            throw new Error(`Middleware removal failed: ${error.message}`);
        }
    }

    // Enable/disable middleware
    enable(middlewareId) {
        const middlewareConfig = this.middleware.get(middlewareId);
        if (middlewareConfig) {
            middlewareConfig.enabled = true;
            this.emit('middleware.enabled', middlewareConfig);
            return true;
        }
        return false;
    }

    disable(middlewareId) {
        const middlewareConfig = this.middleware.get(middlewareId);
        if (middlewareConfig) {
            middlewareConfig.enabled = false;
            this.emit('middleware.disabled', middlewareConfig);
            return true;
        }
        return false;
    }

    // Execute middleware
    async execute(context, middlewareList = null) {
        try {
            const startTime = Date.now();
            const middleware = middlewareList || this.globalMiddleware;
            
            for (const middlewareConfig of middleware) {
                if (!middlewareConfig.enabled) {
                    continue;
                }

                try {
                    const middlewareStartTime = Date.now();
                    
                    // Execute middleware
                    if (this.options.enableAsync) {
                        await this.executeMiddleware(middlewareConfig, context);
                    } else {
                        this.executeMiddleware(middlewareConfig, context);
                    }

                    // Update metrics
                    if (this.options.enableMetrics) {
                        this.updateMetrics(middlewareConfig.id, Date.now() - middlewareStartTime);
                    }

                    // Check if context was modified to stop execution
                    if (context.stop === true) {
                        break;
                    }
                } catch (error) {
                    if (this.options.enableErrorHandling) {
                        await this.handleMiddlewareError(error, middlewareConfig, context);
                    } else {
                        throw error;
                    }
                }
            }

            const totalTime = Date.now() - startTime;
            this.emit('middleware.executed', { 
                context, 
                middleware: middleware.length, 
                executionTime: totalTime 
            });

            return context;
        } catch (error) {
            throw new Error(`Middleware execution failed: ${error.message}`);
        }
    }

    // Execute middleware for specific event
    async executeForEvent(eventName, context) {
        const eventMiddleware = this.eventMiddleware.get(eventName) || [];
        const allMiddleware = [...this.globalMiddleware, ...eventMiddleware];
        return await this.execute(context, allMiddleware);
    }

    // Execute middleware for specific route
    async executeForRoute(route, context) {
        const routeMiddleware = this.routeMiddleware.get(route) || [];
        const allMiddleware = [...this.globalMiddleware, ...routeMiddleware];
        return await this.execute(context, allMiddleware);
    }

    // Execute individual middleware
    async executeMiddleware(middlewareConfig, context) {
        const { middleware, options } = middlewareConfig;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Middleware ${middlewareConfig.name} timed out`));
            }, this.options.maxExecutionTime);
        });

        const middlewarePromise = Promise.resolve(middleware(context, options));
        
        return await Promise.race([middlewarePromise, timeoutPromise]);
    }

    // Error handling
    async handleMiddlewareError(error, middlewareConfig, context) {
        try {
            const errorContext = {
                ...context,
                error: error,
                middleware: middlewareConfig,
                timestamp: new Date().toISOString()
            };

            // Execute error handlers
            for (const errorHandler of this.errorHandlers) {
                if (errorHandler.enabled) {
                    try {
                        await this.executeMiddleware(errorHandler, errorContext);
                    } catch (handlerError) {
                        console.error('Error handler failed:', handlerError);
                    }
                }
            }

            this.emit('middleware.error', errorContext);
        } catch (error) {
            console.error('Error handling failed:', error);
        }
    }

    // Built-in middleware
    setupBuiltInMiddleware() {
        // Register built-in middleware if enabled
        if (this.options.enableLogging) {
            this.use(this.builtInMiddleware.logger, {
                name: 'logger',
                type: this.middlewareTypes.GLOBAL,
                priority: -1000
            });
        }

        if (this.options.enableMetrics) {
            this.use(this.builtInMiddleware.metrics, {
                name: 'metrics',
                type: this.middlewareTypes.GLOBAL,
                priority: -999
            });
        }
    }

    createLoggerMiddleware() {
        return (context, options) => {
            const timestamp = new Date().toISOString();
            const logData = {
                timestamp,
                type: context.type || 'unknown',
                source: context.source || 'unknown',
                data: options.includeData ? context.data : '[data hidden]'
            };

            if (this.options.enableLogging) {
                console.log('[WAMiddleware]', JSON.stringify(logData));
            }

            this.emit('middleware.logged', logData);
        };
    }

    createRateLimitMiddleware() {
        const requests = new Map();
        
        return (context, options = {}) => {
            const { limit = 100, window = 60000, key = 'default' } = options;
            const now = Date.now();
            const windowStart = now - window;
            
            // Get or create request history for this key
            if (!requests.has(key)) {
                requests.set(key, []);
            }
            
            const requestHistory = requests.get(key);
            
            // Remove old requests
            const validRequests = requestHistory.filter(time => time > windowStart);
            requests.set(key, validRequests);
            
            // Check rate limit
            if (validRequests.length >= limit) {
                context.rateLimited = true;
                context.stop = true;
                this.emit('middleware.rate.limited', { key, limit, window });
                return;
            }
            
            // Add current request
            validRequests.push(now);
        };
    }

    createAuthMiddleware() {
        return (context, options = {}) => {
            const { required = true, roles = [] } = options;
            
            if (!required) {
                return;
            }

            // Check if user is authenticated
            if (!context.user || !context.user.authenticated) {
                context.unauthorized = true;
                context.stop = true;
                this.emit('middleware.auth.failed', { reason: 'not_authenticated' });
                return;
            }

            // Check roles if specified
            if (roles.length > 0) {
                const userRoles = context.user.roles || [];
                const hasRole = roles.some(role => userRoles.includes(role));
                
                if (!hasRole) {
                    context.forbidden = true;
                    context.stop = true;
                    this.emit('middleware.auth.failed', { reason: 'insufficient_roles' });
                    return;
                }
            }

            context.authorized = true;
        };
    }

    createValidationMiddleware() {
        return (context, options = {}) => {
            const { schema, required = [] } = options;
            
            if (!context.data) {
                context.validationError = 'No data to validate';
                context.stop = true;
                return;
            }

            // Check required fields
            for (const field of required) {
                if (!context.data.hasOwnProperty(field)) {
                    context.validationError = `Missing required field: ${field}`;
                    context.stop = true;
                    return;
                }
            }

            // Apply schema validation if provided
            if (schema && typeof schema.validate === 'function') {
                const result = schema.validate(context.data);
                if (result.error) {
                    context.validationError = result.error.message;
                    context.stop = true;
                    return;
                }
            }

            context.validated = true;
        };
    }

    createTransformMiddleware() {
        return (context, options = {}) => {
            const { transforms = [] } = options;
            
            for (const transform of transforms) {
                if (typeof transform === 'function') {
                    context.data = transform(context.data);
                } else if (typeof transform === 'object') {
                    // Apply object-based transformations
                    for (const [key, value] of Object.entries(transform)) {
                        if (context.data.hasOwnProperty(key)) {
                            if (typeof value === 'function') {
                                context.data[key] = value(context.data[key]);
                            } else {
                                context.data[key] = value;
                            }
                        }
                    }
                }
            }

            context.transformed = true;
        };
    }

    createFilterMiddleware() {
        return (context, options = {}) => {
            const { filters = [] } = options;
            
            for (const filter of filters) {
                if (typeof filter === 'function') {
                    if (!filter(context)) {
                        context.filtered = true;
                        context.stop = true;
                        return;
                    }
                } else if (typeof filter === 'object') {
                    // Apply object-based filters
                    for (const [key, value] of Object.entries(filter)) {
                        if (context.data && context.data[key] !== value) {
                            context.filtered = true;
                            context.stop = true;
                            return;
                        }
                    }
                }
            }

            context.passed = true;
        };
    }

    createCacheMiddleware() {
        const cache = new Map();
        
        return (context, options = {}) => {
            const { ttl = 300000, key } = options; // 5 minutes default TTL
            
            if (!key) {
                return; // No caching without key
            }

            const cacheKey = typeof key === 'function' ? key(context) : key;
            const now = Date.now();
            
            // Check cache
            if (cache.has(cacheKey)) {
                const cached = cache.get(cacheKey);
                if (now - cached.timestamp < ttl) {
                    context.cached = true;
                    context.data = cached.data;
                    context.stop = true;
                    return;
                }
                // Remove expired entry
                cache.delete(cacheKey);
            }

            // Store original data for caching after processing
            context.cacheKey = cacheKey;
            context.cacheTTL = ttl;
        };
    }

    createMetricsMiddleware() {
        return (context, options = {}) => {
            const timestamp = Date.now();
            const metricKey = options.key || context.type || 'default';
            
            if (!this.metrics.has(metricKey)) {
                this.metrics.set(metricKey, {
                    count: 0,
                    totalTime: 0,
                    averageTime: 0,
                    lastExecuted: null
                });
            }

            const metrics = this.metrics.get(metricKey);
            metrics.count++;
            metrics.lastExecuted = timestamp;
            
            // Store start time for calculation later
            context.metricsStartTime = timestamp;
            context.metricsKey = metricKey;
        };
    }

    // Utility methods
    sortMiddleware(middlewareArray) {
        middlewareArray.sort((a, b) => b.priority - a.priority);
    }

    removeFromArray(array, item) {
        const index = array.indexOf(item);
        if (index > -1) {
            array.splice(index, 1);
        }
    }

    updateMetrics(middlewareId, executionTime) {
        const middlewareConfig = this.middleware.get(middlewareId);
        if (!middlewareConfig) return;

        if (!this.metrics.has(middlewareId)) {
            this.metrics.set(middlewareId, {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }

        const metrics = this.metrics.get(middlewareId);
        metrics.count++;
        metrics.totalTime += executionTime;
        metrics.averageTime = metrics.totalTime / metrics.count;
        metrics.minTime = Math.min(metrics.minTime, executionTime);
        metrics.maxTime = Math.max(metrics.maxTime, executionTime);
    }

    generateMiddlewareId() {
        return `middleware_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Getters
    getMiddleware(middlewareId) {
        return this.middleware.get(middlewareId);
    }

    getAllMiddleware() {
        return Array.from(this.middleware.values());
    }

    getGlobalMiddleware() {
        return this.globalMiddleware.filter(m => m.enabled);
    }

    getEventMiddleware(eventName) {
        return this.eventMiddleware.get(eventName) || [];
    }

    getRouteMiddleware(route) {
        return this.routeMiddleware.get(route) || [];
    }

    getErrorHandlers() {
        return this.errorHandlers.filter(h => h.enabled);
    }

    getMetrics(middlewareId = null) {
        if (middlewareId) {
            return this.metrics.get(middlewareId);
        }
        return Object.fromEntries(this.metrics);
    }

    // Statistics
    getStats() {
        return {
            totalMiddleware: this.middleware.size,
            globalMiddleware: this.globalMiddleware.length,
            eventMiddleware: this.eventMiddleware.size,
            routeMiddleware: this.routeMiddleware.size,
            errorHandlers: this.errorHandlers.length,
            enabledMiddleware: this.getAllMiddleware().filter(m => m.enabled).length,
            metricsCollected: this.metrics.size
        };
    }

    // Cleanup
    cleanup() {
        this.middleware.clear();
        this.globalMiddleware = [];
        this.eventMiddleware.clear();
        this.routeMiddleware.clear();
        this.errorHandlers = [];
        this.metrics.clear();
        this.removeAllListeners();
    }
}

module.exports = WAMiddlewareManager;