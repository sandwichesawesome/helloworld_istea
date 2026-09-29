# 5호관 길찾기 — 실내 평면도 길안내

피난계획도 기반으로 다시 그린 5호관 평면도(B1–4F) 위에서 호실을 검색하면, 빨간 화살표가 복도를 따라
목적지까지 이동하며 위치를 알려 주는 웹 앱입니다. 층이 다르면 화살표가 계단에서 멈추고, 버튼을 누르면 다음 층
평면도에서 안내를 이어갑니다.

```bash
npm install
npm run dev        # http://localhost:5173
```

## 배포 (Google Cloud Run)

`Dockerfile`(Node 로 빌드 → nginx 로 `dist/` 제공, 8080 포트)과 `nginx.conf` 로 Cloud Run 에 올린다.
Docker 설치 없이 Cloud Build 가 원격으로 이미지를 만든다. 코드 수정 후 같은 명령을 다시 실행하면 새 버전이 배포된다.

```bash
gcloud.cmd run deploy istea --source . --region asia-northeast3 --allow-unauthenticated --max-instances 2 --project helloworld-510100
```

- 주소: https://istea-325994405590.asia-northeast3.run.app
- PowerShell 에서는 `gcloud` 대신 `gcloud.cmd` (실행 정책으로 `gcloud.ps1` 이 막힐 수 있음)
- 처음 배포 때 기본 Compute 서비스 계정에 `roles/run.builder` 권한을 부여함 (Cloud Build 가 소스를 읽고 이미지를 저장하는 데 필요)

## 기능

- **탑다운 평면도**: SVG 렌더링, 드래그 이동 · 휠/핀치 확대 · 더블클릭 확대 · `+` `-` `0` 단축키
- **검색**: 호수(`354`), 동+호수(`5남 354`), 층(`2층 화장실`), 용도(`디브리핑`, `GDSC`), 초성(`ㅅㅇㄱㅎ`) — 자동완성, 추천 검색어, 최근 검색, `/` 로 포커스
- **경로 안내**: 격자 A*로 복도 중앙을 따라가는 경로 → 빨간 화살표가 부드럽게 이동, 도착하면 위아래로 튀는 핀 + 펄스
- **카메라**: 경로 전체에 맞춰 자동 이동 → 도착지로 줌. `화살표 따라가기` 모드 지원. 사용자가 조작하면 자동 카메라가 양보
- **층간 이동**: 계단에서 정지 → `N층 평면도 보기` 버튼 → 다음 층에서 같은 계단부터 다시 안내
- **출발 위치**: 남측현관(기본) · 동측 출입구 등 프리셋, 지도에서 직접 지정, 도착하면 현재 위치가 도착지로 갱신
- **현재 위치 초기화** (오른쪽 위 버튼): 진행 중인 안내를 끝내고 1층으로 이동 → 출입구 4곳이 반짝이며 강조됨.
  지도 위 출입구 · 이름표 · 안내창 버튼 중 하나를 누르면 그곳이 현재 위치가 됨 (Esc / ✕ 로 취소)
- **라이트 / 다크 모드** (오른쪽 위 토글): 처음엔 시스템 설정을 따르고, 고른 값은 기억함. 지원 브라우저에서는
  버튼 위치에서 원형으로 퍼지며 전환. 색은 `src/index.css` 의 테마 변수(`--fp-*` 평면도, `--site-*` 주변, UI 토큰)로 관리
- 딥링크 `#to=3F-5남-354`, 모바일 바텀시트 레이아웃

## 구조

```
floorplans/                 원본 평면도 SVG (5호관_B1.svg … 5호관_4F.svg)
scripts/extract-floorplans.mjs  SVG → src/data/floorData.json 변환기
scripts/make-icons.ps1      brand/app-icon-original.png(오리 캐릭터) → public/ 파비콘 · 홈 화면 아이콘 · 헤더 로고
                            (powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1)
src/
  data/
    floorData.json          (생성됨) 층 외곽선 · 안뜰 · 공간(호실/계단/승강기…)의 좌표 · 크기 · 용도
    overrides.ts            수동 메타데이터: 층간 계단 연결, 출입구 이름, 출발 프리셋, 추천 검색어, 동의어
    site.ts                 1층에서 보이는 건물 바깥 배치(차도 · 벤치 · 60주년 기념관 · 운동장 · 정석학술정보관, 스케치 기반 근사)
    building.ts             두 데이터를 합쳐 런타임 모델 생성 (표시 이름, 중심 좌표, 태그, 계단 코어)
  lib/
    navgrid.ts              평면도 래스터화(5단위 격자) + A*/다익스트라 + 경로 당기기(string pulling)
    routing.ts              다층 경로 계획 (층별 flood 2회 → 최적 계단 선택, 필요 시 중간 층 환승)
    search.ts               검색 파서/랭킹 (층·동 필터, 번호/이름/태그/초성)
    viewport.ts             카메라(팬/줌/flyTo)
    geometry.ts             도형 · 폴리라인 유틸
  components/
    MapView.tsx             지도 + 화살표 애니메이션 + 마커
    FloorPlan.tsx           한 층 SVG 렌더링
    SearchBox.tsx, RoutePanel.tsx, Controls.tsx
```

### 공간 데이터 형식 (`floorData.json`)

```jsonc
{
  "id": "3F-5남-354",        // 층-동-호수
  "kind": "room",            // room | restroom | stairs | entrance | elevator | blank | unknown | void
  "wing": "5남", "number": "354", "name": "디브리핑-1",
  "shape": { "type": "rect", "x": 1560.7, "y": 1190, "w": 59.2, "h": 75 },
  "label": { "text": "354", "x": 1590.3, "y": 1227.5, "size": 17 }
}
```

중심 좌표(`anchor`)와 표시 이름은 `building.ts` 에서 계산됩니다. 좌표계는 모든 층이 같은 2000×1523 도면 좌표입니다.

## 데이터 수정 · 확장

- **평면도가 바뀌면**: `floorplans/` 의 SVG를 교체하고 `npm run extract`. SVG 규칙(`g.rm[data-k]` = 호실,
  `url(#stairs)` = 계단, X 표시 rect = 승강기, `url(#grid)` = 중앙계단 블록)을 따르면 그대로 인식됩니다.
- **새 층 추가**: SVG 제목에 `N층` 을 넣어 `floorplans/` 에 추가 → `extract` → `overrides.ts` 의 `STAIR_CORES`
  에 그 층 계단 좌표(`at`)를 추가해야 다른 층과 연결됩니다.
- **호실 용도 · 별칭**: SVG `<title>5남관 354 — 용도</title>` 또는 `overrides.ts` 의 동의어/추천 목록.
- **도면 판독 보정**: `overrides.ts` 의 `SPACE_PATCHES` — 좌표로 공간을 지정해 종류를 바꾸거나(계단 → 출입문,
  승강기 → 빈 공간) 계단에 출입문 역할(`door`)을 더한다. 출입문을 출발 위치로 고르게 하려면 `START_PRESETS` 에도 추가.

## 한계

- 도면 자체가 피난계획도 사진을 옮긴 근사치이며, 거리(1단위 ≈ 0.09m)와 소요 시간도 추정값입니다.
- 승강기는 층마다 위치가 일치하지 않아 경로 계산에는 계단만 사용합니다.
- "사진 없음" 구간은 지나갈 수는 있지만 비용이 높게 잡혀 있습니다.
