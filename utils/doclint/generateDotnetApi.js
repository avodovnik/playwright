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
const Documentation = require('./documentation');
const XmlDoc = require('./xmlDocumentation')
const PROJECT_DIR = path.join(__dirname, '..', '..');
const fs = require('fs');
const { parseApi } = require('./api_parser');
// const { visitAll } = require('../markdown'); // TODO: consider using this instead of manual parsing

const maxDocumentationColumnWidth = 120;

/** @type {Map<string, Documentation.Type>} */
const additionalTypes = new Map(); // this will hold types that we discover, because of .NET specifics, like results
/** @type {Map<string, string[]>} */
const enumTypes = new Map();

let documentation;
/** @type {Map<string, string>} */
let classNameMap;

{
  const typesDir = process.argv[2] || '../generate_types/csharp/';
  console.log(typesDir);
  if (!fs.existsSync(typesDir))
    fs.mkdirSync(typesDir)

  documentation = parseApi(path.join(PROJECT_DIR, 'docs', 'src', 'api'));
  documentation.filterForLanguage('csharp');
  documentation.copyDocsFromSuperclasses([]);

  documentation.setLinkRenderer(item => {
    if (item.clazz) {
      return `<see cref="${translateMemberName("interface", item.clazz.name, null)}"/>`;
    } else if (item.member) {
      return `<see cref="${translateMemberName("interface", item.member.clazz.name, null)}.${translateMemberName(item.member.kind, item.member.name, item.member)}"/>`;
    } else if (item.option) {
      return "{OPTION}";
    } else if (item.param) {
      return "{PARAM}";
    }
  });

  // get the template for a class
  const template = fs.readFileSync("./templates/interface.cs", 'utf-8')
    .replace('[PW_TOOL_VERSION]', `${__filename.substring(path.join(__dirname, '..', '..').length).split(path.sep).join(path.posix.sep)}`);

  // we have some "predefined" types, like the mixed state enum, that we can map in advance
  enumTypes.set("MixedState", ["On", "Off", "Mixed"]);

  // map the name to a C# friendly one (we prepend an I to denote an interface)
  // let name = translateMemberName('interface', element.name, undefined);
  classNameMap = new Map(documentation.classesArray.map(x => [x.name, translateMemberName('interface', x.name, null)]));

  let writeFile = (name, out) => {
    let content = template.replace('[CONTENT]', out.join("\n\t"));
    fs.writeFileSync(`${path.join(typesDir, name)}.cs`, content);
  }

  /**
   * 
   * @param {string} kind 
   * @param {string} name 
   * @param {Documentation.MarkdownNode[]} spec
   * @param {Function} callback 
   */
  let innerRenderElement = (kind, name, spec, callback) => {
    const out = [];
    console.log(`Generating ${name}`);

    out.push(...XmlDoc.renderXmlDoc(spec, maxDocumentationColumnWidth));
    out.push(`public ${kind} ${name}`);
    out.push('{');

    callback(out);

    out.push('}');

    writeFile(name, out);
  };

  for (const element of documentation.classesArray) {
    const name = classNameMap.get(element.name);
    innerRenderElement('interface', name, element.spec, (out) => {
      for (const member of element.membersArray) {
        renderMember(member, element, out);
      }
    });
  }

  additionalTypes.forEach((type, name) => {
    innerRenderElement('class', name, [], (out) => {

      // TODO: consider how this could be merged with the `translateType` check
      if (type.union
        && type.union[0].name === 'null'
        && type.union.length == 2) {
        type = type.union[1];
      }

      if (type.name === 'Array') {
        out.push('// Array');
      } else if (type.properties) {
        for (const member of type.properties) {
          renderMember(member, null, out);
        }
      } else {
        console.log(type);
        out.push(`// HEEELP`);
      }
    });
  });

  // // go over the additional types that we registered in the process
  // additionalTypes.forEach((type, name) => {
  //   console.log(`Generating ${name}`);

  //   const out = [];

  //   out.push(`public partial class ${name}`);
  //   out.push(`{`);


  //   const properties = type.name === 'Array' && type.templates ? generateProperties(type.templates[0]) : generateProperties(type);
  //   out.push(...properties);

  //   out.push(`}`);

  //   let content = template.replace('[CONTENT]', out.join("\n\t"));
  //   fs.writeFileSync(`${path.join(typesDir, name)}.cs`, content);
  // });

  // enumTypes.forEach((values, enumName) => {
  //   console.log(`Generating ${enumName}`);

  //   const out = [];

  //   out.push(`public enum ${enumName}`);
  //   out.push(`{`);

  //   values.forEach(val => {
  //     out.push(`\t${val},`);
  //   });

  //   out.push(`}`);

  //   let content = template.replace('[CONTENT]', out.join("\n\t"));
  //   fs.writeFileSync(`${path.join(typesDir, enumName)}.cs`, content);
  // });
}

/**
 * @param {string} memberKind  
 * @param {string} name 
 * @param {Documentation.Member} member */
