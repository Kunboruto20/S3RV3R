const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * WhatsApp Catalog Manager
 * Handles business catalogs, products, collections, and product management
 */
class WACatalog extends EventEmitter {
    constructor(socket, options = {}) {
        super();
        
        this.socket = socket;
        this.options = {
            catalogPath: options.catalogPath || './wa_catalog',
            enableAutoSync: options.enableAutoSync !== false,
            maxProducts: options.maxProducts || 1000,
            maxCollections: options.maxCollections || 100,
            enableImageProcessing: options.enableImageProcessing !== false,
            defaultCurrency: options.defaultCurrency || 'USD',
            ...options
        };

        // Catalog data
        this.catalog = {
            id: null,
            name: '',
            description: '',
            products: new Map(),
            collections: new Map(),
            categories: new Set(),
            settings: {
                visibility: 'public',
                currency: this.options.defaultCurrency,
                taxIncluded: false,
                shippingInfo: null
            }
        };

        // Product management
        this.productStats = new Map();
        this.productImages = new Map();
        this.productVariants = new Map();

        this.initialize();
    }

    async initialize() {
        try {
            await this.createCatalogStructure();
            await this.loadCatalog();
            this.setupSocketEventHandlers();
            this.emit('catalog:ready');
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    // Create catalog directory structure
    async createCatalogStructure() {
        try {
            await fs.mkdir(this.options.catalogPath, { recursive: true });
            
            const subdirs = ['products', 'collections', 'images', 'backups', 'exports'];
            for (const subdir of subdirs) {
                await fs.mkdir(path.join(this.options.catalogPath, subdir), { recursive: true });
            }
        } catch (error) {
            throw new Error(`Catalog structure creation failed: ${error.message}`);
        }
    }

    // Setup event handlers
    setupSocketEventHandlers() {
        // Handle catalog updates
        this.socket.on('catalog.update', (update) => {
            this.handleCatalogUpdate(update);
        });

        // Handle product updates
        this.socket.on('product.update', (update) => {
            this.handleProductUpdate(update);
        });
    }

    // Catalog Management
    async createCatalog(catalogData) {
        try {
            this.catalog.id = catalogData.id || this.generateCatalogId();
            this.catalog.name = catalogData.name;
            this.catalog.description = catalogData.description || '';
            this.catalog.settings = { ...this.catalog.settings, ...catalogData.settings };

            // Send catalog creation request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalog',
                    attrs: { action: 'create' },
                    content: this.serializeCatalog(this.catalog)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                await this.saveCatalog();
                this.emit('catalog:created', this.catalog);
                return this.catalog;
            } else {
                throw new Error('Failed to create catalog');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async updateCatalog(updates) {
        try {
            this.catalog = { ...this.catalog, ...updates };

            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'catalog',
                    attrs: { 
                        action: 'update',
                        id: this.catalog.id
                    },
                    content: this.serializeCatalog(this.catalog)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                await this.saveCatalog();
                this.emit('catalog:updated', this.catalog);
                return this.catalog;
            } else {
                throw new Error('Failed to update catalog');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    // Product Management
    async addProduct(productData) {
        try {
            if (this.catalog.products.size >= this.options.maxProducts) {
                throw new Error('Maximum products limit reached');
            }

            const product = {
                id: productData.id || this.generateProductId(),
                name: productData.name,
                description: productData.description || '',
                price: parseFloat(productData.price),
                currency: productData.currency || this.catalog.settings.currency,
                category: productData.category,
                images: productData.images || [],
                availability: productData.availability || 'in_stock',
                sku: productData.sku,
                variants: productData.variants || [],
                tags: productData.tags || [],
                metadata: productData.metadata || {},
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };

            // Validate product data
            this.validateProduct(product);

            // Process images if enabled
            if (this.options.enableImageProcessing && product.images.length > 0) {
                product.images = await this.processProductImages(product.id, product.images);
            }

            // Send add product request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'product',
                    attrs: { action: 'add' },
                    content: this.serializeProduct(product)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.catalog.products.set(product.id, product);
                this.catalog.categories.add(product.category);
                
                // Initialize product stats
                this.productStats.set(product.id, {
                    views: 0,
                    inquiries: 0,
                    orders: 0,
                    lastViewed: null
                });

                await this.saveCatalog();
                this.emit('product:added', product);
                return product;
            } else {
                throw new Error('Failed to add product');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async updateProduct(productId, updates) {
        try {
            const product = this.catalog.products.get(productId);
            if (!product) {
                throw new Error(`Product ${productId} not found`);
            }

            const updatedProduct = {
                ...product,
                ...updates,
                updated: new Date().toISOString()
            };

            // Validate updated product
            this.validateProduct(updatedProduct);

            // Process new images if any
            if (this.options.enableImageProcessing && updates.images) {
                updatedProduct.images = await this.processProductImages(productId, updates.images);
            }

            // Send update request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'product',
                    attrs: { 
                        action: 'update',
                        id: productId
                    },
                    content: this.serializeProduct(updatedProduct)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.catalog.products.set(productId, updatedProduct);
                this.catalog.categories.add(updatedProduct.category);
                
                await this.saveCatalog();
                this.emit('product:updated', updatedProduct);
                return updatedProduct;
            } else {
                throw new Error('Failed to update product');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async deleteProduct(productId) {
        try {
            const product = this.catalog.products.get(productId);
            if (!product) {
                throw new Error(`Product ${productId} not found`);
            }

            // Send delete request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'product',
                    attrs: { 
                        action: 'delete',
                        id: productId
                    },
                    content: null
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.catalog.products.delete(productId);
                this.productStats.delete(productId);
                this.productImages.delete(productId);
                this.productVariants.delete(productId);
                
                // Remove from collections
                for (const collection of this.catalog.collections.values()) {
                    collection.products = collection.products.filter(id => id !== productId);
                }

                await this.saveCatalog();
                this.emit('product:deleted', { productId, product });
                return { success: true, message: 'Product deleted successfully' };
            } else {
                throw new Error('Failed to delete product');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    // Collection Management
    async createCollection(collectionData) {
        try {
            if (this.catalog.collections.size >= this.options.maxCollections) {
                throw new Error('Maximum collections limit reached');
            }

            const collection = {
                id: collectionData.id || this.generateCollectionId(),
                name: collectionData.name,
                description: collectionData.description || '',
                products: collectionData.products || [],
                image: collectionData.image,
                visibility: collectionData.visibility || 'public',
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };

            // Validate collection products exist
            for (const productId of collection.products) {
                if (!this.catalog.products.has(productId)) {
                    throw new Error(`Product ${productId} not found in catalog`);
                }
            }

            // Send create collection request
            const query = {
                tag: 'iq',
                attrs: {
                    id: this.socket.generateMessageTag(),
                    type: 'set',
                    xmlns: 'w:biz:catalog'
                },
                content: [{
                    tag: 'collection',
                    attrs: { action: 'create' },
                    content: this.serializeCollection(collection)
                }]
            };

            const result = await this.socket.query(query);
            
            if (result.attrs.type === 'result') {
                this.catalog.collections.set(collection.id, collection);
                
                await this.saveCatalog();
                this.emit('collection:created', collection);
                return collection;
            } else {
                throw new Error('Failed to create collection');
            }
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async updateCollection(collectionId, updates) {
        try {
            const collection = this.catalog.collections.get(collectionId);
            if (!collection) {
                throw new Error(`Collection ${collectionId} not found`);
            }

            const updatedCollection = {
                ...collection,
                ...updates,
                updated: new Date().toISOString()
            };

            // Validate collection products exist
            if (updates.products) {
                for (const productId of updates.products) {
                    if (!this.catalog.products.has(productId)) {
                        throw new Error(`Product ${productId} not found in catalog`);
                    }
                }
            }

            this.catalog.collections.set(collectionId, updatedCollection);
            
            await this.saveCatalog();
            this.emit('collection:updated', updatedCollection);
            return updatedCollection;
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async deleteCollection(collectionId) {
        try {
            const collection = this.catalog.collections.get(collectionId);
            if (!collection) {
                throw new Error(`Collection ${collectionId} not found`);
            }

            this.catalog.collections.delete(collectionId);
            
            await this.saveCatalog();
            this.emit('collection:deleted', { collectionId, collection });
            return { success: true, message: 'Collection deleted successfully' };
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    // Product Search and Filtering
    searchProducts(query, filters = {}) {
        try {
            let results = Array.from(this.catalog.products.values());

            // Text search
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(product => 
                    product.name.toLowerCase().includes(searchTerm) ||
                    product.description.toLowerCase().includes(searchTerm) ||
                    product.tags.some(tag => tag.toLowerCase().includes(searchTerm))
                );
            }

            // Apply filters
            if (filters.category) {
                results = results.filter(product => product.category === filters.category);
            }

            if (filters.priceMin !== undefined) {
                results = results.filter(product => product.price >= filters.priceMin);
            }

            if (filters.priceMax !== undefined) {
                results = results.filter(product => product.price <= filters.priceMax);
            }

            if (filters.availability) {
                results = results.filter(product => product.availability === filters.availability);
            }

            if (filters.tags && filters.tags.length > 0) {
                results = results.filter(product => 
                    filters.tags.some(tag => product.tags.includes(tag))
                );
            }

            // Sort results
            if (filters.sortBy) {
                results.sort((a, b) => {
                    switch (filters.sortBy) {
                        case 'name':
                            return a.name.localeCompare(b.name);
                        case 'price_asc':
                            return a.price - b.price;
                        case 'price_desc':
                            return b.price - a.price;
                        case 'created':
                            return new Date(b.created) - new Date(a.created);
                        default:
                            return 0;
                    }
                });
            }

            // Pagination
            if (filters.limit) {
                const offset = filters.offset || 0;
                results = results.slice(offset, offset + filters.limit);
            }

            return {
                products: results,
                total: results.length,
                query: query,
                filters: filters
            };
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    // Product Statistics
    recordProductView(productId) {
        try {
            const stats = this.productStats.get(productId);
            if (stats) {
                stats.views++;
                stats.lastViewed = new Date().toISOString();
                this.productStats.set(productId, stats);
                
                this.emit('product:viewed', { productId, stats });
            }
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    recordProductInquiry(productId) {
        try {
            const stats = this.productStats.get(productId);
            if (stats) {
                stats.inquiries++;
                this.productStats.set(productId, stats);
                
                this.emit('product:inquiry', { productId, stats });
            }
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    recordProductOrder(productId) {
        try {
            const stats = this.productStats.get(productId);
            if (stats) {
                stats.orders++;
                this.productStats.set(productId, stats);
                
                this.emit('product:ordered', { productId, stats });
            }
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    // Catalog Export/Import
    async exportCatalog(format = 'json') {
        try {
            const catalogData = {
                catalog: {
                    id: this.catalog.id,
                    name: this.catalog.name,
                    description: this.catalog.description,
                    settings: this.catalog.settings
                },
                products: Array.from(this.catalog.products.entries()),
                collections: Array.from(this.catalog.collections.entries()),
                categories: Array.from(this.catalog.categories),
                stats: Array.from(this.productStats.entries()),
                exported: new Date().toISOString()
            };

            let exportData;
            let filename;

            switch (format) {
                case 'json':
                    exportData = JSON.stringify(catalogData, null, 2);
                    filename = `catalog_export_${Date.now()}.json`;
                    break;
                case 'csv':
                    exportData = this.convertToCSV(catalogData.products);
                    filename = `catalog_export_${Date.now()}.csv`;
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            const exportPath = path.join(this.options.catalogPath, 'exports', filename);
            await fs.writeFile(exportPath, exportData);

            this.emit('catalog:exported', { format, filename, exportPath });
            return { success: true, filename, exportPath };
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async importCatalog(filePath, options = {}) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const catalogData = JSON.parse(data);

            if (options.merge) {
                // Merge with existing catalog
                for (const [productId, product] of catalogData.products) {
                    if (!this.catalog.products.has(productId)) {
                        this.catalog.products.set(productId, product);
                    }
                }

                for (const [collectionId, collection] of catalogData.collections) {
                    if (!this.catalog.collections.has(collectionId)) {
                        this.catalog.collections.set(collectionId, collection);
                    }
                }
            } else {
                // Replace catalog
                this.catalog.products = new Map(catalogData.products);
                this.catalog.collections = new Map(catalogData.collections);
                this.catalog.categories = new Set(catalogData.categories);
                
                if (catalogData.stats) {
                    this.productStats = new Map(catalogData.stats);
                }
            }

            await this.saveCatalog();
            this.emit('catalog:imported', { filePath, options });
            return { success: true, message: 'Catalog imported successfully' };
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    // Helper methods
    validateProduct(product) {
        if (!product.name || product.name.trim().length === 0) {
            throw new Error('Product name is required');
        }

        if (typeof product.price !== 'number' || product.price < 0) {
            throw new Error('Product price must be a non-negative number');
        }

        if (!product.category || product.category.trim().length === 0) {
            throw new Error('Product category is required');
        }
    }

    async processProductImages(productId, images) {
        try {
            const processedImages = [];
            
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                // Here you would implement image processing logic
                // For now, just store the image reference
                processedImages.push({
                    id: `${productId}_image_${i}`,
                    url: image.url || image,
                    alt: image.alt || '',
                    order: i
                });
            }

            this.productImages.set(productId, processedImages);
            return processedImages;
        } catch (error) {
            throw new Error(`Image processing failed: ${error.message}`);
        }
    }

    convertToCSV(products) {
        const headers = ['ID', 'Name', 'Description', 'Price', 'Currency', 'Category', 'Availability', 'SKU'];
        const rows = [headers.join(',')];

        for (const [productId, product] of products) {
            const row = [
                productId,
                `"${product.name}"`,
                `"${product.description}"`,
                product.price,
                product.currency,
                product.category,
                product.availability,
                product.sku || ''
            ];
            rows.push(row.join(','));
        }

        return rows.join('\n');
    }

    serializeCatalog(catalog) {
        return [
            { tag: 'name', attrs: {}, content: catalog.name },
            { tag: 'description', attrs: {}, content: catalog.description },
            { tag: 'settings', attrs: {}, content: JSON.stringify(catalog.settings) }
        ];
    }

    serializeProduct(product) {
        return [
            { tag: 'name', attrs: {}, content: product.name },
            { tag: 'description', attrs: {}, content: product.description },
            { tag: 'price', attrs: {}, content: product.price.toString() },
            { tag: 'currency', attrs: {}, content: product.currency },
            { tag: 'category', attrs: {}, content: product.category },
            { tag: 'availability', attrs: {}, content: product.availability },
            { tag: 'sku', attrs: {}, content: product.sku || '' },
            ...product.images.map(img => ({ tag: 'image', attrs: {}, content: img.url || img })),
            ...product.tags.map(tag => ({ tag: 'tag', attrs: {}, content: tag }))
        ];
    }

    serializeCollection(collection) {
        return [
            { tag: 'name', attrs: {}, content: collection.name },
            { tag: 'description', attrs: {}, content: collection.description },
            { tag: 'visibility', attrs: {}, content: collection.visibility },
            ...collection.products.map(productId => ({ 
                tag: 'product_ref', 
                attrs: { id: productId }, 
                content: null 
            }))
        ];
    }

    generateCatalogId() {
        return `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateProductId() {
        return `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateCollectionId() {
        return `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Save/Load methods
    async saveCatalog() {
        try {
            const catalogData = {
                catalog: {
                    id: this.catalog.id,
                    name: this.catalog.name,
                    description: this.catalog.description,
                    settings: this.catalog.settings
                },
                products: Array.from(this.catalog.products.entries()),
                collections: Array.from(this.catalog.collections.entries()),
                categories: Array.from(this.catalog.categories),
                stats: Array.from(this.productStats.entries()),
                images: Array.from(this.productImages.entries()),
                variants: Array.from(this.productVariants.entries()),
                lastSaved: new Date().toISOString()
            };

            const catalogFile = path.join(this.options.catalogPath, 'catalog.json');
            await fs.writeFile(catalogFile, JSON.stringify(catalogData, null, 2));
            
            this.emit('catalog:saved');
        } catch (error) {
            this.emit('catalog:error', error);
            throw error;
        }
    }

    async loadCatalog() {
        try {
            const catalogFile = path.join(this.options.catalogPath, 'catalog.json');
            
            try {
                const data = await fs.readFile(catalogFile, 'utf8');
                const catalogData = JSON.parse(data);

                this.catalog.id = catalogData.catalog.id;
                this.catalog.name = catalogData.catalog.name;
                this.catalog.description = catalogData.catalog.description;
                this.catalog.settings = catalogData.catalog.settings;
                this.catalog.products = new Map(catalogData.products || []);
                this.catalog.collections = new Map(catalogData.collections || []);
                this.catalog.categories = new Set(catalogData.categories || []);
                
                this.productStats = new Map(catalogData.stats || []);
                this.productImages = new Map(catalogData.images || []);
                this.productVariants = new Map(catalogData.variants || []);

                this.emit('catalog:loaded');
            } catch (error) {
                console.warn('Catalog file not found, using defaults');
            }
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    handleCatalogUpdate(update) {
        try {
            // Handle catalog updates from server
            this.emit('catalog:server:update', update);
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    handleProductUpdate(update) {
        try {
            // Handle product updates from server
            this.emit('product:server:update', update);
        } catch (error) {
            this.emit('catalog:error', error);
        }
    }

    // Getters
    getCatalog() {
        return {
            ...this.catalog,
            products: Array.from(this.catalog.products.entries()),
            collections: Array.from(this.catalog.collections.entries()),
            categories: Array.from(this.catalog.categories)
        };
    }

    getProduct(productId) {
        return this.catalog.products.get(productId);
    }

    getCollection(collectionId) {
        return this.catalog.collections.get(collectionId);
    }

    getProductStats(productId) {
        return this.productStats.get(productId);
    }

    getCategories() {
        return Array.from(this.catalog.categories);
    }

    getStatistics() {
        return {
            totalProducts: this.catalog.products.size,
            totalCollections: this.catalog.collections.size,
            totalCategories: this.catalog.categories.size,
            totalViews: Array.from(this.productStats.values()).reduce((sum, stats) => sum + stats.views, 0),
            totalInquiries: Array.from(this.productStats.values()).reduce((sum, stats) => sum + stats.inquiries, 0),
            totalOrders: Array.from(this.productStats.values()).reduce((sum, stats) => sum + stats.orders, 0)
        };
    }
}

module.exports = WACatalog;