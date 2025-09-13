/**
 * Use browser storage
 * @updated 25.09.13
 * @copyright 2025 Hold'inCorp.
 * @author inLoad
 * @license Apache-2.0 ./LICENSE
 *
 * @see https://developer.mozilla.org/docs/Web/API/Web_Storage_API
 */
class BrowserStorage {
    /**
     * Return all data in storage
     */
    static get all(){
        throw new Error(`You have to implement the method "${this.name}.all()" !`);
    }

    /**
     * this.length is protected by Javascript
     */
    static get size(){ return this.all.length }
    
    /**
     * Return the name of the nth key in a given Storage object
     */
    static key(nth){ return this.all.key(nth) }
    
    /**
     * Return specific data in storage
     * @param  {string} name
     * @param  {function} reviver
     * @return {json}
    */
   static get(name, reviver=undefined){
       let data = this.all.getItem(name);
       return data ? JSON.parse(data, reviver) : null;
    }
    
    /**
     * Add or update data in storage
     * @param {string} name
     * @param {rest} data
    */
   static set(name,...data){
       if(!!data.length){
           this.all.setItem(name,JSON.stringify(...data));
        }
    }
    
    /**
     * Remove data in storage
     * @param  {string} name
    */
   static kill(name){
       this.all.removeItem(name);
    }
    
    /**
     * Clear all data in storage
    */
   static clear(){
       this.all.clear();
    }
}

/**
 * Local storage
 * @extends BrowserStorage
 * @see https://developer.mozilla.org/docs/Web/API/Window/localStorage
 */
class LocalBS extends BrowserStorage { static get all(){ return localStorage } }

/**
 * Session storage
 * @extends BrowserStorage
 * @see https://developer.mozilla.org/docs/Web/API/Window/sessionStorage
 */
class SessionBS extends BrowserStorage { static get all(){ return sessionStorage } }

/**
 * @typedef {Object} IndexConfig
 * @property {string} name - The name of the index
 * @property {string} keyPath - The key path for the index
 * @property {IDBIndexParameters} [options] - Optional index parameters (unique, multiEntry, etc.)
 */

/**
 * @typedef {Object} StoreConfig
 * @property {string} keyPath - Primary key for the store
 * @property {boolean} [autoIncrement=true] - Automatically increment the key if missing
 * @property {IndexConfig[]} [indexes] - Optional indexes for the store
 */

/**
 * IndexedBS
 * A wrapper for IndexedDB with:
 *  - Robust versioning
 *  - Structured error handling
 *  - CRUD API with singular/plural methods
 *  - Change listeners
 *  - API access via `db.api[storeName]` to avoid naming conflicts
 *  - Full JSDoc typedefs for autocomplete and maintainability
 */
class IndexedBS {
    /**
     * @param {string} dbName - Name of the database
     * @param {Record<string, StoreConfig>} stores - Configuration of stores
     * @param {number} version - Initial database version
     */
    constructor(dbName, stores = {}, version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.stores = stores;
        this.db = null;

        /** @type {Record<string, any>} API object for stores to avoid conflicts */
        this.api = {};
    }

