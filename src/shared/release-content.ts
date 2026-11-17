export const releaseTypes={Feat:'기능 추가',Fix:'오류 수정',Perf:'성능 개선',Docs:'도움말·문서'} as const
export interface ReleaseNote {version:string;summary:string;sections:{type:keyof typeof releaseTypes;items:string[]}[];notes?:string[]}
export const releaseNotes:ReleaseNote[]=[
 {version:'0.8.5',summary:'변경 전 확인과 버전별 릴리즈노트',sections:[
  {type:'Feat',items:['제목 표시줄에서 버전별 릴리즈노트를 별도 창으로 볼 수 있습니다.','일정 추가·수정·삭제·드래그와 알림 설정 저장 전에 변경 내용을 확인합니다.','프로젝트 목록에서 삭제할 때 하위 일정 수를 함께 확인합니다.']},
  {type:'Fix',items:['도움말과 창 제어 버튼 사이에 구분선을 추가하고 앱 바깥 테두리를 제거했습니다.','Windows 작업표시줄 재실행 항목에 현재 앱 이름·아이콘을 명시합니다.']},
  {type:'Docs',items:['도움말 최초 로딩의 구간별 진단 기록을 보강했습니다. 기존 사전 준비 시점은 유지합니다.']}],notes:['도움말 최초 실행 지연은 원인 조사 중입니다. 이번 진단 추가를 성능 해결로 안내하지 않습니다.','Windows에 남은 이전 고정 항목의 아이콘은 별도 확인이 필요할 수 있습니다.']},
 {version:'0.8.4',summary:'편집 흐름과 전체 기능 도움말',sections:[
  {type:'Feat',items:['주 창 제목 옆에 호스트·멤버 역할 배지를 표시합니다.','저장하지 않은 입력은 닫기·전환·완전 종료 시 확인 없이 폐기합니다. UPDATE 설치도 미저장 입력만으로 대기하지 않습니다.']},
  {type:'Fix',items:['간트 스크롤 조작 후 Space+드래그가 막히던 문제를 수정했습니다.','저장하거나 변경을 버리라는 행동 안내를 4초 경고 토스트로 표시합니다.']},
  {type:'Perf',items:['주 화면 준비 후 도움말을 미리 준비하고, 닫은 창을 재사용해 반복 열기 비용을 줄였습니다.']},
  {type:'Docs',items:['프로젝트·일정·간트·달력·알림·트레이 등 전체 기능 도움말을 추가했습니다.']}],notes:['주 창 X는 입력을 유지한 채 트레이로 숨깁니다. 진행 중인 저장과 저장 결과 불명 상태는 별도로 보호합니다.','도움말 최초 열기 성능은 PC 환경의 영향을 받으며 회사 PC에서 지연이 확인되어 추가 조사 중입니다.']},
 {version:'0.8.3',summary:'알림 제어와 연결된 멤버 확인',sections:[
  {type:'Feat',items:['새 업데이트 발견 시 Windows 알림을 제공합니다.','트레이에 이 PC의 전체 알림을 끄는 메뉴를 추가했습니다.','호스트에서 연결된 멤버 수·연결 상태·마지막 접속 확인 시각을 표시합니다.']},
  {type:'Fix',items:['트레이 최초 표시 시 Windows 자동 실행 체크 상태가 잘못 보이던 문제를 수정했습니다.']}],notes:['멤버도0.8.3 이상으로 업데이트해야 새 기능을 사용할 수 있습니다.','전체 알림을 꺼도 동기화와 UPDATE 버튼은 계속 동작합니다.']},
 {version:'0.8.2',summary:'호스트·멤버 오프라인 도움말',sections:[
  {type:'Feat',items:['제목 표시줄의 물음표 버튼으로 별도 도움말 창을 엽니다.','역할별 시작 화면·목차 검색·화면 이미지 확대와 이동을 제공합니다.']},
  {type:'Docs',items:['공유 시작·참여자 승인·동기화·알림·업데이트·연결 문제 해결 안내를 추가했습니다.']}]},
 {version:'0.8.1',summary:'Windows 자동 실행과 설치 동작 개선',sections:[
  {type:'Feat',items:['설치 화면과 트레이 메뉴에서 현재 사용자 로그인 시 자동 실행을 선택할 수 있습니다.','자동 실행은 트레이에서 시작하며 저장된 공유·알림 설정을 유지합니다.']},
  {type:'Fix',items:['삭제 버튼과 UPDATE 버튼의 색상·테두리 스타일을 정리했습니다.','수동 설치 시 실행 중인 앱을 종료하고 설치를 이어가는 절차를 추가했습니다.']}],notes:['수동 설치는 미저장 입력을 폐기합니다.0.8.0 설치본의 종료 방식과 이후 버전의 정상 종료 방식은 다릅니다.']},
 {version:'0.8.0',summary:'호스트를 통한 사내 앱 업데이트',sections:[
  {type:'Feat',items:['호스트가 업데이트 ZIP을 등록·검증한 뒤 승인된 멤버에게 배포할 수 있습니다.','멤버의 UPDATE 버튼으로 다운로드·검증·설치·재실행을 진행합니다.','다운로드 진행 안내·취소·재시도와 배포 중지/교체 처리를 제공합니다.']}],notes:['호스트 앱은 수동 설치로 먼저 업데이트합니다. 멤버는 호스트와 같은 새 정식 버전을 받습니다.']},
]
export function validateReleaseNotes(notes:ReleaseNote[]):string[]{
 const errors:string[]=[],seen=new Set<string>();let previous:number[]|undefined
 for(const n of notes){
  if(!/^\d+\.\d+\.\d+$/.test(n.version)||seen.has(n.version))errors.push('Invalid or duplicate version')
  seen.add(n.version);const v=n.version.split('.').map(Number)
  if(previous){const i=v.findIndex((x,j)=>x!==previous![j]);if(i<0||v[i]>previous[i])errors.push('Versions must be descending')};previous=v
  if(!n.summary.trim()||!n.sections.length)errors.push('Empty release')
  const types=new Set<string>();for(const s of n.sections){if(!(s.type in releaseTypes)||types.has(s.type)||!s.items.length||s.items.some(i=>!i.trim()))errors.push('Invalid section');types.add(s.type)}
 }
 return errors
}
