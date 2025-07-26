/**
 * WhatsApp Authentication State Handler
 * Manages authentication state and session persistence
 */
class WAAuthState {
    constructor(options = {}) {
        this.options = {
            autoSave: true,
            ...options
        };
        
        this.state = {
            isAuthenticated: false,
            connectionState: 'disconnected',
            user: null,
            credentials: null,
            lastConnected: null,
            sessionData: null
        };
        
        this.listeners = new Map();
    }

    /**
     * Set authentication state
     */
    setAuthenticated(isAuthenticated, user = null) {
        const wasAuthenticated = this.state.isAuthenticated;
        this.state.isAuthenticated = isAuthenticated;
        this.state.user = user;
        
        if (isAuthenticated && !wasAuthenticated) {
            this.state.lastConnected = Date.now();
            this.emit('authenticated', user);
        } else if (!isAuthenticated && wasAuthenticated) {
            this.emit('unauthenticated');
        }
        
        this.saveState();
    }

    /**
     * Set connection state
     */
    setConnectionState(state) {
        const oldState = this.state.connectionState;
        this.state.connectionState = state;
        
        if (oldState !== state) {
            this.emit('connectionStateChanged', { from: oldState, to: state });
        }
        
        this.saveState();
    }

    /**
     * Set credentials
     */
    setCredentials(credentials) {
        this.state.credentials = credentials;
        this.saveState();
    }

    /**
     * Set session data
     */
    setSessionData(sessionData) {
        this.state.sessionData = sessionData;
        this.saveState();
    }

    /**
     * Get authentication state
     */
    isAuthenticated() {
        return this.state.isAuthenticated;
    }

    /**
     * Get connection state
     */
    getConnectionState() {
        return this.state.connectionState;
    }

    /**
     * Get user info
     */
    getUser() {
        return this.state.user;
    }

    /**
     * Get credentials
     */
    getCredentials() {
        return this.state.credentials;
    }

    /**
     * Get session data
     */
    getSessionData() {
        return this.state.sessionData;
    }

    /**
     * Get full state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Clear authentication state
     */
    clearAuth() {
        this.state = {
            isAuthenticated: false,
            connectionState: 'disconnected',
            user: null,
            credentials: null,
            lastConnected: this.state.lastConnected,
            sessionData: null
        };
        
        this.emit('cleared');
        this.saveState();
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in auth state listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Save state (if auto-save enabled)
     */
    saveState() {
        if (this.options.autoSave) {
            this.emit('stateChanged', this.state);
        }
    }

    /**
     * Load state from external source
     */
    loadState(externalState) {
        this.state = {
            ...this.state,
            ...externalState
        };
        
        this.emit('stateLoaded', this.state);
    }

    /**
     * Get state summary
     */
    getSummary() {
        return {
            isAuthenticated: this.state.isAuthenticated,
            connectionState: this.state.connectionState,
            hasUser: !!this.state.user,
            hasCredentials: !!this.state.credentials,
            hasSessionData: !!this.state.sessionData,
            lastConnected: this.state.lastConnected,
            userId: this.state.user?.jid || null
        };
    }
}

module.exports = WAAuthState;