    /**
     * Opens the database, creates stores if needed, and updates the version if necessary.
     * @returns {Promise<IndexedBS>} Resolves when database is ready.
     */
    async open() {
        const currentVersion = await this._getCurrentVersion();
        const needsUpgrade = await this._checkStores(currentVersion);
        
        // Handling to prevent VersionError
        if(needsUpgrade){
            this.version = currentVersion + 1;
        } else {
            this.version = currentVersion;
        }
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = event => {
                this.db = event.target.result;

                for(const [name, config] of Object.entries(this.stores)){
                    if (!this.db.objectStoreNames.contains(name)) {
                        const store = this.db.createObjectStore(name, {
                            keyPath: config.keyPath || "id",
                            autoIncrement: config.autoIncrement ?? true
                        });

                        if (config.indexes) {
                            config.indexes.forEach(idx =>
                                store.createIndex(idx.name, idx.keyPath, idx.options || {})
                            );
                        }
                    }
                }
            };

            request.onsuccess = event => {
                this.db = event.target.result;
                this._createStoreAccessors();
                resolve(this);
            };

            request.onerror = e => reject(e.target.error);
        });
    }

    /** @private Get current DB version, return default if DB does not exist */
    async _getCurrentVersion() {
        return new Promise(resolve => {
            const req = indexedDB.open(this.dbName);
            req.onsuccess = e => {
                const db = e.target.result;
                resolve(db.version);
                db.close();
            };
            req.onerror = () => resolve(this.version);
        });
    }

    /**
     * @private
     * Checks if all stores exist, returns true if upgrade is needed
     */
    async _checkStores(currentVersion) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, currentVersion);
            let needsUpgrade = false;

            req.onsuccess = e => {
                const db = e.target.result;
                for(const name of Object.keys(this.stores)){
                    if(!db.objectStoreNames.contains(name)){
                        needsUpgrade = true;
                        break;
                    }
                }
                db.close();
                resolve(needsUpgrade);
            };

            req.onerror = e => reject(e.target.error);
        });
    }

    /**
     * @private
     * Read transaction wrapper with executor
     * @param {string} storeName
     * @param {Function} executor(store, resolve, reject)
     */
    _read(storeName, executor) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);

            executor(store, resolve, reject);

            // tx.oncomplete can be used for logging or cleanup
            // tx.oncomplete = () => {};
            tx.onerror = e => reject(e.target.error);
        });
    }

    /**
     * @private
     * Write transaction wrapper for single or multiple items
     * Collects all errors in an array
     */
    _write(storeName, action, values, notifyFn = null) {
        const items = Array.isArray(values) ? values : [values];
        const results = [];
        const errors = [];

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);

            items.forEach(item => {
                const req = store[action](item);
                req.onsuccess = e => results.push(e.target.result);
                req.onerror = e => {
                    const err = e.target.error;
                    errors.push({
                        item,
                        error: err.name === "ConstraintError" ? "DuplicateKey" : err
                    });
                };
            });

            tx.oncomplete = () => {
                if (notifyFn) items.forEach(v => notifyFn(action, v));
                errors.length ? reject(errors) : resolve(items.length > 1 ? results : results[0]);
            };

            tx.onerror = () => reject(errors.length ? errors : "Transaction failed");
        });
    }

    /** @private Create API accessors for all stores */
    _createStoreAccessors() {
        for(const storeName of Object.keys(this.stores)){
            this.api[storeName] = this._createStore(storeName);
        }
    }

    /** @private Create a store accessor with full CRUD + listeners */
    _createStore(storeName) {
        const listeners = [];
        const notify = (action, data) => listeners.forEach(fn => fn(action, data));

        return {
            // WRITE
            add: item => this._write(storeName, "add", item, notify),
            adds: items => this._write(storeName, "add", items, notify),
            update: item => this._write(storeName, "put", item, notify),
            updates: items => this._write(storeName, "put", items, notify),
            delete: key => this._write(storeName, "delete", key, notify),
            deletes: keys => this._write(storeName, "delete", keys, notify),

            // READ
            get: key => this._read(storeName, (store, resolve, reject) => {
                const req = store.get(key);
                req.onsuccess = e => resolve(e.target.result);
                req.onerror = e => reject(e.target.error);
            }),

            getAll: () => this._read(storeName, (store, resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = e => resolve(e.target.result);
                req.onerror = e => reject(e.target.error);
            }),

            filter: predicate => this._read(storeName, (store, resolve, reject) => {
                const results = [];
                const req = store.openCursor();
                req.onsuccess = e => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (predicate(cursor.value)) results.push(cursor.value);
                        cursor.continue();
                    } else resolve(results);
                };
                req.onerror = e => reject(e.target.error);
            }),

            query: (indexName = null, query = null) => this._read(storeName, (store, resolve, reject) => {
                const results = [];
                const source = indexName ? store.index(indexName) : store;
                const req = source.openCursor(query);
                req.onsuccess = e => {
                    const cursor = e.target.result;
                    if (cursor) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else resolve(results);
                };
                req.onerror = e => reject(e.target.error);
            }),

            onChange: fn => listeners.push(fn)
        };
    }
}
