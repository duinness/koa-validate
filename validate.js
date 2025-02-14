'use strict';
const util = require('util');
const fs = require('fs');
const path = require('path');
const { JSONPath } = require('jsonpath-plus');

const getValue = (obj, key, transFn) => {
  if (key.startsWith('$') && transFn) {
    let result = JSONPath({
      path: key,
      json: obj,
      wrap: false,
      resultType: 'value'
    });
    if (!Array.isArray(result)) result = [result];
    return result;
  }
  return obj[key]
}

const hasKey = (obj, key, transFn) => {
  if (key.startsWith('$') && transFn) {
    let result = JSONPath({
      path: key,
      json: obj,
      wrap: false,
      resultType: 'all'
    });
    if (!Array.isArray(result)) result = [result];
    return result.length === 1 && result[0] !== undefined;
  }
  return key in obj;
}

module.exports = function(app) {
  app.context.checkQuery = function(key,transFn) {
    return new Validator(this, key, getValue(this.request.query,key,transFn), hasKey(this.request.query, key, transFn),this.request.query);
  };
  app.context.checkParams = function(key) {
    return new Validator(this, key, this.params[key], key in this.params,this.params);
  };
  app.context.checkHeader = function(key) {
    return new Validator(this, key, this.header[key], key in this.header,this.header);
  };
  app.context.checkBody = function(key,transFn) {
    var body = this.request.body;

    if(!body) {
      if(!this.errors){
        this.errors = ['no body to check!'];
      }
      return new Validator(this, null, null,false, null ,false );
    }
    var body =  body.fields || body;	// koa-body fileds. multipart fields in body.fields
    return new Validator(this, key,getValue(body,key,transFn), hasKey(body, key, transFn), body);
  };
  app.context.checkFile = function(key , deleteOnCheckFailed) {
    if('undefined' == typeof this.request.files ) {
      if(!this.errors){
        this.errors = ['no file to check'];
      }
      return new Validator(this, null, null,false, null,false );
    }
    deleteOnCheckFailed = ('undefined' == typeof deleteOnCheckFailed?true :false);
    var files = this.request.files;
    return new FileValidator(this, key ,files&&files[key],!!(files&&files[key]) , this.request.files , deleteOnCheckFailed);
  };
};

function isString(s) {
  if(null == s)return false;
  return 'string' == typeof(s)?true:false
}

var v = require('validator');

function Validator(context, key, value, exists, params , goOn) {
  this.params = params;
  this.context = context;
  this.key = key;
  this.value = value;
  this.exists = exists;
  this.goOn = (false===goOn?false:true);
  if(this.value && this instanceof FileValidator && 'goOn' in this.value ){
    this.goOn = this.value.goOn;
  }
}

module.exports.Validator = Validator;
//Validators
Validator.prototype.addError = function(tip) {
  this.goOn = false;
  if(this.value && this instanceof FileValidator ){
    this.value.goOn = false;
  }
  if (!this.context.errors) {
    this.context.errors = [];
  }
  var e = {};
  e[this.key] = tip;
  this.context.errors.push(e);
};

Validator.prototype.hasError = function() {
  return this.context.errors && this.context.errors.length > 0 ? true : false;
};
Validator.prototype.optional = function() {
  if (!this.exists) {
    this.goOn = false;
  }
  return this;
};
Validator.prototype.notEmpty = function(tip) {
  if (this.goOn && (null==this.value||'undefined'==typeof(this.value) || ('string' == typeof(this.value) &&!this.value))) {
    this.addError(tip || this.key + " can not be empty.");
  }
  return this;
};
Validator.prototype.empty = function() {
  if (this.goOn) {
    if (!this.value) {
      this.goOn = false;
    }
  }
  return this;
};
Validator.prototype.notBlank = function(tip) {
  if (this.goOn && (null==this.value||'undefined'==typeof(this.value) || ('string' == typeof(this.value) &&(/^\s*$/gi).test(this.value)))) {
    this.addError(tip || this.key + " can not be blank.");
  }
  return this;
};
Validator.prototype.exist = function(tip) {
  if (this.goOn && !this.exists) {
     this.addError(tip || this.key +" should exist!");
  }
  return this;
};
Validator.prototype.match = function(reg, tip) {
  if (this.goOn && !reg.test(this.value)) {
    this.addError(tip || this.key + " is bad format.");
  }
  return this;
};

