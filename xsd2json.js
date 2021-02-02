'use strict';

var util = require('util');
var debuglog = util.debuglog('jgexml');

var target; // for new properties
var attributePrefix = '@';
var laxURIs = false;
var defaultNameSpace = '';
var xsPrefix = 'xs:';

/**
 * Привести данные к определенному типу из строки
 * @param {string} value
 * @param {string} type
 * @return {*}
 */
function castValue(value, type) {
    let result;

    switch (type) {
        case 'integer':
            result = parseInt(value, 10);
            break;
        case 'number':
            result = parseFloat(value);
            break;
        case 'boolean':
            result = value === 'true';
    }

    return result;
}

/**
 * Выполнить рекурсивный поиск значений по ключам во вложенных объектах
 * @param {object} target
 * @param {string} keys
 * @return {undefined|*}
 */
function dig(target, ...keys) {
    let digged = target;

    for (let key of keys) {
        if (typeof digged === 'undefined' || digged === null) {
            return undefined;
        }
        if (typeof key === 'function') {
            digged = key(digged);
        } else {
            digged = digged[prefixed(key)];
        }
    }
    return digged;
}

/**
 * Добавить xs префикс к строке
 * @param {string} value
 * @return {string}
 */
function prefixed(value) {
    return (value.startsWith('@') ? '' : xsPrefix) + value;
}

