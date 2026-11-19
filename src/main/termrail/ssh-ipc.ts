import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { termRailSshChannel } from '../../shared/termrail-ssh'
import { isSshSessionId, type TermRailSshService } from './ssh-service'

export function registerTermRailSshIpc(
  service: TermRailSshService,
  allows: (event: IpcMainInvokeEvent, id: string, method: unknown) => boolean,
) {
  ipcMain.handle(termRailSshChannel, (event, method, id, ...args) => {
    if (!isSshSessionId(id) || !allows(event, id, method)) throw new Error('터미널 접근이 허용되지 않았습니다.')
    switch (method) {
      case 'open': if (args.length === 1) return service.open(id, args[0]); break
      case 'close': if (!args.length) return service.close(id); break
      case 'read': if (args.length === 1) return service.read(id, args[0]); break
      case 'trust': if (args.length === 1) return service.trust(id, args[0]); break
      case 'login': if (args.length === 2) return service.login(id, args[0], args[1]); break
      case 'write': if (args.length === 1) return service.write(id, args[0]); break
      case 'resize': if (args.length === 2) return service.resize(id, args[0], args[1]); break
    }
    throw new Error('잘못된 터미널 요청입니다.')
  })
  return () => ipcMain.removeHandler(termRailSshChannel)
}
