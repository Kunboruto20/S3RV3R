const fs = require('fs');
const path = require('path');

/**
 * WhatsApp Logger Utility
 * Provides logging functionality for the WhatsApp library
 */
class WALogger {
    constructor(options = {}) {
        this.options = {
            level: options.level || 'info',
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile || false,
            logPath: options.logPath || './logs',
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: options.maxFiles || 5,
            ...options
        };

        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };

        this.currentLevel = this.levels[this.options.level] || this.levels.info;
        
        if (this.options.enableFile) {
            this.initializeFileLogging();
        }
    }

    initializeFileLogging() {
        try {
            if (!fs.existsSync(this.options.logPath)) {
                fs.mkdirSync(this.options.logPath, { recursive: true });
            }
        } catch (error) {
            console.error('Failed to initialize file logging:', error);
        }
    }

    log(level, message, meta = {}) {
        const levelNum = this.levels[level];
        if (levelNum === undefined || levelNum > this.currentLevel) {
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message: message,
            meta: meta
        };

        if (this.options.enableConsole) {
            this.logToConsole(logEntry);
        }

        if (this.options.enableFile) {
            this.logToFile(logEntry);
        }
    }

    logToConsole(logEntry) {
        const colors = {
            ERROR: '\x1b[31m', // Red
            WARN: '\x1b[33m',  // Yellow
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[37m', // White
            TRACE: '\x1b[90m'  // Gray
        };

        const reset = '\x1b[0m';
        const color = colors[logEntry.level] || '';
        
        const metaStr = Object.keys(logEntry.meta).length > 0 ? 
            ` ${JSON.stringify(logEntry.meta)}` : '';
        
        console.log(
            `${color}[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}${metaStr}${reset}`
        );
    }

    logToFile(logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            const logFile = path.join(this.options.logPath, 'whatsapp.log');
            
            // Check file size and rotate if necessary
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size >= this.options.maxFileSize) {
                    this.rotateLogFile(logFile);
                }
            }
            
            fs.appendFileSync(logFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    rotateLogFile(logFile) {
        try {
            // Move existing files
            for (let i = this.options.maxFiles - 1; i > 0; i--) {
                const oldFile = `${logFile}.${i}`;
                const newFile = `${logFile}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.options.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // Move current log to .1
            if (fs.existsSync(logFile)) {
                fs.renameSync(logFile, `${logFile}.1`);
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }

    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.currentLevel = this.levels[level];
            this.options.level = level;
        }
    }

    getLevel() {
        return this.options.level;
    }

    child(defaultMeta = {}) {
        return {
            error: (message, meta = {}) => this.error(message, { ...defaultMeta, ...meta }),
            warn: (message, meta = {}) => this.warn(message, { ...defaultMeta, ...meta }),
            info: (message, meta = {}) => this.info(message, { ...defaultMeta, ...meta }),
            debug: (message, meta = {}) => this.debug(message, { ...defaultMeta, ...meta }),
            trace: (message, meta = {}) => this.trace(message, { ...defaultMeta, ...meta })
        };
    }
}

// Create default logger instance
const defaultLogger = new WALogger();

module.exports = WALogger;
module.exports.default = defaultLogger;