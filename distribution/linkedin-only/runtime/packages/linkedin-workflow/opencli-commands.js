import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { commands, runCommand } from './src/plugin/runner.mjs';

for (const command of commands) {
  cli({
    site: 'hunter-linkedin', name: command.name,
    description: command.description,
    access: command.access, browser: false, strategy: Strategy.LOCAL,
    args: command.name === 'capabilities' ? [] : [{ name: 'input', type: 'string', required: !command.optional,
      help: `JSON文件路径。字段：${command.parameters}` }],
    func: async args => {
      try { return await runCommand(command.name, args); }
      catch (error) {
        throw new CliError(error.code ?? 'runtime_failed', error.message,
          'Inspect --help and the persisted task receipt. Do not blindly replay interrupted operations.',
          error.code === 'invalid_input' ? 2 : 1);
      }
    },
  });
}

// Existing Hunter business scripts remain their own source of truth.
// Missing dependencies fail explicitly; discovery never launches a script.
import { externalCommands, runExternal } from './src/plugin/external.mjs';
for (const command of externalCommands) {
  cli({site:'hunter-linkedin',name:command.name,description:command.description,
    access:'write',browser:false,strategy:Strategy.LOCAL,
    args:[{name:'input',type:'string',required:true,help:'JSON输入文件；字段及输出见LinkedIn CLI命令表'},
      ...(command.output_dir?[{name:'output-dir',type:'string',required:true,help:'本地回执或报告目录'}]:[])],
    func:async args=>{try{return await runExternal(command.name,args);}catch(e){throw new CliError(e.code??'external_execution_failed',e.message,'Check Hunter skill dependencies and input; sending still requires explicit approval.',e.code==='invalid_input'?2:1);}},
  });
}
