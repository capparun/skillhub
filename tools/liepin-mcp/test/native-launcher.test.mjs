import test from 'node:test';
import assert from 'node:assert/strict';
import {launcherText} from '../scripts/build-native-launcher.mjs';
test('launcher quoting preserves Unicode and spaces and rejects Windows expansion characters',()=>{
 assert.equal(launcherText('/Node path/node',"/用户/a'b/dispatch.mjs",'darwin'),`#!/bin/sh\nexec '/Node path/node' '/用户/a'\\''b/dispatch.mjs' "$@"\n`);
 assert.equal(launcherText('C:\\Program Files\\node.exe','C:\\用户\\dispatch.mjs','win32'),'@echo off\r\n"C:\\Program Files\\node.exe" "C:\\用户\\dispatch.mjs" %*\r\n');
 assert.throws(()=>launcherText('node','C:\\%TEMP%\\dispatch.mjs','win32'),/命令字符/);
 assert.throws(()=>launcherText('node','bad\npath','darwin'),/路径/);
});
