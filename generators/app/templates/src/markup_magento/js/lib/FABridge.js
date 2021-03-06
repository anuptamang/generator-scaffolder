/*
Copyright 2006 Adobe Systems Incorporated

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

/*
 * The Bridge class, responsible for navigating AS instances
 */
function FABridge(target, bridgeName) {
  this.target = target;
  this.remoteTypeCache = {};
  this.remoteInstanceCache = {};
  this.remoteFunctionCache = {};
  this.localFunctionCache = {};
  this.bridgeID = FABridge.nextBridgeID++;
  this.name = bridgeName;
  this.nextLocalFuncID = 0;
  FABridge.instances[this.name] = this;
  FABridge.idMap[this.bridgeID] = this;

  return this;
}

// type codes for packed values
FABridge.TYPE_ASINSTANCE = 1;
FABridge.TYPE_ASFUNCTION = 2;

FABridge.TYPE_JSFUNCTION = 3;
FABridge.TYPE_ANONYMOUS = 4;

FABridge.initCallbacks = {};
FABridge.userTypes = {};

FABridge.addToUserTypes = function() {
  for (let i = 0; i < arguments.length; i++) {
    FABridge.userTypes[arguments[i]] = {
      typeName: arguments[i],
      enriched: false
    };
  }
};

FABridge.argsToArray = function(args) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    result[i] = args[i];
  }
  return result;
};

function instanceFactory(objID) {
  this.fb_instance_id = objID;
  return this;
}

function FABridge__invokeJSFunction(args) {
  const funcID = args[0];
  const throughArgs = args.concat(); // FABridge.argsToArray(arguments);
  throughArgs.shift();

  const bridge = FABridge.extractBridgeFromID(funcID);
  return bridge.invokeLocalFunction(funcID, throughArgs);
}

FABridge.addInitializationCallback = function(bridgeName, callback) {
  const inst = FABridge.instances[bridgeName];
  if (inst != undefined) {
    callback.call(inst);
    return;
  }

  let callbackList = FABridge.initCallbacks[bridgeName];
  if (callbackList == null) {
    FABridge.initCallbacks[bridgeName] = callbackList = [];
  }

  callbackList.push(callback);
};

// updated for changes to SWFObject2
function FABridge__bridgeInitialized(bridgeName) {
  const objects = document.getElementsByTagName('object');
  const ol = objects.length;
  const activeObjects = [];
  if (ol > 0) {
    for (let i = 0; i < ol; i++) {
      if (typeof objects[i].SetVariable !== 'undefined') {
        activeObjects[activeObjects.length] = objects[i];
      }
    }
  }
  const embeds = document.getElementsByTagName('embed');
  const el = embeds.length;
  const activeEmbeds = [];
  if (el > 0) {
    for (let j = 0; j < el; j++) {
      if (typeof embeds[j].SetVariable !== 'undefined') {
        activeEmbeds[activeEmbeds.length] = embeds[j];
      }
    }
  }
  const aol = activeObjects.length;
  const ael = activeEmbeds.length;
  const searchStr = `bridgeName=${bridgeName}`;
  if ((aol == 1 && !ael) || (aol == 1 && ael == 1)) {
    FABridge.attachBridge(activeObjects[0], bridgeName);
  } else if (ael == 1 && !aol) {
    FABridge.attachBridge(activeEmbeds[0], bridgeName);
  } else {
    let flash_found = false;
    if (aol > 1) {
      for (let k = 0; k < aol; k++) {
        const params = activeObjects[k].childNodes;
        for (let l = 0; l < params.length; l++) {
          const param = params[l];
          if (
            param.nodeType == 1 &&
            param.tagName.toLowerCase() == 'param' &&
            param.name.toLowerCase() == 'flashvars' &&
            param.value.indexOf(searchStr) >= 0
          ) {
            FABridge.attachBridge(activeObjects[k], bridgeName);
            flash_found = true;
            break;
          }
        }
        if (flash_found) {
          break;
        }
      }
    }
    if (!flash_found && ael > 1) {
      for (let m = 0; m < ael; m++) {
        const flashVars = activeEmbeds[m].attributes.getNamedItem('flashVars').nodeValue;
        if (flashVars.indexOf(searchStr) >= 0) {
          FABridge.attachBridge(activeEmbeds[m], bridgeName);
          break;
        }
      }
    }
  }
  return true;
}

