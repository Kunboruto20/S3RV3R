/**
 * WACallDefaults
 * Default configurations for WhatsApp
 */

class WACallDefaults {
    static get defaults() {
        return {
            enabled: true,
            timestamp: Date.now(),
            version: '1.0.0'
        };
    }

    static getDefault(key) {
        return this.defaults[key];
    }

    static setDefault(key, value) {
        this.defaults[key] = value;
    }
}

module.exports = WACallDefaults;
