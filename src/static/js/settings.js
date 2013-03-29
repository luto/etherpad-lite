/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var padutils = require('./pad_utils').padutils;
var padcookie = require('./pad_cookie').padcookie;


// Scopes: the last member is the most important and overwrites all others
var scopes = [ "local", "global", "get" ];
// Scopes in this array are ignored when figuring out the final value
var ignoredScopes = [];
// is set to true once the settings are loaded for the first time
var loaded = false;


// This array contains all available settings.
//
// Properties of each setting:
//    * name, the unique name of this setting
//    * callback, called once the the value has been changed
//    * controls, an array of things which can change this settings or
//                reflect changed made to this setting (e.g. a checkbox)
//
// Controls
//    * scope, the scope which shold be saved or loaded by this IO-Option,
//             has to be a member of the `scopes` list.
//
//    * type
//      - control, supported controls are: `<input type="checkbox">` and `<select>`
//                 Requires properties to be set: `id`
//
//      - get, the inital value should be loaded from the URL-get-parameters
//             Requires properties to be set: `name`, `checkValue`
//
//      - custom, a callback should be called when loading this setting
//                Requires properties to be set: `callback`

var settings = [
  // special settings
  {
    name: "name",
    defaultValue: null,
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "userName" }
    ]
  },
  {
    name: "userId",
    defaultValue: null,
    callback: null,
    controls: []
  },
  { name: "userColor",
    defaultValue: null,
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "userColor" }
    ]
  },
  {
    name: "language",
    defaultValue: "en",
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "lang" }
    ]
  },
  { name: "rtl",
    defaultValue: false,
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "rtl" }
    ]
  },
  { name: "ignoreGlobal",
    defaultValue: false,
    callback: null,
    controls: [
      { scope: "get",    type: "get", name: "ignoreGlobal" },
      { scope: "local",  type: "control", id: "options-ignore-global" },
    ]
  },

  // normal UI settings
  {
    name: "showAuthorColors",
    defaultValue: true,
    callback: null,
    controls: [
      { scope: "local",  type: "control", id: "options-colorscheck" },
      { scope: "global", type: "control", id: "options-colorscheck-global" },
      // needed because noColors=true means showAuthorColors=false
      { scope: "get",    type: "custom",
        callback: function()
        {
          if(typeof urlVars["noColors"] != "undefined")
            return urlVars["noColors"] == "false";
        }
      }
    ]
  },
  {
    name: "showLineNumbers",
    defaultValue: true,
    callback: null,
    controls: [
      { scope: "get",    type: "get",   name: "showLineNumbers" },
      { scope: "local",  type: "control", id: "options-linenoscheck" },
      { scope: "global", type: "control", id: "options-linenoscheck-global" }
    ]
  },
  {
    name: "useMonospaceFont",
    defaultValue: false,
    callback: null,
    controls: [
      { scope: "get",    type: "get",   name: "useMonospaceFont" },
      { scope: "local",  type: "control", id: "viewfontmenu" },
      { scope: "global", type: "control", id: "viewfontmenu-global" }
    ]
  },
  {
    name: "stickychat",
    defaultValue: false,
    callback: null,
    controls: [
      { scope: "get",    type: "get",   name: "alwaysShowChat" },
      { scope: "local",  type: "control", id: "options-stickychat" }
    ]
  },

  // pure get parameters, used for embedding, for example.
  {
    name: "showControls",
    defaultValue: true,
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "showControls" }
    ]
  },
  {
    name: "showChat",
    defaultValue: true,
    callback: null,
    controls: [
      { scope: "get", type: "get", name: "showChat" }
    ]
  }
];

var urlVars = getUrlVars();

exports.getValue = function (name)
{
  var setting = exports.getSetting(name);
  for(var i = 0; i < scopes.length; i++)
  {
    var scope = scopes[i];
    if(ignoredScopes.indexOf(scope) == -1 &&
       typeof setting.val[scope] != "undefined")
    {
      return setting.val[scope];
    }
  }
  return null;
}

exports.setValue = function (name, scope, value)
{
  if(scopes.indexOf(scope) == -1)
    throw "Unknown scope";

  var setting = exports.getSetting(name);
  setting.val[scope] = value;

  for(var i = 0; i < setting.controls.length; i++)
  {
    if(setting.controls[i].scope == scope &&
       setting.controls[i].type == "control")
    {
      setControlSettingValue(setting.controls[i], setting.name, value);
    }
  }

  if(setting.callback)
    setting.callback(setting, exports.getValue(name));
  if(loaded)
    saveToCookie();
}

exports.getSetting = function (name)
{
  for(var i = 0; i < settings.length; i++)
  {
    if(settings[i].name == name)
      return settings[i];
  }
  return null;
}

exports.exportSettings = function (scope)
{
  var out = {};

  for(var i = 0; i < settings.length; i++)
  {
    var name = settings[i].name;
    out[name] = [];

    for(var j = 0; j < scopes.length; j++)
    {
      var val = settings[i].val[scopes[j]];
      if(val && (scope == scopes[j] || !scope))
        out[name][scopes[j]] = val;
    }
  }

  return out;
}