// used to track multiple bridge instances, since callbacks from AS are global across the page.

FABridge.nextBridgeID = 0;
FABridge.instances = {};
FABridge.idMap = {};
FABridge.refCount = 0;

FABridge.extractBridgeFromID = function(id) {
  const bridgeID = id >> 16;
  return FABridge.idMap[bridgeID];
};

FABridge.attachBridge = function(instance, bridgeName) {
  // reuse bridge if it exists
  //    var newBridgeInstance = new FABridge(instance, bridgeName);

  // reuse bridge if it exists
  //    FABridge[bridgeName] = newBridgeInstance;

  if (typeof FABridge[bridgeName] === 'undefined') {
    FABridge[bridgeName] = new FABridge(instance, bridgeName);
  }

  /*  FABridge[bridgeName] = function() {
        return newBridgeInstance.root();
    }
*/
  const callbacks = FABridge.initCallbacks[bridgeName];
  if (callbacks == null) {
    return;
  }
  for (let i = 0; i < callbacks.length; i++) {
    //        callbacks[i].call(newBridgeInstance);
    callbacks[i].call(FABridge[bridgeName]);
  }

  // reuse bridge if it exists
  //    delete FABridge.initCallbacks[bridgeName]
};

// some methods can't be proxied.  You can use the explicit get,set, and call methods if necessary.

FABridge.blockedMethods = {
  toString: true,
  get: true,
  set: true,
  call: true
};

