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
const os = require('os');
const devices = require('../../src/server/deviceDescriptors');
const Documentation = require('./documentation');
const PROJECT_DIR = path.join(__dirname, '..', '..');
const fs = require('fs');
const { parseApi } = require('./api_parser');
const { render } = require('../markdown');

let documentation;

{
  const typesDir = path.join(PROJECT_DIR, 'types');
  if (!fs.existsSync(typesDir))
    fs.mkdirSync(typesDir)
  // writeFile(path.join(typesDir, 'protocol.d.ts'), fs.readFileSync(path.join(PROJECT_DIR, 'src', 'server', 'chromium', 'protocol.ts'), 'utf8'));
  documentation = parseApi(path.join(PROJECT_DIR, 'docs', 'src', 'api'));
  documentation.filterForLanguage('csharp');
  documentation.copyDocsFromSuperclasses([]);

  // documentation.setLinkRenderer(item => {
  //   // TODO: this should probably do something smarter
  //   return
  // });

  // get the template for a class
  const template = fs.readFileSync("./templates/interface.cs", 'utf-8')
    .replace('[PW_TOOL_VERSION]', `${__filename.substring(path.join(__dirname, '..', '..').length).split(path.sep).join(path.posix.sep)}`);

  // fs.mkdirSync('../generate_types/csharp');
  documentation.classes.forEach(element => {
    if (element.name !== "Page") {
      return;
    }
    console.log(`Generating ${element.name}`);

    const out = [];

    // map the name to a C# friendly one (we prepend an I to denote an interface)
    let name = translateMemberName('interface', element.name, undefined);

    let docs = renderXmlDoc(element.spec, 80);

    Array.prototype.push.apply(out, docs);

    out.push(`public interface ${name}`);
    out.push('{');

    const members = generateMembers(element);
    // generate the members
    out.push(...members);

    out.push('}');


    let content = template.replace('[CONTENT]', out.join("\n\t"));
    fs.writeFileSync(`../generate_types/csharp/${name}.cs`, content);
  });
}

/**
 * @param {Documentation.MarkdownNode[]} nodes
 * @param {number=} maxColumns
 */
function renderXmlDoc(nodes, maxColumns) {
  const summary = [];
  const examples = [];
  let lastNode;

  summary.push('<summary>');
  for (let node of nodes) {
    lastNode = innerRenderXmlNode('///', node, lastNode, summary, examples, maxColumns);
  }
  summary.push('</summary>');

  // add examples
  summary.push(...examples);
  return summary.map(n => `/// ${n}`);
}

/**
 * @param {string} indent
 * @param {Documentation.MarkdownNode} node
 * @param {Documentation.MarkdownNode} lastNode
 * @param {number=} maxColumns
 * @param {string[]} summary
 * @param {string[]} examples
 */
function innerRenderXmlNode(indent, node, lastNode, summary, examples, maxColumns) {
  /** @param {string[]} a */
  const newLine = (a) => {
    if (a[a.length - 1] !== '')
      a.push('');
  };

  // documentation.renderLinksInText([ node ]);

  let escapedText = node.text;
  // resolve links (within [])

  if (node.type === 'text') {
    // clear up the list, if there was one
    if (lastNode && lastNode.type === 'li') {
      summary.push('</list>');
    }

    summary.push(...wrapText(escapedText, maxColumns));

    return lastNode;
  }

  if (node.type === 'li') {
    if (escapedText.startsWith('extends: ')) {
      summary.push(...wrapText(`<seealso cref="${escapedText.substring(9)}"/>`, maxColumns));
      return undefined;
    }
    // if the previous node was no li, start list
    if (lastNode && lastNode.type !== 'li') {
      summary.push(`<list>`);
    }

    summary.push(...wrapText(`<item><description>${escapedText}</description></item>`, maxColumns));
  }

  return lastNode;
}

/**
 * @param {string} text
 */
function tokenizeNoBreakLinks(text) {
  const links = [];1
  // Don't wrap simple links with spaces.
  text = text.replace(/\[[^\]]+\]/g, match => {
    links.push(match);
    return `[${links.length - 1}]`;
  });
  return text.split(' ').map(c => c.replace(/\[(\d+)\]/g, (_, p1) => links[+p1]));
}

/**
 * @param {string} text
 * @param {number=} maxColumns
 * @param {string=} prefix
 */
function wrapText(text, maxColumns = 0, prefix = '') {
  if (!maxColumns)
    return prefix + text;
  if (text.trim().startsWith('|'))
    return prefix + text;
  const indent = ' '.repeat(prefix.length);
  const lines = [];
  maxColumns -= indent.length;
  const words =  tokenizeNoBreakLinks(text);
  let line = '';
  for (const word of words) {
    if (line.length && line.length + word.length < maxColumns) {
      line += ' ' + word;
    } else {
      if (line)
        lines.push(line);
      line = (lines.length ? indent : prefix) + word;
    }
  }
  if (line)
    lines.push(line);
  return lines;
}

/**
 * @param {string} memberKind  
 * @param {string} name 
 * @param {Documentation.Member} member */
function translateMemberName(memberKind, name, member) {

  // check if there's an alias in the docs, in which case
  // we return that, otherwise, we apply our dotnet magic to it
  if (member) {
    if (member.alias !== name) {
      return member.alias;
    }
  }

  let assumedName = name.charAt(0).toUpperCase() + name.substring(1);
  switch (memberKind) {
    case "interface":
      return `I${assumedName}`;
    case "method":
      return `${assumedName}Async`;
    case "event":
      return `On${assumedName}`;
    default:
      return `${name}-UN`;
  }
}

/** @param {Documentation.Type} type */
function translateType(type) {
  if (type.union) {
    if (type.union[0].name === 'null') {
      // for dotnet, this is a nullable type
      // unless it's something like a string
      const typeName = type.union[1].name;

      if (typeName === 'string'
        || typeName === 'int') {
        return typeName;
      }

      return `${typeName}?`;
    }
  }

  return type.name;
}

/** @param {Documentation.Class} member */
function generateMembers(member) {
  const out = [];

  /**** METHODS  ***/
  member.methodsArray.forEach(method => {
    let name = translateMemberName(method.kind, method.name, method);
    let returnType = "Task";

    if (method.type.name !== 'void') {
      returnType = `Task<${translateType(method.type)}>`;
    }

    // out.push(...generateXmlDoc(method.spec));

    out.push(`${returnType} ${name}();`);
    out.push('');
  });

  /**** EVENTS  ****/
  member.eventsArray.forEach(event => {

    //  out.push(...generateXmlDoc(event.spec));

    let eventType = event.type.name !== 'void' ? `EventHandler<${event.type.name}>` : `EventHandler`;
    out.push(`public event ${eventType} ${translateMemberName(event.kind, event.name, event)};`);
    out.push(''); // we want an empty line in between
  });

  return out.map(e => `\t${e}`);
}