/**
from danneu's proposal [https://github.com/danneu]
*/
// Ensure that a string does not match the supplied regular expression.
Validator.prototype.notMatch = function(reg, tip) {
    if (this.goOn && reg.test(this.value)) {
        this.addError(tip || this.key + ' is bad format.');
    }
    return this;
};
// Ensure that `assertion`, an arbitrary value, is falsey.
Validator.prototype.ensureNot = function(assertion, tip, shouldBail) {
  if (shouldBail) this.goOn = false;
    if (this.goOn && !!assertion) {
        this.addError(tip || this.key + ' failed an assertion.');
    }
    return this;
};
// Ensure that `assertion`, an arbitrary value, is truthy.
Validator.prototype.ensure = function(assertion, tip, shouldBail) {
  if (shouldBail) this.goOn = false;
    if (this.goOn && !assertion) {
        this.addError(tip || this.key + ' failed an assertion.');
    }
    return this;
};

Validator.prototype.isInt = function(tip, options) {
  if (this.goOn&& !v.isInt(String(this.value), options)) {
    this.addError(tip || this.key + " is not integer.");
  }
  return this;
};
Validator.prototype.isFloat = function(tip,options) {
  if (this.goOn && !v.isFloat(String(this.value), options)) {
    this.addError(tip || this.key + " is not float.");
  }
  return this;
};

Validator.prototype.isLength = function(min, max, tip) {
  min = min || 0;
  tip = 'number' != typeof max ? max : tip;
  max = 'number' == typeof max ? max :-1;
  this.exist(tip);
  if (this.goOn) {
    if(this.value.length<min) {
      this.addError(tip || this.key + "'s length must equal or great than " + min+".");
      return this;
    }
    if (-1!=max&&this.value.length>max) {
      this.addError(tip || this.key + "'s length must equal or less than " + max + ".");
      return this;
    }
  }
  return this;
};
Validator.prototype.len = Validator.prototype.isLength;
Validator.prototype.in = function(arr, tip) {
  if (this.goOn && arr) {
    for(var i = 0 ; i < arr.length ;i++){
      if(this.value == arr[i]){
        return this;
      }
    }
    this.addError(tip || this.key + " must be in [" + arr.join(',') + "].");
  }
  return this;
};
Validator.prototype.isIn = Validator.prototype.in;
Validator.prototype.eq = function(l, tip) {
  if (this.goOn && this.value != l) {
    this.addError(tip || this.key + " must equal " + l + ".");
  }
  return this;
};
Validator.prototype.neq = function(l, tip) {
  if (this.goOn && this.value == l) {
    this.addError(tip || this.key + " must not equal " + l + ".");
  }
  return this;
};
Validator.prototype.gt = function(l, tip) {
  if (this.goOn && this.value <= l) {
    this.addError(tip || this.key + " must great than " + l + ".");
  }
  return this;
};
Validator.prototype.lt = function(l, tip) {
  if (this.goOn && this.value >= l) {
    this.addError(tip || this.key + " must less than " + l + ".");
  }
  return this;
};
Validator.prototype.ge = function(l, tip) {
  if (this.goOn && this.value < l) {
    this.addError(tip || this.key + " must great than or equal " + l + ".");
  }
  return this;
};
Validator.prototype.le = function(l, tip) {
  if (this.goOn && this.value > l) {
    this.addError(tip || this.key + " must less than or equal " + l + ".");
  }
  return this;
};
Validator.prototype.contains = function(s, tip) {
  if (this.goOn && (!isString(this.value) ||!v.contains(this.value,s))) {
    this.addError(tip || this.key + " must contain " + s + ".");
  }
  return this;
};
Validator.prototype.notContains = function(s, tip) {
  if (this.goOn && (!isString(this.value) ||v.contains(this.value,s))) {
    this.addError(tip || this.key + " must not contain " + s + ".");
  }
  return this;
};
Validator.prototype.isEmail = function(tip,options) {
  if (this.goOn && (!isString(this.value) ||!v.isEmail(this.value,options))) {
    this.addError(tip || this.key + " is not email format.");
  }
  return this;
};
Validator.prototype.isUrl = function(tip,options) {
  if (this.goOn && (!isString(this.value) ||!v.isURL(this.value,options))) {
    this.addError(tip || this.key + " is not url format.");
  }
  return this;
};
Validator.prototype.isIp = function(tip,version) {
  if (this.goOn && (!isString(this.value) ||!v.isIP(this.value,version))) {
    this.addError(tip || this.key + " is not ip format.");
  }
  return this;
};
Validator.prototype.isAlpha = function(tip,locale) {
  if (this.goOn && (!isString(this.value) ||!v.isAlpha(this.value,locale))) {
    this.addError(tip || this.key + " is not an alpha string.");
  }
  return this;
};
Validator.prototype.isNumeric = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isNumeric(this.value))) {
    this.addError(tip || this.key + " is  not numeric.");
  }
  return this;
};

