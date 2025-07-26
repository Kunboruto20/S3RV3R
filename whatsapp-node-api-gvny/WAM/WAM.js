const { EventEmitter } = require('events');
const WAMMetrics = require('./WAMMetrics');
const WAMEvents = require('./WAMEvents');
const WAMTelemetry = require('./WAMTelemetry');
const WAMReporting = require('./WAMReporting');
const WAMStorage = require('./WAMStorage');
const WAMConfig = require('./WAMConfig');
const WAMCollector = require('./WAMCollector');
const WAMAnalyzer = require('./WAMAnalyzer');
const WAMExporter = require('./WAMExporter');
const WAMDashboard = require('./WAMDashboard');

class WAM extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            enabled: options.enabled !== false,
            collectMetrics: options.collectMetrics !== false,
            collectEvents: options.collectEvents !== false,
            collectTelemetry: options.collectTelemetry !== false,
            enableReporting: options.enableReporting || false,
            enableDashboard: options.enableDashboard || false,
            retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
            flushInterval: options.flushInterval || 60000, // 1 minute
            batchSize: options.batchSize || 100,
            enableAnonymization: options.enableAnonymization !== false,
            enableCompression: options.enableCompression !== false,
            storageType: options.storageType || 'memory', // 'memory', 'file', 'database'
            storagePath: options.storagePath || './wam-data',
            ...options
        };
        
        // Core components
        this.metrics = null;
        this.events = null;
        this.telemetry = null;
        this.reporting = null;
        this.storage = null;
        this.config = null;
        this.collector = null;
        this.analyzer = null;
        this.exporter = null;
        this.dashboard = null;
        
        // State management
        this.isStarted = false;
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        this.lastFlush = Date.now();
        
        // Timers
        this.flushTimer = null;
        this.cleanupTimer = null;
        
        this.init();
    }
    
    async init() {
        if (!this.options.enabled) {
            return;
        }
        
        try {
            // Initialize core components
            this.config = new WAMConfig(this.options);
            this.storage = new WAMStorage(this.options);
            this.collector = new WAMCollector(this.options);
            this.analyzer = new WAMAnalyzer(this.options);
            this.exporter = new WAMExporter(this.options);
            
            if (this.options.collectMetrics) {
                this.metrics = new WAMMetrics(this.options);
            }
            
            if (this.options.collectEvents) {
                this.events = new WAMEvents(this.options);
            }
            
            if (this.options.collectTelemetry) {
                this.telemetry = new WAMTelemetry(this.options);
            }
            
            if (this.options.enableReporting) {
                this.reporting = new WAMReporting(this.options);
            }
            
            if (this.options.enableDashboard) {
                this.dashboard = new WAMDashboard(this.options);
            }
            
            // Initialize storage
            await this.storage.init();
            
            this.emit('wam.initialized');
        } catch (error) {
            this.emit('error', new Error(`WAM initialization failed: ${error.message}`));
        }
    }
    
    start() {
        if (!this.options.enabled || this.isStarted) {
            return;
        }
        
        this.isStarted = true;
        this.startTime = Date.now();
        
        // Start periodic flushing
        this.startFlushTimer();
        
        // Start cleanup timer
        this.startCleanupTimer();
        
        // Record session start
        this.recordEvent('session.start', {
            sessionId: this.sessionId,
            timestamp: this.startTime,
            platform: process.platform,
            nodeVersion: process.version
        });
        
        this.emit('wam.started');
    }
    
    stop() {
        if (!this.isStarted) {
            return;
        }
        
        this.isStarted = false;
        
        // Stop timers
        this.stopFlushTimer();
        this.stopCleanupTimer();
        
        // Final flush
        this.flush();
        
        // Record session end
        const sessionDuration = Date.now() - this.startTime;
        this.recordEvent('session.end', {
            sessionId: this.sessionId,
            duration: sessionDuration,
            timestamp: Date.now()
        });
        
        this.emit('wam.stopped');
    }
    
    // Metrics recording
    recordMetric(name, value, tags = {}) {
        if (!this.isStarted || !this.metrics) {
            return;
        }
        
        this.metrics.record(name, value, {
            ...tags,
            sessionId: this.sessionId,
            timestamp: Date.now()
        });
        
        this.emit('metric.recorded', { name, value, tags });
    }
    
    incrementCounter(name, value = 1, tags = {}) {
        if (!this.isStarted || !this.metrics) {
            return;
        }
        
        this.metrics.increment(name, value, {
            ...tags,
            sessionId: this.sessionId
        });
    }
    
    recordGauge(name, value, tags = {}) {
        if (!this.isStarted || !this.metrics) {
            return;
        }
        
        this.metrics.gauge(name, value, {
            ...tags,
            sessionId: this.sessionId
        });
    }
    
    recordHistogram(name, value, tags = {}) {
        if (!this.isStarted || !this.metrics) {
            return;
        }
        
        this.metrics.histogram(name, value, {
            ...tags,
            sessionId: this.sessionId
        });
    }
    
    recordTiming(name, startTime, tags = {}) {
        if (!this.isStarted || !this.metrics) {
            return;
        }
        
        const duration = Date.now() - startTime;
        this.metrics.timing(name, duration, {
            ...tags,
            sessionId: this.sessionId
        });
    }
    
    // Event recording
    recordEvent(name, data = {}) {
        if (!this.isStarted || !this.events) {
            return;
        }
        
        this.events.record(name, {
            ...data,
            sessionId: this.sessionId,
            timestamp: Date.now()
        });
        
        this.emit('event.recorded', { name, data });
    }
    
    // Telemetry recording
    recordTelemetry(category, data = {}) {
        if (!this.isStarted || !this.telemetry) {
            return;
        }
        
        this.telemetry.record(category, {
            ...data,
            sessionId: this.sessionId,
            timestamp: Date.now()
        });
        
        this.emit('telemetry.recorded', { category, data });
    }
    
    // Connection metrics
    recordConnectionMetrics(state, duration = null, error = null) {
        this.recordEvent('connection.state', {
            state,
            duration,
            error: error ? error.message : null,
            errorCode: error ? error.code : null
        });
        
        this.incrementCounter('connection.state.count', 1, { state });
        
        if (duration) {
            this.recordHistogram('connection.duration', duration, { state });
        }
    }
    
    // Message metrics
    recordMessageMetrics(type, direction, size = null, error = null) {
        this.recordEvent('message.processed', {
            type,
            direction, // 'sent' or 'received'
            size,
            error: error ? error.message : null
        });
        
        this.incrementCounter('message.count', 1, { type, direction });
        
        if (size) {
            this.recordHistogram('message.size', size, { type, direction });
        }
        
        if (error) {
            this.incrementCounter('message.errors', 1, { type, direction });
        }
    }
    
    // Media metrics
    recordMediaMetrics(type, operation, size = null, duration = null, error = null) {
        this.recordEvent('media.processed', {
            type,
            operation, // 'upload', 'download', 'process'
            size,
            duration,
            error: error ? error.message : null
        });
        
        this.incrementCounter('media.count', 1, { type, operation });
        
        if (size) {
            this.recordHistogram('media.size', size, { type, operation });
        }
        
        if (duration) {
            this.recordHistogram('media.duration', duration, { type, operation });
        }
        
        if (error) {
            this.incrementCounter('media.errors', 1, { type, operation });
        }
    }
    
    // Authentication metrics
    recordAuthMetrics(method, success, duration = null, error = null) {
        this.recordEvent('auth.attempt', {
            method, // 'qr', 'pairing_code'
            success,
            duration,
            error: error ? error.message : null
        });
        
        this.incrementCounter('auth.attempts', 1, { method, success });
        
        if (duration) {
            this.recordHistogram('auth.duration', duration, { method });
        }
        
        if (!success && error) {
            this.incrementCounter('auth.errors', 1, { method });
        }
    }
    
    // Group metrics
    recordGroupMetrics(action, participantCount = null, error = null) {
        this.recordEvent('group.action', {
            action, // 'create', 'join', 'leave', 'add_participant', etc.
            participantCount,
            error: error ? error.message : null
        });
        
        this.incrementCounter('group.actions', 1, { action });
        
        if (participantCount) {
            this.recordGauge('group.participant_count', participantCount);
        }
        
        if (error) {
            this.incrementCounter('group.errors', 1, { action });
        }
    }
    
    // Performance metrics
    recordPerformanceMetrics() {
        if (!this.isStarted) {
            return;
        }
        
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // Memory metrics
        this.recordGauge('performance.memory.rss', memUsage.rss);
        this.recordGauge('performance.memory.heap_total', memUsage.heapTotal);
        this.recordGauge('performance.memory.heap_used', memUsage.heapUsed);
        this.recordGauge('performance.memory.external', memUsage.external);
        
        // CPU metrics
        this.recordGauge('performance.cpu.user', cpuUsage.user);
        this.recordGauge('performance.cpu.system', cpuUsage.system);
        
        // Event loop lag
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
            this.recordGauge('performance.event_loop_lag', lag);
        });
    }
    
    // Error tracking
    recordError(error, context = {}) {
        this.recordEvent('error.occurred', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            context
        });
        
        this.incrementCounter('errors.count', 1, {
            type: error.constructor.name,
            code: error.code
        });
    }
    
    // Data flushing
    async flush() {
        if (!this.isStarted) {
            return;
        }
        
        try {
            const data = this.collector.collect();
            
            if (data && Object.keys(data).length > 0) {
                // Store data
                await this.storage.store(data);
                
                // Export if enabled
                if (this.exporter) {
                    await this.exporter.export(data);
                }
                
                // Send to reporting if enabled
                if (this.reporting) {
                    await this.reporting.send(data);
                }
                
                this.lastFlush = Date.now();
                this.emit('data.flushed', { recordCount: Object.keys(data).length });
            }
        } catch (error) {
            this.emit('error', new Error(`Data flush failed: ${error.message}`));
        }
    }
    
    // Analytics and insights
    async getAnalytics(timeRange = '1h') {
        if (!this.analyzer) {
            return null;
        }
        
        try {
            const data = await this.storage.retrieve(timeRange);
            return this.analyzer.analyze(data);
        } catch (error) {
            this.emit('error', new Error(`Analytics generation failed: ${error.message}`));
            return null;
        }
    }
    
    async getMetricsSummary(metricNames = null, timeRange = '1h') {
        try {
            const data = await this.storage.retrieve(timeRange);
            return this.analyzer.summarizeMetrics(data, metricNames);
        } catch (error) {
            this.emit('error', new Error(`Metrics summary failed: ${error.message}`));
            return null;
        }
    }
    
    async getEventsSummary(eventNames = null, timeRange = '1h') {
        try {
            const data = await this.storage.retrieve(timeRange);
            return this.analyzer.summarizeEvents(data, eventNames);
        } catch (error) {
            this.emit('error', new Error(`Events summary failed: ${error.message}`));
            return null;
        }
    }
    
    // Timer management
    startFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.options.flushInterval);
    }
    
    stopFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        // Cleanup every hour
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 3600000);
    }
    
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    
    // Data cleanup
    async cleanup() {
        try {
            const cutoffTime = Date.now() - this.options.retentionPeriod;
            await this.storage.cleanup(cutoffTime);
            
            this.emit('data.cleaned', { cutoffTime });
        } catch (error) {
            this.emit('error', new Error(`Data cleanup failed: ${error.message}`));
        }
    }
    
    // Configuration
    updateConfig(newConfig) {
        this.options = { ...this.options, ...newConfig };
        
        if (this.config) {
            this.config.update(newConfig);
        }
        
        this.emit('config.updated', newConfig);
    }
    
    getConfig() {
        return { ...this.options };
    }
    
    // Status and health
    getStatus() {
        return {
            enabled: this.options.enabled,
            started: this.isStarted,
            sessionId: this.sessionId,
            startTime: this.startTime,
            lastFlush: this.lastFlush,
            uptime: Date.now() - this.startTime,
            components: {
                metrics: !!this.metrics,
                events: !!this.events,
                telemetry: !!this.telemetry,
                reporting: !!this.reporting,
                storage: !!this.storage,
                analyzer: !!this.analyzer,
                exporter: !!this.exporter,
                dashboard: !!this.dashboard
            }
        };
    }
    
    async getHealth() {
        const status = this.getStatus();
        const health = {
            ...status,
            healthy: true,
            issues: []
        };
        
        // Check storage health
        if (this.storage) {
            try {
                await this.storage.healthCheck();
            } catch (error) {
                health.healthy = false;
                health.issues.push(`Storage: ${error.message}`);
            }
        }
        
        // Check memory usage
        const memUsage = process.memoryUsage();
        const maxMemory = 1024 * 1024 * 1024; // 1GB threshold
        if (memUsage.heapUsed > maxMemory) {
            health.healthy = false;
            health.issues.push(`High memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
        
        return health;
    }
    
    // Utility methods
    generateSessionId() {
        return `wam_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    
    // Export data
    async exportData(format = 'json', timeRange = '24h') {
        if (!this.exporter) {
            throw new Error('Exporter not available');
        }
        
        try {
            const data = await this.storage.retrieve(timeRange);
            return this.exporter.export(data, format);
        } catch (error) {
            throw new Error(`Data export failed: ${error.message}`);
        }
    }
    
    // Dashboard
    async getDashboardData() {
        if (!this.dashboard) {
            return null;
        }
        
        try {
            return this.dashboard.getData();
        } catch (error) {
            this.emit('error', new Error(`Dashboard data generation failed: ${error.message}`));
            return null;
        }
    }
    
    // Cleanup
    async destroy() {
        this.stop();
        
        // Cleanup components
        if (this.storage) {
            await this.storage.destroy();
        }
        
        if (this.dashboard) {
            await this.dashboard.stop();
        }
        
        this.removeAllListeners();
    }
}

module.exports = WAM;