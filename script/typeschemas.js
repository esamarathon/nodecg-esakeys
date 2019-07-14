/* eslint-disable no-console */
const { compileFromFile } = require('json-schema-to-typescript');
const fs = require('fs');

console.log('configschema');
compileFromFile('./configschema.json').then(ts => fs.writeFileSync('./configschema.d.ts', ts));
