/**
 * WhatsApp Status Handler
 * Manages status updates, story viewing, and status-related operations
 */

const EventEmitter = require('events');

class WAStatusHandler extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.statusCache = new Map();
        this.viewedStatuses = new Set();
        this.initialize();
    }

    /**
     * Initialize status handler
     */
    initialize() {
        console.log('🟢 WAStatusHandler initialized');
        this.setupEventListeners();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.on('status.new', this.handleNewStatus.bind(this));
        this.on('status.viewed', this.handleStatusViewed.bind(this));
        this.on('status.deleted', this.handleStatusDeleted.bind(this));
    }

    /**
     * Get user status
     */
    async getUserStatus(jid) {
        try {
            return this.statusCache.get(jid) || null;
        } catch (error) {
            console.error('Error getting user status:', error);
            return null;
        }
    }

    /**
     * Update status
     */
    async updateStatus(content, options = {}) {
        try {
            const statusData = {
                content,
                timestamp: Date.now(),
                privacy: options.privacy || 'contacts',
                backgroundColor: options.backgroundColor || '#000000',
                font: options.font || 'default'
            };

            this.emit('status.updated', statusData);
            return { success: true, statusId: `status_${Date.now()}` };
        } catch (error) {
            console.error('Error updating status:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * View status
     */
    async viewStatus(statusId, jid) {
        try {
            this.viewedStatuses.add(`${jid}_${statusId}`);
            this.emit('status.viewed', { statusId, jid, timestamp: Date.now() });
            return { success: true };
        } catch (error) {
            console.error('Error viewing status:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete status
     */
    async deleteStatus(statusId) {
        try {
            this.emit('status.deleted', { statusId, timestamp: Date.now() });
            return { success: true };
        } catch (error) {
            console.error('Error deleting status:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get status viewers
     */
    async getStatusViewers(statusId) {
        try {
            const viewers = Array.from(this.viewedStatuses)
                .filter(view => view.includes(statusId))
                .map(view => view.split('_')[0]);
            return { success: true, viewers };
        } catch (error) {
            console.error('Error getting status viewers:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle new status
     */
    handleNewStatus(statusData) {
        this.statusCache.set(statusData.jid, statusData);
        console.log('📱 New status received:', statusData.jid);
    }

    /**
     * Handle status viewed
     */
    handleStatusViewed(viewData) {
        console.log('👁️ Status viewed:', viewData.statusId);
    }

    /**
     * Handle status deleted
     */
    handleStatusDeleted(deleteData) {
        console.log('🗑️ Status deleted:', deleteData.statusId);
    }

    /**
     * Get all statuses
     */
    getAllStatuses() {
        return Array.from(this.statusCache.values());
    }

    /**
     * Clear status cache
     */
    clearCache() {
        this.statusCache.clear();
        this.viewedStatuses.clear();
    }
}

module.exports = WAStatusHandler;