FABridge.prototype = {
  // bootstrapping

  root() {
    return this.deserialize(this.target.getRoot());
  },
  // clears all of the AS objects in the cache maps
  releaseASObjects() {
    return this.target.releaseASObjects();
  },
  // clears a specific object in AS from the type maps
  releaseNamedASObject(value) {
    if (typeof value !== 'object') {
      return false;
    }
    const ret = this.target.releaseNamedASObject(value.fb_instance_id);
    return ret;
  },
  // create a new AS Object
  create(className) {
    return this.deserialize(this.target.create(className));
  },

  // utilities

  makeID(token) {
    return (this.bridgeID << 16) + token;
  },

  // low level access to the flash object

  // get a named property from an AS object
  getPropertyFromAS(objRef, propName) {
    if (FABridge.refCount > 0) {
      throw new Error(
        'You are trying to call recursively into the Flash Player which is not allowed. In most cases the JavaScript setTimeout function, can be used as a workaround.'
      );
    } else {
      FABridge.refCount++;
      retVal = this.target.getPropFromAS(objRef, propName);
      retVal = this.handleError(retVal);
      FABridge.refCount--;
      return retVal;
    }
  },
  // set a named property on an AS object
  setPropertyInAS(objRef, propName, value) {
    if (FABridge.refCount > 0) {
      throw new Error(
        'You are trying to call recursively into the Flash Player which is not allowed. In most cases the JavaScript setTimeout function, can be used as a workaround.'
      );
    } else {
      FABridge.refCount++;
      retVal = this.target.setPropInAS(objRef, propName, this.serialize(value));
      retVal = this.handleError(retVal);
      FABridge.refCount--;
      return retVal;
    }
  },

  // call an AS function
  callASFunction(funcID, args) {
    if (FABridge.refCount > 0) {
      throw new Error(
        'You are trying to call recursively into the Flash Player which is not allowed. In most cases the JavaScript setTimeout function, can be used as a workaround.'
      );
    } else {
      FABridge.refCount++;
      retVal = this.target.invokeASFunction(funcID, this.serialize(args));
      retVal = this.handleError(retVal);
      FABridge.refCount--;
      return retVal;
    }
  },
  // call a method on an AS object
  callASMethod(objID, funcName, args) {
    if (FABridge.refCount > 0) {
      throw new Error(
        'You are trying to call recursively into the Flash Player which is not allowed. In most cases the JavaScript setTimeout function, can be used as a workaround.'
      );
    } else {
      FABridge.refCount++;
      args = this.serialize(args);
      retVal = this.target.invokeASMethod(objID, funcName, args);
      retVal = this.handleError(retVal);
      FABridge.refCount--;
      return retVal;
    }
  },

  // responders to remote calls from flash

  // callback from flash that executes a local JS function
  // used mostly when setting js functions as callbacks on events
  invokeLocalFunction(funcID, args) {
    let result;
    const func = this.localFunctionCache[funcID];

    if (func != undefined) {
      result = this.serialize(func(...this.deserialize(args)));
    }

    return result;
  },

  // Object Types and Proxies

  // accepts an object reference, returns a type object matching the obj reference.
  getTypeFromName(objTypeName) {
    return this.remoteTypeCache[objTypeName];
  },
  // create an AS proxy for the given object ID and type
  createProxy(objID, typeName) {
    const objType = this.getTypeFromName(typeName);
    instanceFactory.prototype = objType;
    const instance = new instanceFactory(objID);
    this.remoteInstanceCache[objID] = instance;
    return instance;
  },
  // return the proxy associated with the given object ID
  getProxy(objID) {
    return this.remoteInstanceCache[objID];
  },

  // accepts a type structure, returns a constructed type
  addTypeDataToCache(typeData) {
    newType = new ASProxy(this, typeData.name);
    const accessors = typeData.accessors;
    for (var i = 0; i < accessors.length; i++) {
      this.addPropertyToType(newType, accessors[i]);
    }

    const methods = typeData.methods;
    for (var i = 0; i < methods.length; i++) {
      if (FABridge.blockedMethods[methods[i]] == undefined) {
        this.addMethodToType(newType, methods[i]);
      }
    }

    this.remoteTypeCache[newType.typeName] = newType;
    return newType;
  },

  // add a property to a typename; used to define the properties that can be called on an AS proxied object
  addPropertyToType(ty, propName) {
    const c = propName.charAt(0);
    let setterName;
    let getterName;
    if (c >= 'a' && c <= 'z') {
      getterName = `get${c.toUpperCase()}${propName.substr(1)}`;
      setterName = `set${c.toUpperCase()}${propName.substr(1)}`;
    } else {
      getterName = `get${propName}`;
      setterName = `set${propName}`;
    }
    ty[setterName] = function(val) {
      this.bridge.setPropertyInAS(this.fb_instance_id, propName, val);
    };
    ty[getterName] = function() {
      return this.bridge.deserialize(this.bridge.getPropertyFromAS(this.fb_instance_id, propName));
    };
  },

  // add a method to a typename; used to define the methods that can be callefd on an AS proxied object
  addMethodToType(ty, methodName) {
    ty[methodName] = function() {
      return this.bridge.deserialize(
        this.bridge.callASMethod(this.fb_instance_id, methodName, FABridge.argsToArray(arguments))
      );
    };
  },

  // Function Proxies

  // returns the AS proxy for the specified function ID
  getFunctionProxy(funcID) {
    const bridge = this;
    if (this.remoteFunctionCache[funcID] == null) {
      this.remoteFunctionCache[funcID] = function() {
        bridge.callASFunction(funcID, FABridge.argsToArray(arguments));
      };
    }
    return this.remoteFunctionCache[funcID];
  },

  // reutrns the ID of the given function; if it doesnt exist it is created and added to the local cache
  getFunctionID(func) {
    if (func.__bridge_id__ == undefined) {
      func.__bridge_id__ = this.makeID(this.nextLocalFuncID++);
      this.localFunctionCache[func.__bridge_id__] = func;
    }
    return func.__bridge_id__;
  },

  // serialization / deserialization

  serialize(value) {
    let result = {};

    const t = typeof value;
    // primitives are kept as such
    if (t == 'number' || t == 'string' || t == 'boolean' || t == null || t == undefined) {
      result = value;
    } else if (value instanceof Array) {
      // arrays are serializesd recursively
      result = [];
      for (let i = 0; i < value.length; i++) {
        result[i] = this.serialize(value[i]);
      }
    } else if (t == 'function') {
      // js functions are assigned an ID and stored in the local cache
      result.type = FABridge.TYPE_JSFUNCTION;
      result.value = this.getFunctionID(value);
    } else if (value instanceof ASProxy) {
      result.type = FABridge.TYPE_ASINSTANCE;
      result.value = value.fb_instance_id;
    } else {
      result.type = FABridge.TYPE_ANONYMOUS;
      result.value = value;
    }

    return result;
  },

  // on deserialization we always check the return for the specific error code that is used to marshall NPE's into JS errors
  // the unpacking is done by returning the value on each pachet for objects/arrays
  deserialize(packedValue) {
    let result;

    const t = typeof packedValue;
    if (t == 'number' || t == 'string' || t == 'boolean' || packedValue == null || packedValue == undefined) {
      result = this.handleError(packedValue);
    } else if (packedValue instanceof Array) {
      result = [];
      for (var i = 0; i < packedValue.length; i++) {
        result[i] = this.deserialize(packedValue[i]);
      }
    } else if (t == 'object') {
      for (var i = 0; i < packedValue.newTypes.length; i++) {
        this.addTypeDataToCache(packedValue.newTypes[i]);
      }
      for (const aRefID in packedValue.newRefs) {
        this.createProxy(aRefID, packedValue.newRefs[aRefID]);
      }
      if (packedValue.type == FABridge.TYPE_PRIMITIVE) {
        result = packedValue.value;
      } else if (packedValue.type == FABridge.TYPE_ASFUNCTION) {
        result = this.getFunctionProxy(packedValue.value);
      } else if (packedValue.type == FABridge.TYPE_ASINSTANCE) {
        result = this.getProxy(packedValue.value);
      } else if (packedValue.type == FABridge.TYPE_ANONYMOUS) {
        result = packedValue.value;
      }
    }
    return result;
  },
  // increases the reference count for the given object
  addRef(obj) {
    this.target.incRef(obj.fb_instance_id);
  },
  // decrease the reference count for the given object and release it if needed
  release(obj) {
    this.target.releaseRef(obj.fb_instance_id);
  },

  // check the given value for the components of the hard-coded error code : __FLASHERROR
  // used to marshall NPE's into flash

  handleError(value) {
    if (typeof value === 'string' && value.indexOf('__FLASHERROR') == 0) {
      const myErrorMessage = value.split('||');
      if (FABridge.refCount > 0) {
        FABridge.refCount--;
      }
      throw new Error(myErrorMessage[1]);
      return value;
    }
    return value;
  }
};

// The root ASProxy class that facades a flash object

ASProxy = function(bridge, typeName) {
  this.bridge = bridge;
  this.typeName = typeName;
  return this;
};
// methods available on each ASProxy object
ASProxy.prototype = {
  get(propName) {
    return this.bridge.deserialize(this.bridge.getPropertyFromAS(this.fb_instance_id, propName));
  },

  set(propName, value) {
    this.bridge.setPropertyInAS(this.fb_instance_id, propName, value);
  },

  call(funcName, args) {
    this.bridge.callASMethod(this.fb_instance_id, funcName, args);
  },

  addRef() {
    this.bridge.addRef(this);
  },

  release() {
    this.bridge.release(this);
  }
};
