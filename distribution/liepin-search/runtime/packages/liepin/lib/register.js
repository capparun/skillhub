import {cli as register,Strategy} from '@jackwener/opencli/registry';
export {Strategy};

// OpenCLI's lifecycle hooks swallow errors. validateArgs is the supported
// pre-browser boundary: failure propagates before pre-navigation/connection.
// This development gate must remain until each browser path is migrated and
// accepted. It intentionally has no --force or environment-variable bypass.
export function cli(definition) {
  if (definition.site === 'liepin' && definition.browser === true) {
    return register({...definition,validateArgs:()=>{
      throw new Error('此开发版入口的导航或执行链尚未通过风控兼容性验收，已在浏览器连接前停止；请勿通过重试、换标签或更换任务绕过。已验证的已有详情只读入口为 liepin detail。');
    }});
  }
  return register(definition);
}