Validator.prototype.isAlphanumeric = function(tip,locale) {
  if (this.goOn && (!isString(this.value) ||!v.isAlphanumeric(this.value,locale))) {
    this.addError(tip || this.key + " is not an aphanumeric string.");
  }
  return this;
};
Validator.prototype.isBase64 = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isBase64(this.value))) {
    this.addError(tip || this.key + " is not a base64 string.");
  }
  return this;
};
Validator.prototype.isHexadecimal = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isHexadecimal(this.value))) {
    this.addError(tip || this.key + " is not a hexa decimal string.");
  }
  return this;
};
Validator.prototype.isHexColor = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isHexColor(this.value))) {
    this.addError(tip || this.key + " is  not hex color format.");
  }
  return this;
};
Validator.prototype.isLowercase = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isLowercase(this.value))) {
    this.addError(tip || this.key + " is not a lowwer case string");
  }
  return this;
};
Validator.prototype.isUppercase = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isUppercase(this.value))) {
    this.addError(tip || this.key + " is not a upper case string.");
  }
  return this;
};
Validator.prototype.isDivisibleBy = function(n, tip) {
  if (this.goOn && (!isString(this.value) ||!v.isDivisibleBy(this.value, n))) {
    this.addError(tip || this.key + " can not divide by" + n + ".");
  }
  return this;
};
Validator.prototype.isEmpty = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isEmpty(this.value))) {
    this.addError(tip || this.key + " is not empty.");
  }
  return this;
};
Validator.prototype.isByteLength = function(min, max,charset,tip) {
  min = min || 0;
  max = max || Number.MAX_VALUE;
  charset = charset||'utf8';
  this.notEmpty(tip);
  if (this.goOn) {
    var bl = Buffer.byteLength(this.value , charset);
    tip = 'number' != typeof max ? max : tip;
    if (bl<min || bl>max) {
      this.addError(tip || this.key + "'s byte lenth great than " + min +" and less than " + max + "." );
    }
  }
  return this;
};
Validator.prototype.byteLength = Validator.prototype.isByteLength;
Validator.prototype.isUUID = function(tip,ver) {
  if (this.goOn && (!isString(this.value) ||!v.isUUID(this.value,ver))) {
    this.addError(tip || this.key + " is not a UUID format.");
  }
  return this;
};
Validator.prototype.isDate = function(tip) {
  if (this.goOn && !util.isDate(this.value)  && (!isString(this.value) ||!v.isDate(this.value))) {
    this.addError(tip || this.key + " is not a date format.");
  }
  return this;
};
Validator.prototype.isTime = function(tip) {
  var timeReg = /^(([0-1]?[0-9])|([2][0-3])):([0-5]?[0-9])(:([0-5]?[0-9]))?$/;
  if(this.goOn && ! timeReg.test(this.value)){
    this.addError(tip || this.key + " is not a time format.");
  }
  return this;
};