function reset(attrPrefix, laxURIprocessing, newXsPrefix) {
    target = null;
    attributePrefix = attrPrefix;
    laxURIs = laxURIprocessing;
    defaultNameSpace = '';
    xsPrefix = newXsPrefix || 'xs:';
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function hoik(obj, target, key, newKey) {
    if (target && obj && (typeof obj[key] != 'undefined')) {
        if (!newKey) {
            newKey = key;
        }
        target[newKey] = clone(obj[key]);
        delete obj[key];
    }
}

function rename(obj, key, newName) {
    obj[newName] = obj[key];
    delete obj[key];
}

function isEmpty(obj) {
    if (typeof obj !== 'object') return false;
    for (var prop in obj) {
        if ((obj.hasOwnProperty(prop) && (typeof obj[prop] !== 'undefined'))) {
            return false;
        }
    }
    return true;
}

function toArray(item) {
    if (!(item instanceof Array)) {
        var newitem = [];
        if (item) {
            newitem.push(item);
        }
        return newitem;
    }
    else {
        return item;
    }
}

function mandate(target, inAnyOf, inAllOf, name) {
    if ((name != '#text') && (name != '#')) {
        var tempTarget = target;
        if (inAnyOf >= 0) {
            tempTarget = target.anyOf[inAnyOf];
        }
        if (inAllOf >= 0) {
            tempTarget = target.allOf[inAllOf];
        }
        if (!tempTarget.required) tempTarget.required = [];
        if (tempTarget.required.indexOf(name) < 0) {
            tempTarget.required.push(name);
        }
    }
}

function finaliseType(typeData) {
    if ((typeData.type == 'string') || (typeData.type == 'boolean') || (typeData.type == 'array') || (typeData.type == 'object')
        || (typeData.type == 'integer') || (typeData.type == 'number') || (typeData.type == 'null')) {
        //typeData.type = typeData.type;
    }
    else {
        if (typeData.type.startsWith('xml:')) { // id, lang, space, base, Father
            typeData.type = 'string';
        }
        else {
            var tempType = typeData.type;
            if (defaultNameSpace) {
                tempType = tempType.replace(defaultNameSpace + ':', '');
            }
            if (tempType.indexOf(':') >= 0) {
                var tempComp = tempType.split(':');
                typeData["$ref"] = tempComp[0] + '.json#/definitions/' + tempComp[1]; //'/'+typeData.type.replace(':','/');
            }
            else {
                typeData["$ref"] = '#/definitions/' + tempType;
            }
            delete typeData.type;
        }
    }
    return typeData;
}

/**
 * Смапить тип данных XSD на тип JSON с дополнительными ограничителями
 * @param {String} type
 * @return {{}}
 */
function mapType(type) {

    const result = {};
    result.type = type;

    if (Array.isArray(type)) {
        result.type = 'object';
        result.oneOf = [];
        for (var t in type) {
            result.oneOf.push(finaliseType(mapType(type[t])));
        }
    }
    else if (type == xsPrefix + 'integer') {
        result.type = 'integer';
    }
    else if (type == xsPrefix + 'positiveInteger') {
        result.type = 'integer';
        result.minimum = 1;
    }
    else if (type == xsPrefix + 'nonPositiveInteger') {
        result.type = 'integer';
        result.maximum = 0;
    }
    else if (type == xsPrefix + 'negativeInteger') {
        result.type = 'integer';
        result.maximum = -1;
    }
    else if (type == xsPrefix + 'nonNegativeInteger') {
        result.type = 'integer';
        result.minimum = 0;
    }
    else if (type == xsPrefix + 'unsignedInt') {
        result.type = 'integer';
        result.minimum = 0;
        result.maximum = 4294967295;
    }
    else if (type == xsPrefix + 'unsignedShort') {
        result.type = 'integer';
        result.minimum = 0;
        result.maximum = 65535;
    }
    else if (type == xsPrefix + 'unsignedByte') {
        result.type = 'integer';
        result.minimum = 0;
        result.maximum = 255;
    }
    else if (type == xsPrefix + 'int') {
        result.type = 'integer';
        result.maximum = 2147483647;
        result.minimum = -2147483648;
    }
    else if (type == xsPrefix + 'short') {
        result.type = 'integer';
        result.maximum = 32767;
        result.minimum = -32768;
    }
    else if (type == xsPrefix + 'byte') {
        result.type = 'integer';
        result.maximum = 127;
        result.minimum = -128;
    }
    else if (type == xsPrefix + 'long') {
        result.type = 'integer';
    }
    else if (type == xsPrefix + 'unsignedLong') {
        result.type = 'integer';
        result.minimum = 0;
    }

    if (type == xsPrefix + 'string') result.type = 'string';
    if (type == xsPrefix + 'NMTOKEN') result.type = 'string';
    if (type == xsPrefix + 'NMTOKENS') result.type = 'string';
    if (type == xsPrefix + 'ENTITY') result.type = 'string';
    if (type == xsPrefix + 'ENTITIES') result.type = 'string';
    if (type == xsPrefix + 'ID') result.type = 'string';
    if (type == xsPrefix + 'IDREF') result.type = 'string';
    if (type == xsPrefix + 'IDREFS') result.type = 'string';
    if (type == xsPrefix + 'NOTATION') result.type = 'string';
    if (type == xsPrefix + 'token') result.type = 'string';
    if (type == xsPrefix + 'Name') result.type = 'string';
    if (type == xsPrefix + 'NCName') result.type = 'string';
    if (type == xsPrefix + 'QName') result.type = 'string';
    if (type == xsPrefix + 'normalizedString') result.type = 'string';
    if (type == xsPrefix + 'base64Binary') {
        result.type = 'string';
        result.format = 'byte';
    }
    if (type == xsPrefix + 'hexBinary') {
        result.type = 'string';
        result.format = '^[0-9,a-f,A-F]*';
    }

    if (type == xsPrefix + 'boolean') result.type = 'boolean';

    if (type == xsPrefix + 'date') {
        result.type = 'string';
        result.pattern = '^[0-9]{4}\-[0-9]{2}\-[0-9]{2}.*$'; //timezones
    }
    else if (type == xsPrefix + 'dateTime') {
        result.type = 'string';
        result.format = 'date-time';
    }
    else if (type == xsPrefix + 'time') {
        result.type = 'string';
        result.pattern = '^[0-9]{2}\:[0-9]{2}:[0-9]{2}.*$'; // timezones
    }
    else if (type == xsPrefix + 'duration') {
        result.type = 'string';
        result.pattern = '^(-)?P(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)W)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?$';
    }
    else if (type == xsPrefix + 'gDay') {
        result.type = 'string';
        result.pattern = '[0-9]{2}';
    }
    else if (type == xsPrefix + 'gMonth') {
        result.type = 'string';
        result.pattern = '[0-9]{2}';
    }
    else if (type == xsPrefix + 'gMonthDay') {
        result.type = 'string';
        result.pattern = '[0-9]{2}\-[0-9]{2}';
    }
    else if (type == xsPrefix + 'gYear') {
        result.type = 'string';
        result.pattern = '[0-9]{4}';
    }
    else if (type == xsPrefix + 'gYearMonth') {
        result.type = 'string';
        result.pattern = '[0-9]{4}\-[0-9]{2}';
    }

    if (type == xsPrefix + 'language') {
        result.type = 'string';
        result.pattern = '[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*';
    }

    if (type == xsPrefix + 'decimal') {
        result.type = 'number';
    }
    else if (type == xsPrefix + 'double') {
        result.type = 'number';
        result.format = 'double';
    }
    else if (type == xsPrefix + 'float') {
        result.type = 'number';
        result.format = 'float';
    }

    if (type == xsPrefix + 'anyURI') {
        result.type = 'string';
        if (!laxURIs) {
            result.format = 'uri'; //XSD allows relative URIs, it seems JSON schema uri format may not?
            // this regex breaks swagger validators
            //result.pattern = '^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?';
        }
    }

    return result;
}

function initTarget(parent) {
    if (!target) target = parent;
    if (!target.properties) {
        target.properties = {};
        target.required = [];
        target.additionalProperties = false;
    }
    if (!target.allOf) target.allOf = [];
}

/**
 * Обработать элемент дерева
 * @param src    Текущий элемент в дереве обработки
 * @param parent Родительский элемент в дереве обработки
 * @param key    Имя текущего элемента (для )
 * @return {boolean}
 */
function doElement(src, parent, key) {

    //console.log(src);
    //console.log(parent);
    //console.log(key);

    let type;
    let name;

    let simpleType;
    let doc;
    let inAnyOf = -1; // used for attributeGroups - properties can get merged in here later, see mergeAnyOf
    let inAllOf = (target && target.allOf) ? target.allOf.length - 1 : -1; // used for extension based composition

    let element = src[key];
    if ((typeof element == 'undefined') || (null === element)) {
        return false;
    }

    if ((key === prefixed("any")) || (key === prefixed("anyAttribute"))) {
        if (target) target.additionalProperties = true; // target should always be defined at this point
    }

    // документация по элементу
    doc = dig(element, "annotation", "documentation")


    if (element["@name"]) {
        name = element["@name"];
    }
    if (element["@type"]) {
        type = element["@type"];
    }
    else if ((element["@name"]) && (simpleType = dig(element, "simpleType", "restriction"))) {
        type = simpleType["@base"];
        // скопировать аннотацию в тип, чтобы он тоже содержал описание
        // TODO: надо ли оно?
        simpleType[prefixed("annotation")] = dig(element, "simpleType", "annotation");
    }
    else if ((element["@name"]) && (simpleType = dig(element, "restriction"))) {
        type = simpleType["@base"];
        // скопировать аннотацию в тип, чтобы он тоже содержал описание
        // TODO: надо ли оно?
        simpleType[prefixed("annotation")] = dig(element, "annotation");
    }
    else if ((type = dig(element, "extension", "@base"))) {
        const tempType = finaliseType(mapType(type));
        if (!tempType["$ref"]) {
            name = "#text"; // see anonymous types
        }
        else {
            var oldP = clone(target);
            oldP.additionalProperties = true;
            for (let v in target) {
                delete target[v];
            }
            if (!target.allOf) target.allOf = [];
            let newt = {};
            target.allOf.push(newt);
            target.allOf.push(oldP);
            name = '#';
            inAllOf = 0; //target.allOf.length-1;
        }
    }
    else if ((type = dig(element, "union", "@memberTypes"))) {
        type = type.split(' ');
    }
    else if (element[prefixed("list")]) {
        type = 'string';
    }
    else if (element["@ref"]) {
        name = element["@ref"];
        type = element["@ref"];
    } else {
        type = 'object';
    }

    if (name && type) {
        let isAttribute = (element["@isAttr"] === true);

        initTarget(parent);
        let newTarget = target;

        let minOccurs = 1;
        let maxOccurs = 1;
        let enumList = [];
        if (element["@minOccurs"]) minOccurs = parseInt(element["@minOccurs"], 10);
        if (element["@maxOccurs"]) maxOccurs = element["@maxOccurs"];
        if (maxOccurs === 'unbounded') maxOccurs = Number.MAX_SAFE_INTEGER;
        if (isAttribute) {
            if ((!element["@use"]) || (element["@use"] !== 'required')) minOccurs = 0;
            if (element["@fixed"]) enumList.push(element["@fixed"]);
        }
        if (element["@isChoice"]) minOccurs = 0;

        var typeData = mapType(type);
        if (isAttribute && (typeData.type === 'object')) {
            typeData.type = 'string'; // handle case where attribute has no defined type
        }

        if (doc) {
            typeData.description = doc;
        }

        if (enumList.length) {
            typeData.enum = enumList;
        }

        if (typeData.type === 'object') {
            typeData.properties = {};
            typeData.required = [];
            typeData.additionalProperties = false;
            newTarget = typeData;
        }

        // handle @ref / attributeGroups
        if ((key === xsPrefix + "attributeGroup") && (element["@ref"])) { // || (name == '$ref')) {
            if (!target.anyOf) target.anyOf = [];
            var newt = {};
            newt.properties = {};
            newt.required = clone(target.required);
            target.anyOf.push(newt);
            inAnyOf = target.anyOf.length - 1;
            target.required = [];
            delete src[key];
            minOccurs = 0;
        }

        if ((parent[xsPrefix + "annotation"]) && ((parent[xsPrefix + "annotation"][xsPrefix + "documentation"]))) {
            target.description = parent[xsPrefix + "annotation"][xsPrefix + "documentation"];
        }

        // обработка значение Enum
        let enumSource = dig(element, "simpleType", "restriction", "enumeration") || dig(element, "restriction", "enumeration");
        if (enumSource) {
            typeData.description = '';
            typeData.enum = [];
            enumSource = toArray(enumSource);
            for (let i = 0; i < enumSource.length; i++) {

                typeData.enum.push(castValue(enumSource[i]["@value"], typeData.type));

                let doc = dig(enumSource[i], "annotation", "documentation");
                if (doc) {
                    if (typeData.description !== '') {
                        typeData.description += '\n';
                    }
                    typeData.description += enumSource[i]["@value"] + ': ' + doc;
                }
            }
            if (!typeData.description) delete typeData.description;
        }
        else {
            typeData = finaliseType(typeData);
        }

        if (maxOccurs > 1) {
            var newTD = {};
            newTD.type = 'array';
            if (minOccurs > 0) newTD.minItems = parseInt(minOccurs, 10);
            if (maxOccurs < Number.MAX_SAFE_INTEGER) newTD.maxItems = parseInt(maxOccurs, 10);
            newTD.items = typeData;
            typeData = newTD;
            // TODO add mode where if array minOccurs is 1, add oneOf allowing single object or array with object as item
        }
        if (minOccurs > 0) {
            mandate(target, inAnyOf, inAllOf, name);
        }

        if (simpleType) {
            if (simpleType[xsPrefix + "minLength"]) typeData.minLength = parseInt(simpleType[xsPrefix + "minLength"]["@value"], 10);
            if (simpleType[xsPrefix + "maxLength"]) typeData.maxLength = parseInt(simpleType[xsPrefix + "maxLength"]["@value"], 10);
            if (simpleType[xsPrefix + "pattern"]) typeData.pattern = simpleType[xsPrefix + "pattern"]["@value"];
            if ((simpleType[xsPrefix + "annotation"]) && (simpleType[xsPrefix + "annotation"][xsPrefix + "documentation"])) {
                typeData.description = simpleType[xsPrefix + "annotation"][xsPrefix + "documentation"];
            }
        }

        if (inAllOf >= 0) {
            if (typeData.$ref) target.allOf[inAllOf].$ref = typeData["$ref"]
            else delete target.allOf[inAllOf].$ref;
        }
        else if (inAnyOf >= 0) {
            if (typeData.$ref) target.anyOf[inAnyOf].$ref = typeData["$ref"]
            else delete target.anyOf[inAnyOf].$ref;
        }
        else {
            if (!target.type) target.type = 'object';
            target.properties[name] = typeData; // Object.assign 'corrupts' property ordering
        }

        target = newTarget;
    }
}

function moveAttributes(obj, parent, key) {
    if (key !== prefixed('attribute')) return;

    obj[key] = toArray(obj[key]);

    let target;

    let element = dig(obj, "sequence", "element");
    if (element) {
        target = toArray(element)
        obj[prefixed("sequence")][prefixed("element")] = target;
    }

    element = dig(obj, "choice", "element");
    if (element) {
        target = toArray(element)
        obj[prefixed("choice")][prefixed("element")] = target;
    }

    for (let i = 0; i < obj[key].length; i++) {
        let attr = clone(obj[key][i]);
        if (attributePrefix) {
            attr["@name"] = attributePrefix + attr["@name"];
        }
        if (typeof attr == 'object') {
            attr["@isAttr"] = true;
        }
        if (target) target.push(attr)
        else obj[key][i] = attr;
    }
    if (target) delete obj[key];
}

function processChoice(obj, parent, key) {
    if (key !== prefixed('choice')) return;

    const choice = dig(obj, 'choice');
    ["element", "group"].forEach(element => {
        if (choice[prefixed(element)]) {
            let e = choice[prefixed(element)] = toArray(choice[prefixed(element)])
            for (let i = 0; i < e.length; i++) {
                if (!e[i]["@isAttr"]) {
                    e[i]["@isChoice"] = true;
                }
            }
        }
    });
}

function renameObjects(obj, parent, key) {
    if (key !== prefixed('complexType')) return;

    const name = obj["@name"];
    if (name) {
        rename(obj, key, name);
    }
    else debuglog('complexType with no name');
}

function removeUnique(obj, parent, key) {
    delete obj[prefixed("unique")];
}

function moveProperties(obj, parent, key) {
    if (key !== prefixed('sequence')) return;

    if (obj[key].properties) {
        obj.properties = obj[key].properties;
        obj.required = obj[key].required;
        obj.additionalProperties = false;
        delete obj[key];
    }
}

function clean(obj, parent, key) {
    if (key == '@name') delete obj[key];
    if (key == '@type') delete obj[key];
    if (key == xsPrefix + "attribute") delete obj[key];
    if (key == xsPrefix + "restriction") delete obj[key];
    if (key == xsPrefix + "annotation") delete obj[key];
    if (key == xsPrefix + "sequence") delete obj[key];
    if (obj.properties && (Object.keys(obj.properties).length == 1) && obj.properties["#text"] && obj.properties["#text"]["$ref"]) {
        obj.properties["$ref"] = obj.properties["#text"]["$ref"];
        delete obj.properties["#text"]; // anonymous types
    }
    if (obj.properties && obj.anyOf) { // mergeAnyOf
        var newI = {};
        if (obj.properties["$ref"]) {
            newI["$ref"] = obj.properties["$ref"];
        }
        else if (Object.keys(obj.properties).length > 0) {
            newI.properties = obj.properties;
            newI.required = obj.required;
        }
        if (Object.keys(newI).length > 0) {
            obj.anyOf.push(newI);
        }
        obj.properties = {}; // gets removed later
        obj.required = []; // ditto

        if (obj.anyOf.length === 1) {
            if (obj.anyOf[0]["$ref"]) {
                obj["$ref"] = clone(obj.anyOf[0]["$ref"]);
                delete obj.type;
                delete obj.additionalProperties;
            }
            // possible missing else here for properties !== {}
            obj.anyOf = []; // also gets removed later
        }
    }
}

function removeEmpties(obj, parent, key) {
    var count = 0;
    if (isEmpty(obj[key])) {
        delete obj[key];
        if (key === 'properties') {
            if ((!obj.oneOf) && (!obj.anyOf)) {
                if (obj.type === 'object') obj.type = 'string';
                delete obj.additionalProperties;
            }
        }
        count++;
    }
    else {
        if (Array.isArray(obj[key])) {
            var newArray = [];
            for (var i = 0; i < obj[key].length; i++) {
                if (typeof obj[key][i] !== 'undefined') {
                    newArray.push(obj[key][i]);
                }
                else {
                    count++;
                }
            }
            if (newArray.length === 0) {
                delete obj[key];
                count++;
            }
            else {
                obj[key] = newArray;
            }
        }
    }
    return count;
}

function recurse(obj, parent, callback, depthFirst) {

    var oTarget = target;

    if (typeof obj != 'string') {
        for (var key in obj) {
            target = oTarget;
            // skip loop if the property is from prototype
            if (!obj.hasOwnProperty(key)) continue;

            if (!depthFirst) callback(obj, parent, key);

            var array = Array.isArray(obj);

            if (typeof obj[key] === 'object') {
                if (array) {
                    for (let i in obj[key]) {
                        recurse(obj[key][i], obj[key], callback);
                    }
                }
                recurse(obj[key], obj, callback);
            }

            if (depthFirst) callback(obj, parent, key);
        }
    }

    return obj;
}

function rootElemenCreate(obj, rootElement, src) {

    obj.required = [rootElement["@name"]]
    obj.properties = clone(rootElement);

    recurse(obj, {}, function (obj, parent, key) {
        renameObjects(obj, parent, key);
    });

    // support for schemas with just a top-level name and type (no complexType/sequence etc)
    if (obj.properties["@type"]) {
        target = obj; // tell it where to put the properties
    } else {
        delete obj.properties["@name"]; // to prevent root-element being picked up twice
    }

    // main processing of the root element
    recurse(obj, {}, function (src, parent, key) { // was obj.properties
        doElement(src, parent, key);
    });

    recurse(obj, {}, function (obj, parent, key) {
        moveProperties(obj, parent, key);
    });
}

module.exports = {
    getJsonSchema: function getJsonSchema(src, title, outputAttrPrefix, laxURIs, newXsPrefix) { // TODO convert to options parameter
        reset(outputAttrPrefix, laxURIs, newXsPrefix);

        for (let p in src) {
            if (p.indexOf(':') >= 0) {
                let pp = p.split(':')[0];
                if (src[p]["@xmlns:" + pp] === 'http://www.w3.org/2001/XMLSchema') {
                    xsPrefix = pp + ':';
                }
            }
        }

        recurse(src, {}, function (src, parent, key) {
            moveAttributes(src, parent, key);
        });

        recurse(src, {}, function (src, parent, key) {
            processChoice(src, parent, key);
        });

        /**
         * Удалить конструкцию unique (в данный момент не поддерживается jsonschema)
         */
        /*recurse(src, {}, function (src, parent, key) {
            removeUnique(src, parent, key);
        });*/

        var obj = {};
        var id = '';

        if (src[xsPrefix + "schema"]) {
            id = src[xsPrefix + "schema"]["@targetNamespace"];
            if (!id) {
                id = src[xsPrefix + "schema"]["@xmlns"];
            }
        }
        else throw new Error('Could find schema with given prefix: ' + xsPrefix);

        for (var a in src[xsPrefix + "schema"]) {
            if (a.startsWith('@xmlns:')) {
                if (src[xsPrefix + "schema"][a] == id) {
                    defaultNameSpace = a.replace('@xmlns:', '');
                }
            }
        }

        //initial root object transformations
        obj.title = title;
        obj.$schema = 'http://json-schema.org/schema#'; //for latest, or 'http://json-schema.org/draft-04/schema#' for v4
        if (id) {
            obj.id = id;
        }
        if (src[xsPrefix + "schema"] && src[xsPrefix + "schema"][xsPrefix + "annotation"]) {
            obj.description = '';
            src[xsPrefix + "schema"][xsPrefix + "annotation"] = toArray(src[xsPrefix + "schema"][xsPrefix + "annotation"]);
            for (var a in src[xsPrefix + "schema"][xsPrefix + "annotation"]) {
                var annotation = src[xsPrefix + "schema"][xsPrefix + "annotation"][a];
                if ((annotation[xsPrefix + "documentation"]) && (annotation[xsPrefix + "documentation"]["#text"])) {
                    obj.description += (obj.description ? '\n' : '') + annotation[xsPrefix + "documentation"]["#text"];
                }
                else {
                    if (annotation[xsPrefix + "documentation"]) obj.description += (obj.description ? '\n' : '') + annotation[xsPrefix + "documentation"];
                }
            }
        }

        var rootElement = src[xsPrefix + "schema"][xsPrefix + "element"];

        obj.type = 'object';

        if (Array.isArray(rootElement)) {
            if (rootElement.length > 1) {
                var objs = []
                rootElement.forEach(function (entry) {
                    var tmp = {}
                    rootElemenCreate(tmp, entry, src)
                    objs.push(tmp)
                    delete tmp["type"]
                });
                obj.anyOf = objs
            } else {
                rootElemenCreate(obj, rootElement[0], src)
            }
        } else {
            rootElemenCreate(obj, rootElement, src)
        }

        // remove rootElement to leave ref'd definitions
        if (Array.isArray(src[xsPrefix + "schema"][xsPrefix + "element"])) {
            //src[xsPrefix+"schema"][xsPrefix+"element"] = src[xsPrefix+"schema"][xsPrefix+"element"].splice(0,1);
            src[xsPrefix + "schema"][xsPrefix + "element"].forEach(function (entry, i) {
                delete src[xsPrefix + "schema"][xsPrefix + "element"][i];
            })
        }
        else {
            delete src[xsPrefix + "schema"][xsPrefix + "element"];
        }

        obj.definitions = clone(src);
        obj.definitions.properties = {};
        target = obj.definitions;

        // main processing of the ref'd elements
        recurse(obj.definitions, {}, function (src, parent, key) {
            doElement(src, parent, key);
        });

        // correct for /definitions/properties
        obj.definitions = obj.definitions.properties;

        recurse(obj, {}, function (obj, parent, key) {
            clean(obj, parent, key);
        });

        delete (obj.definitions[xsPrefix + "schema"]);

        var count = 1;
        while (count > 0) { // loop until we haven't removed any empties
            count = 0;
            recurse(obj, {}, function (obj, parent, key) {
                count += removeEmpties(obj, parent, key);
            });
        }

        return obj;
    }
};
