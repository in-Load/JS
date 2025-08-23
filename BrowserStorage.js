/**
 * Use browser storage
 * @updated 25.08.23
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
