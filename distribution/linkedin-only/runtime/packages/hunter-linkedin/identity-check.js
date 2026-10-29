import {cli,Strategy} from '@jackwener/opencli/registry';
import {probeIdentity,validateIdentityTarget} from './lib/identity-probe.js';
cli({site:'hunter-linkedin',name:'identity-check',description:'在当前LinkedIn页面实时核验登录身份；不回首页。无站内页面时直接打开指定目标。',domain:'www.linkedin.com',access:'read',browser:true,navigateBefore:false,strategy:Strategy.COOKIE,
 args:[{name:'target-url',type:'string',required:true,help:'用于首次初始化的LinkedIn人物、公司或人员搜索页URL'}],
 validateArgs:args=>validateIdentityTarget(args['target-url']),
 func:(page,args)=>probeIdentity(page,args['target-url'])});