exports.loadSettings = function (_pad)
{
  checkSettingsArray();

  for(var i = 0; i < settings.length; i++)
  {
    var setting = settings[i];
    setting.val = [];
    setting.val["local"] = setting.defaultValue;

    for(var j = 0; j < setting.controls.length; j++)
    {
      var scope = setting.controls[j].scope;

      switch(setting.controls[j].type)
      {
        case "get":
          var paramValue = urlVars[setting.controls[j].name];
          
          if(paramValue == "true") paramValue = true;
          else if(paramValue == "false") paramValue = false;
          
          if(paramValue)
            setting.val[scope] = paramValue;
          break;
        case "custom":
          setting.val[scope] = setting.controls[j].callback(setting, scope);
          break;
      }
    }

    for(var j = 0; j < scopes.length; j++)
    {
      if(typeof setting.val[scopes[j]] != "undefined")
        exports.setValue(setting.name, scopes[j], setting.val[scopes[j]]);
    }
  }

  // we finished loading, call all the callbacks
  for(var i = 0; i < settings.length; i++)
  {
    if(settings[i].callback)
      settings[i].callback(settings[i], exports.getValue(settings[i].name));
  }

  loaded = true;
  saveToCookie();
}

exports.setIgnoreScope = function (scope, ignore)
{
  if(scopes.indexOf(scope) == -1)
    throw "Scope " + scope + " does not exist.";

  var currentIndex = ignoredScopes.indexOf(scope);

  if(ignore && currentIndex == -1)
  {
    ignoredScopes.push(scope);
  }
  else if(!ignore && currentIndex != -1)
  {
    ignoredScopes.splice(currentIndex, 1);
  }
}

function checkSettingsArray()
{
  var errors = [];
  var validTypes = ["control", "get", "custom"];

  for(var i = 0; i < ignoredScopes.length; i++)
  {
    if(scopes.indexOf(ignoredScopes[i]) == -1)
      logSettingsError(errors, "ignored scope " + ignoredScopes[i] + " does not exist.");
  }

  for(var i = 0; i < settings.length; i++)
  {
    var setting = settings[i];
    var nameOkay = true;

    if(!setting.name || setting.name.length == 0)
    {
      logSettingsError(errors, "name of setting " + i + " not given");
      nameOkay = false;
    }
    if(!setting.controls)
    {
      var name = i;
      if(nameOkay) name = setting.name;
      logSettingsError(errors, "controls of setting " + name + " not given");
      continue;
    }

    for(var j = 0; j < setting.controls.length; j++)
    {
      var type = setting.controls[j].type;
      if(!type)
        logSettingsError(errors, "no type for control " + j + " in setting " + setting.name);
      if(validTypes.indexOf(type) == -1)
        logSettingsError(errors, "invalid type " + type + " for setting " + j + " in setting " + setting.name);

      var scope = setting.controls[j].scope;
      if(!scope)
        logSettingsError(errors, "no scope for control " + j + " in setting " + setting.name);
      if(scopes.indexOf(scope) == -1)
        logSettingsError(errors, "invalid scope " + type + " for control " + j + " in setting " + setting.name);

      if(type == "control")
      {
        var id = setting.controls[j].id;
        if(!id || id.length == 0)
          logSettingsError(errors, "ID of control for control " + j + " in setting " + setting.name + " not given");
      }
      else if(type == "get")
      {
        var name = setting.controls[j].name;
        if(!name || name.length == 0)
          logSettingsError(errors, "Name of get-parameter for control " + j + " in setting " + setting.name + " not given");
      }
      else if(type == "custom")
      {
        var cb = setting.controls[j].callback;

        if(!cb)
          logSettingsError(errors, "Callback for control " + j + " in setting " + setting.name + " not given");
        else if(typeof(cb) != "function")
          logSettingsError(errors, "Callback for control " + j + " in setting " + setting.name + " is not a function");
      }
    }
  }

  if(errors != 0)
  {
    throw "Errors occurred when checking the setting-definitions. Check the log.";
  }
}

function saveToCookie()
{
  var exported = exports.exportSettings("local");
  padcookie.saveCookie("epl_prefs", exported);
}

function logSettingsError(errors, msg)
{
  msg = "settings error: " + msg;
  errors.push(msg);
  console.log(msg);
}

function setControlSettingValue(setting, name, value)
{
  var control = $("#" + setting.id);
  var tagName = control.prop("tagName").toLowerCase();

  if(control.length == 0)
    throw "settings error: control #" + setting.id + " used in setting " + name + " does not exist";

  switch(tagName)
  {
    case "input":
      if(control.attr("type") != "checkbox")
        throw "settings error: only checkboxes are supported (setting: " + name + ")";
      padutils.setCheckbox(control[0], value);
      break;
    case "select":
      control.val(value);
      break;
    default:
      throw "settings error: unsuppored control #" + setting.id + " (" + tagName + ")";
  }
}

function getUrlVars()
{
  var vars = [], hash;
  var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
  for(var i = 0; i < hashes.length; i++)
  {
    hash = hashes[i].split('=');
    vars.push(hash[0]);
    vars[hash[0]] = hash[1];
  }
  return vars;
}
