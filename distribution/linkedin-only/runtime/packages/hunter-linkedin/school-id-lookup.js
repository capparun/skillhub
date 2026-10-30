import { cli, Strategy } from '@jackwener/opencli/registry';
import {schoolSlug,resolveSchoolPage} from './lib/school-lookup.js';
cli({
 site:'hunter-linkedin',name:'school-id-lookup',access:'read',description:'读取指定LinkedIn学校主页的数字ID，供 scout --school 使用；不接受模糊学校名称',domain:'www.linkedin.com',strategy:Strategy.COOKIE,browser:true,navigateBefore:false,
 args:[{name:'school',type:'string',required:true,description:'学校主页slug或完整URL，例如 fudan-university'}],
 validateArgs:args=>schoolSlug(args.school),
 func:async(page,args)=>{const slug=schoolSlug(args.school);await page.goto('https://www.linkedin.com/school/'+slug+'/',{waitUntil:'domcontentloaded',timeout:60000});return resolveSchoolPage(page,slug);}
});