function translateMemberName(memberKind, name, member) {
  if (memberKind === 'argument') {
    if (name === 'params') { // just in case we want to add others
      return `@${name}`;
    } else {
      return name;
    }
  }
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
      if (member && member.async)
        return `${assumedName}Async`;
      return assumedName;
    case "event":
      return `On${assumedName}`;
    case "enum":
      return `${assumedName}`;
    default:
      return `${assumedName}`;
  }
}

/**
 * 
 * @param {Documentation.Member} member 
 * @param {Documentation.Class} parent 
 * @param {string[]} out
 */
function renderMember(member, parent, out) {
  let output = line => out.push(`\t${line}`);
  let name = translateMemberName(member.kind, member.name, member);
  if (name === 'OnHeaders')
    throw 'AAA';
  let type = translateType(member.type, parent);

  if (member.kind === 'event') {
    if (!member.type)
      throw `No Event Type for ${name} in ${parent.name}`;
    // console.log(member.type);
    output(`event EventHandler<${type}> ${name};`);
  } else if (member.kind === 'property') {
    output(`${type} ${name} { get; set; }`);
    return
  } else if (member.kind === 'method') {
    // TODO: this is something that will probably go into the docs
    if (member.args.size == 0
      && type !== 'void'
      && !name.startsWith('Is')) {
      name = `Get${name}`;
    }

    // HACK: special case for generics handling!
    if (type === 'T') {
      name = `${name}<T>`;
    }

    // TODO: if the return method is an Object, we need to generate the object
    if (type === 'Object') {
      if (member.type.expression === '[Object]<[string], [string]>') {
        type = `IEnumerable<KeyValuePair<string, string>>`;
      } else if (!member.type.properties) {
        type = `object`;
      } else {
        type = `${parent.name}${member.name}Result`;
        additionalTypes.set(type, member.type);
        console.log(`Registering additional type: ${type}...`);
      }
    }

    // adjust the return type for async methods
    if (member.async)
      if (type === 'void')
        type = `Task`;
      else
        type = `Task<${type}>`;

    // render args
    let args = [];
    let parseArg = (/** @type {Documentation.Member} */ arg) => {
      if (arg.name === "options") {
        arg.type.properties.forEach(prop => {
          parseArg(prop);
        });
        return;
      }

      const argType = translateType(arg.type, parent);
      const argName = translateMemberName('argument', arg.name, null);

      args.push(`${argType} ${argName}`);
    };

    member.args.forEach(parseArg);

    output(`${type} ${name}(${args.join(', ')});`);
  } else {
    throw `Problem rendering a member: ${type} - ${name} (${member.kind})`; output(`// ${type} - ${name} (${member.kind})`);
  }
}


/**
 *  @param {Documentation.Type} type 
*/
function translateType(type, parent) {
  if (type.union) {
    if (type.union[0].name === 'null') {
      // for dotnet, this is a nullable type
      // if the other side is a primitive type
      if (type.union.length > 2)
        throw `Union (${parent.name}) with null is too long.`;

      const innerTypeName = translateType(type.union[1]);
      // if type is primitive, or an enum, then it's nullable
      if (innerTypeName === 'bool'
        || innerTypeName === 'int') {
        return `${innerTypeName}?`;
      }

      // if it's not a value type, it'll be nullable by default, so we can ignore it
      return `${innerTypeName}`;
    }

    return `Union`;
    // throw `Not sure how to parse union ${type.name} in ${parent.name}`;
  }

  if (type.name === 'Array') {
    if (type.templates.length != 1)
      throw `Array (${type.name} from ${parent.name}) has more than 1 dimension. Panic.`;

    let innerType = translateType(type.templates[0], parent);
    return `${innerType}[]`;
  }

  if (type.name === 'boolean')
    return 'bool';

  if (type.name === 'Serializable')
    return 'T';

  if (type.name === 'Buffer')
    return 'byte[]';

  if (type.name === 'Object') {
    // this is an additional type that we need to generate
  }

  // there's a chance this is a name we've already seen before, so check
  let name = classNameMap.get(type.name) || type.name;
  return `${name}`;
}













/**
 *  @param {Documentation.Type} type 
 *  @param {Documentation.Member} parent
 *  @returns {string}
 * */
function _translateType(type, parent) {
  if (type.union) {
    if (type.union[0].name === 'null') {
      // for dotnet, this is a nullable type
      // unless it's something like a string
      const typeName = _translateType(type.union[1], parent);

      if (typeName === 'string'
        || typeName === 'int') {
        return typeName;
      }

      return `${typeName}?`;
    } else {

      let unionMap = type.union.map(u => _translateType(u, parent));
      console.log(unionMap);

      return translateAndRegisterUnion(type, parent);
    }
  }

  if (type.name === 'Array') {
    return `${type.templates[0].name}[]`;
  }

  if (type.templates) {
    if (type.templates.length == 2 && type.templates[0].name === "string" && type.templates[1].name === "string") {
      return "IList<KeyValuePair<string, string>>";
    }
    console.log(`${parent.name}:`);
    console.log(type.templates);
    return "AAAARRRGH";
  }

  // apply some basic rules
  if (type.name === 'boolean') {
    return 'bool';
  }

  /** @param {string} */
  return type.name;
}

