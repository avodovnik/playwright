/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// @ts-check

const path = require('path');
const PROJECT_DIR = path.join(__dirname, '..', '..');
const fs = require('fs');
const yaml = require('yaml');
const { args } = require('commander');
const { EOL } = require('os');

// get the template for a class
const template = fs.readFileSync("./templates/interface.cs", 'utf-8')
  .replace('[PW_TOOL_VERSION]', `${__filename.substring(path.join(__dirname, '..', '..').length).split(path.sep).join(path.posix.sep)}`);

const typeMap = new Map([
  ["boolean", "bool"],
  ["boolean?", "bool?"],
  ["string", "string"],
  ["string?", "string"],
  ["number", "float"],
  ["number?", "float?"],
]);

const enumValuesMap = new Map([
  ["undefined", "Undefined"],
  ["null", "Undefined"],
  ["-Infinity", "NegativeInfinity"],
  ["-0", "NegativeZero"]
]);

const enumMap = new Map();

{
  generateChannels(process.argv[2] || '../generate_types/csharp/channel');
}

function generateChannels(location) {
  const yml = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'protocol', 'protocol.yml'), 'utf-8');
  const protocol = yaml.parse(yml);

  let checkAndMakeDir = (path) => {
    if (!fs.existsSync(path))
      fs.mkdirSync(path, { recursive: true });
  };

  const modelsDir = path.join(location, "models");
  const channelsDir = path.join(location, "channels");
  const enumsDir = path.join(location, "enums");

  checkAndMakeDir(modelsDir);
  checkAndMakeDir(channelsDir);
  checkAndMakeDir(enumsDir);

  for (const [name, value] of Object.entries(protocol)) {
    if (value.type === 'object') {
      typeMap.set(name, name);
    }
  }

  // const inherits = new Map();
  // // for (const [name, value] of Object.entries(protocol)) {
  // //   if (value.type === 'interface') {
  // //     channels.add(name);
  // //     if (value.extends)
  // //       inherits.set(name, value.extends);
  // //   }
  // // }

  for (const [name, item] of Object.entries(protocol)) {
    const translatedName = translateMemberName(item.type, name);
    console.log(`Generating ${item.type}: ${translatedName}`);
    let out = renderObject(item.type, translatedName, item, name);

    let content = template.replace('[CONTENT]', out.join(`${EOL}\t`));
    fs.writeFileSync(`${path.join(item.type === "interface" ? channelsDir : modelsDir, translatedName)}.cs`, content);
  }

  for (const [name, out] of enumMap) {
    let enumOut = [];
    enumOut.push(`public enum ${name}`);
    enumOut.push(`{`);
    enumOut.push(...out.map(t => `\t${t}`));
    enumOut.push(`}`);
    let content = template.replace('[CONTENT]', enumOut.join(`${EOL}\t`));
    fs.writeFileSync(`${path.join(enumsDir, name)}.cs`, content);
  }
}

/**
 * 
 * @param {"interface" | "object"} kind 
 * @param {string} name
 * @param {*} obj 
 * @param {string} originalName
 */
function renderObject(kind, name, obj, originalName) {
  let out = [];

  out.push(`// Generated from: ${originalName}`);
  out.push(`public partial class ${name}`);
  out.push(`{`);

  if (obj.properties)
    out.push(...renderProperties(kind, obj.properties).map(x => `\t${x}`));

  out.push(`}`);
  return out;
}

/**
 * 
 * @param {"interface" | "object"} kind 
 * @param {*} properties 
 */
function renderProperties(kind, properties) {
  let out = [];
  for (const [name, value] of Object.entries(properties)) {
    const propertyName = translateMemberName("property", name);
    if (out.length != 0)
      out.push("");

    // get the type
    const type = translateType(value, propertyName);
    out.push(`[JsonProperty("${name}")]`);
    out.push(`public ${type} ${propertyName} { get; set; }`);
  }
  return out;
}

/**
 * 
 * @param {string | object} value 
 */
function translateType(value, ownerName) {
  const isNullable = value[value.length - 1] === '?';
  if (isNullable)
    value = value.substring(0, value.length - 1);
  if (typeof value === 'string') {
    let mappedType = typeMap.get(value);
    if (mappedType)
      return mappedType;
    throw new Error(`Unknown Type: ${value}`);
  } else if (typeof value === 'object') {
    if (value.type && value.type.startsWith('enum')) {
      if (!ownerName)
        throw new Error(`Can't generate enum name for ${value}`);
      let enumName = `${ownerName}Enum`;
      registerEnum(enumName, value.literals);
    }
  }
}

/**
 * 
 * @param {"interface" | "object" | "property" | * } kind 
 * @param {*} name 
 */
function translateMemberName(kind, name) {
  if (!name) return name;
  let assumedName = name.charAt(0).toUpperCase() + name.substring(1);
  switch (kind) {
    case "interface":
      return `${assumedName}Channel`;
    default:
      return assumedName;
  }
}

/**
 * 
 * @param {string} enumName 
 * @param {string[]} values 
 */
function registerEnum(enumName, values) {
  let out = [];
  values.forEach(val => {
    if(val === null) return;
    let translatedVal = enumValuesMap.get(val) || val;
    translatedVal = translateMemberName("EnumValue", translatedVal);
    if (out.length !== 0)
      out.push("");
    out.push(`[EnumMember(Value = "${val}")]`);
    out.push(`${translatedVal},`);
  });

  enumMap.set(enumName, out);
}