Validator.prototype.isAfter = function(d, tip) {
  if (this.goOn && (!isString(this.value) ||!v.isAfter(this.value, d))) {
    this.addError(tip || this.key + " must after " + d + ".");
  }
  return this;
};
Validator.prototype.isBefore = function(d, tip) {
  if (this.goOn && (!isString(this.value) ||!v.isBefore(this.value, d))) {
    this.addError(tip || this.key + " must before " + d + ".");
  }
  return this;
};
Validator.prototype.isCreditCard = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isCreditCard(this.value))) {
    this.addError(tip || this.key + " is not credit card format.");
  }
  return this;
};
Validator.prototype.isISBN = function(tip,version) {
  if (this.goOn && (!isString(this.value) ||!v.isISBN(this.value,version))) {
    this.addError(tip || this.key + " is not a ISBN format.");
  }
  return this;
};
Validator.prototype.isJSON = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isJSON(this.value))) {
    this.addError(tip || this.key + " is not a json format.");
  }
  return this;
};

Validator.prototype.isMultibyte = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isMultibyte(this.value))) {
    this.addError(tip || this.key + " is not a multibyte string.");
  }
  return this;
};
Validator.prototype.isAscii = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isAscii(this.value))) {
    this.addError(tip || this.key + " is not a ascii string.");
  }
  return this;
};
Validator.prototype.isFullWidth = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isFullWidth(this.value))) {
    this.addError(tip || this.key + " is not a full width string.");
  }
  return this;
};
Validator.prototype.isHalfWidth = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isHalfWidth(this.value))) {
    this.addError(tip || this.key + " is not a half width string.");
  }
  return this;
};
Validator.prototype.isVariableWidth = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isVariableWidth(this.value))) {
    this.addError(tip || this.key + " is not a variable width string.");
  }
  return this;
};
Validator.prototype.isSurrogatePair = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isSurrogatePair(this.value))) {
    this.addError(tip || this.key + " is not a surrogate pair string.");
  }
  return this;
};
Validator.prototype.isCurrency = function(tip,options) {
  if (this.goOn && (!isString(this.value) ||!v.isCurrency(this.value,options))) {
    this.addError(tip || this.key + " is not a currency format.");
  }
  return this;
};
Validator.prototype.isDataURI = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isDataURI(this.value))) {
    this.addError(tip || this.key + " is not a data uri format.");
  }
  return this;
};
Validator.prototype.isMobilePhone = function(tip,locale) {
  if (this.goOn && (!isString(this.value) ||!v.isMobilePhone(this.value,locale))) {
    this.addError(tip || this.key + " is not a mobile phone format.");
  }
  return this;
};
Validator.prototype.isISO8601 = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isISO8601(this.value))) {
    this.addError(tip || this.key + " is not a ISO8601 string format.");
  }
  return this;
};
Validator.prototype.isMACAddress = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isMACAddress(this.value))) {
    this.addError(tip || this.key + " is not a MAC address format.");
  }
  return this;
};

Validator.prototype.isISIN = function(tip) {
  if (this.goOn && (!isString(this.value) ||!v.isISIN(this.value))) {
    this.addError(tip || this.key + " is not a ISIN format.");
  }
  return this;
};
Validator.prototype.isFQDN = function(tip,options) {
  if (this.goOn && (!isString(this.value) ||!v.isFQDN(this.value,options))) {
    this.addError(tip || this.key + " is not a fully qualified domain name format.");
  }
  return this;
};


