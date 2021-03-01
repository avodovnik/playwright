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

{
  generateChannels(process.argv[2] || '../generate_types/csharp/channel');
}

function generateChannels(location) {
  const yml = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'protocol', 'protocol.yml'), 'utf-8');
  const protocol = yaml.parse(yml);


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
    console.log(`Genearing ${item.type}: ${translatedName}`);
    renderObject(item.type, item);
  }
}

/**
 * 
 * @param {"interface" | "object"} kind 
 * @param {*} obj 
 */
function renderObject(kind, obj) {
  let out = [];
  if (obj.properties)
    out.push(...renderProperties(kind, obj.properties));
  let writeFile = (name, out, folder) => {
    let content = template.replace('[CONTENT]', out.join(`${EOL}\t`));
    fs.writeFileSync(`${path.join(folder, name)}.cs`, content);
  }
}

/**
 * 
 * @param {"interface" | "object"} kind 
 * @param {*} properties 
 */
function renderProperties(kind, properties) {
  let out = [];
  for (const [name, value] of Object.entries(properties)) {
    console.log(`Property: ${name} (of type: ${value})`);
  }
  return out;
}

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