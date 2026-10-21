// Only the current user's Chrome native-host entry; no elevation or client edits.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const key='Software\\Google\\Chrome\\NativeMessagingHosts\\com.opencli.mcp';
export function createWindowsNativeRegistry(){
 if(process.platform!=='win32')throw Error('Windows注册表仅能在Windows本机操作');
 const command=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const run=(operation,value)=>{
  const input=JSON.stringify({operation,value}).replaceAll("'","''");
  const script=`$ErrorActionPreference='Stop';$p=ConvertFrom-Json '${input}';$base=[Microsoft.Win32.Registry]::CurrentUser;$name='${key}';
if($p.operation -eq 'set'){$k=$base.CreateSubKey($name);try{$k.SetValue('',[string]$p.value,[Microsoft.Win32.RegistryValueKind]::String)}finally{$k.Dispose()}}
elseif($p.operation -eq 'remove-value'){$k=$base.OpenSubKey($name,$true);if($null -ne $k){try{$k.DeleteValue('',$false)}finally{$k.Dispose()}}}
elseif($p.operation -eq 'remove-key'){$k=$base.OpenSubKey($name,$false);if($null -ne $k){try{if($k.GetValueNames().Count -gt 1 -or @($k.GetValueNames()|Where-Object {$_ -ne ''}).Count -gt 0 -or $k.GetSubKeyNames().Count -gt 0){throw 'Registry entry has later changes'}}finally{$k.Dispose()};$base.DeleteSubKey($name,$false)}}
$k=$base.OpenSubKey($name,$false);if($null -eq $k){@{exists=$false;hasDefault=$false;value=$null;kind=$null;otherValues=@();subKeys=@()}|ConvertTo-Json -Compress}
else{try{$names=@($k.GetValueNames());$has=$names -contains '';$v=$null;$kind=$null;if($has){$kind=$k.GetValueKind('').ToString();$v=$k.GetValue('',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)};@{exists=$true;hasDefault=$has;value=$v;kind=$kind;otherValues=@($names|Where-Object {$_ -ne ''}|Sort-Object);subKeys=@($k.GetSubKeyNames()|Sort-Object)}|ConvertTo-Json -Compress}finally{$k.Dispose()}}`;
  const result=spawnSync(command,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000,windowsHide:true});
  if(result.error||result.status!==0)throw Error('当前用户Chrome通信注册失败：'+(result.error?.message??result.stderr));
  const state=JSON.parse(result.stdout.trim().replace(/^\uFEFF/,''));
  if(typeof state.exists!=='boolean'||typeof state.hasDefault!=='boolean'||!Array.isArray(state.otherValues)||!Array.isArray(state.subKeys)||state.hasDefault&&(state.kind!=='String'||typeof state.value!=='string'))throw Error('当前通信注册类型不受支持，未自动覆盖');
  return state;
 };
 return {read:()=>run('read'),set:value=>run('set',value),restore:before=>before.hasDefault?run('set',before.value):run(before.exists?'remove-value':'remove-key')};
}
