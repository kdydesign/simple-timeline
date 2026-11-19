# NodeRail의 Windows ZIP 설치와 재검사, Windows 셸 아이콘

공식 nvm-windows 1.1.10·1.1.11을 사용하는 Windows x64에서 WorkRail의 설치 버튼이 공식 ZIP을 받는다. nvm-windows 1.2.2·2.0.1과 WSL2는 각각 기존 관리자로 설치한다. 사용 버튼은 선택한 관리자의 버전 전환을 수행한다. [설계](../design/noderail-zip-recovery-shell-icons.md) · [사용 안내](../release/user-guide.md#사내-프록시에서-node-설치)

## 배포본과 기존 설치의 확인

- 공식 `nvm-noinstall.zip`에서 1.1.10과 1.1.11의 실행 파일과 전환 도우미를 확인했다. 앱은 등록된 SHA-256과 실제 nvm 실행 파일을 대조한다. [관리자 식별](../../src/main/node-management/manager-support.ts) · [1.1.10 공식 릴리스](https://github.com/nvm-windows/nvm/releases/tag/1.1.10)
- Node 배포 목록과 ZIP에는 Windows 클래식 nvm의 검증된 HTTP(S) 프록시 설정을 적용한다. 명시된 주소는 메인 프로세스에서만 보관한다. 설정이 없으면 Electron의 기본 네트워크 세션을 사용한다. [프록시 처리](../../src/main/node-management/zip-transport.ts)
- 공식 릴리스 공개키 29개는 upstream 커밋의 공개키들을 하나의 ASCII-armored 키링으로 내보낸 것이다. 키 변경 시 upstream의 지문·폐기 상태를 검토하고 공식 서명과 변조 사례를 다시 검사한다. OpenPGP.js로 해당 릴리스의 원본 `SHASUMS256.txt`와 detached 서명을 검증한 후 정확한 Windows ZIP 항목을 대조한다. [고정한 공식 공개키 출처](https://github.com/nodejs/release-keys/tree/481637f813e912c4aa3622d7964ab426c97b8e8d) · [서명 검증](../../src/main/node-management/zip-download.ts)
- 같은 볼륨의 임시 폴더에서 ZIP 경로와 파일 속성·크기·CRC, Node와 npm의 구성을 검사한다. 게시 직전 관리자와 설정을 다시 확인한다. 이미 같은 이름의 불완전한 폴더가 있으면 경로를 표시하고 보존한다. 완료 판정에는 파일 인벤토리, 기존 활성 버전 보존, 인증된 관리자에서 읽은 `nvm list` 결과가 필요하다. [설치](../../src/main/node-management/zip-install.ts) · [목록 확인](../../src/main/node-management/classic-list.ts)

## 재검사와 Windows 아이콘

자동 조회가 진행 중이면 실제 파일 잠금 관측을 마친 뒤 변경 요청을 처리한다. ‘환경 다시 검사’는 종료된 작업의 현재 환경과 잠금을 확인해 화면 오류를 정리한다. ZIP 게시 이후 목록 확인에 실패한 경우 해당 버전이 실제로 확인돼야 오류가 사라진다. 종료 미확인 작업과 재부팅 예약은 유지한다. [작업 상태](../../src/main/node-management/service.ts)

설치기는 시작 메뉴 바로가기의 대상과 앱 ID를 확인한다. 해당 링크의 아이콘 위치만 갱신하고 Windows에 그 항목의 변경을 알린다. 실행 창의 재실행 아이콘과 시작 메뉴 링크가 같은 SHA-256 파일명의 외부 ICO를 사용한다. [NSIS 설치 처리](../../scripts/release/installer.nsh) · [실행 창 속성](../../src/main/taskbar-details.ts)

## 검증 범위

Linux에서 실제 Node 24.22.1 Windows x64 ZIP 37,748,064바이트를 SHA-256과 대조하고 임시 경로에 해제해 npm 11.19.1을 확인했다. 원본 서명과 변조된 목록, 경로 이탈 및 중복 설치, 파일 잠금이 해제된 뒤의 재검사, 9개 아이콘 프레임 대조와 NSIS 컴파일을 회귀 검사에 포함했다.

Windows Actions에는 두 nvm 버전의 일회성 실물 설치·전환 검사와 동일 경로 WorkRail 업그레이드 후 EXE 및 바로가기 아이콘 리소스 검사가 있다. 실제 사내 프록시·보안 제품의 동작과 사용자가 보는 Windows 검색 결과·우클릭 메뉴의 그림은 해당 PC에서 확인할 항목이다. [실물 nvm 검사](../../scripts/testing/verify-classic-nvm.ps1) · [Windows 패키지 검사](../../tests/e2e/packaged.spec.ts)

Linux 앱 검사에서 타입·배포·단위(세 시간대)·UI·제품 빌드·native가 통과했다. Electron 통합 검사의 첫 실행은 118/119였다. 수동 검사 진행선을 검증하는 테스트의 IPC 대상을 새 `recheck` 요청으로 맞췄고 해당 사례를 독립 실행해 통과했다. 전체 실행 결과는 실행 SHA에 해당하는 앱 보고서에서 확인한다.
