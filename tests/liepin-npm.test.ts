import assert from 'node:assert/strict';
import {test} from 'node:test';
// @ts-expect-error Distribution scripts are shipped as native ESM without declarations.
import {npmInstallOptions} from '../distribution/liepin-search/npm-distribution.mjs';
test('explicit registry overrides ambient config and offline keeps the same registry cache keys',()=>{
 const result=npmInstallOptions(['--npm-registry','https://registry.npmmirror.com','--offline'],{configuredRegistry:'https://registry.npmjs.org/',env:{}});
 assert.equal(result.registry,'https://registry.npmmirror.com/');
 assert.deepEqual(result.args,['install','--omit=dev','--registry','https://registry.npmmirror.com/','--offline']);
});
test('npm current configuration is preserved when no registry override is requested',()=>{
 assert.equal(npmInstallOptions([],{configuredRegistry:'https://registry.example.org/npm/',env:{}}).registry,'https://registry.example.org/npm/');
 assert.equal(npmInstallOptions([],{configuredRegistry:'https://registry.npmjs.org/',env:{npm_config_registry:'https://registry.npmmirror.com/'}}).registry,'https://registry.npmmirror.com/');
});
test('missing registry values or credential-bearing registry URLs are rejected without echoing secrets',()=>{
 for(const args of [['--npm-registry'],['--npm-registry','--offline'],['--npm-registry','https://secret:password@example.com/'],['--npm-registry','http://registry.npmjs.org']])assert.throws(()=>npmInstallOptions(args,{env:{}}),error=>error instanceof Error && !error.message.includes('password'));
});
