import { cli, Strategy } from '@jackwener/opencli/registry';
import {companySlug,resolveCompanyPage} from './lib/company-lookup.js';
cli({
 site:'hunter-linkedin',name:'company-id-lookup',access:'read',description:'读取指定LinkedIn公司主页的数字ID；不接受模糊公司名称',domain:'www.linkedin.com',strategy:Strategy.COOKIE,browser:true,navigateBefore:false,
 args:[{name:'company',type:'string',required:true,description:'公司主页slug或完整URL，例如microsoft'}],
 validateArgs:args=>companySlug(args.company),
 func:async(page,args)=>{const slug=companySlug(args.company);await page.goto('https://www.linkedin.com/company/'+slug+'/',{waitUntil:'domcontentloaded',timeout:60000});return resolveCompanyPage(page,slug);}
});
