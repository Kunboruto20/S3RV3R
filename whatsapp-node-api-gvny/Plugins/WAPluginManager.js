const EventEmitter = require('events');

/**
 * WhatsApp Plugin Manager
 * Handles plugin loading, management, and execution
 */
class WAPluginManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            pluginsPath: options.pluginsPath || './wa_plugins',
            enableHotReload: options.enableHotReload || false,
            enableSandbox: options.enableSandbox !== false,
            maxExecutionTime: options.maxExecutionTime || 30000,
            enableMetrics: options.enableMetrics !== false,
            ...options
        };

        this.plugins = new Map();
        this.hooks = new Map();
        this.metrics = new Map();
        this.sandbox = null;

        this.initialize();
    }

    async initialize() {
        try {
            await this.setupSandbox();
            await this.loadPlugins();
            this.emit('ready');
        } catch (error) {
            this.emit('error', error);
        }
    }

    async loadPlugin(pluginPath) {
        try {
            const plugin = require(pluginPath);
            const pluginId = this.generatePluginId();
            
            const pluginConfig = {
                id: pluginId,
                name: plugin.name || 'Unknown Plugin',
                version: plugin.version || '1.0.0',
                description: plugin.description || '',
                author: plugin.author || 'Unknown',
                main: plugin.main || plugin,
                hooks: plugin.hooks || {},
                enabled: true,
                loaded: new Date().toISOString(),
                path: pluginPath
            };

            this.plugins.set(pluginId, pluginConfig);
            this.registerHooks(pluginId, plugin.hooks || {});
            
            if (typeof plugin.onLoad === 'function') {
                await plugin.onLoad();
            }

            this.emit('plugin.loaded', pluginConfig);
            return pluginId;
        } catch (error) {
            throw new Error(`Plugin load failed: ${error.message}`);
        }
    }

    registerHooks(pluginId, hooks) {
        for (const [hookName, handler] of Object.entries(hooks)) {
            if (!this.hooks.has(hookName)) {
                this.hooks.set(hookName, []);
            }
            
            this.hooks.get(hookName).push({
                pluginId,
                handler,
                priority: handler.priority || 0
            });
            
            // Sort by priority
            this.hooks.get(hookName).sort((a, b) => b.priority - a.priority);
        }
    }

    async executeHook(hookName, context = {}) {
        const handlers = this.hooks.get(hookName) || [];
        const results = [];

        for (const { pluginId, handler } of handlers) {
            const plugin = this.plugins.get(pluginId);
            if (!plugin || !plugin.enabled) continue;

            try {
                const startTime = Date.now();
                const result = await this.executeInSandbox(handler, context);
                const executionTime = Date.now() - startTime;
                
                if (this.options.enableMetrics) {
                    this.updateMetrics(pluginId, executionTime);
                }

                results.push({ pluginId, result });
            } catch (error) {
                this.emit('plugin.error', { pluginId, hookName, error });
            }
        }

        return results;
    }

    async executeInSandbox(handler, context) {
        if (this.options.enableSandbox && this.sandbox) {
            return await this.sandbox.execute(handler, context);
        } else {
            return await handler(context);
        }
    }

    async setupSandbox() {
        if (this.options.enableSandbox) {
            // Implement sandbox logic here
            this.sandbox = {
                execute: async (handler, context) => {
                    // Simple timeout wrapper
                    return new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Plugin execution timeout'));
                        }, this.options.maxExecutionTime);

                        Promise.resolve(handler(context))
                            .then(result => {
                                clearTimeout(timeout);
                                resolve(result);
                            })
                            .catch(error => {
                                clearTimeout(timeout);
                                reject(error);
                            });
                    });
                }
            };
        }
    }

    async loadPlugins() {
        // Implementation for loading plugins from directory
        // This would scan the plugins directory and load each plugin
    }

    updateMetrics(pluginId, executionTime) {
        if (!this.metrics.has(pluginId)) {
            this.metrics.set(pluginId, {
                executions: 0,
                totalTime: 0,
                averageTime: 0,
                errors: 0
            });
        }

        const metrics = this.metrics.get(pluginId);
        metrics.executions++;
        metrics.totalTime += executionTime;
        metrics.averageTime = metrics.totalTime / metrics.executions;
    }

    generatePluginId() {
        return `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    enablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            plugin.enabled = true;
            this.emit('plugin.enabled', plugin);
            return true;
        }
        return false;
    }

    disablePlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            plugin.enabled = false;
            this.emit('plugin.disabled', plugin);
            return true;
        }
        return false;
    }

    getPlugins() {
        return Array.from(this.plugins.values());
    }

    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }

    getHooks() {
        return Object.fromEntries(this.hooks);
    }

    getMetrics() {
        return Object.fromEntries(this.metrics);
    }
}

module.exports = WAPluginManager;