//Sanitizers
Validator.prototype.default = function(d) {
  if(!this.hasError()&&!this.value){
    this.value = this.params[this.key] = d;
  }
  return this;
};
Validator.prototype.toDate = function() {
  this.isDate();
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.toDate(this.value);
  }
  return this;
};
Validator.prototype.toInt = function(tip, radix, options) {
  this.isInt(tip, options);
  if (this.goOn && !this.hasError()) {
    if('number' == typeof(this.value)) {
      return this;
    }
    this.value = this.params[this.key] = v.toInt(this.value, radix);
  }
  return this;
};
Validator.prototype.toFloat = function(tip) {
  this.isFloat(tip);
  if (this.goOn && !this.hasError()) {
    if('number' == typeof(this.value)) {
      return this;
    }
    this.value = this.params[this.key] = v.toFloat(this.value);
  }
  return this;
};
Validator.prototype.toJson = function(tip) {
  if (this.goOn && !this.hasError()) {
    try{
      if('object' == typeof(this.value)) {
        return this;
      }
      this.value = this.params[this.key] = JSON.parse(this.value);
    }catch(e){
      this.addError(tip||'not json format');
    }
  }
  return this;
};
Validator.prototype.toLowercase = function() {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = this.value.toLowerCase();
  }
  return this;
};
Validator.prototype.toLow = Validator.prototype.toLowercase;
Validator.prototype.toUppercase = function() {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = this.value.toUpperCase();
  }
  return this;
};
Validator.prototype.toUp = Validator.prototype.toUppercase;
Validator.prototype.toBoolean = function() {
  if (this.goOn && !this.hasError()) {
    if('boolean' == typeof(this.value)) {
      return this;
    }
    if('string' == typeof(this.value)){
      this.value = this.params[this.key] = v.toBoolean(this.value);
    }
  }
  return this;
};
Validator.prototype.trim = function(c) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.trim(this.value,c);
  }
  return this;
};
Validator.prototype.ltrim = function(c) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.ltrim(this.value,c);
  }
  return this;
};
Validator.prototype.rtrim = function(c) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.rtrim(this.value,c);
  }
  return this;
};
Validator.prototype.escape = function() {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.escape(this.value);
  }
  return this;
};
Validator.prototype.stripLow = function(nl) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.stripLow(this.value, nl);
  }
  return this;
};
Validator.prototype.whitelist = function(s) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.whitelist(this.value,s);
  }
  return this;
};
Validator.prototype.blacklist = function(s) {
  if (this.goOn && !this.hasError()) {
    this.value = this.params[this.key] = v.blacklist(this.value,s);
  }
  return this;
};
Validator.prototype.encodeURI = function() {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = encodeURI(this.value);
  }
  return this;
};
Validator.prototype.decodeURI = function(tip) {
  if (this.goOn && !this.hasError()&&this.value) {
    try{
      this.value = this.params[this.key] = decodeURI(this.value);
    }catch(e){
      this.addError(tip||'bad uri to decode.');
    }
  }
  return this;
};
Validator.prototype.encodeURIComponent = function() {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = encodeURIComponent(this.value);
  }
  return this;
};
Validator.prototype.decodeURIComponent = function(tip) {
  if (this.goOn && !this.hasError()&&this.value) {
    try{
      this.value = this.params[this.key] = decodeURIComponent(this.value);
    }catch(e){
      this.addError(tip||'bad uri to decode.');
    }
  }
  return this;
};
Validator.prototype.replace = function(a,b) {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = this.value.replace(a,b);
  }
  return this;
};
Validator.prototype.encodeBase64 = function() {
  if (this.goOn && !this.hasError()&&this.value) {
    this.value = this.params[this.key] = new Buffer(this.value).toString('base64');
  }
  return this;
};
Validator.prototype.decodeBase64 = function(inBuffer ,tip) {
  if (!this.hasError()&&this.value) {
    try{
      if(inBuffer){
        this.value = this.params[this.key] = new Buffer(this.value , 'base64');
      }else{
        this.value = this.params[this.key] = new Buffer(this.value , 'base64').toString();
      }
    }catch(e){
      this.addError(tip||"bad base64 format value");
    }
  }
  return this;
};
Validator.prototype.hash = function(alg , enc) {
  if (!this.hasError()&&this.value) {
    enc = enc ||'hex';
    this.value = this.params[this.key] =require('crypto').createHash(alg).update(this.value).digest(enc);
  }
  return this;
};
Validator.prototype.md5 = function() {
  this.hash('md5');
  return this;
};
Validator.prototype.sha1 = function() {
  this.hash('sha1');
  return this;
};
Validator.prototype.clone = function(key , value) {
  if (!this.hasError()&&this.value) {
    this.value = this.params[key] = ('undefined' == typeof value?this.value:value);
    this.key = key;
  }
  return this;
};


