// Read the runtime tables, including the nine support-building fragments added in TypeScript.
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {getAllProps}=require('../src/core/config/PropConfig.ts');
const {getItemIconKey}=require('../src/phaser/config/ItemIconMap.ts');
module.exports=getAllProps().map(p=>{
  const key=getItemIconKey(p.id,{exists:k=>fs.existsSync(`assets/generated/${k}.png`)});
  return {...p,reference:key&&fs.existsSync(`assets/generated/${key}.png`)?`assets/generated/${key}.png`:null};
});
