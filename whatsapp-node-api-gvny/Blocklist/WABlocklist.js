const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Blocklist Manager
 * Handles blocked contacts, spam prevention, and contact restrictions
 */
class WABlocklist extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            blocklistPath: options.blocklistPath || './wa_blocklist',
            enableAutoSave: options.enableAutoSave !== false,
            enableSpamDetection: options.enableSpamDetection !== false,
            maxBlockedContacts: options.maxBlockedContacts || 10000,
            spamThreshold: options.spamThreshold || 10,
            ...options
        };

        // Blocklist data
        this.blockedContacts = new Set();
        this.blockedGroups = new Set();
        this.restrictedContacts = new Map();
        this.spamReports = new Map();
        this.blockHistory = [];

        // Spam detection
        this.spamPatterns = new Set();
        this.messageCounters = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            await this.createBlocklistStructure();
            await this.loadBlocklist();
            await this.loadSpamPatterns();
            this.setupSocketEventHandlers();
            this.emit('blocklist:ready');
        } catch (error) {
            this.emit('blocklist:error', error);
        }
    }

    // Create blocklist directory structure
    async createBlocklistStructure() {
        try {
            await fs.mkdir(this.options.blocklistPath, { recursive: true });
            
            const subdirs = ['contacts', 'groups', 'spam', 'history'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.blocklistPath, subdir), { recursive: true });
            }
        } catch (error) {
            throw new Error(`Blocklist structure creation failed: ${error.message}`);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Monitor incoming messages for spam
        this.socket.on('messages.upsert', (messageUpdate) => {
            if (this.options.enableSpamDetection) {
                messageUpdate.messages.forEach(message => {
                    if (!message.key.fromMe) {
                        this.checkForSpam(message);
                    }
                });
            }
        });

        // Handle blocklist updates from server
        this.socket.on('blocklist.update', (update) => {
            this.handleBlocklistUpdate(update);
        });
    }

    // Block contact
    async blockContact(jid, reason = 'user_request') {
        try {
            if (this.blockedContacts.has(jid)) {
                return { success: false, message: 'Contact already blocked' };
            }

            if (this.blockedContacts.size >= this.options.maxBlockedContacts) {
                throw new Error('Maximum blocked contacts limit reached');
            }

            // Send block request to WhatsApp
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'block',
                    attrs: { jid: jid },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.blockedContacts.add(jid);
                
                // Add to block history
                const blockEntry = {
                    jid: jid,
                    blocked: new Date().toISOString(),
                    reason: reason,
                    action: 'block'
                };
                
                this.blockHistory.push(blockEntry);
                
                if (this.options.enableAutoSave) {
                    await this.saveBlocklist();
                }

                this.emit('contact:blocked', { jid, reason });
                return { success: true, message: 'Contact blocked successfully' };
            } else {
                throw new Error('Failed to block contact');
            }
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Unblock contact
    async unblockContact(jid) {
        try {
            if (!this.blockedContacts.has(jid)) {
                return { success: false, message: 'Contact is not blocked' };
            }

            // Send unblock request to WhatsApp
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'blocklist'
                },
                content: [{
                    tag: 'unblock',
                    attrs: { jid: jid },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.blockedContacts.delete(jid);
                
                // Add to block history
                const unblockEntry = {
                    jid: jid,
                    unblocked: new Date().toISOString(),
                    action: 'unblock'
                };
                
                this.blockHistory.push(unblockEntry);
                
                if (this.options.enableAutoSave) {
                    await this.saveBlocklist();
                }

                this.emit('contact:unblocked', { jid });
                return { success: true, message: 'Contact unblocked successfully' };
            } else {
                throw new Error('Failed to unblock contact');
            }
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Block group
    async blockGroup(groupJid, reason = 'user_request') {
        try {
            if (this.blockedGroups.has(groupJid)) {
                return { success: false, message: 'Group already blocked' };
            }

            this.blockedGroups.add(groupJid);
            
            // Add to block history
            const blockEntry = {
                jid: groupJid,
                blocked: new Date().toISOString(),
                reason: reason,
                action: 'block_group',
                type: 'group'
            };
            
            this.blockHistory.push(blockEntry);
            
            if (this.options.enableAutoSave) {
                await this.saveBlocklist();
            }

            this.emit('group:blocked', { jid: groupJid, reason });
            return { success: true, message: 'Group blocked successfully' };
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Unblock group
    async unblockGroup(groupJid) {
        try {
            if (!this.blockedGroups.has(groupJid)) {
                return { success: false, message: 'Group is not blocked' };
            }

            this.blockedGroups.delete(groupJid);
            
            // Add to block history
            const unblockEntry = {
                jid: groupJid,
                unblocked: new Date().toISOString(),
                action: 'unblock_group',
                type: 'group'
            };
            
            this.blockHistory.push(unblockEntry);
            
            if (this.options.enableAutoSave) {
                await this.saveBlocklist();
            }

            this.emit('group:unblocked', { jid: groupJid });
            return { success: true, message: 'Group unblocked successfully' };
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Restrict contact (temporary block)
    async restrictContact(jid, duration = 3600000, reason = 'temporary_restriction') {
        try {
            const restriction = {
                jid: jid,
                restricted: new Date().toISOString(),
                expires: new Date(Date.now() + duration).toISOString(),
                reason: reason,
                duration: duration
            };

            this.restrictedContacts.set(jid, restriction);
            
            if (this.options.enableAutoSave) {
                await this.saveBlocklist();
            }

            // Set timeout to automatically unrestrict
            setTimeout(() => {
                this.unrestrictContact(jid);
            }, duration);

            this.emit('contact:restricted', restriction);
            return { success: true, message: 'Contact restricted successfully', restriction };
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Unrestrict contact
    async unrestrictContact(jid) {
        try {
            if (!this.restrictedContacts.has(jid)) {
                return { success: false, message: 'Contact is not restricted' };
            }

            this.restrictedContacts.delete(jid);
            
            if (this.options.enableAutoSave) {
                await this.saveBlocklist();
            }

            this.emit('contact:unrestricted', { jid });
            return { success: true, message: 'Contact unrestricted successfully' };
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Report spam
    async reportSpam(jid, messageId, reason = 'spam') {
        try {
            const spamReport = {
                jid: jid,
                messageId: messageId,
                reported: new Date().toISOString(),
                reason: reason,
                reportId: this.generateReportId()
            };

            // Store spam report
            if (!this.spamReports.has(jid)) {
                this.spamReports.set(jid, []);
            }
            this.spamReports.get(jid).push(spamReport);

            // Send spam report to WhatsApp
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:spam'
                },
                content: [{
                    tag: 'report',
                    attrs: {
                        jid: jid,
                        messageId: messageId,
                        reason: reason
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            // Check if we should auto-block based on spam reports
            const reports = this.spamReports.get(jid);
            if (reports.length >= this.options.spamThreshold) {
                await this.blockContact(jid, 'automatic_spam_detection');
            }

            this.emit('spam:reported', spamReport);
            return { success: true, message: 'Spam reported successfully', reportId: spamReport.reportId };
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Check for spam
    checkForSpam(message) {
        try {
            const jid = message.key.remoteJid;
            const messageContent = message.message?.conversation || 
                                 message.message?.extendedTextMessage?.text || '';

            // Count messages from this contact
            if (!this.messageCounters.has(jid)) {
                this.messageCounters.set(jid, { count: 0, firstMessage: Date.now() });
            }

            const counter = this.messageCounters.get(jid);
            counter.count++;

            // Check for spam patterns
            const isSpam = this.detectSpamPatterns(messageContent) ||
                          this.detectRapidMessaging(jid, counter) ||
                          this.detectSuspiciousContent(messageContent);

            if (isSpam) {
                this.emit('spam:detected', {
                    jid: jid,
                    messageId: message.key.id,
                    content: messageContent,
                    reason: 'automatic_detection'
                });

                // Auto-report spam
                this.reportSpam(jid, message.key.id, 'automatic_detection');
            }

            return isSpam;
        } catch (error) {
            this.emit('blocklist:error', error);
            return false;
        }
    }

    // Detect spam patterns
    detectSpamPatterns(content) {
        const lowerContent = content.toLowerCase();
        
        for (const pattern of this.spamPatterns) {
            if (lowerContent.includes(pattern.toLowerCase())) {
                return true;
            }
        }

        // Common spam indicators
        const spamIndicators = [
            /win.*money/i,
            /click.*here/i,
            /urgent.*action/i,
            /congratulations.*won/i,
            /free.*gift/i,
            /limited.*time/i,
            /act.*now/i
        ];

        return spamIndicators.some(pattern => pattern.test(content));
    }

    // Detect rapid messaging (potential spam)
    detectRapidMessaging(jid, counter) {
        const timeWindow = 60000; // 1 minute
        const messageThreshold = 10;

        if (counter.count > messageThreshold) {
            const timeDiff = Date.now() - counter.firstMessage;
            if (timeDiff < timeWindow) {
                return true;
            }
        }

        return false;
    }

    // Detect suspicious content
    detectSuspiciousContent(content) {
        // Check for excessive links
        const linkCount = (content.match(/https?:\/\/[^\s]+/g) || []).length;
        if (linkCount > 3) return true;

        // Check for excessive emojis
        const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
        if (emojiCount > 10) return true;

        // Check for repeated characters
        if (/(.)\1{5,}/.test(content)) return true;

        return false;
    }

    // Add spam pattern
    addSpamPattern(pattern) {
        this.spamPatterns.add(pattern);
        this.emit('spam:pattern:added', pattern);
    }

    // Remove spam pattern
    removeSpamPattern(pattern) {
        this.spamPatterns.delete(pattern);
        this.emit('spam:pattern:removed', pattern);
    }

    // Get blocked contacts
    getBlockedContacts() {
        return Array.from(this.blockedContacts);
    }

    // Get blocked groups
    getBlockedGroups() {
        return Array.from(this.blockedGroups);
    }

    // Get restricted contacts
    getRestrictedContacts() {
        return Array.from(this.restrictedContacts.entries()).map(([jid, restriction]) => ({
            jid,
            ...restriction
        }));
    }

    // Check if contact is blocked
    isBlocked(jid) {
        return this.blockedContacts.has(jid) || this.blockedGroups.has(jid);
    }

    // Check if contact is restricted
    isRestricted(jid) {
        const restriction = this.restrictedContacts.get(jid);
        if (!restriction) return false;

        const now = new Date();
        const expires = new Date(restriction.expires);
        
        if (now > expires) {
            this.restrictedContacts.delete(jid);
            return false;
        }

        return true;
    }

    // Save blocklist to file
    async saveBlocklist() {
        try {
            const blocklistData = {
                blockedContacts: Array.from(this.blockedContacts),
                blockedGroups: Array.from(this.blockedGroups),
                restrictedContacts: Array.from(this.restrictedContacts.entries()),
                spamReports: Array.from(this.spamReports.entries()),
                blockHistory: this.blockHistory,
                spamPatterns: Array.from(this.spamPatterns),
                lastUpdated: new Date().toISOString()
            };

            const blocklistFile = path.join(this.options.blocklistPath, 'blocklist.json');
            await fs.writeFile(blocklistFile, JSON.stringify(blocklistData, null, 2));
            
            this.emit('blocklist:saved');
        } catch (error) {
            this.emit('blocklist:error', error);
            throw error;
        }
    }

    // Load blocklist from file
    async loadBlocklist() {
        try {
            const blocklistFile = path.join(this.options.blocklistPath, 'blocklist.json');
            
            try {
                const data = await fs.readFile(blocklistFile, 'utf8');
                const blocklistData = JSON.parse(data);

                this.blockedContacts = new Set(blocklistData.blockedContacts || []);
                this.blockedGroups = new Set(blocklistData.blockedGroups || []);
                this.restrictedContacts = new Map(blocklistData.restrictedContacts || []);
                this.spamReports = new Map(blocklistData.spamReports || []);
                this.blockHistory = blocklistData.blockHistory || [];
                this.spamPatterns = new Set(blocklistData.spamPatterns || []);

                this.emit('blocklist:loaded');
            } catch (error) {
                console.warn('Blocklist file not found, using defaults');
            }
        } catch (error) {
            this.emit('blocklist:error', error);
        }
    }

    // Load spam patterns
    async loadSpamPatterns() {
        try {
            const patternsFile = path.join(this.options.blocklistPath, 'spam', 'patterns.json');
            
            try {
                const data = await fs.readFile(patternsFile, 'utf8');
                const patterns = JSON.parse(data);
                
                patterns.forEach(pattern => this.spamPatterns.add(pattern));
                this.emit('spam:patterns:loaded');
            } catch (error) {
                // Use default patterns
                const defaultPatterns = [
                    'free money',
                    'click here now',
                    'urgent action required',
                    'congratulations you won',
                    'limited time offer',
                    'act now'
                ];
                
                defaultPatterns.forEach(pattern => this.spamPatterns.add(pattern));
            }
        } catch (error) {
            this.emit('blocklist:error', error);
        }
    }

    // Handle blocklist updates from server
    handleBlocklistUpdate(update) {
        try {
            if (update.blocked) {
                update.blocked.forEach(jid => {
                    this.blockedContacts.add(jid);
                });
            }

            if (update.unblocked) {
                update.unblocked.forEach(jid => {
                    this.blockedContacts.delete(jid);
                });
            }

            this.emit('blocklist:server:update', update);
        } catch (error) {
            this.emit('blocklist:error', error);
        }
    }

    // Generate report ID
    generateReportId() {
        return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Get block history
    getBlockHistory(limit = 100) {
        return this.blockHistory.slice(-limit);
    }

    // Get spam reports for a contact
    getSpamReports(jid) {
        return this.spamReports.get(jid) || [];
    }

    // Clear expired restrictions
    clearExpiredRestrictions() {
        const now = new Date();
        const expiredJids = [];

        for (const [jid, restriction] of this.restrictedContacts.entries()) {
            const expires = new Date(restriction.expires);
            if (now > expires) {
                expiredJids.push(jid);
            }
        }

        expiredJids.forEach(jid => {
            this.restrictedContacts.delete(jid);
            this.emit('contact:restriction:expired', { jid });
        });

        return expiredJids.length;
    }

    // Get statistics
    getStatistics() {
        return {
            blockedContacts: this.blockedContacts.size,
            blockedGroups: this.blockedGroups.size,
            restrictedContacts: this.restrictedContacts.size,
            totalSpamReports: Array.from(this.spamReports.values()).reduce((total, reports) => total + reports.length, 0),
            spamPatterns: this.spamPatterns.size,
            blockHistoryEntries: this.blockHistory.length
        };
    }
}

module.exports = WABlocklist;