// for json path value

Validator.prototype.check = function(fn ,tip, scope) {
  if(this.goOn && !this.hasError()&&!fn.call(scope||this,this.value,this.key,this.context)) {
    this.addError(tip||this.key+" check failed.")
  }
  return this;
}
Validator.prototype.get = function(index) {
  if (this.value) {
    this.value = this.value[index||0]
  }
  return this;
};
Validator.prototype.first = function(index) {
  return this.get(0);
};
Validator.prototype.filter = function(cb,scope) {
  if (this.value&&this.value.length>0) {
    var vs = []
    for(var i = 0 ;i<this.value.length;i++) {
      if(cb.call(scope||this,this.value[i],i,this.key,this.context)){
        vs.push(this.value[i])
      }
    }
    this.value=vs;
  }
  return this;
};

Validator.prototype.type = function(t,tip) {
  if(this.value){
    if('boolean'==t || 'string'==t|| 'number' == t || 'object' == t || 'undefined' ==t){
      if(t!=typeof(this.value)) this.addError(tip|| this.key+" is not "+t+"");
    }else if ('array' == t){
      if(!util.isArray(this.value)) this.addError(tip|| this.key+" is not array");
    }else if ('date' == t){
      if(!util.isDate(this.value)) this.addError(tip|| this.key+" is not date.");
    }else if ('null' == t){
      if(!util.isNull(this.value)) this.addError(tip|| this.key+" is not null.");
    }else if ('nullorundefined' == t.toLowerCase()){
      if(!util.isNullOrUndefined(this.value)) this.addError(tip|| this.key+" is not primitive type.");
    }else if ('primitive' == t){
      if(!util.isPrimitive(this.value)) this.addError(tip|| this.key+" is not primitive type.");
    }else{
      console.warn("not support this type check,type:'"+t+"'")
    }
  }
  return this;
};

function coFsExists(file){
  return function(done){
    fs.exists(file,function(x){
      return done(null , x);
    });
  };
}

function coFsMd(dir){
  return function(done){
    fs.mkdir(dir , done);
  };
}

function coFsIsDir(file){
  return function(done){
    fs.stat(file , function(e,r){
      done(e , r.isDirectory());
    });
  };
}

function coFsCopy(src,dst){
  return function(done){
    var srcStream = fs.createReadStream(src);
    var dstSteam = fs.createWriteStream(dst);

    srcStream.pipe(dstSteam);
    srcStream.on('end', function() {
      done();
    });
    srcStream.on('error', function(e) {
      done(e);
    });
  };
}

function coFsDel(file){
  return function(done){
    fs.unlink(file ,done);
  };
}

function*ensureDir(dir){
  if(!(yield coFsExists(dir))){
    yield ensureDir(path.dirname(dir));
    yield coFsMd(dir);
  }
}

function delFileAsync(path ,cb){
  if(!path){
    if(cb)cb();
    return;
  }
  fs.unlink(path , function(e){
    if(e){
      console.error(e);
    }
    if(cb)cb(e);
  });
}

function isGeneratorFunction(obj) {
  return obj && obj.constructor && 'GeneratorFunction' == obj.constructor.name;
}

function formatSize(size){
  if(size<1024){
    return size+" bytes";
  }else if(size>=1024 && size<1024*1024){
    return (size/1024).toFixed(2)+" kb";
  }else if(size >= 1024*1024 && size<1024*1024*1024){
    return (size/(1024*1024)).toFixed(2)+" mb";
  }else{
    return (size/(1024*1024*1024)).toFixed(2)+" gb";
  }
}

