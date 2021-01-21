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

/** @typedef {{
 *    type: 'summary' | 'list' | 'example' | 'remarks',
 *    text?: string[],
 *    items?: string[],
 *    render: function(DocNode, string):string[],
 * }} DocNode */

/**
 * 
 * @param {import('../markdown').MarkdownNode[]} nodes 
 */
function generateXmlDoc(nodes) {
  /** @type {DocNode[]} */
  let out = [];
  
  /** @type {DocNode} */
  let summary = {
    type: 'summary',
    items: [],
    render: function(summaryNode, prefix) {
      /** @type {string[]} **/
      let render = [];
      render.push(`${prefix}<summary>`);
      render.push(...summaryNode.items.flatMap(t => `${prefix}${t}`));
      render.push(`${prefix}</summary>`);

      return render;
    }
  };

  nodes.forEach(node => {

    /** @type {DocNode} **/
    let lastItem = out.pop();

    switch (node.type ) {
      case 'text':
        if(node.text) {
          summary.items.push(node.text);
        }
        break;
      case 'li':
        // check if we already have a list item in the array (last)
        // if a summary object does not exist, we add it now        
        // if(!lastItem || lastItem.type !== 'list') {
        //   if(lastItem) {
        //     // push it back
        //     out.push(lastItem);
        //   }

        //   lastItem = {
        //     type: 'list',
        //     items: [],
        //     render: function(listNode, prefix) {
        //        /** @type {string[]} **/
        //        let render = [];
        //        render.push(`${prefix}<list>`);
        //        render.push(`${prefix}${listNode.items.map(i => `${prefix}${i}`).join(`\n`)}`);               render.push(`${prefix}</list>`);
        //        return render;
        //     }
        //   };
        // }

        // lastItem.items.push(`<item><description>${node.text}</description></item>`);
        // out.push(lastItem);
        break;
      case 'code':
        break;
      case 'note':
        break;
      default:
        // properties, h0...h4
        break;
    } 
  });

  out.push(summary);

  /** @type DocNode **/
  return out.flatMap(root => root.render(root, "/// "));
}

(async function() {
    const typesDir = path.join(PROJECT_DIR, 'types');
    if (!fs.existsSync(typesDir))
      fs.mkdirSync(typesDir)
    // writeFile(path.join(typesDir, 'protocol.d.ts'), fs.readFileSync(path.join(PROJECT_DIR, 'src', 'server', 'chromium', 'protocol.ts'), 'utf8'));
    documentation = parseApi(path.join(PROJECT_DIR, 'docs', 'src', 'api'));
    documentation.filterForLanguage('csharp');
    documentation.copyDocsFromSuperclasses([]);

    const createMemberLink = (text) => {
      const anchor = text.toLowerCase().split(',').map(c => c.replace(/[^a-z]/g, '')).join('-');
      return `[${text}](https://github.com/microsoft/playwright/blob/master/docs/api.md#${anchor})`;
    };

    // get the template for a class
    let template = fs.readFileSync("./templates/interface.cs", 'utf-8');
    template = template.replace('[PW_TOOL_VERSION]', `${__filename.substring(path.join(__dirname, '..', '..').length).split(path.sep).join(path.posix.sep)}`);

    // fs.mkdirSync('../generate_types/csharp');
    documentation.classes.forEach(element => {
      console.log(`Generating ${element.name}`);
      
      const out = [];

      // map the name to a C# friendly one (we prepend an I to denote an interface)
      let name = `I${element.name}`;

      let docs = generateXmlDoc(element.spec);
      
      Array.prototype.push.apply(out, docs);

      out.push(`public interface ${name}`);
      out.push('{');
      out.push('}');

      
      let content = template.replace('[CONTENT]', out.join("\n\t"));
      fs.writeFileSync(`../generate_types/csharp/${name}.cs`, content);
    });

})();