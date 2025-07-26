/**
 * WAMDashboard
 * WhatsApp Analytics Dashboard
 */

const { EventEmitter } = require('events');

class WAMDashboard extends EventEmitter {
    constructor() {
        super();
        this.widgets = new Map();
        this.data = new Map();
        this.initialize();
    }

    initialize() {
        console.log('📊 WAMDashboard initialized');
    }

    addWidget(name, config) {
        try {
            const widget = {
                name,
                config,
                data: [],
                timestamp: Date.now()
            };
            
            this.widgets.set(name, widget);
            this.emit('widget.added', widget);
            return { success: true, widget };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    updateWidget(name, data) {
        const widget = this.widgets.get(name);
        if (widget) {
            widget.data.push(data);
            widget.timestamp = Date.now();
            this.emit('widget.updated', widget);
            return { success: true };
        }
        return { success: false, error: 'Widget not found' };
    }

    getWidgets() {
        return Array.from(this.widgets.values());
    }

    getDashboardData() {
        return {
            widgets: this.getWidgets(),
            timestamp: Date.now()
        };
    }
}

module.exports = WAMDashboard;
