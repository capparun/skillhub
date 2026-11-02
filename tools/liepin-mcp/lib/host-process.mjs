import {spawn} from 'node:child_process';
/** Keep the fixed upstream process lifetime tied to its launcher. */
export function runHostProcess(entry,args){
 const child=spawn(process.execPath,[entry,...args],{stdio:'inherit'});
 const signals=['SIGINT','SIGTERM',...(process.platform==='win32'?[]:['SIGHUP'])];
 const handlers=new Map(signals.map(signal=>[signal,()=>{if(child.exitCode===null)child.kill(signal);} ]));
 for(const [signal,handler] of handlers)process.on(signal,handler);
 const cleanup=()=>{for(const [signal,handler] of handlers)process.off(signal,handler);};
 child.once('error',error=>{cleanup();console.error(error.message);process.exitCode=1;});
 child.once('exit',(code)=>{cleanup();process.exitCode=code??1;});
 return child;
}
