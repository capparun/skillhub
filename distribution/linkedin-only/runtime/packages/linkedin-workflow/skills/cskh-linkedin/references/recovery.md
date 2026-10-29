# 中断诊断与恢复边界

仅在超时、task_busy、profile_busy 或未知执行结果时读取本页。

## 先保留结果，再判断能否继续

1. 用当前安装 Skill 的固定入口调用 `task-recovery`，读取已完成对象、检查点和中断记录。此命令不访问 LinkedIn。
2. `task-lock-inspect` 检查指定任务锁；`profile-lock-inspect` 检查指定 Chrome Profile 的产品锁。使用命令帮助确认输入格式。
3. 锁持有进程仍在运行时，不删锁、不再次执行相同操作。进程已退出，仅说明本机持有者结束，不能证明已发到浏览器的操作结束。
4. 对正常返回且提供游标的单查询任务，用 `task-continue` 继续，它自动选最新进度并沿用目标及预算。不要自己复用较早游标。
5. 对未知结果的中断，保留诊断，不将状态改成成功。当前检查点恢复尚不能自动完成浏览器停止核验；明确报告阻断，不能承诺直接续读。

## 什么证据不能当作“已停止”

- 本机 CLI 进程不在了。
- OpenCLI daemon 正在运行或桥接重新连接。
- daemon 的 pending 数为 0。
- 页面看起来没有变化。

固定 OpenCLI 2.0.1 的 daemon 超时处理会移除 pending 记录；已派发且结果未知的请求另计 commandResultUnknown。因此 pending=0 只表示 daemon 当前没有等待回执，不保证远端动作被取消。不要自动重启共享 daemon 或切换扩展来处理一个任务。

## 锁恢复命令的含义

`task-lock-recover` 归档核验过的过期任务锁；`profile-lock-recover` 归档指定 Chrome Profile 的产品锁。二者只处理本地锁，不恢复浏览器、不补写成功回执、不重跑操作。必须先读取当前 revision；revision 变化、持有者仍活跃或无法确认时拒绝恢复。

`execution_stopped_confirmed` 是调用方对执行已停止的明确确认，不是工具自动得出的事实。Agent 不得仅根据“PID 已退出”或“pending=0”自行填 true。没有充分依据时保持阻断并报告，不手动删锁。

## 给用户的结果

报告已保存的人数和页进度、最后操作、错误、可复用结果，以及尚待确认的停止状态。检查点中的人数是该查询累计列表量，不能跨检查点相加，也不能当作业务匹配人数。

账号锁恢复输入为 `{"profile":"已核对的Profile ID","revision":"inspect返回的当前revision","execution_stopped_confirmed":true}`，通过 `profile-lock-recover --input 文件路径` 调用。只有已获得执行停止依据时才可使用该示例。归档成功返回 `dispatched:false`，不会恢复任何浏览器操作；后续动作仍需符合原授权与预算。

诊断返回 `legacy_owner_host_unverified` 表示旧锁没有记录所属主机；`foreign_owner_host` 表示锁记录属于其他主机。二者不是已确认退出，恢复命令不会自动归档。`invalid_lock_owner` 或 `invalid_lock_json` 表示锁格式异常，保留原文件用于支持诊断。不要补写hostname来绕过核验。