/**
 * A union in dotnet world, when it's a mix of strings only, maps to an enum. Otherwise, 
 * it most likely maps to a nullable object (Union of null and object).
 * @param {Documentation.Type} parentType
 * @param {Documentation.Member} parentMember
 */
function translateAndRegisterUnion(parentType, parentMember) {
  let union = parentType.union;

  // we have some predetermined unions that we can map to "smarter" objects
  if (union.length == 2 && union[0].name === 'boolean' && union[1].name === '"mixed"') {
    return "MixedState";
  }

  if (union.filter(x => x.name.startsWith('"')).length == union.length) { // this is an enum 
    // check if there's an enum already registered with this name
    let enumName = translateMemberName('enum', parentMember ? parentMember.name : `${parentType.name}`, null);
    let potentialEnum = enumTypes.get(enumName);
    let enumValues = union.map(u => u.name.replace('"', ''));
    // if (!potentialEnum) {
    //   enumTypes.set(enumName, enumValues);
    // } else {
    //   // we should double check the enum exists, and if it's not the same, we panic (merge?)
    //   if (potentialEnum.join(',') !== enumValues.join(',')) {
    //     throw `Enums have the same name, but not the same values. ${enumName}: ${potentialEnum.join(', ')} vs ${enumValues}`;
    //   }
    // }

    // return `Union<${union.map(x => x.name).join(", ")}>`;
    return enumName;
  }

  //return `SomethingSpecial<${union.map(u => u.name).join(', ')}>`;
  return null;
}

/**
 *    @param {Documentation.Member} member 
 *    @returns {string}
*/
function generateReturnType(member) {
  let innerReturnType = _translateType(member.type, member);

  if (innerReturnType && innerReturnType.startsWith('Object')) {
    // if the return type is an Object, we should generate a new one where the name is a combination of
    // the onwer class, method and Result, i.e. [Accessibility][Snapshot][Result].  
    const typeName = `${member.clazz.name}${translateMemberName('', member.name, null)}Result`;
    innerReturnType = innerReturnType.replace('Object', typeName);
    // we need to register
    if (member.type.name === 'union') {
      if (member.type.union[0].name === 'null') {
        additionalTypes.set(typeName, member.type.union[1]);
      } else {
        console.log(`Not sure what to do here. Investigate: ${typeName} with ${member.type.union[0].name}`);
      }
    } else {
      additionalTypes.set(typeName, member.type);
    }
  }

  return innerReturnType;
}

/** @param {Documentation.Class} member */
function generateMembers(member) {
  const out = [];

  console.log(member.members);
  /**** METHODS  ***/
  member.methodsArray.forEach(method => {
    let name = translateMemberName(method.kind, method.name, method);
    let returnType = "Task";


    if (method.deprecated) {
      out.push(`[Obsolete]`);
    }

    if (method.type.name !== 'void') {
      returnType = `Task<${generateReturnType(method)}>`;
    }

    out.push(...XmlDoc.renderXmlDoc(method.spec, maxDocumentationColumnWidth));

    method.argsArray.forEach(arg => {
      let argType = _translateType(arg.type, arg);
      out.push(`// -- ${argType} ${arg.name}`);
      // if (arg.type.name !== "options") {
      //   if (arg.type.properties) {
      //     arg.type.properties.forEach(opt => {
      //       let paramType = _translateType(opt.type, opt);
      //       out.push(`// ---- ${paramType} ${opt.name}`);
      //     });
      //   } else {
      //     throw `Missing Properties on an option ${arg.type.name}`;
      //   }
      // } else {
      //   out.push(`// ${arg.alias || arg.type.name} ${arg.name}`);
      // }
    });

    out.push(`${returnType} ${name}();`);
    out.push('');
  });

  /**** EVENTS  ****/
  member.eventsArray.forEach(event => {

    out.push(...XmlDoc.renderXmlDoc(event.spec, maxDocumentationColumnWidth));

    let eventType = event.type.name !== 'void' ? `EventHandler<${event.type.name}>` : `EventHandler`;
    out.push(`public event ${eventType} ${translateMemberName(event.kind, event.name, event)};`);
    out.push(''); // we want an empty line in between
  });

  return out.map(e => `\t${e}`);
}

/** @param {Documentation.Type} type */
function generateProperties(type) {
  const out = [];

  if (!type.properties) {
    return out;
  }

  type.properties.forEach(property => {
    if (out.length > 0) {
      out.push(``);
    }

    const name = translateMemberName('property', property.name, null);

    const docs = XmlDoc.renderXmlDoc(property.spec, maxDocumentationColumnWidth);
    if (property.type.union && property.type.union[0].name !== "null" && !property.type.union[1].name.startsWith('"')) {
      // we need to actually split this into multiple properties
      property.type.union.forEach(unionType => {
        out.push(...docs);
        out.push(`public ${_translateType(unionType, property)} ${name}As${translateMemberName('union', unionType.name, null)} { get; set; }`)
      });
    } else {
      out.push(...docs);
      out.push(`public ${_translateType(property.type, property)} ${name} { get; set; }`)
    }
  });

  return out.map(e => `\t${e}`);
}