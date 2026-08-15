const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'import-reviewed-icons.js');
const result = JSON.parse(execFileSync(process.execPath, [script, '--check', '--json'], { encoding: 'utf8' }));

assert.equal(result.mapped, 322);
assert.equal(result.missingSources.length, 0);
assert(result.mapping.some(item => item.id === 10013 && item.source.endsWith('L02.png')));
assert(result.mapping.some(item => item.id === 50035 && item.source.includes('第二张') && item.source.endsWith('L05.png')));
console.log('reviewed icon mapping check passed');
