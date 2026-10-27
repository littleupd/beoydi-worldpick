# Worldpick ✳

모바일 우선의 세계 도시 추첨 사이트. START로 도시를 돌리고 STOP을 누르면 첨부 `pick.js`의 구간별 가중치로 여행지를 선택·저장한 뒤, 감속과 확대 연출로 공개합니다. 돌아가는 이름은 결과와 무관한 표시용입니다. 한 번 확정한 GeoNames ID는 같은 브라우저에서 다시 추첨되지 않습니다.

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

## 구간별 도시 풀

실제 추첨은 프로젝트에 포함된 `public/data/pools.json`을 사용합니다. 첨부된 `scripts/build_pools.py`를 그대로 보존했으며, `npm run data:pools`는 고정된 `all-the-cities@3.1.0`의 인구·행정구역·원래 도시 이름을 GeoNames 호환 TSV로 내보내 이 분류기에 전달합니다. 원본 패키지에는 별도의 ASCII 이름 필드가 없어 display name으로 매칭합니다. 분류 기준은 사용자 스크립트 그대로이며 외부 다운로드는 필요 없습니다.

현재 대상은 **24,030개**: famous 88 / mid 8,449 / small 14,951 / danger 542. 인구 15,000 미만과 유명 목록에 없는 인구 100만 이상 도시는 제외됩니다. 화면의 총 도시 수·남은 수는 실제 추첨 풀 기준입니다. 원래 135,233개 전체 스냅샷도 프로젝트에 보존합니다.

풀 레코드는 `[geonameId, name, countryCode, admin1, latitude, longitude, population]`입니다. 빌드는 `pools-manifest.json`의 SHA-256·구간별 개수·전체 고유 ID·좌표·원본 ID 소속을 검사합니다. 일반 빌드는 스냅샷을 다시 생성하지 않습니다. 첨부 스크립트의 danger 국가 목록은 고정된 사용자 분류이며 실시간 여행 경보가 아닙니다.

## 추첨과 저장

- `public/pick.js`의 `pickCity()`로 구간을 먼저 고른 다음 해당 구간의 미추첨 도시를 선택합니다. 구간 가중치는 famous 25 / mid 45 / small 25 / danger 5입니다. 전부 소진된 구간은 제외하고 남은 가중치를 정규화합니다. 모든 구간이 소진되면 추첨을 중단합니다.
- `requestAnimationFrame`으로 표시를 갱신합니다. STOP에서 즉시 중복 입력을 막고 가중 결과를 저장하며, 약 1.6초 동안 이름 교체 간격을 늘린 후 확정 결과를 확대해 보여줍니다. 감소된 모션 설정에서는 감속·확대를 생략합니다. 탭이 숨겨지면 감속 연출을 끝내 Safari 백그라운드 정지 때문에 결과 공개가 막히지 않게 합니다.
- IndexedDB read/write 트랜잭션 안에서 ID 존재를 확인하고 기록을 추가합니다. 여러 탭이 같은 ID를 확정하려 해도 하나만 저장됩니다. 충돌한 탭은 최신 기록을 읽고 `pickCity()`를 다시 실행합니다. 기존 DB 이름·버전·저장 레코드와 경도/위도 순서를 유지하므로 과거 기록은 그대로 표시되고 새 풀에서도 제외됩니다.
- 저장이 완료되어야 확정 메시지를 표시합니다. 저장이 불가능하면 추첨을 막고 복구 안내를 제공합니다. 네트워크 요청은 시간제한과 재시도 기능을 가집니다.
- 여행 기록 초기화 버튼을 누르고 확인하면 해당 브라우저의 추첨 기록만 지웁니다. 모든 도시가 다시 추첨 대상에 포함되며, 열린 다른 탭도 초기화 상태를 반영합니다. 취소하면 기록을 유지하고, 저장소 오류가 나면 초기화 성공으로 처리하지 않습니다. 또한 브라우저 사이트 데이터 삭제·비공개 모드 종료·OS의 저장소 정리 시 기록은 사라질 수 있습니다. 기록은 브라우저·기기 간 동기화되지 않습니다.
- 초기 도시 로딩 후에는 추첨 중 네트워크가 필요 없습니다. 최초 방문 시 페이지와 내부 JSON을 받기 위한 연결은 필요합니다.

## GitHub Pages

`.github/workflows/pages.yml`은 `main` push 시 빌드와 Chromium/WebKit 테스트 후 `dist`를 GitHub Pages에 배포합니다. 저장소 Settings → Pages → Source가 **GitHub Actions**여야 합니다.

배포 주소: `https://littleupd.github.io/beoydi-worldpick/`

모든 정적 경로는 상대 경로이므로 프로젝트 하위 경로에서 동작합니다. 실제 배포 성공 여부는 Actions 실행과 공개 URL의 HTTP 응답으로 확인해야 합니다.