/**
use koa-body ,file object will be {type:"image/jpeg",path:"",name:"",size:"",mtile:""}
*/
function FileValidator(context, key, value, exists, params,deleteOnCheckFailed){
  Validator.call(this,context, key, value, exists, params ,true);
  this.deleteOnCheckFailed = deleteOnCheckFailed;
}
require("util").inherits(FileValidator, Validator);
module.exports.FileValidator = FileValidator;


FileValidator.prototype.notEmpty = function(tip){
  if (this.goOn && (!this.value||this.value.size<=0)) {
    this.addError(tip || "file "+ this.key + " can not be a empty file.");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value&&this.value.path);
    }
  }
  return this;
};

FileValidator.prototype.size = function(min,max,tip){
  if (this.goOn && (!this.value||this.value.size<min || this.value.size>max)) {
    this.addError(tip || "file "+(this.value && this.value.name||this.key) + "' length must between "+formatSize(min)+" and "+formatSize(max)+".");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value &&this.value.path);
    }
  }
  return this;
};
FileValidator.prototype.contentTypeMatch = function(reg,tip){
  if (this.goOn && (!this.value || !reg.test(this.value.type))) {
    this.addError(tip || "file "+ (this.value && this.value.name||this.key) + " is bad format.");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value &&this.value.path);
    }
  }
  return this;
};
FileValidator.prototype.isImageContentType = function(tip){
  if (this.goOn && (!this.value || 0!==this.value.type.indexOf('image/'))) {
    this.addError(tip || "file "+ (this.value && this.value.name||this.key) + " is not a image format.");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value &&this.value.path);
    }
  }
  return this;
};
FileValidator.prototype.fileNameMatch = function(reg,tip){
  if (this.goOn && (!this.value || !reg.test(this.value.name))) {
    this.addError(tip || "file "+ (this.value && this.value.name||this.key) + " is bad file type.");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value&&this.value.path);
    }
  }
  return this;
};
FileValidator.prototype.suffixIn = function(arr,tip){
  if (this.goOn && (!this.value || -1==arr.indexOf(-1==this.value.name.lastIndexOf('.')?"":this.value.name.substring(this.value.name.lastIndexOf('.')+1)))) {
    this.addError(tip || "file "+ (this.value && this.value.name||this.key) + " is bad file type.");
    if(this.deleteOnCheckFailed){
      delFileAsync(this.value &&this.value.path);
    }
  }
  return this;
};
FileValidator.prototype.move = function*(dst,afterMove){
  if (this.goOn && this.value ) {
    yield this.copy(dst);
    yield coFsDel(this.value.path);
    if('function' == typeof afterMove){
      if(isGeneratorFunction(afterMove)){
        yield afterMove(this.value,this.key,this.context);
      }else{
        afterMove(this.value,this.key,this.context);
      }
    }
  }
  return this;
};
FileValidator.prototype.copy = function*(dst,afterCopy){
  if (this.goOn && this.value ) {
    var dstFile = dst;
    if('function' == typeof dst){
      if(isGeneratorFunction(dst)){
        dstFile = yield dst(this.value,this.key,this.context);
      }else{
        dstFile = dst(this.value,this.key,this.context);
      }
    }
    if(!(yield coFsExists(this.value.path))){
      this.addError('upload file not exists');
      return;
    }
    if(dstFile.length-1 == dstFile.lastIndexOf('/') ||dstFile.length-1 == dstFile.lastIndexOf('\\')||(yield coFsExists(dstFile)) && (yield coFsIsDir(dstFile))){
      dstFile = path.join(dstFile , path.basename(this.value.path));
    }
    yield ensureDir(path.dirname(dstFile));
    yield coFsCopy(this.value.path,dstFile);
    this.value.newPath = dstFile;
    if('function' == typeof afterCopy){
      if(isGeneratorFunction(afterCopy)){
        yield afterCopy(this.value,this.key,this.context);
      }else{
        afterCopy(this.value,this.key,this.context);
      }
    }
  }
  return this;
};
FileValidator.prototype.delete = function*(){
  if (this.goOn && this.value ) {
    yield coFsDel(this.value.path);
  }
  return this;
};
