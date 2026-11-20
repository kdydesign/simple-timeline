import {postRailBusy, type PrRunState} from '../../shared/postrail-run'

const phases = {idle:'실행 대기',authenticating:'인증 준비 중',running:'전송 중',stopping:'중지 중',
  completed:'실행 완료',stopped:'실행 중지',failed:'실행 실패'}

export function formatPostRailStatus(run:PrRunState|null) {
  if (!run || run.phase==='idle') return phases.idle
  const fields = [phases[run.phase], run.completed+' / '+run.total+'회 완료']
  if (run.failed !== '0') fields.push('실패 '+run.failed+'건')
  if (run.uncertain !== '0') fields.push('결과 확인 필요 '+run.uncertain+'건')
  if (!postRailBusy(run.phase) && BigInt(run.completed)<BigInt(run.total)) {
    fields.push('미전송 '+(BigInt(run.total)-BigInt(run.completed))+'건')
  }
  return fields.join(' · ')
}
