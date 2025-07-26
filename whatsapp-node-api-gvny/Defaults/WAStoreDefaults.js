/**
 * WAStoreDefaults
 * Default configurations for WhatsApp
 */

class WAStoreDefaults {
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

module.exports = WAStoreDefaults;
