# Forest Crystal 시안 보정 · 0.6.2

기준 `4802f1a` clean main. 사용자 재업로드 시안과 [승인 설계](../design/forest-crystal.md), [보정 계획](../superpowers/plans/2026-11-10-glass-correction.md)에 따른다.

## 원인과 변경

0.6.1은 root의 넓은 색상층과 패널이 겹쳐 실제 투과를 약화했고 일정 막대는 두 불투명 색을 혼합했다.
기능 검사·CSS 속성 검사 통과를 시안 재현 완료로 해석한 점도 부족했다.

- 기존 `forest-crystal.css`를 직접 보정해 root 색을 줄이고 밝고 어두운 유리 테두리 반사와 내부 경계를 구분했다. 새 스타일 레이어를 덧붙이지 않았다.
- 간트·달력·드래그 미리보기의 막대 색은 투명 혼합이다. 실제 날짜 선과 뒤쪽 표면이 비치며, 반사층이 글자의 가독성을 보완한다.
- PNG와 6크기 ICO를 시안의 녹색 유리 P 아이콘으로 교체했다. 제목 표시줄도 기존 간트 SVG 대신 같은 PNG를 사용한다. [아이콘 출처](../../resources/icon-NOTICE.md)를 참조한다.
- 기존 창 재질 정책, 데이터·공유·알림·날짜 규칙과 의존성은 유지한다. 설치본 식별 버전만 0.6.2로 올렸다.

## 검증과 한계

Linux x64, Node24.22.1, Electron45.2.1, 격리 프로필과 sandbox 유지, Xorg `:95` 사용.
`artifacts/glass-correction/`에 로그와 실제 앱·합성 배경 캡처를 구분해 보존한다.
`synthetic-backdrop-*`는 CSS 투과를 확인하는 테스트용 배경이며 Windows 바탕화면 캡처가 아니다.

- P 이미지 연결·불투명 막대의 실패 RED를 확인한 뒤 보정했다.
- 양 테마에서 body의 검정/흰색 배경을 바꿔 완성된 패널 픽셀이 달라지는지 확인한다.
- 투명한 막대는 CSS 배경색만으로 대비를 계산할 수 없어 실제 합성 픽셀을 읽는 방식으로 검사한다. 검정/흰색 프로젝트, 양 모드·양 테마의 일반 막대 대비 4.5:1 이상이 기준이다.
- 최종 `DISPLAY=:95 npm run verify:app`: 2026-11-10 14:06:12~14:11:33 UTC, HEAD `4802f1a` + 이번 변경(dirty), 7단계 모두 통과.
  타입·빌드, release 15, unit 112×3 TZ, UI 116, native 41, Electron E2E 74개가 통과했다.
- `node scripts/harness/run.mjs verify`: 7/7 통과. `git diff --check` 통과.
- 커밋 후 clean checkout의 Windows/Linux CI와 설치본 결과는 종료 메시지의 해당 SHA·CI 링크로 확인한다.

첫 전체 검증은 E2E 74개 중 날짜 강조 1개가 실패했고 오늘과 hover 색을 모두 투명으로 읽었다.
검사는 `aria-current`만 기다린 뒤 색을 즉시 읽어 기존 100ms 배경 전환이 칠해지기 전 상태를 허용했다.
오늘 강조가 실제로 칠해졌는지 재시도 가능한 assertion으로 확인한 뒤 색을 비교하도록 검사를 보정했다.
검사를 생략하거나 제품의 전환 시간을 바꾸지 않았다. 해당 검사는 보정 후 연속 3회 통과했다.

화면 비교는 `final/add.png`, `projects.png`, `calendar.png`, `calendar-scrolled.png`,
`date-picker.png`, `dark.png`에 남겼다. 1440×900 Linux 앱의 배치·팝오버·날짜 선택기·두 테마를 확인했고,
`synthetic-backdrop-light.png`, `synthetic-backdrop-dark.png`는 같은 앱에 테스트 배경을 놓은 별도 비교다.

독립 리뷰: Critical/Important 결함 없음. 대비 검사는 막대 오른쪽 중앙의 기본 배경 샘플이며,
모든 배경·세로 그라데이션 위치의 최소 대비를 인증하지 않는다는 Minor 검증 범위 제한을 기록했다.
아이콘 alpha와 ICO 6개 크기, 모든 사용처 연결, rim의 중앙 마스크·입력 비간섭·forced-colors 처리를 확인했다.

Windows 실제 Acrylic 투과, OS 투명 효과 설정 켜기/끄기, 회사 PC 150% 배율·성능은 별도 미검증이다.
시안의 배경 모양은 사용자의 바탕화면에 따라 달라진다. Linux의 불투명 OS 대체 배경에서는 같은 외부 투과가 나타나지 않는다.
