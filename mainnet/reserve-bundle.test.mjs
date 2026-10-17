import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=mkdtempSync(join(tmpdir(),'reserve-build-check-'));
const output=join(directory,'bundle'),artifact=join(output,'reserve-byte-stdio.mjs');
const builder=fileURLToPath(new URL('./build-reserve-bundle.mjs',import.meta.url));
const options={cwd:directory,env:{PATH:process.env.PATH},encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let manifest,bytes;
before(()=>{
 const r=spawnSync(process.execPath,[builder,output],options);
 assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');
 manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));bytes=readFileSync(artifact);
 assert.equal(JSON.parse(r.stdout).sha256,hash(bytes));
});
after(()=>rmSync(directory,{recursive:true,force:true}));
test('built adapter runs all selected transport fixtures outside the checkout',()=>{
 assert.equal(manifest.artifact.sha256,hash(bytes));assert.equal(manifest.artifact.bytes,bytes.length);
 assert.equal(manifest.build.localRebuildIdentical,true);assert.equal(manifest.nativeAddonLoadersExcluded,true);
 assert.equal(manifest.commonJSImportsRestrictedToBuiltins,true);
 for(const key of ['artifactAdmitted','preparerIntegrated','canSign','canBroadcast','mainnetActivated','productionReady'])assert.equal(manifest[key],false);
 assert(!Object.keys(manifest.inputs).some(p=>/node-gyp-build|\/bufferutil\/|\/utf-8-validate\//.test(p)));
 assert.deepEqual(readdirSync(output).sort(),['manifest.json','reserve-byte-stdio.mjs']);
 const suite=fileURLToPath(new URL('./reserve-byte-input.test.mjs',import.meta.url));
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',suite],{...options,env:{PATH:process.env.PATH,RESERVE_TEST_ARTIFACT:artifact}});
 assert.ifError(r.error);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.stderr,'');
 assert.match(r.stdout,/# tests 23\b/);assert.match(r.stdout,/# pass 23\b/);assert.match(r.stdout,/# fail 0\b/);
});
test('generated CommonJS import guard refuses package and file resolution before execution',async()=>{
 const unexpected=join(directory,'unexpected.cjs');writeFileSync(unexpected,'throw new Error("UNEXPECTED_MODULE_EXECUTED");');
 const probe=join(output,'guard-probe.mjs');
 // Derived fixture exposes the actual generated guard, without modifying the artifact.
 writeFileSync(probe,Buffer.concat([bytes,Buffer.from('\nexport const probeRequire=id=>require(id);\n')]));
 const {probeRequire}=await import(pathToFileURL(probe).href);
 assert.equal(probeRequire('node:crypto').createHash('sha256').update('fixture').digest('hex'),hash('fixture'));
 for(const id of ['encoding','bufferutil','utf-8-validate',unexpected,'./unexpected.cjs',null,{}])assert.throws(()=>probeRequire(id),/^Error: RESERVE_BUNDLE_IMPORT_REFUSED$/);
 assert.equal(hash(readFileSync(artifact)),manifest.artifact.sha256);
});
test('builder refuses existing output and invalid arguments without replacing retained bytes',()=>{
 const before=new Map(readdirSync(output).map(name=>[name,hash(readFileSync(join(output,name)))]));
 for(const args of [[output],[],[output,'extra']]){
  const r=spawnSync(process.execPath,[builder,...args],options);
  assert.ifError(r.error);assert.equal(r.status,78);assert.equal(r.stdout,'');assert.equal(r.stderr,'RESERVE_BUNDLE_BUILD_REFUSED\n');
 }
 assert.deepEqual(new Map(readdirSync(output).map(name=>[name,hash(readFileSync(join(output,name)))])),before);
});
