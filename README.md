# Worldpick ✳

모바일 우선의 세계 도시 추첨 사이트. START로 도시를 돌리고 STOP을 누르면 **그 순간 표시된 도시**를 확정합니다. 한 번 확정한 GeoNames ID는 같은 브라우저에서 다시 추첨되지 않습니다.

## 개발

Node.js 22 이상, npm. 별도 API 키·DB 서버·런타임 CDN이 필요 없습니다.

```sh
npm ci
npm run dev
```

```sh
npm run build        # 데이터 해시·ID·좌표 검증 및 dist 생성
npm run preview      # dist 로컬 확인 (기본 포트 4173)
npx playwright install --with-deps chromium webkit
npm test             # 데스크톱 Chromium + iPhone 크기 WebKit
```

클라우드에 Chromium이 이미 있으면 `CHROMIUM_PATH=/usr/bin/chromium npm test -- --project=chromium`을 사용할 수 있습니다. 테스트는 GitHub Pages와 같은 `/beoydi-worldpick/` 하위 경로를 사용합니다. WebKit 에뮬레이션은 실제 iPhone 하드웨어 테스트를 대체하지 않습니다.

## 데이터

`public/data/cities.json`에 **135,233개 고유 도시 전체 스냅샷**을 포함합니다. GeoNames cities1000을 재배포하는 `all-the-cities@3.1.0` 기반입니다. 인구 약 1,000명 이상 도시를 중심으로 하는 역사적 스냅샷이며 지구상의 모든 마을 또는 최신 실시간 GeoNames 덤프는 아닙니다. 원 패키지 README의 138,398개 표기는 실제 배포본과 다르므로 실제 레코드 수를 검증해 표시합니다.

레코드: `[geonameId, name, countryCode, longitude, latitude]`. 빌드마다 `manifest.json`의 SHA-256, 도시 수, 고유 ID와 좌표를 검사합니다. 일반 설치·빌드는 외부 도시 데이터를 다운로드하지 않습니다. 명시적으로 스냅샷을 재생성할 때만 `npm run data:import`를 실행합니다. 데이터의 출처·라이선스는 [attribution.txt](public/data/attribution.txt)에 있습니다.

## 추첨과 저장

- `crypto.getRandomValues`와 rejection sampling으로 남은 도시를 균등 선택합니다.
- `requestAnimationFrame`으로 표시를 갱신하고 STOP 이벤트에서 즉시 중단합니다. 감소된 모션 설정에서는 갱신 빈도를 낮춥니다.
- IndexedDB read/write 트랜잭션 안에서 ID 존재를 확인하고 기록을 추가합니다. 여러 탭이 같은 ID를 확정하려 해도 하나만 저장됩니다. 충돌한 탭은 남은 목록에서 다시 선택합니다.
- 저장이 완료되어야 확정 메시지를 표시합니다. 저장이 불가능하면 추첨을 막고 복구 안내를 제공합니다. 네트워크 요청은 시간제한과 재시도 기능을 가집니다.
- 데이터 초기화 버튼은 제공하지 않습니다. 단, 브라우저 사이트 데이터 삭제·비공개 모드 종료·OS의 저장소 정리 시 기록은 사라질 수 있습니다. 기록은 브라우저·기기 간 동기화되지 않습니다.
- 초기 도시 로딩 후에는 추첨 중 네트워크가 필요 없습니다. 최초 방문 시 페이지와 내부 JSON을 받기 위한 연결은 필요합니다.

## GitHub Pages

`.github/workflows/pages.yml`은 `main` push 시 빌드와 Chromium/WebKit 테스트 후 `dist`를 GitHub Pages에 배포합니다. 저장소 Settings → Pages → Source가 **GitHub Actions**여야 합니다.

배포 주소: `https://littleupd.github.io/beoydi-worldpick/`

모든 정적 경로는 상대 경로이므로 프로젝트 하위 경로에서 동작합니다. 실제 배포 성공 여부는 Actions 실행과 공개 URL의 HTTP 응답으로 확인해야 합니다.
