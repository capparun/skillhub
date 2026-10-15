// Scope registry selection to this install invocation; never rewrite user npmrc.
export function npmInstallOptions(argv, {configuredRegistry,env=process.env}={}) {
 const index=argv.indexOf('--npm-registry');
 if(index>=0 && (!argv[index+1] || argv[index+1].startsWith('--')))throw new Error('--npm-registry 需要完整 HTTPS 地址');
 const raw=index>=0?argv[index+1]:(env.npm_config_registry ?? env.NPM_CONFIG_REGISTRY ?? configuredRegistry);
 if(!raw)throw new Error('未能确定 npm registry；请使用 --npm-registry 指定与缓存一致的地址');
 let url;
 try{url=new URL(raw.trim());}catch{throw new Error('npm registry 地址无效');}
 if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)throw new Error('npm registry 必须为不含凭据、查询参数的 HTTPS 地址');
 const registry=url.href.endsWith('/')?url.href:url.href+'/';
 return {registry,offline:argv.includes('--offline'),args:['install','--omit=dev','--registry',registry,...(argv.includes('--offline')?['--offline']:[])]};
}
